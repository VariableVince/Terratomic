import { html, LitElement } from "lit";
import { customElement, query } from "lit/decorators.js";
import "./baseComponents/Modal";

@customElement("hardware-acceleration-modal")
export class HardwareAccelerationModal extends LitElement {
  @query("o-modal")
  private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
    isModalOpen: boolean;
  };

  createRenderRoot() {
    return this; // Use light DOM for modal styling
  }

  open() {
    console.log(
      "HardwareAccelerationModal.open() called, modalEl:",
      this.modalEl,
    );
    if (this.modalEl) {
      this.modalEl.open();
    } else {
      console.error("modalEl not found!");
    }
  }

  close() {
    if (this.modalEl) {
      this.modalEl.close();
    }
  }

  private getBrowserInstructions() {
    const ua = navigator.userAgent;

    // Check for Chromium browsers (Chrome, Edge, Opera, Brave, Vivaldi, etc.)
    if (
      ua.includes("Chrome/") ||
      ua.includes("Edg/") ||
      ua.includes("OPR/") ||
      ua.includes("Opera/") ||
      ua.includes("Brave/") ||
      ua.includes("Vivaldi/")
    ) {
      let browserName = "Chrome";
      let directLink = "chrome://settings/system";

      if (ua.includes("Edg/")) {
        browserName = "Edge";
        directLink = "edge://settings/system";
      } else if (ua.includes("OPR/") || ua.includes("Opera/")) {
        browserName = "Opera";
        directLink = "opera://settings";
      } else if (ua.includes("Brave/")) {
        browserName = "Brave";
        directLink = "brave://settings/system";
      } else if (ua.includes("Vivaldi/")) {
        browserName = "Vivaldi";
        directLink = "vivaldi://settings";
      }

      return {
        browser: `${browserName} (Chromium)`,
        steps: [
          "Click the three dots menu (⋮ or ⋯) in the top-right corner",
          "Select 'Settings'",
          "Search for 'hardware acceleration' or navigate to System settings",
          "Enable 'Use hardware acceleration when available'",
          "Click 'Relaunch' or 'Restart' to restart your browser",
        ],
        directLink,
      };
    } else if (ua.includes("Firefox/")) {
      return {
        browser: "Firefox",
        steps: [
          "Firefox is not recommended for this game - it experiences severe performance issues with many units on screen",
          "For best performance, switch to a Chromium-based browser:",
          "  • Chrome (google.com/chrome)",
          "  • Edge (microsoft.com/edge)",
          "  • Opera (opera.com)",
          "  • Brave (brave.com)",
          "After switching, enable hardware acceleration in browser settings",
        ],
        directLink: null,
      };
    } else {
      return {
        browser: "your browser",
        steps: [
          "For best performance, we recommend using a Chromium-based browser:",
          "  • Chrome (google.com/chrome)",
          "  • Edge (microsoft.com/edge)",
          "  • Opera (opera.com)",
          "  • Brave (brave.com)",
          "After installation, enable hardware acceleration in browser settings",
        ],
        directLink: null,
      };
    }
  }

  render() {
    const instructions = this.getBrowserInstructions();

    return html`
      <o-modal title="Enable Hardware Acceleration" @close-modal=${this.close}>
        <div style="max-width: 600px; padding: 20px;">
          <div
            style="background: rgba(234, 88, 12, 0.1); border-left: 4px solid #ea580c; padding: 16px; margin-bottom: 20px; border-radius: 4px;"
          >
            <strong style="color: #ea580c; display: block; margin-bottom: 8px;"
              >⚠️ Performance Issue Detected</strong
            >
            <p style="margin: 0; line-height: 1.5;">
              Terratomic uses WebGL for GPU-accelerated rendering. Without
              hardware acceleration enabled, the game will run extremely slowly
              or may not work at all.
            </p>
          </div>

          <h3 style="margin-top: 0;">
            Instructions for ${instructions.browser}:
          </h3>
          <ol style="line-height: 1.8; padding-left: 20px;">
            ${instructions.steps.map((step) => html`<li>${step}</li>`)}
          </ol>

          ${instructions.directLink
            ? html`
                <div
                  style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); padding: 12px; border-radius: 4px; margin-top: 20px;"
                >
                  <strong>Quick Access:</strong>
                  <div style="margin-top: 8px;">
                    <span style="font-size: 13px;"
                      >Copy and paste this into your browser's address
                      bar:</span
                    >
                    <div
                      style="background: rgba(255, 255, 255, 0.9); color: #1f2937; padding: 8px 12px; border-radius: 4px; margin-top: 6px; font-family: monospace; font-size: 13px; user-select: all; cursor: text;"
                      title="Click to select all, then copy"
                    >
                      ${instructions.directLink}
                    </div>
                  </div>
                </div>
              `
            : ""}

          <div
            style="background: rgba(34, 197, 94, 0.1); border-left: 4px solid #22c55e; padding: 16px; margin-top: 20px; border-radius: 4px;"
          >
            <strong style="color: #22c55e; display: block; margin-bottom: 8px;"
              >💡 Recommended Setup</strong
            >
            <p style="margin: 0; line-height: 1.5;">
              For the best Terratomic experience, we recommend:
            </p>
            <ul style="margin-top: 8px; line-height: 1.6;">
              <li>Chrome or Edge browser (latest version)</li>
              <li>Hardware acceleration enabled</li>
              <li>Dedicated GPU (if available)</li>
              <li>Updated graphics drivers</li>
            </ul>
          </div>

          <div style="margin-top: 24px; text-align: right;">
            <button
              @click=${this.close}
              style="background: var(--ui-primary); color: white; border: none; padding: 10px 24px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 600;"
            >
              Close
            </button>
          </div>
        </div>
      </o-modal>
    `;
  }
}
