import FastPriorityQueue from "fastpriorityqueue";
import { AStar, PathFindResultType } from "./AStar";

/**
 * Implement this interface with your graph to find paths with A*
 */
export interface GraphAdapter<NodeType> {
  // Iterable to support arrays or typed array views
  neighbors(node: NodeType): Iterable<NodeType>;
  cost(node: NodeType): number;
  position(node: NodeType): { x: number; y: number };
  isTraversable(from: NodeType, to: NodeType): boolean;
}

export class SerialAStar<NodeType> implements AStar<NodeType> {
  private fwdOpenSet: FastPriorityQueue<{
    tile: NodeType;
    fScore: number;
  }>;
  private bwdOpenSet: FastPriorityQueue<{
    tile: NodeType;
    fScore: number;
  }>;

  private fwdCameFrom = new Map<NodeType, NodeType>();
  private bwdCameFrom = new Map<NodeType, NodeType>();
  private fwdGScore = new Map<NodeType, number>();
  private bwdGScore = new Map<NodeType, number>();
  // Direction used to reach a node (encoded as an int 0..8)
  private fwdDirTo = new Map<NodeType, number>();
  private bwdDirTo = new Map<NodeType, number>();

  private meetingPoint: NodeType | null = null;
  public completed = false;
  private sources: NodeType[];
  private closestSource: NodeType;

  constructor(
    src: NodeType | NodeType[],
    private dst: NodeType,
    private iterations: number,
    private maxTries: number,
    private graph: GraphAdapter<NodeType>,
    private directionChangePenalty: number = 0,
  ) {
    this.fwdOpenSet = new FastPriorityQueue((a, b) => a.fScore < b.fScore);
    this.bwdOpenSet = new FastPriorityQueue((a, b) => a.fScore < b.fScore);
    this.sources = Array.isArray(src) ? src : [src];
    this.closestSource = this.findClosestSource(dst);

    // Initialize forward search with source point(s)
    this.sources.forEach((startPoint) => {
      this.fwdGScore.set(startPoint, 0);
      this.fwdOpenSet.add({
        tile: startPoint,
        fScore: this.heuristic(startPoint, dst),
      });
    });

    // Initialize backward search from destination
    this.bwdGScore.set(dst, 0);
    this.bwdOpenSet.add({
      tile: dst,
      fScore: this.heuristic(dst, this.findClosestSource(dst)),
    });
  }

  private findClosestSource(tile: NodeType): NodeType {
    return this.sources.reduce((closest, source) =>
      this.heuristic(tile, source) < this.heuristic(tile, closest)
        ? source
        : closest,
    );
  }

  compute(): PathFindResultType {
    if (this.completed) return PathFindResultType.Completed;

    this.maxTries -= 1;
    let iterations = this.iterations;

    while (!this.fwdOpenSet.isEmpty() && !this.bwdOpenSet.isEmpty()) {
      iterations--;
      if (iterations <= 0) {
        if (this.maxTries <= 0) {
          return PathFindResultType.PathNotFound;
        }
        return PathFindResultType.Pending;
      }

      // Process forward search
      const fwdCurrent = this.fwdOpenSet.poll()!.tile;

      // Check if we've found a meeting point
      if (this.bwdGScore.has(fwdCurrent)) {
        this.meetingPoint = fwdCurrent;
        this.completed = true;
        return PathFindResultType.Completed;
      }
      this.expandNode(fwdCurrent, true);
      if (this.completed) return PathFindResultType.Completed;

      // Process backward search
      const bwdCurrent = this.bwdOpenSet.poll()!.tile;

      // Check if we've found a meeting point
      if (this.fwdGScore.has(bwdCurrent)) {
        this.meetingPoint = bwdCurrent;
        this.completed = true;
        return PathFindResultType.Completed;
      }
      this.expandNode(bwdCurrent, false);
      if (this.completed) return PathFindResultType.Completed;
    }

    return this.completed
      ? PathFindResultType.Completed
      : PathFindResultType.PathNotFound;
  }

  private expandNode(current: NodeType, isForward: boolean) {
    // Hoist side-specific structures and immutable targets out of the loop
    const gScore = isForward ? this.fwdGScore : this.bwdGScore;
    const openSet = isForward ? this.fwdOpenSet : this.bwdOpenSet;
    const cameFrom = isForward ? this.fwdCameFrom : this.bwdCameFrom;
    const dirTo = isForward ? this.fwdDirTo : this.bwdDirTo;
    const otherG = isForward ? this.bwdGScore : this.fwdGScore;
    const target = isForward ? this.dst : this.closestSource;

    // Cache current and target positions once
    const currentPos = this.graph.position(current);
    const targetPos = this.graph.position(target);
    const prevDirCode =
      this.directionChangePenalty > 0 ? dirTo.get(current) : undefined;
    const currentG = gScore.get(current)!;

    for (const neighbor of this.graph.neighbors(current)) {
      // Skip non-traversable neighbors except when the neighbor is the target
      if (neighbor !== target && !this.graph.isTraversable(current, neighbor))
        continue;

      const tentativeGScore = currentG + this.graph.cost(neighbor);
      // Cache neighbor position once (used by penalty and heuristic)
      const nPos = this.graph.position(neighbor);

      // Optional direction change penalty without string allocations
      let penalty = 0;
      let newDirCode: number | undefined = undefined;
      if (this.directionChangePenalty > 0) {
        const dx = Math.sign(nPos.x - currentPos.x) + 1; // 0..2
        const dy = Math.sign(nPos.y - currentPos.y) + 1; // 0..2
        newDirCode = dx * 3 + dy; // 0..8
        if (prevDirCode !== undefined && prevDirCode !== newDirCode) {
          penalty = this.directionChangePenalty;
        }
      }

      const totalG = tentativeGScore + penalty;
      const neighborG = gScore.get(neighbor);
      if (neighborG === undefined || totalG < neighborG) {
        cameFrom.set(neighbor, current);
        gScore.set(neighbor, totalG);
        if (this.directionChangePenalty > 0 && newDirCode !== undefined) {
          dirTo.set(neighbor, newDirCode);
        }

        // Inline heuristic using cached target position (2 * Manhattan)
        const fScore =
          totalG +
          2 * (Math.abs(nPos.x - targetPos.x) + Math.abs(nPos.y - targetPos.y));
        openSet.add({ tile: neighbor, fScore });

        // Early meeting detection to reduce expansions
        if (otherG.has(neighbor)) {
          this.meetingPoint = neighbor;
          this.completed = true;
          return;
        }
      }
    }
  }

  private heuristic(a: NodeType, b: NodeType): number {
    const posA = this.graph.position(a);
    const posB = this.graph.position(b);
    return 2 * (Math.abs(posA.x - posB.x) + Math.abs(posA.y - posB.y));
  }

  private getDirection(from: NodeType, to: NodeType): string {
    const fromPos = this.graph.position(from);
    const toPos = this.graph.position(to);
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    return `${Math.sign(dx)},${Math.sign(dy)}`;
  }

  public reconstructPath(): NodeType[] {
    if (!this.meetingPoint) return [];

    // Reconstruct path from start to meeting point
    const fwdPath: NodeType[] = [this.meetingPoint];
    let current = this.meetingPoint;

    while (this.fwdCameFrom.has(current)) {
      current = this.fwdCameFrom.get(current)!;
      fwdPath.unshift(current);
    }

    // Reconstruct path from meeting point to goal
    current = this.meetingPoint;

    while (this.bwdCameFrom.has(current)) {
      current = this.bwdCameFrom.get(current)!;
      fwdPath.push(current);
    }

    return fwdPath;
  }
}
