import { GameEvent } from "../../core/EventBus";

/**
 * Fired when the list of living players changes (join, leave, or defeat).
 */
export class PlayerListChangedEvent implements GameEvent {}
