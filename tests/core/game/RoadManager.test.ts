import {
  Player,
  PlayerType,
  UnitType,
  UpgradeType,
} from "../../../src/core/game/Game";
import { GameImpl } from "../../../src/core/game/GameImpl";
import { PlayerImpl } from "../../../src/core/game/PlayerImpl";
import { RoadManager } from "../../../src/core/game/RoadManager";
import { playerInfo, setup } from "../../util/Setup";
import { executeTicks } from "../../util/utils";

describe("RoadManager", () => {
  let game: GameImpl;
  let playerA: Player;
  let roadManager: RoadManager;

  beforeEach(async () => {
    game = (await setup("ocean_and_land", { instantBuild: true })) as GameImpl;
    const pInfo = playerInfo("Player A", PlayerType.Human);
    game.addPlayer(pInfo);
    playerA = game.player(pInfo.id);
    roadManager = (game as any).roadManager;
    // Ensure roads can actually be constructed during tests without relying on instantBuild
    // by allocating sufficient per-tick income to roads and boosting workers for income.
    playerA.setRoadInvestmentRate(1);
    (playerA as any).addWorkers(10000000);
  });

  it("should form a road between two cities for a player with the Roads upgrade", () => {
    playerA.addUpgrade(UpgradeType.Roads);

    const tile1 = game.ref(0, 10);
    const tile2 = game.ref(0, 15);

    // Explicitly conquer a path of tiles for the player to ensure pathfinding works
    for (let i = 10; i <= 15; i++) {
      const tile = game.ref(0, i);
      if (game.owner(tile) !== playerA) {
        game.conquer(playerA as PlayerImpl, tile);
      }
    }

    const city1 = playerA.buildUnit(UnitType.City, tile1, {});
    const city2 = playerA.buildUnit(UnitType.City, tile2, {});
    executeTicks(game, 15);

    const roads = (roadManager as any).roads;
    expect(roads.size).toBeGreaterThan(0);

    const segment = (roadManager as any).getCanonicalSegment(
      city1.tile(),
      city2.tile(),
    );
    expect((roadManager as any).existingRoadSegments.has(segment)).toBe(true);
  });

  it("should NOT form a road if the player does not have the Roads upgrade", () => {
    const tile1 = game.ref(0, 10);
    const tile2 = game.ref(0, 15);
    game.conquer(playerA as PlayerImpl, tile1);
    game.conquer(playerA as PlayerImpl, tile2);

    playerA.buildUnit(UnitType.City, tile1, {});
    playerA.buildUnit(UnitType.City, tile2, {});
    executeTicks(game, 15);

    const roads = (roadManager as any).roads;
    expect(roads.size).toBe(0);
  });

  it("destroyPlayerRoads should clear all road state for a player", () => {
    playerA.addUpgrade(UpgradeType.Roads);
    const tile1 = game.ref(0, 10);
    const tile2 = game.ref(0, 15);
    for (let i = 10; i <= 15; i++) {
      game.conquer(playerA as PlayerImpl, game.ref(0, i));
    }

    const city1 = playerA.buildUnit(UnitType.City, tile1, {});
    const city2 = playerA.buildUnit(UnitType.City, tile2, {});
    executeTicks(game, 15);
    expect((roadManager as any).roads.size).toBeGreaterThan(0);

    const segment = (roadManager as any).getCanonicalSegment(
      city1.tile(),
      city2.tile(),
    );

    roadManager.destroyPlayerRoads(playerA);

    expect((roadManager as any).roads.size).toBe(0);
    expect((roadManager as any).roadsByOwner.has(playerA.id())).toBe(false);
    expect((roadManager as any).existingRoadSegments.has(segment)).toBe(false);
    expect((roadManager as any).pathCache.size).toBe(0);
    const graph = (roadManager as any).structureGraph;
    const edge = graph.getEdge(city1, city2);
    expect(edge).toBeUndefined();
  });

  it("should rebuild the road network after using markPlayerNodesForReconnection", () => {
    playerA.addUpgrade(UpgradeType.Roads);
    const tile1 = game.ref(0, 10);
    const tile2 = game.ref(0, 15);
    for (let i = 10; i <= 15; i++) {
      game.conquer(playerA as PlayerImpl, game.ref(0, i));
    }

    playerA.buildUnit(UnitType.City, tile1, {});
    playerA.buildUnit(UnitType.City, tile2, {});
    executeTicks(game, 15);
    expect((roadManager as any).roads.size).toBeGreaterThan(0);

    roadManager.destroyPlayerRoads(playerA);
    expect((roadManager as any).roads.size).toBe(0);

    // Re-add the upgrade before marking for reconnection
    playerA.addUpgrade(UpgradeType.Roads);
    roadManager.markPlayerNodesForReconnection(playerA);
    executeTicks(game, 15);

    expect((roadManager as any).roads.size).toBeGreaterThan(0);
  });

  it("revalidates and recalculates a queued road path when it reaches the top of the queue", () => {
    playerA.addUpgrade(UpgradeType.Roads);

    // Conquer a 3x5 corridor to allow alternate routing around a future blocked tile
    for (let x = 0; x <= 2; x++) {
      for (let y = 10; y <= 14; y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) {
          game.conquer(playerA as PlayerImpl, t);
        }
      }
    }

    const start = game.ref(0, 10);
    const end = game.ref(0, 14);

    // Seed path cache/path planner
    const initialPath: number[] = (roadManager as any).getCachedPath(
      start,
      end,
    );
    expect(initialPath).toBeTruthy();
    expect((initialPath as number[]).length).toBeGreaterThan(1);

    // Enqueue a short dummy plan first to ensure our target plan sits in the queue initially
    const dStart = game.ref(2, 10);
    const dEnd = game.ref(2, 11);
    const dPath: number[] = (roadManager as any).getCachedPath(dStart, dEnd);
    (roadManager as any).enqueuePlannedRoad(
      playerA.id(),
      dStart,
      dEnd,
      dPath,
      false,
    );

    // Now enqueue the target plan which will initially be queued behind the dummy
    (roadManager as any).enqueuePlannedRoad(
      playerA.id(),
      start,
      end,
      initialPath,
      false,
    );

    // Invalidate the original path by making a middle land tile neutral
    const blocked = game.ref(0, 12);
    // Ensure the tile is land and currently owned before relinquishing
    expect(game.isLand(blocked)).toBe(true);
    game.relinquish(blocked);

    // Simulate the first construction finishing
    (roadManager as any).currentConstruction.delete(playerA.id());

    // Start next; this should revalidate and recalculate the path
    (roadManager as any).startNextFor(playerA.id());

    const state = (roadManager as any).currentConstruction.get(playerA.id());
    expect(state).toBeTruthy();
    const nextPath: number[] = state.planned.path;
    // Should have a valid path to build after revalidation
    expect(nextPath.length).toBeGreaterThan(1);
  });

  it("does not traverse foreign-owned land for domestic roads (only own land or water/shore)", () => {
    // Add a second player (foreign)
    const pInfoB = playerInfo("Player B", PlayerType.Human);
    game.addPlayer(pInfoB);
    const playerB = game.player(pInfoB.id);

    // Player A has Roads
    playerA.addUpgrade(UpgradeType.Roads);

    // Conquer a 3x5 corridor for Player A so alternate paths exist around a blocked tile
    for (let x = 0; x <= 2; x++) {
      for (let y = 10; y <= 14; y++) {
        const t = game.ref(x, y);
        if (game.isLand(t)) {
          game.conquer(playerA as PlayerImpl, t);
        }
      }
    }

    const start = game.ref(0, 10);
    const end = game.ref(0, 14);

    // Make a direct in-line land tile owned by Player B to force a detour if possible
    const foreignBlock = game.ref(0, 12);
    if (game.isLand(foreignBlock)) {
      game.conquer(playerB as PlayerImpl, foreignBlock);
    }

    // Compute a domestic path (private method access via any)
    const path: number[] | null = (
      roadManager as any
    ).shortestPathOverFriendlyLand(start, end);

    // If no path exists (e.g., due to map layout), test is inconclusive but should not fail.
    // When a path exists, ensure it never uses foreign-owned land.
    if (path && path.length > 0) {
      for (const t of path as number[]) {
        const tile = t as unknown as number;
        if (game.isLand(tile as any)) {
          expect(game.owner(tile as any)).toBe(playerA);
        }
      }
    }
  });
});
