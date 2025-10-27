import { Execution, Game, Player } from "../game/Game";

// Execution to set the player's research priority tech in the tree.
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
    // Toggle priority: clicking an already prioritized tech unsets it.
    const current = (this.player as any).researchPriority?.() ?? null;
    const next = current === this.techId ? null : this.techId;
    (this.player as any).setResearchPriority?.(next);
    this._active = false;
  }
}
