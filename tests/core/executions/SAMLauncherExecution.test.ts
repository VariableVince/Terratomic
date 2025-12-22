import { NukeExecution } from "../../../src/core/execution/NukeExecution";
import { SAMLauncherExecution } from "../../../src/core/execution/SAMLauncherExecution";
import { SpawnExecution } from "../../../src/core/execution/SpawnExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
  UpgradeType,
} from "../../../src/core/game/Game";
import { setup } from "../../util/Setup";
import { constructionExecution, executeTicks } from "../../util/utils";

let game: Game;
let attacker: Player;
let defender: Player;
let far_defender: Player;
let middle_defender: Player;

describe("SAM", () => {
  beforeEach(async () => {
    game = await setup("BigPlains", { infiniteGold: true, instantBuild: true });
    const defender_info = new PlayerInfo(
      "us",
      "defender_id",
      PlayerType.Human,
      null,
      "defender_id",
    );
    const middle_defender_info = new PlayerInfo(
      "us",
      "middle_defender_id",
      PlayerType.Human,
      null,
      "middle_defender_id",
    );
    const far_defender_info = new PlayerInfo(
      "us",
      "far_defender_id",
      PlayerType.Human,
      null,
      "far_defender_id",
    );
    const attacker_info = new PlayerInfo(
      "fr",
      "attacker_id",
      PlayerType.Human,
      null,
      "attacker_id",
    );
    game.addPlayer(defender_info);
    game.addPlayer(middle_defender_info);
    game.addPlayer(far_defender_info);
    game.addPlayer(attacker_info);

    game.addExecution(
      new SpawnExecution(game.player(defender_info.id).info(), game.ref(1, 1)),
      new SpawnExecution(
        game.player(middle_defender_info.id).info(),
        game.ref(50, 1),
      ),
      new SpawnExecution(
        game.player(far_defender_info.id).info(),
        game.ref(199, 1),
      ),
      new SpawnExecution(game.player(attacker_info.id).info(), game.ref(7, 7)),
    );

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    attacker = game.player("attacker_id");
    defender = game.player("defender_id");
    middle_defender = game.player("middle_defender_id");
    far_defender = game.player("far_defender_id");

    // Grant nuclear upgrade so attacker can build missile silo and nukes
    attacker.addUpgrade(UpgradeType.NuclearFission);

    constructionExecution(game, attacker, 7, 7, UnitType.MissileSilo);

    // SAM Level 1 is available by default at game start
  });

  test("one sam should take down one nuke", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);

    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Sam will only target nukes it can destroy before it reaches its target
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(3, 1),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });
    executeTicks(game, 3);

    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(0);
  });

  test("sam should only get one nuke at a time", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);

    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    attacker.buildUnit(UnitType.AtomBomb, game.ref(2, 1), {
      targetTile: game.ref(3, 1),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });
    attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 2), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(1, 2), targetable: true },
        { tile: game.ref(1, 3), targetable: true },
      ],
    });
    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(2);

    executeTicks(game, 3);

    expect(attacker.units(UnitType.AtomBomb)).toHaveLength(1);
  });

  test("sam should cooldown as long as configured", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);

    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    expect(sam.isInCooldown()).toBeFalsy();
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });

    executeTicks(game, 3);

    expect(nuke.isActive()).toBeFalsy();
    for (let i = 0; i < game.config().SAMNukeCooldown() - 3; i++) {
      game.executeNextTick();
      expect(sam.isInCooldown()).toBeTruthy();
    }

    executeTicks(game, 2);

    expect(sam.isInCooldown()).toBeFalsy();
  });

  test("two sams should not target twice same nuke", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);

    const sam1 = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam1));
    const sam2 = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 2), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam2));
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(1, 1), {
      targetTile: game.ref(1, 3),
      trajectory: [
        { tile: game.ref(1, 1), targetable: true },
        { tile: game.ref(1, 2), targetable: true },
        { tile: game.ref(1, 3), targetable: true },
      ],
    });

    executeTicks(game, 3);

    expect(nuke.isActive()).toBeFalsy();
    expect([sam1, sam2].filter((s) => s.isInCooldown())).toHaveLength(1);
  });

  test("SAMs should target close to launch site", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);

    const targetDistance = 199;
    // Close SAM: should intercept the nuke
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    const nukeExecution = new NukeExecution(
      UnitType.AtomBomb,
      attacker,
      game.ref(targetDistance, 1),
      null,
    );
    game.addExecution(nukeExecution);
    // Long distance nuke: compute the proper number of ticks
    const ticksToExecute = Math.ceil(
      targetDistance / game.config().defaultNukeSpeed() + 1,
    );
    executeTicks(game, ticksToExecute);

    expect(nukeExecution.isActive()).toBeFalsy();
    expect(sam.isInCooldown()).toBeTruthy();
  });

  test("SAMs should target only nukes aimed at nearby targets if not close to launch site", async () => {
    attacker.setWarWith(defender);
    defender.setWarWith(attacker);
    attacker.setWarWith(middle_defender);
    middle_defender.setWarWith(attacker);
    attacker.setWarWith(far_defender);
    far_defender.setWarWith(attacker);

    const targetDistance = 199;
    // Middle SAM: should not intercept the nuke
    const sam1 = middle_defender.buildUnit(
      UnitType.SAMLauncher,
      game.ref(50, 1),
      {},
    );
    game.addExecution(new SAMLauncherExecution(defender, null, sam1));

    // Far SAM: Should intercept the nuke. Use the far_defender so the SAM can be built
    const sam2 = far_defender.buildUnit(
      UnitType.SAMLauncher,
      game.ref(targetDistance, 1),
      {},
    );
    game.addExecution(new SAMLauncherExecution(far_defender, null, sam2));

    const nukeExecution = new NukeExecution(
      UnitType.AtomBomb,
      attacker,
      game.ref(targetDistance, 1),
      null,
    );
    game.addExecution(nukeExecution);
    // Long distance nuke: compute the proper number of ticks
    const ticksToExecute = Math.ceil(
      targetDistance / game.config().defaultNukeSpeed() + 1,
    );
    executeTicks(game, ticksToExecute);
    expect(nukeExecution.isActive()).toBeFalsy();
    expect(sam1.isInCooldown()).toBeFalsy();
    expect(sam2.isInCooldown()).toBeTruthy();
  });

  test("neutral: SAM should not intercept bomber unless bomber targets defender land", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Bomber in range but targeting attacker land.
    const bomber = attacker.buildUnit(UnitType.Bomber, game.ref(2, 1), {
      targetTile: game.ref(7, 7),
    });

    // Run enough ticks to hit the 20-tick plane interception sweep.
    executeTicks(game, 25);

    expect(bomber.targetedBySAM()).toBe(false);
  });

  test("neutral: SAM should intercept bomber when bomber targets defender land", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Bomber in range and targeting a tile owned by defender.
    const bomber = attacker.buildUnit(UnitType.Bomber, game.ref(2, 1), {
      targetTile: game.ref(1, 1),
    });

    executeTicks(game, 25);

    expect(bomber.targetedBySAM()).toBe(true);
  });

  test("neutral: SAM should not intercept a nuke that does not threaten its territory", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Nuke travels near the SAM but is targeted far away (blast radius doesn't touch defender land).
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(2, 1), {
      targetTile: game.ref(199, 199),
      trajectory: [
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(2, 2), targetable: true },
        { tile: game.ref(2, 3), targetable: true },
      ],
    });

    executeTicks(game, 5);

    expect(nuke.targetedBySAM()).toBe(false);
    expect(sam.isInCooldown()).toBeFalsy();
  });

  test("neutral: SAM should intercept a nuke whose blast radius threatens its territory", async () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(1, 1), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));

    // Target near defender so blast radius overlaps defender-owned tiles.
    const nuke = attacker.buildUnit(UnitType.AtomBomb, game.ref(2, 1), {
      targetTile: game.ref(3, 1),
      trajectory: [
        { tile: game.ref(2, 1), targetable: true },
        { tile: game.ref(3, 1), targetable: true },
      ],
    });

    executeTicks(game, 5);

    expect(nuke.targetedBySAM()).toBe(true);
  });
});
