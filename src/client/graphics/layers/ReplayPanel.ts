import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameType } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import { ReplaySpeedChangeEvent } from "../../InputHandler";
import {
  defaultReplaySpeedMultiplier,
  ReplaySpeedMultiplier,
} from "../../utilities/ReplaySpeedMultiplier";
import { translateText } from "../../Utils";
import { Layer } from "./Layer";

@customElement("replay-panel")
export class ReplayPanel extends LitElement implements Layer {
  public game: GameView | undefined;
  public eventBus: EventBus | undefined;

  @state()
  private _replaySpeedMultiplier: number = defaultReplaySpeedMultiplier;
  private _isSinglePlayer: boolean = false;

  @state()
  private _isVisible = false;

  init() {
    this._isSinglePlayer =
      this.game?.config().gameConfig().gameType === GameType.Singleplayer;
    if (this._isSinglePlayer) {
      this.setVisible(true);
    }
  }

  tick() {
    if (!this._isVisible && this.game?.config().isReplay()) {
      this.setVisible(true);
    }

    this.requestUpdate();
  }

  onReplaySpeedChange(value: ReplaySpeedMultiplier) {
    this._replaySpeedMultiplier = value;
    this.eventBus?.emit(new ReplaySpeedChangeEvent(value));
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Render any necessary canvas elements
  }

  shouldTransform(): boolean {
    return false;
  }

  setVisible(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  render() {
    if (!this._isVisible) {
      return html``;
    }

    return html`
      <div
        class="submarine-panel military-panel p-1 lg:p-2"
        style="box-shadow: inset 0 0 18px rgba(2, 8, 20, 0.8), 0 2px 6px rgba(0, 0, 0, 0.5);"
        @contextmenu=${(e) => e.preventDefault()}
      >
        <label class="block mb-1" style="color:#dbe7ff" translate="no">
          ${this._isSinglePlayer
            ? translateText("replay_panel.game_speed")
            : translateText("replay_panel.replay_speed")}
        </label>
        <div class="grid grid-cols-2 gap-1">
          <button
            class="text-white font-bold py-0 rounded border transition ${this
              ._replaySpeedMultiplier === ReplaySpeedMultiplier.slow
              ? "bg-[#1a2e4a] border-[#27476e]"
              : "border-[#27476e]"}"
            @click=${() => {
              this.onReplaySpeedChange(ReplaySpeedMultiplier.slow);
            }}
          >
            ×0.5
          </button>
          <button
            class="text-white font-bold py-0 rounded border transition ${this
              ._replaySpeedMultiplier === ReplaySpeedMultiplier.normal
              ? "bg-[#1a2e4a] border-[#27476e]"
              : "border-[#27476e]"}"
            @click=${() => {
              this.onReplaySpeedChange(ReplaySpeedMultiplier.normal);
            }}
          >
            ×1
          </button>
          <button
            class="text-white font-bold py-0 rounded border transition ${this
              ._replaySpeedMultiplier === ReplaySpeedMultiplier.fast
              ? "bg-[#1a2e4a] border-[#27476e]"
              : "border-[#27476e]"}"
            @click=${() => {
              this.onReplaySpeedChange(ReplaySpeedMultiplier.fast);
            }}
          >
            ×2
          </button>
          <button
            class="text-white font-bold py-0 rounded border transition ${this
              ._replaySpeedMultiplier === ReplaySpeedMultiplier.fastest
              ? "bg-[#1a2e4a] border-[#27476e]"
              : "border-[#27476e]"}"
            @click=${() => {
              this.onReplaySpeedChange(ReplaySpeedMultiplier.fastest);
            }}
          >
            max
          </button>
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
