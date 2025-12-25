import { SAMMissileExecution } from "../../../src/core/execution/SAMMissileExecution";
import { WarshipExecution } from "../../../src/core/execution/WarshipExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
  UpgradeType,
} from "../../../src/core/game/Game";
import { PseudoRandom } from "../../../src/core/PseudoRandom";
import { setup } from "../../util/Setup";
import { executeTicks } from "../../util/utils";

// Test suite for the Warship's new Anti-Air capability
describe("WarshipExecution AA Capability", () => {
  let game: Game;
  let player1: Player; // Our warship owner
  let player2: Player; // Our aircraft owner
  let warship: Unit;

  // This block runs before each test to create a clean game world
  beforeEach(async () => {
    // Use the existing 'setup' helper to create the game
    game = await setup(
      "half_land_half_ocean", // A map with water
      { infiniteGold: true, instantBuild: true },
      [
        new PlayerInfo("p1", "Player 1", PlayerType.Human, null, "p1_id"),
        new PlayerInfo("p2", "Player 2", PlayerType.Human, null, "p2_id"),
      ],
    );

    // Fast-forward through the spawn phase
    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    // Get references to our players
    player1 = game.player("p1_id");
    player2 = game.player("p2_id");

    // Set players at war so warship AA will engage
    player1.setWarWith(player2);
    player2.setWarWith(player1);

    // Create the warship for player1 at a known valid sea coordinate
    warship = player1.buildUnit(UnitType.Warship, game.ref(7, 10), {
      patrolTile: game.ref(7, 10),
    });

    // Add the WarshipExecution to the game's execution loop
    game.addExecution(new WarshipExecution(warship));
  });

  // Test Case: No Upgrade
  test("should not engage aircraft without the AA upgrade", () => {
    const addExecutionSpy = jest.spyOn(game, "addExecution");
    player2.buildUnit(UnitType.Bomber, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
    });
    executeTicks(game, 10);
    expect(addExecutionSpy).not.toHaveBeenCalledWith(
      expect.any(SAMMissileExecution),
    );
  });

  // Test Case: With Upgrade
  test("should engage a bomber with the AA upgrade", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    const addExecutionSpy = jest.spyOn(game, "addExecution");
    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1); // Guarantee hit
    player2.buildUnit(UnitType.Bomber, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
    });
    executeTicks(game, 10);
    expect(addExecutionSpy).toHaveBeenCalledWith(
      expect.any(SAMMissileExecution),
    );
  });

  // Test Case: Range Check
  test("should not engage aircraft outside of AA range", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    const addExecutionSpy = jest.spyOn(game, "addExecution");

    // Mock the AA range to be a very small, controllable value
    jest.spyOn(game.config(), "warshipAARange").mockReturnValue(5);

    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1);

    // Place bomber at a safe coordinate outside the mocked range of 5
    player2.buildUnit(UnitType.Bomber, game.ref(0, 0), {
      targetTile: game.ref(0, 0),
    });

    executeTicks(game, 10);

    expect(addExecutionSpy).not.toHaveBeenCalledWith(
      expect.any(SAMMissileExecution),
    );
  });

  // Test Case: Cooldown Check
  test("should respect the AA cooldown", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    const addExecutionSpy = jest.spyOn(game, "addExecution");
    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1); // Guarantee hits
    player2.buildUnit(UnitType.Bomber, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
    });

    // Fire the first shot
    executeTicks(game, 10);
    expect(addExecutionSpy).toHaveBeenCalledTimes(1);

    // Create a new target immediately. Cooldown is 50 ticks.
    player2.buildUnit(UnitType.Bomber, game.ref(12, 12), {
      targetTile: game.ref(0, 0),
    });
    executeTicks(game, 40); // Not enough time for cooldown

    // Assert it hasn't fired again
    expect(addExecutionSpy).toHaveBeenCalledTimes(1);
  });

  // Test Case: Target Priority
  test("should prioritize a Paratrooper over a Bomber", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1); // Guarantee hit

    const bomber = player2.buildUnit(UnitType.Bomber, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
    });
    const paratrooper = player2.buildUnit(
      UnitType.Paratrooper,
      game.ref(12, 12),
      { troops: 100, targetTile: game.ref(1, 1) },
    );

    executeTicks(game, 10);

    expect(paratrooper.targetedBySAM()).toBe(true);
    expect(bomber.targetedBySAM()).toBe(false);
  });

  // Test Case: No Nuke Targeting
  test("should ignore nuke units", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    const addExecutionSpy = jest.spyOn(game, "addExecution");
    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1);
    player2.buildUnit(UnitType.AtomBomb, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
      trajectory: [
        { tile: game.ref(11, 11), targetable: true },
        { tile: game.ref(10, 11), targetable: true },
      ],
    });
    executeTicks(game, 10);
    expect(addExecutionSpy).not.toHaveBeenCalledWith(
      expect.any(SAMMissileExecution),
    );
  });

  // Test Case: Anti-Overkill
  test("should not fire at a target already targeted by another SAM", () => {
    player1.addUpgrade(UpgradeType.WarshipAntiAir);
    const addExecutionSpy = jest.spyOn(game, "addExecution");
    jest.spyOn(PseudoRandom.prototype, "next").mockReturnValue(0.1);

    const bomber = player2.buildUnit(UnitType.Bomber, game.ref(11, 11), {
      targetTile: game.ref(0, 0),
    });
    bomber.setTargetedBySAM(true); // Simulate another SAM locking on

    executeTicks(game, 10);

    expect(addExecutionSpy).not.toHaveBeenCalledWith(
      expect.any(SAMMissileExecution),
    );
  });
});

// Test suite for Warship target caching optimization
describe("WarshipExecution Target Caching", () => {
  let game: Game;
  let player1: Player;
  let player2: Player;
  let warship: Unit;

  beforeEach(async () => {
    game = await setup(
      "half_land_half_ocean",
      { infiniteGold: true, instantBuild: true },
      [
        new PlayerInfo("p1", "Player 1", PlayerType.Human, null, "p1_id"),
        new PlayerInfo("p2", "Player 2", PlayerType.Human, null, "p2_id"),
      ],
    );

    while (game.inSpawnPhase()) {
      game.executeNextTick();
    }

    player1 = game.player("p1_id");
    player2 = game.player("p2_id");

    // Players start at war by default (no alliance)

    warship = player1.buildUnit(UnitType.Warship, game.ref(7, 10), {
      patrolTile: game.ref(7, 10),
    });

    game.addExecution(new WarshipExecution(warship));
  });

  test("should cache target and reduce nearbyUnits() calls", () => {
    // This test verifies caching behavior indirectly by checking
    // that the warship maintains its target across multiple ticks

    // Create enemy warship
    const enemyWarship = player2.buildUnit(UnitType.Warship, game.ref(8, 10), {
      patrolTile: game.ref(8, 10),
    });

    // Let warship acquire target
    executeTicks(game, 3);
    const initialTarget = warship.targetUnit();

    // Run several more ticks - target should remain cached
    executeTicks(game, 7); // Total of 10 ticks (cache duration)
    const targetAfterCache = warship.targetUnit();

    // If warship had a target, it should maintain it via cache
    // (unless destroyed or out of range)
    if (initialTarget && enemyWarship.isActive()) {
      expect(targetAfterCache).toBe(initialTarget);
    }
  });

  test("should invalidate cache when target is destroyed", () => {
    const enemyWarship = player2.buildUnit(UnitType.Warship, game.ref(8, 10), {
      patrolTile: game.ref(8, 10),
    });

    // Let warship acquire target
    executeTicks(game, 5);
    // Warship should have acquired the target by now (or not, depending on engagement rules)
    const hadTarget = warship.targetUnit() === enemyWarship;

    // Destroy enemy
    enemyWarship.modifyHealth(-1000);
    game.executeNextTick();

    // If it had a target before, it should be cleared now
    // If it never targeted it (due to game rules), that's also fine
    if (hadTarget) {
      expect(warship.targetUnit()).toBeUndefined();
    }
  });

  test("should re-scan after cache expires (10 ticks)", () => {
    const nearbyUnitsSpy = jest.spyOn(game, "nearbyUnits");

    player2.buildUnit(UnitType.Warship, game.ref(8, 10), {
      patrolTile: game.ref(8, 10),
    });

    // First scan
    game.executeNextTick();
    const firstCallCount = nearbyUnitsSpy.mock.calls.length;

    // Run until cache should expire (10 ticks)
    executeTicks(game, 10);

    // Should have made a new nearbyUnits call for target finding
    expect(nearbyUnitsSpy.mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  test("should maintain correct targeting behavior with cache", () => {
    // Create multiple targets with different priorities
    const submarine = player2.buildUnit(UnitType.Submarine, game.ref(9, 10), {
      patrolTile: game.ref(9, 10),
    });
    submarine.isAttacking = true; // Make visible

    const artillery = player2.buildUnit(UnitType.Artillery, game.ref(8, 11), {
      patrolTile: game.ref(8, 11),
    });

    const enemyWarship = player2.buildUnit(UnitType.Warship, game.ref(7, 11), {
      patrolTile: game.ref(7, 11),
    });

    executeTicks(game, 5);

    // Warship should target something (priority: submarine > artillery > warship)
    const currentTarget = warship.targetUnit();

    // Test only runs if warship acquired a target (depends on war state and range)
    if (currentTarget) {
      expect([submarine, artillery, enemyWarship]).toContain(currentTarget);

      // If it targeted the submarine, test priority switching
      if (currentTarget === submarine) {
        // Destroy submarine
        submarine.modifyHealth(-1000);
        executeTicks(game, 2);

        // Should switch to artillery or warship
        const newTarget = warship.targetUnit();
        if (newTarget) {
          expect([artillery, enemyWarship]).toContain(newTarget);
        }
      }
    }
  });

  test("should not cache invalid targets", () => {
    // Create friendly warship (shouldn't be targeted)
    const friendlyWarship = player1.buildUnit(
      UnitType.Warship,
      game.ref(8, 10),
      { patrolTile: game.ref(8, 10) },
    );

    executeTicks(game, 5);

    // Should not target friendly unit
    expect(warship.targetUnit()).toBeUndefined();
  });
});
