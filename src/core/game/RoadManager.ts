import { Game, Player, PlayerID, Unit, UnitType } from "./Game";
import { TileRef } from "./GameMap";
import { PriorityQueue } from "./PriorityQueue";
import { SpatialGrid } from "./SpatialGrid";
import { StructureGraph } from "./StructureGraph";

/**
 * Represents a road connection between two points
 * @interface Road
 * @property {number} id - Unique identifier for the road
 * @property {TileRef[]} path - Array of tiles forming the road path
 */
export interface Road {
  id: number;
  path: TileRef[];
  owner: PlayerID;
}

interface PlannedRoad {
  owner: PlayerID;
  start: TileRef;
  end: TileRef;
  path: TileRef[];
  length: number;
}

interface ConstructionState {
  planned: PlannedRoad;
  builtIndex: number; // number of completed edges (between tile[i] and tile[i+1])
  pxAccum: number; // remaining pixel progress towards next edge
}

let nextRoadId = 0;

/**
 * RoadManager handles the high-level road management in the game.
 * It coordinates between different systems to:
 * 1. Track road construction between cities and other buildings
 * 2. Manage road networks for multiple players
 * 3. Handle batched road updates efficiently
 * 4. Provide pathfinding for both road construction and unit movement
 */
export class RoadManager {
  // Small penalty for changing direction while laying roads to prefer straighter paths
  // Tuned low so it never overwhelms terrain costs (land=2, road=1, water/shore=20)
  private readonly DIRECTION_CHANGE_PENALTY = 0.5;
  // 8-way movement deltas and cost scale (diagonals)
  private static readonly DX = new Int8Array([0, 0, -1, 1, -1, 1, -1, 1]);
  private static readonly DY = new Int8Array([-1, 1, 0, 0, -1, -1, 1, 1]);
  private static readonly SCALE = new Float32Array([
    1, 1, 1, 1, 1.41421356237, 1.41421356237, 1.41421356237, 1.41421356237,
  ]);
  // Scratch buffers for shortestPathOverFriendlyLand (versioned to avoid full clears)
  private spCosts: Float32Array | null = null;
  private spPrev: Int32Array | null = null;
  private spPrevDir: Int8Array | null = null; // last move dir index [0..7], 127 for start, -128 unset
  private spMark: Uint32Array | null = null;
  private spMarkVersion = 1;
  private spClosed: Uint32Array | null = null; // closed-set marker (versioned)
  private roads = new Map<number, Road>();
  private roadsByOwner = new Map<PlayerID, Set<number>>();
  private structureGraph = new StructureGraph();
  private nodes: Unit[] = [];
  private newNodesQueue: Unit[] = [];
  private spatialGrid: SpatialGrid;
  private pathfindingQueue: {
    from: TileRef;
    to: TileRef;
    radius?: number;
    isPriority?: boolean;
  }[] = [];
  private existingRoadSegments: Set<string> = new Set();
  // Maintain an incrementally updated set of tile-to-tile road segments
  private segmentSet = new Set<string>();
  private pendingAddedSegments: string[] = [];
  private pendingRemovedSegments: string[] = [];
  private nodeOwnerIds = new Map<number, PlayerID>();
  private nodesByOwner = new Map<PlayerID, Unit[]>();

  // New: per-player planned road queues and construction state
  private plannedQueues = new Map<PlayerID, PlannedRoad[]>();
  private currentConstruction = new Map<PlayerID, ConstructionState>();
  private reservedEndpointSegments = new Set<string>(); // endpoints reserved for planned/construction
  private underConstructionSegments = new Set<string>(); // tile-to-tile segments added before finalization

  // Performance optimization caches
  private roadTilesCache = new Set<TileRef>();
  // Tiles belonging to queued or in-progress planned roads (bias pathfinding towards these)
  private plannedTilesCache = new Set<TileRef>();
  private pathCache = new Map<string, TileRef[]>();
  private tileToNode = new Map<TileRef, Unit>();

  // Periodic consistency reconciliation for incremental segment tracking
  private lastSegmentReconcileTick = 0;
  private readonly RECONCILE_INTERVAL_TICKS = 600; // ~60s at 100ms per tick

  private readonly eligible: UnitType[] = [
    UnitType.City,
    UnitType.Port,
    UnitType.Hospital,
    UnitType.Academy,
    UnitType.Airfield,
  ];

  private hasNodesChanged(currentNodes: Unit[]): boolean {
    if (currentNodes.length !== this.nodes.length) return true;
    const currentNodeIds = new Set(currentNodes.map((n) => n.id()));
    return this.nodes.some((n) => !currentNodeIds.has(n.id()));
  }

  private updateTileToNodeIndex(currentNodes: Unit[]) {
    this.tileToNode.clear();
    for (const node of currentNodes) {
      this.tileToNode.set(node.tile(), node);
    }
  }

  private findNodeByTile(tile: TileRef): Unit | undefined {
    return this.tileToNode.get(tile);
  }

  private getCachedPath(start: TileRef, end: TileRef): TileRef[] | null {
    const key = this.getCanonicalSegment(start, end);
    if (this.pathCache.has(key)) {
      return this.pathCache.get(key)!;
    }
    const path = this.computePath(start, end);
    if (path) {
      this.pathCache.set(key, path);
    }
    return path;
  }

  private clearPathCache() {
    this.pathCache.clear();
  }

  /**
   * Creates a new RoadManager instance
   * @param game - Reference to the main game instance
   *
   * The constructor sets up:
   * 1. Spatial grid for efficient node lookups
   * 2. Road cache for rendering optimization
   * 3. Batched road network for pathfinding and connectivity
   * 4. Initial road tiles cache state
   */
  constructor(private game: Game) {
    // Initialize spatial grid with adaptive chunk size
    const adaptiveChunkSize = this.computeAdaptiveChunkSize();
    this.spatialGrid = new SpatialGrid(game.map(), adaptiveChunkSize);

    // Initialize road tiles cache for quick lookups
    this.initializeRoadTilesCache();
  }

  private computeAdaptiveChunkSize(): number {
    const w = this.game.map().width();
    const h = this.game.map().height();
    return Math.max(100, Math.floor(Math.sqrt(w * h) / 20));
  }

  private initializeRoadTilesCache(): void {
    this.roadTilesCache.clear();
    for (const road of this.roads.values()) {
      for (const tile of road.path) {
        this.roadTilesCache.add(tile);
      }
    }
  }

  public hasRoadOnTile(tile: TileRef): boolean {
    return this.roadTilesCache.has(tile);
  }

  public updateLocalArea(center: TileRef, radius: number): void {
    // Queue local updates for roads within radius of the changed tile
    const nearbyNodes = this.spatialGrid.getNearby(
      { tile: () => center } as Unit,
      radius,
    );

    for (const node of nearbyNodes) {
      for (const otherNode of nearbyNodes) {
        if (node.id() !== otherNode.id()) {
          const segment = this.getCanonicalSegment(
            node.tile(),
            otherNode.tile(),
          );
          if (!this.existingRoadSegments.has(segment)) {
            this.pathfindingQueue.push({
              from: node.tile(),
              to: otherNode.tile(),
              radius: radius,
            });
          }
        }
      }
    }
  }

  public update(playersWithRoads: Player[]): {
    added: string[];
    removed: string[];
  } {
    if (playersWithRoads.length === 0) {
      if (this.pathfindingQueue.length > 0) {
        this.pathfindingQueue = [];
      }
      const added = this.pendingAddedSegments;
      const removed = this.pendingRemovedSegments;
      this.pendingAddedSegments = [];
      this.pendingRemovedSegments = [];
      return { added, removed };
    }

    const currentNodes = playersWithRoads.flatMap((p) => {
      const finished = p.units(...this.eligible).filter((u) => u.isActive());
      return [...finished];
    });

    // Synchronize nodes with the StructureGraph
    const currentNodeIds = new Set(currentNodes.map((n) => n.id()));
    const oldNodeIds = new Set(this.nodes.map((n) => n.id()));

    for (const node of currentNodes) {
      if (!oldNodeIds.has(node.id())) {
        this.structureGraph.addNode(node);
      }
    }

    for (const node of this.nodes) {
      if (!currentNodeIds.has(node.id())) {
        this.structureGraph.removeNode(node);
      }
    }

    // Only rebuild caches if nodes have changed significantly
    if (this.hasNodesChanged(currentNodes)) {
      this.spatialGrid = new SpatialGrid(
        this.game.map(),
        this.computeAdaptiveChunkSize(),
      );
      for (const node of currentNodes) {
        this.spatialGrid.add(node);
      }
      this.updateTileToNodeIndex(currentNodes);
      this.clearPathCache();
    }

    const newNodeOwnerIds = new Map<number, PlayerID>();
    currentNodes.forEach((n) => newNodeOwnerIds.set(n.id(), n.owner().id()));

    const newNodes = currentNodes.filter((n) => !this.nodeOwnerIds.has(n.id()));
    const ownerChangedNodes = currentNodes.filter((n) => {
      const oldOwnerId = this.nodeOwnerIds.get(n.id());
      return oldOwnerId && oldOwnerId !== n.owner().id();
    });

    this.newNodesQueue.push(...newNodes, ...ownerChangedNodes);

    const removedNodeIds = [...this.nodeOwnerIds.keys()].filter(
      (id) => !newNodeOwnerIds.has(id),
    );
    const removedNodes = this.nodes.filter((n) =>
      removedNodeIds.includes(n.id()),
    );

    this.nodeOwnerIds = newNodeOwnerIds;

    // Process removed nodes with localized updates
    const ROAD_UPDATE_RADIUS = 10; // Tiles to recalculate around changes
    removedNodes.forEach((node) => {
      const removedNodeTile = node.tile();

      // Get roads that need to be removed
      const affectedRoads = new Set<number>();
      for (const road of this.roads.values()) {
        const startTile = road.path[0];
        const endTile = road.path[road.path.length - 1];
        if (startTile === removedNodeTile || endTile === removedNodeTile) {
          affectedRoads.add(road.id);
        }
      }

      // Remove affected roads
      affectedRoads.forEach((roadId) => {
        const road = this.roads.get(roadId);
        if (road) {
          // Remove from roadsByOwner map
          const ownerRoads = this.roadsByOwner.get(road.owner);
          if (ownerRoads) {
            ownerRoads.delete(roadId);
          }

          const startTile = road.path[0];
          const endTile = road.path[road.path.length - 1];
          // Track per-edge segment removals for UI redraw
          for (let i = 0; i < road.path.length - 1; i++) {
            const seg = this.getCanonicalSegment(
              road.path[i],
              road.path[i + 1],
            );
            if (this.segmentSet.delete(seg))
              this.pendingRemovedSegments.push(seg);
          }
          this.roads.delete(roadId);
          this.existingRoadSegments.delete(
            this.getCanonicalSegment(startTile, endTile),
          );
        }
      });

      // Also cancel any planned or in-progress roads that referenced this node as an endpoint
      // Cancel in-progress constructions first
      const constructionsToCancel: PlayerID[] = [];
      for (const [pid, state] of this.currentConstruction) {
        if (
          state.planned.start === removedNodeTile ||
          state.planned.end === removedNodeTile
        ) {
          // Remove partially built segments and free reservation/planned bias
          this.removePartialConstructionSegments(state);
          this.cleanupPlannedReservationAndBias(
            state.planned.start,
            state.planned.end,
            state.planned.path,
          );
          constructionsToCancel.push(pid);
        }
      }
      for (const pid of constructionsToCancel) {
        this.currentConstruction.delete(pid);
      }

      // Purge queued plans that reference this node
      for (const [ownerId, queue] of this.plannedQueues) {
        const toRemove: PlannedRoad[] = [];
        for (const pr of queue) {
          if (pr.start === removedNodeTile || pr.end === removedNodeTile) {
            toRemove.push(pr);
          }
        }
        if (toRemove.length > 0) {
          for (const pr of toRemove) {
            this.cleanupPlannedReservationAndBias(pr.start, pr.end, pr.path);
          }
          this.plannedQueues.set(
            ownerId,
            queue.filter((pr) => !toRemove.includes(pr)),
          );
        }
      }

      // Queue local updates for nearby nodes
      this.updateLocalArea(removedNodeTile, ROAD_UPDATE_RADIUS);
    });

    // Increase neighbor search radius by 20% to match the max road distance change (100 -> 120)
    const maxRoadDistSquared = 120 * 120;
    const updatesPerTick = this.game.config().roadUpdatesPerTick();

    for (let i = 0; i < updatesPerTick && this.newNodesQueue.length > 0; i++) {
      const newNode = this.newNodesQueue.shift()!;
      const ownerOfNewNode = this.game.owner(newNode.tile());
      if (!ownerOfNewNode.isPlayer()) continue;

      const preFilterNearbyNodes = this.spatialGrid.getNearby(
        newNode,
        Math.sqrt(maxRoadDistSquared),
      );

      const nearbyNodes = preFilterNearbyNodes
        .filter((node) => {
          if (node.id() === newNode.id()) return false;
          const nodeOwner = this.game.owner(node.tile());
          if (!nodeOwner.isPlayer()) return false;

          const owner1ID = ownerOfNewNode.id();
          const owner2ID = nodeOwner.id();
          const areSameOwner = owner1ID === owner2ID;

          return areSameOwner || ownerOfNewNode.isFriendly(nodeOwner as Player);
        })
        .sort(
          (a, b) =>
            this.game.euclideanDistSquared(newNode.tile(), a.tile()) -
            this.game.euclideanDistSquared(newNode.tile(), b.tile()),
        )
        .slice(0, 5); // Consider up to 5 closest neighbors

      for (const neighbor of nearbyNodes) {
        // Consider both built and planned connections when checking redundancy
        const existingOrPlannedPath = this.findPathIncludingPlanned(
          newNode,
          neighbor,
        );
        const roadNetworkMaxRedundantPathLength = 5; // Making it configurable is a good idea for the future

        if (
          existingOrPlannedPath === null ||
          existingOrPlannedPath.length > roadNetworkMaxRedundantPathLength
        ) {
          const segment = this.getCanonicalSegment(
            newNode.tile(),
            neighbor.tile(),
          );
          if (!this.reservedEndpointSegments.has(segment)) {
            const path = this.getCachedPath(newNode.tile(), neighbor.tile());
            if (path) {
              this.enqueuePlannedRoad(
                ownerOfNewNode.id(),
                newNode.tile(),
                neighbor.tile(),
                path,
              );
            }
          }
        }
      }
    }

    this.nodes = currentNodes;

    // Rebuild quick index by owner once per update call
    this.nodesByOwner.clear();
    for (const node of this.nodes) {
      const pid = node.owner().id();
      const arr = this.nodesByOwner.get(pid);
      if (arr) arr.push(node);
      else this.nodesByOwner.set(pid, [node]);
    }

    // Process pathfinding queue in chunks for better performance
    const startTime = performance.now();
    const MAX_PROCESSING_TIME = 16; // Max 16ms per frame to prevent stuttering
    const isBulkOperation = this.pathfindingQueue.length > 100;

    // Sort queue to process priority connections first in bulk operations
    if (isBulkOperation) {
      this.pathfindingQueue.sort((a, b) => {
        if (a.isPriority === b.isPriority) return 0;
        return a.isPriority ? -1 : 1;
      });
    }

    let processedThisTick = 0;
    const MAX_PER_TICK = isBulkOperation ? 50 : 20; // Process fewer connections per tick in bulk mode

    while (
      this.pathfindingQueue.length > 0 &&
      processedThisTick < MAX_PER_TICK
    ) {
      const { from, to, radius, isPriority } = this.pathfindingQueue[0];

      // Skip if outside local update radius for non-priority connections
      if (radius !== undefined && !isPriority) {
        const dist = Math.sqrt(this.game.euclideanDistSquared(from, to));
        if (dist > radius) {
          this.pathfindingQueue.shift();
          continue;
        }
      }

      const canonicalSegment = this.getCanonicalSegment(from, to);

      // Check processing time limit
      if (performance.now() - startTime > MAX_PROCESSING_TIME) {
        break; // Continue next frame if we're taking too long
      }

      processedThisTick++;
      this.pathfindingQueue.shift(); // Only remove if we're actually processing it

      if (!this.reservedEndpointSegments.has(canonicalSegment)) {
        const path = this.getCachedPath(from, to);
        if (path) {
          const owner = this.game.owner(from);
          if (owner.isPlayer()) {
            this.enqueuePlannedRoad(
              owner.id(),
              from,
              to,
              path,
              /*priority*/ !!isPriority,
            );
          }
        }
      }
    }

    // Progressive construction per-player based on slider speed
    this.progressConstruction(playersWithRoads);

    // Periodically reconcile the incremental segment set with authoritative roads
    this.maybeReconcileSegments();

    // Produce incremental updates for the renderer
    const added = this.pendingAddedSegments;
    const removed = this.pendingRemovedSegments;
    this.pendingAddedSegments = [];
    this.pendingRemovedSegments = [];

    return { added, removed };
  }

  private enqueuePlannedRoad(
    owner: PlayerID,
    start: TileRef,
    end: TileRef,
    path: TileRef[],
    isPriority: boolean = false,
  ): void {
    const segmentKey = this.getCanonicalSegment(start, end);
    // Reserve endpoints to avoid duplicate planning
    this.reservedEndpointSegments.add(segmentKey);

    const planned: PlannedRoad = {
      owner,
      start,
      end,
      path,
      length: Math.max(0, (path.length - 1) * 1), // pixels at 1px per tile edge (canvas grid is 1px per tile)
    };

    const queue = this.plannedQueues.get(owner) ?? [];
    queue.push(planned);
    // Sort by length ascending, but keep currentConstruction intact elsewhere
    queue.sort((a, b) => a.length - b.length);
    this.plannedQueues.set(owner, queue);

    // Bias future pathfinding to prefer this planned corridor
    this.addPlannedPath(path);

    // If no construction currently running for owner, start this one
    if (!this.currentConstruction.has(owner)) {
      this.currentConstruction.set(owner, {
        planned,
        builtIndex: 0,
        pxAccum: 0,
      });
      // Remove from queue head (we kept it sorted)
      const idx = queue.indexOf(planned);
      if (idx >= 0) queue.splice(idx, 1);
    }
  }

  private progressConstruction(playersWithRoads: Player[]): void {
    // Map players to their IDs for quick speed lookup
    const playerById = new Map<PlayerID, Player>();
    for (const p of playersWithRoads) playerById.set(p.id(), p);

    for (const [pid, state] of this.currentConstruction) {
      const player = playerById.get(pid);
      if (!player) {
        // Player no longer has roads or is gone; abandon construction and clean up partials
        this.cleanupPlannedReservationAndBias(
          state.planned.start,
          state.planned.end,
          state.planned.path,
        );
        // Remove any partially built segments
        this.removePartialConstructionSegments(state);

        this.currentConstruction.delete(pid);
        continue;
      }
      // Compute build speed (ignore instantBuild for roads):
      // Invested gold per tick = grossGoldPerTick * roadInvestmentRate
      // Using parameter: 600 gold invested per tick yields 1 px per tick
      let edgesToBuild = 0;
      const grossGoldPerTick = this.game.config().grossGoldAdditionRate(player);
      const investRatio = player.roadInvestmentRate?.() ?? 0;
      const investedPerTick = grossGoldPerTick * investRatio; // gold/tick (double)
      const PX_PER_TICK_PER_GOLD = 1 / 600; // 1 px/tick per 600 gold/tick invested
      const pxPerTick = investedPerTick * PX_PER_TICK_PER_GOLD;
      if (pxPerTick <= 0) continue;

      state.pxAccum += pxPerTick;

      // Canvas grid uses 1px per tile step (see RoadLayer using game.x/y() directly)
      const TILE_EDGE_PX = 1;
      edgesToBuild = Math.floor(state.pxAccum / TILE_EDGE_PX);
      if (edgesToBuild <= 0) continue;

      // Consume px and build edges
      state.pxAccum -= edgesToBuild * TILE_EDGE_PX;

      // Validate endpoints periodically; if invalid, abandon and move on
      if (!this.isPlannedRoadValid(state.planned)) {
        // Free reservation and remove any partially built segments
        this.cleanupPlannedReservationAndBias(
          state.planned.start,
          state.planned.end,
          state.planned.path,
        );
        this.removePartialConstructionSegments(state);

        // Cancel this construction entirely and reset all planned/queued roads for this player
        this.currentConstruction.delete(pid);

        this.clearQueuedPlansForPlayer(pid);

        // Do not immediately start the next plan; we cleared the queue so planning can restart cleanly
        continue;
      }

      const path = state.planned.path;
      while (edgesToBuild > 0 && state.builtIndex < path.length - 1) {
        const a = path[state.builtIndex];
        const b = path[state.builtIndex + 1];
        const seg = this.getCanonicalSegment(a, b);
        if (!this.segmentSet.has(seg)) {
          this.segmentSet.add(seg);
          this.pendingAddedSegments.push(seg);
        }
        // Track as under construction until the entire road is finalized
        this.underConstructionSegments.add(seg);
        // Update road tiles cache incrementally to influence future pathfinding
        this.roadTilesCache.add(a);
        this.roadTilesCache.add(b);

        state.builtIndex++;
        edgesToBuild--;
      }

      // If completed, finalize as an authoritative road
      if (state.builtIndex >= path.length - 1) {
        const newRoad: Road = {
          id: nextRoadId++,
          path: path,
          owner: pid,
        };
        this.roads.set(newRoad.id, newRoad);
        if (!this.roadsByOwner.has(newRoad.owner)) {
          this.roadsByOwner.set(newRoad.owner, new Set());
        }
        this.roadsByOwner.get(newRoad.owner)!.add(newRoad.id);

        // Ensure reservation and existing-endpoint record are set
        const endpointKey = this.getCanonicalSegment(
          path[0],
          path[path.length - 1],
        );
        this.existingRoadSegments.add(endpointKey);
        this.reservedEndpointSegments.add(endpointKey);

        // Link in structure graph now that it's built end-to-end
        const startNode = this.findNodeByTile(path[0]);
        const endNode = this.findNodeByTile(path[path.length - 1]);
        if (startNode && endNode) {
          this.structureGraph.addEdge(startNode, endNode, path);
        }

        // This road is now finalized; remove its segments from the temporary under-construction set
        for (let i = 0; i < path.length - 1; i++) {
          const seg = this.getCanonicalSegment(path[i], path[i + 1]);
          this.underConstructionSegments.delete(seg);
        }

        // Remove planned bias now that it's built
        this.removePlannedPath(path);

        // Already incrementally added tiles to roadTilesCache and segments to segmentSet
        // Just clear construction and move to next
        this.currentConstruction.delete(pid);
        this.startNextFor(pid);
      }
    }
  }

  private startNextFor(pid: PlayerID): void {
    const q = this.plannedQueues.get(pid);
    if (!q || q.length === 0) return;
    // Next item is always the first (already sorted shortest-first)
    const planned = q.shift()!;
    this.currentConstruction.set(pid, { planned, builtIndex: 0, pxAccum: 0 });
  }

  private isPlannedRoadValid(pr: PlannedRoad): boolean {
    // Endpoints must remain land and owned by player or friendly
    const ok = (r: TileRef) => {
      if (!this.game.isLand(r)) return false;
      const owner = this.game.owner(r);
      if (!owner.isPlayer()) return false;
      if (owner.id() === pr.owner) return true;
      const roadOwner = this.game.player(pr.owner);
      return roadOwner.isFriendly(owner as Player);
    };
    if (!ok(pr.start) || !ok(pr.end)) return false;

    // Optionally verify that a path still exists (cheap via cache or recompute)
    const cached = this.getCachedPath(pr.start, pr.end);
    return cached !== null;
  }

  private maybeReconcileSegments(force: boolean = false): void {
    const nowTick = this.game.ticks();
    if (
      !force && // Check force parameter
      nowTick - this.lastSegmentReconcileTick < this.RECONCILE_INTERVAL_TICKS
    ) {
      return;
    }
    this.lastSegmentReconcileTick = nowTick;

    // Build current authoritative set from roads
    const current = new Set<string>();
    for (const road of this.roads.values()) {
      for (let i = 0; i < road.path.length - 1; i++) {
        current.add(this.getCanonicalSegment(road.path[i], road.path[i + 1]));
      }
    }

    // Purge orphan "under construction" segments left from abandoned builds
    if (this.underConstructionSegments.size > 0) {
      const activeUC = new Set<string>();
      for (const { planned, builtIndex } of this.currentConstruction.values()) {
        for (let i = 0; i < builtIndex; i++) {
          activeUC.add(
            this.getCanonicalSegment(planned.path[i], planned.path[i + 1]),
          );
        }
      }
      for (const seg of [...this.underConstructionSegments]) {
        if (!activeUC.has(seg)) {
          // No longer part of any active construction; clear the flag
          this.underConstructionSegments.delete(seg);
          // If not an authoritative road edge either, remove the stray segment now
          if (!current.has(seg) && this.segmentSet.delete(seg)) {
            this.pendingRemovedSegments.push(seg);
          }
        }
      }
    }

    // Compute differences
    const toAdd: string[] = [];
    const toRemove: string[] = [];

    for (const seg of current) {
      if (!this.segmentSet.has(seg)) toAdd.push(seg);
    }
    for (const seg of this.segmentSet) {
      if (!current.has(seg)) {
        // Do not remove segments that are currently under construction
        if (!this.underConstructionSegments.has(seg)) {
          toRemove.push(seg);
        }
      }
    }

    if (toAdd.length === 0 && toRemove.length === 0) return;

    // Apply reconciliation to internal state and queue for renderer
    for (const seg of toAdd) this.segmentSet.add(seg);
    for (const seg of toRemove) this.segmentSet.delete(seg);
    this.pendingAddedSegments.push(...toAdd);
    this.pendingRemovedSegments.push(...toRemove);
  }

  private getCanonicalSegment(tile1: TileRef, tile2: TileRef): string {
    return tile1 < tile2 ? `${tile1}-${tile2}` : `${tile2}-${tile1}`;
  }

  private addPlannedPath(path: TileRef[]): void {
    for (const t of path) this.plannedTilesCache.add(t);
  }

  private removePlannedPath(path: TileRef[]): void {
    for (const t of path) this.plannedTilesCache.delete(t);
  }

  // Helper: remove reservation for an endpoint pair and clear planned-path bias
  private cleanupPlannedReservationAndBias(
    start: TileRef,
    end: TileRef,
    path: TileRef[],
  ): void {
    const seg = this.getCanonicalSegment(start, end);
    this.reservedEndpointSegments.delete(seg);
    this.removePlannedPath(path);
  }

  // Helper: remove any partially built segments for a construction state
  private removePartialConstructionSegments(state: ConstructionState): void {
    const path = state.planned.path;
    for (let i = 0; i < state.builtIndex; i++) {
      const a = path[i];
      const b = path[i + 1];
      const seg = this.getCanonicalSegment(a, b);
      if (this.segmentSet.delete(seg)) {
        this.pendingRemovedSegments.push(seg);
      }
      this.underConstructionSegments.delete(seg);
    }
  }

  // Helper: clear all queued plans for a player, releasing reservations and planned bias
  private clearQueuedPlansForPlayer(pid: PlayerID): void {
    const queued = this.plannedQueues.get(pid);
    if (queued) {
      for (const pr of queued) {
        this.cleanupPlannedReservationAndBias(pr.start, pr.end, pr.path);
      }
      this.plannedQueues.delete(pid);
    }
  }

  // Find a path using the built structure graph plus any planned or in-progress edges
  private findPathIncludingPlanned(
    startUnit: Unit,
    endUnit: Unit,
  ): Unit[] | null {
    // Quick win: if built graph already connects them, use that
    const built = this.structureGraph.findPath(startUnit, endUnit);
    if (built) return built;

    // Build a temporary adjacency that augments the built graph with planned edges
    // Gather planned edges (both queued and in-progress)
    const extraEdges = new Map<number, Set<number>>();

    const addEdge = (a?: Unit, b?: Unit) => {
      if (!a || !b) return;
      const aid = a.id();
      const bid = b.id();
      if (!extraEdges.has(aid)) extraEdges.set(aid, new Set());
      if (!extraEdges.has(bid)) extraEdges.set(bid, new Set());
      extraEdges.get(aid)!.add(bid);
      extraEdges.get(bid)!.add(aid);
    };

    // In-progress constructions
    for (const { planned } of this.currentConstruction.values()) {
      const u1 = this.findNodeByTile(planned.start);
      const u2 = this.findNodeByTile(planned.end);
      addEdge(u1, u2);
    }

    // Queued, not-yet-started plans
    for (const queue of this.plannedQueues.values()) {
      for (const pr of queue) {
        const u1 = this.findNodeByTile(pr.start);
        const u2 = this.findNodeByTile(pr.end);
        addEdge(u1, u2);
      }
    }

    // If no extra edges, nothing more to do
    if (extraEdges.size === 0) return null;

    // BFS over built neighbors + extra edges
    const startId = startUnit.id();
    const goalId = endUnit.id();
    const visited = new Set<number>([startId]);
    const cameFrom = new Map<number, number>();
    const q: Unit[] = [startUnit];

    while (q.length > 0) {
      const cur = q.shift()!;
      const curId = cur.id();
      if (curId === goalId) break;

      // Built neighbors
      const builtNeighbors = this.structureGraph.neighbors(cur);
      for (const nb of builtNeighbors) {
        const nid = nb.id();
        if (!visited.has(nid)) {
          visited.add(nid);
          cameFrom.set(nid, curId);
          q.push(nb);
        }
      }

      // Planned neighbors
      const plannedSet = extraEdges.get(curId);
      if (plannedSet) {
        for (const nid of plannedSet) {
          if (!visited.has(nid)) {
            // Neighbor might not be directly connected in built graph yet; locate among known nodes
            const nb =
              builtNeighbors.find((u) => u.id() === nid) ||
              this.nodes.find((u) => u.id() === nid);
            if (nb) {
              visited.add(nid);
              cameFrom.set(nid, curId);
              q.push(nb);
            }
          }
        }
      }
    }

    if (!visited.has(goalId)) return null;

    // Reconstruct path
    const path: Unit[] = [];
    let at = goalId;
    while (at !== startId) {
      const node = this.nodes.find((u) => u.id() === at);
      if (!node) break;
      path.unshift(node);
      at = cameFrom.get(at)!;
    }
    path.unshift(startUnit);
    return path;
  }

  private computePath(start: TileRef, goal: TileRef): TileRef[] | null {
    return this.shortestPathOverFriendlyLand(start, goal);
  }

  private shortestPathOverFriendlyLand(
    start: TileRef,
    goal: TileRef,
  ): TileRef[] | null {
    const ensureSPBuffers = () => {
      const w = this.game.width();
      const h = this.game.height();
      const n = w * h;
      if (!this.spCosts || this.spCosts.length !== n) {
        this.spCosts = new Float32Array(n);
      }
      if (!this.spPrev || this.spPrev.length !== n) {
        this.spPrev = new Int32Array(n);
      }
      if (!this.spPrevDir || this.spPrevDir.length !== n) {
        this.spPrevDir = new Int8Array(n);
      }
      if (!this.spMark || this.spMark.length !== n) {
        this.spMark = new Uint32Array(n);
      }
      if (!this.spClosed || this.spClosed.length !== n) {
        this.spClosed = new Uint32Array(n);
      }
    };
    if (start === goal) return [start];

    const startOwner = this.game.owner(start);
    if (!startOwner.isPlayer()) return null;

    const maxRoadLength = this.game.config().maxRoadLength();

    // Check maximum road distance (as the crow flies)
    if (
      this.game.euclideanDistSquared(start, goal) >
      maxRoadLength * maxRoadLength
    ) {
      return null;
    }

    // Build fast owner allow-list once per query
    const allowedOwners = new Set<number>();
    const startPlayer = startOwner as Player;
    allowedOwners.add(startPlayer.smallID());
    for (const p of this.game.players()) {
      if (p.smallID() !== startPlayer.smallID() && startPlayer.isFriendly(p)) {
        allowedOwners.add(p.smallID());
      }
    }

    const ok = (r: TileRef) => {
      // Allow water/shore tiles to be traversed for roads (bridges/ferries),
      // but keep ownership rules for land tiles.
      if (!this.game.isLand(r)) return true;
      // Land tiles must be owned by the start owner or friendly
      const oid = this.game.ownerID(r);
      if (oid === 0) return false; // terra nullius
      return allowedOwners.has(oid);
    };

    if (!ok(start) || !ok(goal)) return null;

    // Fallback to regular A* search if no road path found
    ensureSPBuffers();
    // Version bump; reset when wrap-around
    if (this.spMarkVersion === 0xffffffff) {
      this.spMark!.fill(0);
      this.spClosed!.fill(0);
      this.spMarkVersion = 1;
    }
    const version = ++this.spMarkVersion;
    const costs = this.spCosts!;
    const prev = this.spPrev!;
    const prevDirArr = this.spPrevDir!;
    const mark = this.spMark!;
    const closed = this.spClosed!;

    const INF = Number.POSITIVE_INFINITY;
    const getCost = (t: TileRef) => (mark[t] === version ? costs[t] : INF);
    const setCost = (t: TileRef, c: number) => {
      mark[t] = version;
      costs[t] = c;
    };
    const setPrev = (t: TileRef, p: number, dir: number) => {
      prev[t] = p;
      prevDirArr[t] = dir;
    };

    const pq = new PriorityQueue<TileRef>();
    setCost(start, 0);
    setPrev(start, -1, 127); // 127 sentinel for start (no direction)
    // Precompute goal position for heuristic
    const gx = this.game.x(goal);
    const gy = this.game.y(goal);
    const SQRT2 = 1.41421356237;
    const octile = (x: number, y: number) => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      const m = Math.min(dx, dy);
      // Lower bound using min step cost = 1
      return dx + dy - m + m * SQRT2;
    };
    pq.enqueue(octile(this.game.x(start), this.game.y(start)), start);

    let expanded = 0;
    const MAX_EXPANSIONS = 80000; // hard safety cap to avoid frame stalls on worst cases
    while (pq.size > 0) {
      const current = pq.dequeue();
      if (current === undefined) break;
      if (closed[current] === version) continue;
      closed[current] = version;
      if (++expanded > MAX_EXPANSIONS) {
        // Give up this attempt to avoid freezing the game; let planner try later
        return null;
      }

      if (current === goal) break;

      const currentCost = getCost(current);

      // Enumerate 8-directional neighbors without allocations
      const cx = this.game.x(current);
      const cy = this.game.y(current);
      // If even the best-case remaining distance would exceed the max cost, prune this node
      if (currentCost + octile(cx, cy) > maxRoadLength) {
        continue;
      }
      const w = this.game.width();
      const h = this.game.height();
      // dx,dy pairs: 4-orthogonal + 4-diagonals (class-level typed arrays to avoid allocations)
      const DX = RoadManager.DX;
      const DY = RoadManager.DY;
      const SCALE = RoadManager.SCALE;
      const prevDir = prevDirArr[current];
      for (let dir = 0; dir < 8; dir++) {
        const dx = DX[dir];
        const dy = DY[dir];
        // Fast bounds checks without creating coords/TileRef via ref()
        if ((dx === -1 && cx === 0) || (dx === 1 && cx === w - 1)) continue;
        if ((dy === -1 && cy === 0) || (dy === 1 && cy === h - 1)) continue;
        const neighbor = (current + dx + dy * w) as TileRef;
        if (closed[neighbor] === version) continue;
        // Prefer built and planned roads equally over fresh land
        // Base land cost = 2, Water/Shore cost = 20, Built/Planned = 1
        let stepCost = 2;
        if (
          this.roadTilesCache.has(neighbor) ||
          this.plannedTilesCache.has(neighbor)
        ) {
          stepCost = 1;
        } else if (!this.game.isLand(neighbor) || this.game.isShore(neighbor)) {
          stepCost = 20;
        }
        const moveScale = SCALE[dir];

        // Add a small penalty if turning relative to how we entered `current`
        let turnPenalty = 0;
        if (prevDir !== 127 /* has a direction */) {
          if (prevDir !== dir) turnPenalty = this.DIRECTION_CHANGE_PENALTY;
        }

        const newCost = currentCost + stepCost * moveScale + turnPenalty;

        // Stop exploring paths that are already too long (cost threshold)
        if (newCost > maxRoadLength) continue;

        if (newCost < getCost(neighbor)) {
          setCost(neighbor, newCost);
          setPrev(neighbor, current, dir);
          // A* priority: f = g + h (with admissible octile heuristic using min step cost 1)
          pq.enqueue(
            newCost + octile(this.game.x(neighbor), this.game.y(neighbor)),
            neighbor,
          );
        }
      }
    }

    if (getCost(goal) === INF) return null;

    const path: TileRef[] = [];
    for (let at: number = goal; at !== -1; at = prev[at])
      path.push(at as TileRef);
    path.reverse();

    return path.length > 0 ? path : null;
  }

  public findCompleteStructurePath(
    startUnit: Unit,
    endUnit: Unit,
  ): TileRef[] | null {
    const structurePath = this.structureGraph.findPath(startUnit, endUnit);
    if (!structurePath || structurePath.length < 2) {
      return null;
    }

    const completePath: TileRef[] = [];
    for (let i = 0; i < structurePath.length - 1; i++) {
      const from = structurePath[i];
      const to = structurePath[i + 1];
      const edge = this.structureGraph.getEdge(from, to);

      if (edge) {
        const segmentPath = [...edge.path];
        if (segmentPath[0] !== from.tile()) {
          segmentPath.reverse();
        }
        // On the first segment, add the whole path.
        // On subsequent segments, slice(1) to avoid duplicating the connection node.
        completePath.push(...(i === 0 ? segmentPath : segmentPath.slice(1)));
      }
    }
    return completePath;
  }

  public getConnectedNodes(player: Player): Unit[] {
    return this.nodesByOwner.get(player.id()) ?? [];
  }

  public destroyPlayerRoads(player: Player): void {
    const roadIdsToDestroy = this.roadsByOwner.get(player.id());
    if (!roadIdsToDestroy) {
      // Still clear any planned or in-progress roads for this player
      this.clearQueuedPlansForPlayer(player.id());
      const inProg = this.currentConstruction.get(player.id());
      if (inProg) {
        // Free endpoint reservation so it can be planned again in the future
        this.cleanupPlannedReservationAndBias(
          inProg.planned.start,
          inProg.planned.end,
          inProg.planned.path,
        );
        this.currentConstruction.delete(player.id());
      }
      return;
    }

    for (const roadId of roadIdsToDestroy) {
      const road = this.roads.get(roadId);
      if (road) {
        for (const tile of road.path) {
          this.roadTilesCache.delete(tile);
        }

        const startNode = this.findNodeByTile(road.path[0]);
        const endNode = this.findNodeByTile(road.path[road.path.length - 1]);

        // Clean up all state related to this road
        if (startNode && endNode) {
          this.structureGraph.removeEdge(startNode, endNode);
        }
        // Clear endpoint tracking based on path endpoints (nodes may be missing)
        const endpointSeg = this.getCanonicalSegment(
          road.path[0],
          road.path[road.path.length - 1],
        );
        this.existingRoadSegments.delete(endpointSeg);
        // Free reservation so endpoints can be replanned later
        this.reservedEndpointSegments.delete(endpointSeg);

        this.roads.delete(roadId);

        // Explicitly remove segments from segmentSet for renderer
        for (let i = 0; i < road.path.length - 1; i++) {
          const seg = this.getCanonicalSegment(road.path[i], road.path[i + 1]);
          if (this.segmentSet.delete(seg)) {
            this.pendingRemovedSegments.push(seg); // Ensure these are also queued for renderer
          }
        }
      }
    }

    this.roadsByOwner.delete(player.id());

    // Also clear planned and in-progress work for this player
    this.clearQueuedPlansForPlayer(player.id());
    const inProg = this.currentConstruction.get(player.id());
    if (inProg) {
      // Remove any partially built segments from the incremental state
      this.removePartialConstructionSegments(inProg);
      this.cleanupPlannedReservationAndBias(
        inProg.planned.start,
        inProg.planned.end,
        inProg.planned.path,
      );
      this.currentConstruction.delete(player.id());
    }

    // Clear path cache as roads have been destroyed
    this.clearPathCache();

    this.maybeReconcileSegments(true);
  }

  public markPlayerNodesForReconnection(player: Player): void {
    const playerNodes = player
      .units(...this.eligible)
      .filter((u) => u.isActive());
    for (const node of playerNodes) {
      // Only remove from nodeOwnerIds to make them appear as newNodes in the next update
      this.nodeOwnerIds.delete(node.id());
    }
  }

  // Expose current roads for external consumers (e.g., GameImpl/tests)
  public getRoads(): Road[] {
    return Array.from(this.roads.values());
  }

  // Road KPI helper for per-player counts
  public getCountsForPlayer(player: Player): {
    completed: number;
    queued: number;
    inProgress: number;
  } {
    const pid = player.id();
    const completed = this.roadsByOwner.get(pid)?.size ?? 0;
    const queued = this.plannedQueues.get(pid)?.length ?? 0;
    const inProgress = this.currentConstruction.has(pid) ? 1 : 0;
    return { completed, queued, inProgress };
  }
}
