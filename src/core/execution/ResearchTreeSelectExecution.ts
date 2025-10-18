import { Execution, Game, Player } from "../game/Game";

// Simple execution that marks a research-tree tech as selected for a player.
// This is intentionally side-effect free except updating the player's per-match
// research tech set, which is included in PlayerUpdate via PlayerImpl.
export class ResearchTreeSelectExecution implements Execution {
  private _active = true;

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
    // no-op
  }
  tick(_ticks: number): void {
    // Add tech to player's research set; duplicate adds are ignored.
    if ((this.player as any).addResearchedTech) {
      (this.player as any).addResearchedTech(this.techId);
    }
    this._active = false;
  }
}
