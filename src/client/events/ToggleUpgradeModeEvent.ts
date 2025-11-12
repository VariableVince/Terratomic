import { GameEvent } from "../../core/EventBus";

export class ToggleUpgradeModeEvent implements GameEvent {
  constructor(public readonly enabled: boolean) {}
}
