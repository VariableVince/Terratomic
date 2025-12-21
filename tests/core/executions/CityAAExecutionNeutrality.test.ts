import { CityAAExecution } from "../../../src/core/execution/CityAAExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
  UpgradeType,
} from "../../../src/core/game/Game";
import { setup } from "../../util/Setup";
import { TestConfig } from "../../util/TestConfig";
import { executeTicks } from "../../util/utils";

let game: Game;
let defender: Player;
let attacker: Player;
let attackerAirfield: Unit;

async function setupCityAA(): Promise<void> {
  game = await setup("BigPlains", { infiniteGold: true, instantBuild: true }, [
    new PlayerInfo("us", "defender", PlayerType.Human, "client_def", "def_id"),
    new PlayerInfo("us", "attacker", PlayerType.Human, "client_att", "att_id"),
  ]);

  while (game.inSpawnPhase()) {
    game.executeNextTick();
  }

  defender = game.player("def_id");
  attacker = game.player("att_id");

  // Make City AA deterministic + fast.
  const cfg = game.config() as TestConfig;
  cfg.cityAAFireRate = jest.fn(() => 1);
  cfg.cityAARange = jest.fn(() => 6);
  cfg.cityAABulletSpeed = jest.fn(() => 6);
  cfg.cityAABulletDamage = jest.fn(() => 999_999);

  // Defender city + ownership
  defender.conquer(game.ref(10, 10));
  defender.conquer(game.ref(10, 11));
  defender.conquer(game.ref(11, 11));
  defender.buildUnit(UnitType.City, game.ref(10, 10), {});

  // Attacker airfield just to satisfy bomber metadata (sourceAirfield)
  attacker.conquer(game.ref(30, 30));
  attackerAirfield = attacker.buildUnit(
    UnitType.Airfield,
    game.ref(30, 30),
    {},
  );

  defender.addUpgrade(UpgradeType.CityAntiAir);
  game.addExecution(new CityAAExecution(defender));
}

describe("CityAAExecution neutrality", () => {
  beforeEach(async () => {
    await setupCityAA();
  });

  test("neutral: city AA does not shoot bomber unless bomber targets defender land", () => {
    // Bomber near city, but targeting attacker-owned land.
    attacker.conquer(game.ref(40, 40));
    const bomber = attacker.buildUnit(UnitType.Bomber, game.ref(11, 10), {
      targetTile: game.ref(40, 40),
      sourceAirfield: attackerAirfield,
    });

    executeTicks(game, 8);
    expect(bomber.isActive()).toBe(true);
  });

  test("neutral: city AA shoots bomber when bomber targets defender land", () => {
    const bomber = attacker.buildUnit(UnitType.Bomber, game.ref(11, 10), {
      targetTile: game.ref(10, 11),
      sourceAirfield: attackerAirfield,
    });

    executeTicks(game, 8);
    expect(bomber.isActive()).toBe(false);
  });

  test("neutral: city AA shoots paratrooper when paratrooper targets defender land", () => {
    const paratrooper = attacker.buildUnit(
      UnitType.Paratrooper,
      game.ref(11, 10),
      {
        troops: 10,
        targetTile: game.ref(11, 11),
      },
    );

    executeTicks(game, 8);
    expect(paratrooper.isActive()).toBe(false);
  });

  test("neutral: city AA does not shoot fighter jets", () => {
    const fighter = attacker.buildUnit(UnitType.FighterJet, game.ref(11, 10), {
      patrolTile: game.ref(0, 0),
    });

    executeTicks(game, 8);
    expect(fighter.isActive()).toBe(true);
  });
});
