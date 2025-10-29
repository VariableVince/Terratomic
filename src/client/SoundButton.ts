import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { UserSettings } from "../core/game/UserSettings";

@customElement("sound-button")
export class SoundButton extends LitElement {
  private userSettings: UserSettings = new UserSettings();
  @state() private muted: boolean = this.userSettings.soundMuted();

  createRenderRoot() {
    // Use light DOM to inherit global styles (like Tailwind)
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("sound-muted-changed", this.handleMutedChanged);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("sound-muted-changed", this.handleMutedChanged);
  }

  private handleMutedChanged = (e: Event) => {
    const event = e as CustomEvent<{ muted: boolean }>;
    this.muted = event.detail.muted;
  };

  toggleMuted() {
    this.userSettings.toggleSoundMuted();
    this.muted = this.userSettings.soundMuted();
  }

  render() {
    return html`
      <button
        title="Toggle Sound"
        class="absolute top-0 right-[42px] md:top-[10px] md:right-[52px] border-none bg-none cursor-pointer text-2xl"
        @click=${() => this.toggleMuted()}
        aria-label=${this.muted ? "Unmute sound" : "Mute sound"}
      >
        ${this.muted ? "🔇" : "🔊"}
      </button>
    `;
  }
}
