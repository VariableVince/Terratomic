import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import "./HardwareAccelerationModal";
import type { HardwareAccelerationModal } from "./HardwareAccelerationModal";

export type WarningType = "hardware" | "browser";

@customElement("hardware-acceleration-warning")
export class HardwareAccelerationWarning extends LitElement {
  @property({ type: String })
  warningType: WarningType = "hardware";

  @state()
  private dismissed: boolean = false;

  private modal: HardwareAccelerationModal | null = null;

  async connectedCallback() {
    super.connectedCallback();

    // Don't check dismissed state - we always want to show if hardware acceleration is off
    // User can dismiss per session only
    this.dismissed = false;

    // Wait for the modal element to be defined before creating it
    await customElements.whenDefined("hardware-acceleration-modal");

    // Create modal instance
    this.modal = document.createElement(
      "hardware-acceleration-modal",
    ) as HardwareAccelerationModal;
    document.body.appendChild(this.modal);
    console.log("Modal created and appended:", this.modal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Clean up modal when warning is removed
    if (this.modal && this.modal.parentNode) {
      this.modal.parentNode.removeChild(this.modal);
    }
  }

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 10000;
      transform: translateY(-100%);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }

    :host(.visible) {
      transform: translateY(0);
    }

    .warning-banner {
      background: linear-gradient(
        135deg,
        rgba(234, 88, 12, 0.95) 0%,
        rgba(220, 38, 38, 0.95) 100%
      );
      border-bottom: 3px solid var(--ui-status-warning);
      padding: 12px 20px;
      color: white;
      display: flex;
      gap: 16px;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(8px);
    }

    .warning-icon {
      font-size: 28px;
      flex-shrink: 0;
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%,
      100% {
        transform: scale(1);
        filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.5));
      }
      50% {
        transform: scale(1.1);
        filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.8));
      }
    }

    .warning-content {
      flex: 1;
      min-width: 0;
    }

    .warning-title {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 2px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .warning-text {
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.95;
    }

    .learn-more-btn {
      background: none;
      border: none;
      color: white;
      text-decoration: underline;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
      margin: 0;
      font-size: 12px;
      font-family: inherit;
      display: inline;
    }

    .learn-more-btn:hover {
      opacity: 0.8;
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      border-color: rgba(255, 255, 255, 0.5);
      transform: scale(1.05);
    }
  `;

  private handleDismiss() {
    this.dismissed = true;
    this.classList.remove("visible");
  }

  private handleLearnMore() {
    console.log("Learn more clicked, modal:", this.modal);
    if (this.modal) {
      this.modal.open();
    } else {
      console.error("Modal not found!");
    }
  }

  render() {
    if (this.dismissed) return null;

    const titleKey =
      this.warningType === "hardware"
        ? "hardware_warning.title"
        : "browser_warning.title";
    const messageKey =
      this.warningType === "hardware"
        ? "hardware_warning.message"
        : "browser_warning.message";

    return html`
      <div class="warning-banner">
        <div class="warning-icon">⚠️</div>
        <div class="warning-content">
          <div class="warning-title">${translateText(titleKey)}</div>
          <div class="warning-text">
            ${translateText(messageKey)}
            <button
              class="learn-more-btn"
              @click=${() => this.handleLearnMore()}
            >
              ${translateText("hardware_warning.learn_more")}
            </button>
          </div>
        </div>
        <button
          class="close-btn"
          @click=${() => this.handleDismiss()}
          title="${translateText("hardware_warning.dismiss")}"
        >
          ✕
        </button>
      </div>
    `;
  }
}
