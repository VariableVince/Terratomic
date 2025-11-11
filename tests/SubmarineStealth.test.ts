import { GameRunner } from "../src/core/GameRunner";
import { Executor } from "../src/core/execution/ExecutionManager";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

const coastX = 7;

describe("Submarine stealth filtering", () => {
  let game: Game;
  let p1: Player; // submarine owner
  let p2: Player; // viewer/enemy

  beforeEach(async () => {
    game = await setup(
      "half_land_half_ocean",
      {
        infiniteGold: true,
        instantBuild: true,
      },
      [
        new PlayerInfo("us", "p1", PlayerType.Human, "c1", "player_1_id"),
        new PlayerInfo("us", "p2", PlayerType.Human, "c2", "player_2_id"),
      ],
    );

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    p1 = game.player("player_1_id");
    p2 = game.player("player_2_id");
  });

  function mkRunner(clientID: string): GameRunner {
    // Minimal runner instance to use its filter function
    const exec = new Executor(game, "test_game", clientID);
    return new GameRunner(game, exec, () => {}, clientID);
  }

  test("Enemy does not see idle, undetected submarine; owner does", () => {
    const sub = p1.buildUnit(UnitType.Submarine, game.ref(coastX + 1, 10), {
      patrolTile: game.ref(coastX + 1, 10),
    });

    // Advance one tick to ensure unit state is stable
    game.executeNextTick();

    const updates = game.executeNextTick();
    // Replace unit updates with just the submarine's current state
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];

    const rEnemy = mkRunner("c2");
    const filteredEnemy = rEnemy.filterUpdatesForClient(updates);
    expect(filteredEnemy[GameUpdateType.Unit].length).toBe(0); // hidden

    const rOwner = mkRunner("c1");
    const filteredOwner = rOwner.filterUpdatesForClient(updates);
    expect(filteredOwner[GameUpdateType.Unit].length).toBe(1); // owner always sees
    expect((filteredOwner[GameUpdateType.Unit][0] as any).unitType).toBe(
      UnitType.Submarine,
    );
  });

  test("Detection reveals to detector only; linger then ghost on loss", () => {
    const pos = game.ref(coastX + 1, 10);
    const sub = p1.buildUnit(UnitType.Submarine, pos, { patrolTile: pos });

    // Detector warship for p2 near the submarine
    const ws = p2.buildUnit(UnitType.Warship, game.ref(coastX + 1, 9), {
      patrolTile: game.ref(coastX + 1, 9),
    });

    executeTicks(game, 1);

    // Construct a unit update for submarine
    let updates = game.executeNextTick();
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];

    const rEnemy = mkRunner("c2");

    // With detector nearby, enemy should see the submarine
    let filtered = rEnemy.filterUpdatesForClient(updates);
    expect(filtered[GameUpdateType.Unit].length).toBe(1);
    expect((filtered[GameUpdateType.Unit][0] as any).unitType).toBe(
      UnitType.Submarine,
    );

    // Remove detector; visibility should linger
    ws.delete();
    const linger = game.config().submarineDetectionLingerTicks();

    // First tick after removal: still visible due to linger
    game.executeNextTick();
    updates = game.executeNextTick();
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];
    filtered = rEnemy.filterUpdatesForClient(updates);
    expect(filtered[GameUpdateType.Unit].length).toBe(1);

    // Fast-forward to after linger expires
    executeTicks(game, linger);
    updates = game.executeNextTick();
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];
    filtered = rEnemy.filterUpdatesForClient(updates);

    // On the transition tick, a single ghost update should be emitted
    expect(filtered[GameUpdateType.Unit].length).toBe(1);
    expect((filtered[GameUpdateType.Unit][0] as any).ghost).toBe(true);
    expect(
      (filtered[GameUpdateType.Unit][0] as any).ghostExpiresAt,
    ).toBeGreaterThan(game.ticks());

    // Subsequent ticks while ghost is active should not resend the ghost
    const ghostLinger = game.config().submarineGhostLingerTicks();
    game.executeNextTick();
    updates = game.executeNextTick();
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];
    filtered = rEnemy.filterUpdatesForClient(updates);
    expect(filtered[GameUpdateType.Unit].length).toBe(0);

    // After ghost expiry, still no updates for the hidden sub
    executeTicks(game, ghostLinger + 1);
    updates = game.executeNextTick();
    (updates as any)[GameUpdateType.Unit] = [sub.toUpdate()];
    filtered = rEnemy.filterUpdatesForClient(updates);
    expect(filtered[GameUpdateType.Unit].length).toBe(0);
  });
});
