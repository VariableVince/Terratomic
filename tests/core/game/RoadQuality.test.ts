import {
  Player,
  PlayerType,
  UnitType,
  UpgradeType,
} from "../../../src/core/game/Game";
import { GameImpl } from "../../../src/core/game/GameImpl";
import { PlayerImpl } from "../../../src/core/game/PlayerImpl";
import { playerInfo, setup } from "../../util/Setup";
import { executeTicks } from "../../util/utils";

describe("Road network quality", () => {
  let game: GameImpl;
  let playerA: Player;
  let playerB: Player;

  beforeEach(async () => {
    game = (await setup("ocean_and_land", { instantBuild: true })) as GameImpl;
    const pInfoA = playerInfo("Player A", PlayerType.Human);
    const pInfoB = playerInfo("Player B", PlayerType.Human);
    game.addPlayer(pInfoA);
    game.addPlayer(pInfoB);
    playerA = game.player(pInfoA.id);
    playerB = game.player(pInfoB.id);
  });

  it("defaults to 100 and stays 100 when building new roads", () => {
    // No roads yet
    expect(playerA.roadNetworkQuality()).toBe(100);

    playerA.addUpgrade(UpgradeType.Roads);
    // Make a straight land path and two cities
    const tile1 = game.ref(0, 10);
    const tile2 = game.ref(0, 15);
    for (let i = 10; i <= 15; i++) {
      const tile = game.ref(0, i);
      if (game.owner(tile) !== playerA) {
        game.conquer(playerA as PlayerImpl, tile);
      }
    }
    playerA.buildUnit(UnitType.City, tile1, {});
    playerA.buildUnit(UnitType.City, tile2, {});

    // Run a few ticks to allow planning/build
    executeTicks(game, 25);

    expect(playerA.roadNetworkQuality()).toBe(100);
  });

  it("uses source owner's quality when roads are taken via conquest (transfer)", () => {
    playerA.addUpgrade(UpgradeType.Roads);
    playerB.addUpgrade(UpgradeType.Roads);

    const tile1 = game.ref(1, 10);
    const tile2 = game.ref(1, 15);

    // Own the path for A
    for (let i = 10; i <= 15; i++) {
      const tile = game.ref(1, i);
      if (game.owner(tile) !== playerA) {
        game.conquer(playerA as PlayerImpl, tile);
      }
    }

    const city1 = playerA.buildUnit(UnitType.City, tile1, {});
    const city2 = playerA.buildUnit(UnitType.City, tile2, {});

    executeTicks(game, 30);

    // Sanity
    expect(playerA.roadNetworkQuality()).toBe(100);
    expect(playerB.roadNetworkQuality()).toBe(100);

    // Player B conquers city1 tile and captures the unit (simulating conquest)
    game.conquer(playerB as PlayerImpl, tile1);
    (playerB as PlayerImpl).captureUnit(city1);

    // Allow RoadManager to process owner change and reassign credit
    executeTicks(game, 10);

    // B gains attribution for part of the road; quality should reflect source quality (A = 100)
    expect(playerB.roadNetworkQuality()).toBe(100);
  });
});
