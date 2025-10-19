import { LitElement, css, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../../Utils";

@customElement("o-modal")
export class OModal extends LitElement {
  @state() public isModalOpen = false;
  @property({ type: String }) title = "";
  @property({ type: String }) translationKey = "";
  // Optional sizing overrides so some modals can be wider/taller
  @property({ type: String, attribute: "max-width" }) maxWidth: string =
    "860px";
  @property({ type: String, attribute: "max-height" }) maxHeight: string =
    "60dvh";
  // Control whether the content area itself scrolls (default) or is clipped
  @property({ type: String, attribute: "content-overflow" })
  contentOverflow: string = "auto";

  static styles = css`
    .c-modal {
      position: fixed;
      padding: 1rem;
      z-index: 9999;
      left: 0;
      bottom: 0;
      right: 0;
      top: 0;
      background-color: rgba(0, 0, 0, 0.5);
      /* Avoid double vertical scrollbars; content area will scroll */
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .c-modal__wrapper {
      border-radius: 8px;
      min-width: 340px;
      max-height: 95dvh;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      /* max-width is overridden inline using the maxWidth property */
    }

    .c-modal__header {
      position: relative;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
      font-size: 18px;
      background: #000000a1;
      text-align: center;
      color: #fff;
      padding: 1rem 2.4rem 1rem 1.4rem;
    }

    .c-modal__close {
      cursor: pointer;
      position: absolute;
      right: 1rem;
      top: 1rem;
    }

    .c-modal__content {
      background: #23232382;
      position: relative;
      color: #fff;
      padding: 1.4rem;
      /* max-height is overridden inline using the maxHeight property */
      overflow: auto;
      backdrop-filter: blur(8px);
      /* Themed scrollbar (vertical + horizontal) */
      scrollbar-width: thin;
      scrollbar-color: #27476e #0e1a33; /* thumb track */
    }
    .c-modal__content::-webkit-scrollbar {
      width: 10px; /* vertical */
      height: 10px; /* horizontal */
      background: transparent;
    }
    .c-modal__content::-webkit-scrollbar-track {
      background: #0e1a33;
      border-radius: 8px;
      box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.4);
    }
    .c-modal__content::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #27476e, #1e3554);
      border-radius: 8px;
      border: 1px solid #27476e;
      box-shadow: inset 0 0 4px rgba(255, 255, 255, 0.06);
    }
    .c-modal__content::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #32629b, #254a78);
      border-color: #32629b;
    }
  `;
  public open() {
    this.isModalOpen = true;
  }

  public close() {
    this.isModalOpen = false;
    this.dispatchEvent(
      new CustomEvent("modal-close", { bubbles: true, composed: true }),
    );
  }

  render() {
    return html`
      ${this.isModalOpen
        ? html`
            <aside class="c-modal">
              <div class="c-modal__wrapper" style="max-width: ${this.maxWidth}">
                <header class="c-modal__header">
                  ${`${this.translationKey}` === ""
                    ? `${this.title}`
                    : `${translateText(this.translationKey)}`}
                  <div class="c-modal__close" @click=${this.close}>✕</div>
                </header>
                <section
                  class="c-modal__content"
                  style="max-height: ${this.maxHeight}; overflow: ${this
                    .contentOverflow}"
                >
                  <slot></slot>
                </section>
              </div>
            </aside>
          `
        : html``}
    `;
  }
}
