import { renderNumber } from "../../client/Utils";
import { Config } from "../configuration/Config";
import {
  Execution,
  Game,
  MessageType,
  Player,
  UnitType,
  UpgradeType,
} from "../game/Game";
import { GameImpl } from "../game/GameImpl";
import { GameMap, TileRef } from "../game/GameMap";
import { PseudoRandom } from "../PseudoRandom";
import { getTechNodes, isTechAvailable } from "../tech/ResearchTree";
import { RESEARCH_TECH_IDS } from "../tech/TechEffects";
import { calculateBoundingBox, getMode, inscribed, simpleHash } from "../Util";

export class PlayerExecution implements Execution {
  private readonly ticksPerClusterCalc = 20;

  private config: Config;
  private lastCalc = 0;
  private mg: Game;
  private active = true;
  private random: PseudoRandom | null = null;

  constructor(private player: Player) {}

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  init(mg: Game, ticks: number) {
    this.mg = mg;
    this.config = mg.config();
    this.lastCalc =
      ticks + (simpleHash(this.player.name()) % this.ticksPerClusterCalc);
    // Seed RNG for per-player deterministic-ish behavior
    this.random = new PseudoRandom(ticks + simpleHash(this.player.id()));
  }

  tick(ticks: number) {
    this.player.decayRelations();
    this.player.units().forEach((u) => {
      const tileOwner = this.mg!.owner(u.tile());
      if (u.info().territoryBound) {
        if (tileOwner.isPlayer()) {
          if (tileOwner !== this.player) {
            this.mg!.player(tileOwner.id()).captureUnit(u);
          }
        } else {
          u.delete();
        }
      }
    });

    if (!this.player.isAlive()) {
      // Player has no tiles, delete any remaining units and gold
      const gold = this.player.gold();
      this.player.removeGold(gold);
      this.player.units().forEach((u) => {
        if (
          u.type() !== UnitType.AtomBomb &&
          u.type() !== UnitType.HydrogenBomb &&
          u.type() !== UnitType.MIRVWarhead &&
          u.type() !== UnitType.MIRV
        ) {
          u.delete();
        }
      });
      this.active = false;
      return;
    }

    const popInc =
      this.config.populationIncreaseRate(this.player) +
      this.player.hospitalReturns();
    this.player.resetHospitalReturns();
    this.player.addWorkers(popInc * (1 - this.player.targetTroopRatio()));
    this.player.addTroops(popInc * this.player.targetTroopRatio());
    // Compute gross gold from config (pre-investment), then apply both investments
    const grossGoldDouble = this.config.grossGoldAdditionRate(this.player);
    const grossGold = BigInt(
      Math.floor(Number.isFinite(grossGoldDouble) ? grossGoldDouble : 0),
    );

    const prodInvest = this.player.investmentRate?.() ?? 0; // 0..0.5 (clamped in PlayerImpl)
    const roadInvest = this.player.hasUpgrade(UpgradeType.Roads)
      ? (this.player.roadInvestmentRate?.() ?? 0)
      : 0;
    const researchInvest = this.player.researchInvestmentRate?.() ?? 0; // 0..1 (no gating)
    let totalInvest = prodInvest + roadInvest + researchInvest; // can exceed 1

    // Allow up to 110% total when treasury is positive, else cap at 100%
    const hasTreasury = this.player.gold() > 0n;
    const maxTotal = hasTreasury ? 1.1 : 1.0;
    if (totalInvest > maxTotal) totalInvest = maxTotal;

    // Net gold added this tick (can be negative when totalInvest > 1)
    let netGoldDouble = grossGoldDouble * (1 - totalInvest);
    if (!Number.isFinite(netGoldDouble)) netGoldDouble = 0;
    let netGold = BigInt(Math.floor(netGoldDouble));
    // Prevent gold from going below zero (server-side safety)
    if (netGold < 0n) {
      const goldNow = this.player.gold();
      if (goldNow + netGold < 0n) {
        netGold = -goldNow; // drain treasury to zero at most
      }
    }
    this.player.addGold(netGold);
    this.player.updateProductivity();
    // Record stats
    // Track net income after investment in stats
    this.mg.stats().goldWork(this.player, netGold);

    const adjustRate = this.config.troopAdjustmentRate(this.player);
    this.player.addTroops(adjustRate);
    this.player.removeWorkers(adjustRate);

    const alliances = Array.from(this.player.alliances());
    for (const alliance of alliances) {
      if (
        this.mg.ticks() - alliance.createdAt() >
        this.mg.config().allianceDuration()
      ) {
        alliance.expire();
      }
    }

    const embargoes = this.player.getEmbargoes();
    for (const embargo of embargoes) {
      if (
        embargo.isTemporary &&
        this.mg.ticks() - embargo.createdAt >
          this.mg.config().temporaryEmbargoDuration()
      ) {
        this.player.stopEmbargo(embargo.target);
      }
    }

    // Regenerate health of damaged buildings
    this.player.units().forEach((u) => {
      if (u.hasHealth() && u.health() < (u.info().maxHealth ?? 0)) {
        u.modifyHealth(0.5);
      }
    });

    if (ticks - this.lastCalc > this.ticksPerClusterCalc) {
      if (this.player.lastTileChange() > this.lastCalc) {
        this.lastCalc = ticks;
        const start = performance.now();
        this.removeClusters();
        const end = performance.now();
        if (end - start > 1000) {
          console.log(`player ${this.player.name()}, took ${end - start}ms`);
        }
      }
    }

    // --- Research system per-tick processing ---
    this.tickResearch();
  }

  private tickResearch() {
    // Ensure RNG and config are ready
    if (!this.random) return;

    // Determine research investment (gold) this tick and transform via f(x) = A * investment^B
    const grossGold = this.config.grossGoldAdditionRate(this.player);
    const investRate = (this.player as any).researchInvestmentRate?.() ?? 0;
    if (investRate <= 0 || grossGold <= 0) return;

    const investment = Math.max(0, grossGold * investRate);
    const A = this.config.researchAlpha();
    const B = this.config.researchBeta();
    const xTotal = A * Math.pow(investment, B);
    if (!Number.isFinite(xTotal) || xTotal <= 0) return;

    // Build researched set and available techs
    const nodes = getTechNodes();
    const researched = new Set<string>();
    for (const n of nodes) {
      if ((this.player as any).hasResearchedTech?.(n.id)) researched.add(n.id);
    }
    const available = nodes.filter(
      (n) => !researched.has(n.id) && isTechAvailable(n.id, researched),
    );
    if (available.length === 0) return;

    // Allocation: 50% to priority, 50% split among remaining; if no valid priority, split evenly
    const priorityId: string | null =
      (this.player as any).researchPriority?.() ?? null;
    const priorityInSet =
      priorityId !== null && available.some((n) => n.id === priorityId);

    const k = this.config.researchK();
    const bMin = this.config.researchBeakerMin();
    const bMax = this.config.researchBeakerMax();

    // Helper to get node by id and same-category filtering
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    const sameCat = (a: string, b: string) =>
      (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

    // Build prerequisite path set for a target within same category, including only missing techs
    const buildMissingPrereqPath = (targetId: string): Set<string> => {
      const path = new Set<string>();
      const seen = new Set<string>();
      const dfs = (tid: string) => {
        if (seen.has(tid)) return;
        seen.add(tid);
        const node = byId.get(tid);
        if (!node) return;
        // If already available given current researched, stop here
        // We collect missing prereqs only
        const reqAll = (node.requiresAllOf ?? []).filter((p) =>
          sameCat(p, tid),
        );
        const reqOne = (node.requiresOneOf ?? []).filter((p) =>
          sameCat(p, tid),
        );

        // Handle requiresAllOf: include those not yet researched
        for (const r of reqAll) {
          if (!researched.has(r)) {
            path.add(r);
            dfs(r);
          }
        }
        // Handle requiresOneOf: if none are researched, choose one deterministically
        if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
          // Choose the lower-level option first; fallback to first listed
          const sorted = [...reqOne].sort(
            (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
          );
          const choice = sorted[0];
          if (choice && !researched.has(choice)) {
            path.add(choice);
            dfs(choice);
          }
        }
      };
      dfs(targetId);
      return path;
    };

    const alloc: Record<string, number> = {};
    if (priorityId && !priorityInSet) {
      // Priority target not available: allocate half to the frontier of its missing prereqs
      const pathSet = buildMissingPrereqPath(priorityId);
      const frontier = available.filter((n) => pathSet.has(n.id));
      if (frontier.length > 0) {
        const half = 0.5 * xTotal;
        const shareFrontier = half / frontier.length;
        for (const n of frontier)
          alloc[n.id] = (alloc[n.id] ?? 0) + shareFrontier;
        const others = available.filter((n) => !pathSet.has(n.id));
        const remaining = xTotal - half;
        const shareOthers = others.length > 0 ? remaining / others.length : 0;
        for (const n of others) alloc[n.id] = (alloc[n.id] ?? 0) + shareOthers;
      } else {
        // Fallback: even split if no frontier identified
        const share = xTotal / available.length;
        for (const n of available) alloc[n.id] = share;
      }
    } else if (priorityInSet && available.length > 1) {
      const half = 0.5 * xTotal;
      alloc[priorityId!] = (alloc[priorityId!] ?? 0) + half;
      const others = available.filter((n) => n.id !== priorityId);
      const share = others.length > 0 ? half / others.length : 0;
      for (const n of others) alloc[n.id] = (alloc[n.id] ?? 0) + share;
    } else {
      const share = xTotal / available.length;
      for (const n of available) alloc[n.id] = share;
    }

    // For each tech, compute per-tick success probability and award beakers on success
    for (const n of available) {
      const x = alloc[n.id] ?? 0;
      if (x <= 0) continue;
      const p = 1 - Math.exp(-k * x);
      const roll = this.random.next();
      if (roll < p) {
        // Success: award uniform beakers between [bMin, bMax] inclusive
        const beakers = this.random.nextInt(bMin, bMax + 1);
        const result = (this.player as any).addResearchBeakers?.(
          n.id,
          beakers,
          n.cost,
        );
        if (result?.completed) {
          // On completion, record tech and apply any side-effects
          // Roads unlock via Economy-1 (Post-War Reconstruction)
          if (n.id === RESEARCH_TECH_IDS.POST_WAR_RECONSTRUCTION) {
            if (!(this.player as any).hasUpgrade?.(UpgradeType.Roads)) {
              (this.player as any).addUpgrade?.(UpgradeType.Roads);
            }
          }
        }
      }
    }
  }

  private removeClusters() {
    const clusters = this.calculateClusters();
    clusters.sort((a, b) => b.size - a.size);

    const main = clusters.shift();
    if (main === undefined) throw new Error("No clusters");
    this.player.largestClusterBoundingBox = calculateBoundingBox(this.mg, main);
    const surroundedBy = this.surroundedBySamePlayer(main);
    if (surroundedBy && !this.player.isFriendly(surroundedBy)) {
      this.removeCluster(main);
    }

    for (const cluster of clusters) {
      if (this.isSurrounded(cluster)) {
        this.removeCluster(cluster);
      }
    }
  }

  private surroundedBySamePlayer(cluster: Set<TileRef>): false | Player {
    const enemies = new Set<number>();
    for (const tile of cluster) {
      const isOceanShore = this.mg.isOceanShore(tile);
      if (this.mg.isOceanShore(tile) && !isOceanShore) {
        continue;
      }
      if (
        isOceanShore ||
        this.mg.isOnEdgeOfMap(tile) ||
        this.mg.neighbors(tile).some((n) => !this.mg?.hasOwner(n))
      ) {
        return false;
      }
      this.mg
        .neighbors(tile)
        .filter((n) => this.mg?.ownerID(n) !== this.player?.smallID())
        .forEach((p) => this.mg && enemies.add(this.mg.ownerID(p)));
      if (enemies.size !== 1) {
        return false;
      }
    }
    if (enemies.size !== 1) {
      return false;
    }
    const enemy = this.mg.playerBySmallID(Array.from(enemies)[0]) as Player;
    const enemyBox = calculateBoundingBox(this.mg, enemy.borderTiles());
    const clusterBox = calculateBoundingBox(this.mg, cluster);
    if (inscribed(enemyBox, clusterBox)) {
      return enemy;
    }
    return false;
  }

  private isSurrounded(cluster: Set<TileRef>): boolean {
    const enemyTiles = new Set<TileRef>();
    for (const tr of cluster) {
      if (this.mg.isShore(tr) || this.mg.isOnEdgeOfMap(tr)) {
        return false;
      }
      this.mg
        .neighbors(tr)
        .filter(
          (n) =>
            this.mg?.owner(n).isPlayer() &&
            this.mg?.ownerID(n) !== this.player?.smallID(),
        )
        .forEach((n) => enemyTiles.add(n));
    }
    if (enemyTiles.size === 0) {
      return false;
    }
    const enemyBox = calculateBoundingBox(this.mg, enemyTiles);
    const clusterBox = calculateBoundingBox(this.mg, cluster);
    return inscribed(enemyBox, clusterBox);
  }

  private removeCluster(cluster: Set<TileRef>) {
    if (
      Array.from(cluster).some(
        (t) => this.mg?.ownerID(t) !== this.player?.smallID(),
      )
    ) {
      // Other removeCluster operations could change tile owners,
      // so double check.
      return;
    }

    const capturing = this.getCapturingPlayer(cluster);
    if (capturing === null) {
      return;
    }

    const firstTile = cluster.values().next().value;
    if (!firstTile) {
      return;
    }

    const filter = (_: GameMap, t: TileRef): boolean =>
      this.mg?.ownerID(t) === this.player?.smallID();
    const tiles = this.mg.bfs(firstTile, filter);

    if (this.player.numTilesOwned() === tiles.size) {
      const gold = this.player.gold();
      this.mg.displayMessage(
        `Conquered ${this.player.displayName()} received ${renderNumber(
          gold,
        )} gold`,
        MessageType.CONQUERED_PLAYER,
        capturing.id(),
        gold,
      );
      capturing.addGold(gold);
      this.player.removeGold(gold);

      // Record stats
      this.mg.stats().goldWar(capturing, this.player, gold);
    }

    for (const tile of tiles) {
      capturing.conquer(tile);
    }
  }

  private getCapturingPlayer(cluster: Set<TileRef>): Player | null {
    const neighborsIDs = new Set<number>();
    for (const t of cluster) {
      for (const neighbor of this.mg.neighbors(t)) {
        if (this.mg.ownerID(neighbor) !== this.player.smallID()) {
          neighborsIDs.add(this.mg.ownerID(neighbor));
        }
      }
    }

    let largestNeighborAttack: Player | null = null;
    let largestTroopCount: number = 0;
    for (const id of neighborsIDs) {
      const neighbor = this.mg.playerBySmallID(id);
      if (!neighbor.isPlayer() || this.player.isFriendly(neighbor)) {
        continue;
      }
      for (const attack of neighbor.outgoingAttacks()) {
        if (attack.target() === this.player) {
          if (attack.troops() > largestTroopCount) {
            largestTroopCount = attack.troops();
            largestNeighborAttack = neighbor;
          }
        }
      }
    }
    if (largestNeighborAttack !== null) {
      return largestNeighborAttack;
    }

    // fall back to getting mode if no attacks
    const mode = getMode(neighborsIDs);
    if (!this.mg.playerBySmallID(mode).isPlayer()) {
      return null;
    }
    const capturing = this.mg.playerBySmallID(mode);
    if (!capturing.isPlayer()) {
      return null;
    }
    return capturing;
  }

  private calculateClusters(): Set<TileRef>[] {
    const seen = new Set<TileRef>();
    const border = this.player.borderTiles();
    const clusters: Set<TileRef>[] = [];
    for (const tile of border) {
      if (seen.has(tile)) {
        continue;
      }

      const cluster = new Set<TileRef>();
      const queue: TileRef[] = [tile];
      seen.add(tile);
      while (queue.length > 0) {
        const curr = queue.shift();
        if (curr === undefined) throw new Error("curr is undefined");
        cluster.add(curr);

        const neighbors = (this.mg as GameImpl).neighborsWithDiag(curr);
        for (const neighbor of neighbors) {
          if (border.has(neighbor) && !seen.has(neighbor)) {
            queue.push(neighbor);
            seen.add(neighbor);
          }
        }
      }
      clusters.push(cluster);
    }
    return clusters;
  }

  owner(): Player {
    if (this.player === null) {
      throw new Error("Not initialized");
    }
    return this.player;
  }

  isActive(): boolean {
    return this.active;
  }
}
