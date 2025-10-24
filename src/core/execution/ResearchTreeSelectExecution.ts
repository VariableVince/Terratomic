import { Execution, Game, Player, UpgradeType } from "../game/Game";
import { RESEARCH_TECH_IDS } from "../tech/TechEffects";

// Simple execution that marks a research-tree tech as selected for a player.
// This is intentionally side-effect free except updating the player's per-match
// research tech set, which is included in PlayerUpdate via PlayerImpl.
export class ResearchTreeSelectExecution implements Execution {
  private _active = true;
  private mg: Game | null = null;

  constructor(
    private readonly player: Player,
    private readonly techId: string,
  ) {}

  isActive(): boolean {
    return this._active;
  }
  activeDuringSpawnPhase(): boolean {
    return true;
  }
  init(_mg: Game, _ticks: number): void {
    // Capture game reference for optional side-effects
    this.mg = _mg;
  }
  tick(_ticks: number): void {
    // Add tech to player's research set; duplicate adds are ignored.
    if ((this.player as any).addResearchedTech) {
      (this.player as any).addResearchedTech(this.techId);
    }

    // If the first Economy tech is researched, unlock Roads automatically.
    if (this.techId === RESEARCH_TECH_IDS.POST_WAR_RECONSTRUCTION) {
      // Grant Roads upgrade if not already owned
      if (!this.player.hasUpgrade(UpgradeType.Roads)) {
        this.player.addUpgrade(UpgradeType.Roads);
        // Ensure road network recalculates connectivity
        this.mg?.markPlayerNodesForReconnection(this.player);
      }
    }
    this._active = false;
  }
}
