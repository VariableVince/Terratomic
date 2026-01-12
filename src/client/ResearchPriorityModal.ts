import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import airIcon from "../../resources/icons/research/air.svg";
import landIcon from "../../resources/icons/research/land.svg";
import nuclearIcon from "../../resources/icons/research/nuclear.svg";
import seaIcon from "../../resources/icons/research/sea.svg";
import { EventBus } from "../core/EventBus";
import { GameView } from "../core/game/GameView";
import {
  getTechNodes,
  type Category,
  type TechNode,
} from "../core/tech/ResearchTree";
import { SendResearchTreeSelectIntentEvent } from "./Transport";
import { translateText } from "./Utils";

@customElement("research-priority-modal")
export class ResearchPriorityModal extends LitElement {
  @property({ type: Boolean }) visible: boolean = false;
  @property({ attribute: false }) game!: GameView;
  @property({ attribute: false }) eventBus!: EventBus;

  private techs: TechNode[] = [...getTechNodes()];
  private categories: Category[] = ["Land", "Sea", "Air", "Nuclear"];
  private updateInterval: number | null = null;

  createRenderRoot() {
    return this; // No shadow DOM - use global styles
  }

  open() {
    this.visible = true;
    this.requestUpdate();
    // Poll for updates while modal is open
    this.updateInterval ??= window.setInterval(() => {
      if (this.visible) {
        this.requestUpdate();
      }
    }, 100); // Check every 100ms
  }

  close = () => {
    this.visible = false;
    this.requestUpdate();
    // Stop polling when modal closes
    if (this.updateInterval !== null) {
      window.clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  };

  show() {
    this.visible = true;
    this.open();
  }

  hide() {
    this.visible = false;
  }

  private researchedIDsFromGame(): Set<string> {
    const res = new Set<string>();
    const me = this.game?.myPlayer?.();
    if (!me) return res;
    for (const t of this.techs) if (me.hasResearchedTech(t.id)) res.add(t.id);
    return res;
  }

  private prioritizeCategory(category: Category) {
    if (!this.game || !this.eventBus) return;
    const me = this.game.myPlayer();
    if (!me) return;

    const allTechs = this.techs;
    const researched = this.researchedIDsFromGame();
    const priorities = me.researchPriorities?.() ?? new Set<string>();

    // Remove priorities from techs in other categories
    for (const tech of allTechs) {
      if (tech.category !== category && priorities.has(tech.id)) {
        this.eventBus.emit(new SendResearchTreeSelectIntentEvent(tech.id));
      }
    }

    // Prioritize all techs in this category
    const categoryTechs = this.techs.filter((t) => t.category === category);
    for (const tech of categoryTechs) {
      if (!researched.has(tech.id) && !priorities.has(tech.id)) {
        this.eventBus.emit(new SendResearchTreeSelectIntentEvent(tech.id));
      }
    }

    // Force immediate UI update
    this.requestUpdate();
  }

  render() {
    if (!this.visible) return html``;

    const researched = this.researchedIDsFromGame();
    const me = this.game?.myPlayer?.();
    const priorities = me?.researchPriorities?.() ?? new Set<string>();

    // Group techs by category
    const techsByCategory = new Map<Category, TechNode[]>();
    for (const cat of this.categories) {
      techsByCategory.set(
        cat,
        this.techs.filter((t) => t.category === cat),
      );
    }

    // Check which categories have all non-researched techs prioritized
    const categoryPrioritized = new Map<Category, boolean>();
    for (const cat of this.categories) {
      const techs = techsByCategory.get(cat) ?? [];
      const nonResearchedTechs = techs.filter((t) => !researched.has(t.id));
      const allPrioritized =
        nonResearchedTechs.length > 0 &&
        nonResearchedTechs.every((t) => priorities.has(t.id));
      categoryPrioritized.set(cat, allPrioritized);
    }

    // Category descriptions
    const categoryDescriptions: Record<Category, string> = {
      Land: translateText("research_priority.category_land"),
      Sea: translateText("research_priority.category_sea"),
      Air: translateText("research_priority.category_air"),
      Nuclear: translateText("research_priority.category_nuclear"),
    };

    const icons: Record<string, string> = {
      Land: landIcon,
      Sea: seaIcon,
      Air: airIcon,
      Nuclear: nuclearIcon,
    };

    return html`
      <style>
        .research-priority-banner {
          position: fixed;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 9999;
          background: #183152;
          border: 2px solid #27476e;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          max-width: 1200px;
          width: 95%;
          display: flex;
          flex-direction: column;
        }

        .banner-header {
          background: #27476e;
          padding: 1rem 1.4rem;
          border-bottom: 1px solid #32629b;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .banner-title {
          font-size: 18px;
          font-weight: 600;
          color: #dbe7ff;
          margin: 0;
        }

        .banner-close-btn {
          cursor: pointer;
          background: none;
          border: none;
          color: #dbe7ff;
          font-size: 20px;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s;
        }

        .banner-close-btn:hover {
          transform: scale(1.2);
          color: #ffffff;
        }

        .banner-content {
          background: #183152;
          padding: 1.4rem;
        }

        .banner-intro {
          font-size: 0.95em;
          color: #dbe7ff;
          margin-bottom: 1rem;
          text-align: center;
          line-height: 1.5;
        }

        .categories-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 1rem;
        }

        @media (max-width: 1100px) {
          .categories-row {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 600px) {
          .categories-row {
            grid-template-columns: 1fr;
          }
        }

        .category-tile {
          background: #213a5a;
          border: 2px solid #32629b;
          border-radius: 6px;
          padding: 12px;
          cursor: pointer;
          transition: all 0.25s;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 8px;
          min-height: 100px;
        }

        .category-tile:hover {
          transform: translateY(-3px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.3);
          background: #27476e;
          border-color: #dbe7ff;
        }

        .category-tile.selected {
          border-width: 3px;
          box-shadow: 0 0 16px rgba(243, 156, 18, 0.6);
        }

        .category-tile-icon {
          width: 36px;
          height: 36px;
          background-color: currentColor;
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }

        .category-tile-name {
          font-size: 1.1em;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #dbe7ff;
        }

        .category-tile-desc {
          font-size: 0.75em;
          color: #a8c5d9;
          line-height: 1.3;
        }

        .category-tile-badge {
          background: #f39c12;
          color: #fff;
          padding: 3px 10px;
          border-radius: 10px;
          font-size: 0.7em;
          font-weight: 600;
          text-transform: uppercase;
        }

        .banner-footer {
          text-align: center;
          font-size: 0.85em;
          color: #a8c5d9;
          font-style: italic;
          padding-top: 0.5rem;
          border-top: 1px solid #32629b;
        }

        .cat-sea {
          color: #3498db;
        }
        .cat-land {
          color: #2ecc71;
        }
        .cat-air {
          color: #9b59b6;
        }
        .cat-nuclear {
          color: #e74c3c;
        }

        .cat-sea.selected {
          border-color: #3498db;
        }
        .cat-land.selected {
          border-color: #2ecc71;
        }
        .cat-air.selected {
          border-color: #9b59b6;
        }
        .cat-nuclear.selected {
          border-color: #e74c3c;
        }
      </style>

      <div class="research-priority-banner">
        <div class="banner-header">
          <div class="banner-title">
            ${translateText("research_priority.intro_title")}
          </div>
          <div class="banner-close-btn" @click=${this.close}>✕</div>
        </div>

        <div class="banner-content">
          <div class="banner-intro">
            ${translateText("research_priority.intro_text_simple")}
          </div>

          <div class="categories-row">
            ${this.categories.map((cat) => {
              const isPrioritized = categoryPrioritized.get(cat) ?? false;
              const catClass = `cat-${cat.toLowerCase()}`;
              const iconSrc = icons[cat];

              return html`
                <div
                  class="category-tile ${catClass} ${isPrioritized
                    ? "selected"
                    : ""}"
                  @click=${() => this.prioritizeCategory(cat)}
                >
                  <div
                    class="category-tile-icon"
                    style="-webkit-mask-image: url('${iconSrc}'); mask-image: url('${iconSrc}')"
                  ></div>
                  <div class="category-tile-name">${cat}</div>
                  <div class="category-tile-desc">
                    ${categoryDescriptions[cat]}
                  </div>
                  ${isPrioritized
                    ? html`<div class="category-tile-badge">⭐ Selected</div>`
                    : ""}
                </div>
              `;
            })}
          </div>

          <div class="banner-footer">
            ${translateText("research_priority.footer_hint_simple")}
          </div>
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "research-priority-modal": ResearchPriorityModal;
  }
}
