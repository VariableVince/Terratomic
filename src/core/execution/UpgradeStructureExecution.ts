import { Execution, Gold, Player, Unit, UnitType } from "../game/Game";
import { GameImpl } from "../game/GameImpl";
import { UnitImpl } from "../game/UnitImpl";
import { NoOpExecution } from "./NoOpExecution";

/**
 * Generic structure upgrade execution.
 * Currently only supports City upgrades; structure branching is ready for future types.
 */
export class UpgradeStructureExecution implements Execution {
  private mg!: GameImpl;
  private _isActive = true;

  constructor(
    private player: Player,
    private unit: Unit,
  ) {}

  isActive(): boolean {
    return this._isActive;
  }

  activeDuringSpawnPhase(): boolean {
    return true; // Allow upgrades during spawn phase (mirrors build behavior)
  }

  init(mg: GameImpl, _ticks: number): void {
    this.mg = mg;
    if (!this.unit.isUnit || !this.unit.isUnit()) {
      this._isActive = false;
      return;
    }
    if (this.unit.owner() !== this.player) {
      this._isActive = false;
      return;
    }

    switch (this.unit.type()) {
      case UnitType.City: {
        const baseCost: Gold = this.mg
          .unitInfo(UnitType.City)
          .cost(this.player);
        const upgradeCost: Gold = (baseCost * 4n) / 5n; // 80%
        if (this.player.gold() < upgradeCost) {
          this._isActive = false;
          return;
        }
        this.player.removeGold(upgradeCost);
        (this.unit as UnitImpl).upgradeStructure();
        this._isActive = false;
        return;
      }
      default: {
        // Unsupported structure type for upgrade at this time
        this._isActive = false;
        return;
      }
    }
  }

  tick(_ticks: number): void {
    // One-shot handled in init
  }

  static fromIntent(
    mg: GameImpl,
    intent: {
      type: "upgrade_structure";
      unitId: number;
      unitType: UnitType;
      clientID: string;
    },
  ): Execution {
    const player = mg.playerByClientID(intent.clientID);
    if (!player) return new NoOpExecution();
    const unit = player.units().find((u) => u.id() === intent.unitId);
    if (!unit || unit.type() !== intent.unitType) return new NoOpExecution();
    return new UpgradeStructureExecution(player, unit);
  }
}
