import { Execution, Game, Player } from "../game/Game";

export class SetRoadSpeedExecution implements Execution {
  private active = true;
  constructor(
    private player: Player,
    private ratePxPerSecond: number,
  ) {}

  init(mg: Game, ticks: number): void {}

  tick(ticks: number): void {
    // Clamp happens in setter; accept 0..5 from client
    this.player.setRoadBuildSpeed(this.ratePxPerSecond);
    // For compatibility: when explicit speed is set, also set investment rate to 0 so the dynamic formula doesn't double-apply
    this.player.setRoadInvestmentRate(0);
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
