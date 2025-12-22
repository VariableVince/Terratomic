import { Game, Player, Unit, UnitType, UpgradeType } from "../../game/Game";
import { SAMMissileExecution } from "../SAMMissileExecution";

/**
 * Finds all non-friendly cities with the CityAntiAir upgrade within the nuke's blast radius.
 *
 * Note: This is already "targeting-based" for neutral players because we only consider
 * cities that are threatened by the nuke's target (blast-radius check).
 */
export function findEligibleCitiesForNuke(nuke: Unit, game: Game): Unit[] {
  const nukeOwner = nuke.owner();
  const blastRadius = game.config().nukeMagnitudes(nuke.type()).outer;

  return game
    .nearbyUnits(nuke.targetTile()!, blastRadius, UnitType.City, ({ unit }) => {
      const cityOwner = unit.owner();
      return (
        !nukeOwner.isFriendly(cityOwner as Player) &&
        cityOwner.hasUpgrade(UpgradeType.CityAntiAir)
      );
    })
    .map((result) => result.unit);
}

/**
 * Attempts to have a single city intercept a nuke using SAM missiles.
 * Note: Planes are now handled by CityAAExecution with AA bullets instead.
 */
export function attemptNukeInterception(target: Unit, game: Game, city: Unit) {
  // Use per-unit cooldown state for cities, same as other units
  if (!city.isActive() || (city.ticksLeftInCooldown() ?? 0) > 0) {
    return;
  }

  target.setTargetedBySAM(true);
  const sam = new SAMMissileExecution(
    city.tile(),
    city.owner(),
    city,
    target,
    target.tile(),
  );
  game.addExecution(sam);
  // Start city SAM cooldown using standard unit cooldown API
  city.launch(game.config().citySamCooldown());
}
