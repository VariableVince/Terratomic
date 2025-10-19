import { LitElement, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { EventBus } from "../core/EventBus";
import { GameView } from "../core/game/GameView";
import { SendResearchTreeSelectIntentEvent } from "./Transport";
import "./components/baseComponents/Modal";

type Category = "Land" | "Sea" | "Air" | "Nuclear" | "Economy";

interface TechNode {
  id: string;
  name: string;
  category: Category;
  level: number; // 1..5 top to bottom
  requiresAllOf?: string[]; // all these must be researched
  requiresOneOf?: string[]; // at least one of these researched
  description?: string; // Optional hover description
}

@customElement("research-tree-modal")
export class ResearchTreeModal extends LitElement {
  @query("o-modal") private modalEl!: HTMLElement & {
    open: () => void;
    close: () => void;
  };

  @property({ type: Boolean }) visible: boolean = false;
  // Injected from parent so we can read upgrades and send intents
  @property({ attribute: false }) game!: GameView;
  @property({ attribute: false }) eventBus!: EventBus;

  // Local polling while modal is open to keep UI in sync with game state
  private refreshTimer: number | null = null;
  // Optimistic local state so clicks feel instant, independent of gold affordability
  @state() private optimisticResearched = new Set<string>();

  private techs: TechNode[] = this.generatePlaceholderTechs();
  private categories: Category[] = ["Land", "Sea", "Air", "Nuclear", "Economy"];
  // Fixed column widths per category (px). Adjust as needed.
  private readonly categoryColumnWidths: Record<Category, number> = {
    Land: 360,
    Sea: 360,
    Air: 360,
    Nuclear: 360,
    Economy: 360,
  };

  connectedCallback(): void {
    super.connectedCallback();
    if (this.visible) this.open();
  }

  open() {
    this.modalEl?.open();
    // Draw edges on the next frame after modal becomes visible so positions are correct
    requestAnimationFrame(() => setTimeout(() => this.drawEdges(), 0));
    // Start a light refresh loop to reflect game state (gold/upgrades) while open
    if (this.refreshTimer === null) {
      this.refreshTimer = window.setInterval(() => this.requestUpdate(), 500);
    }
  }
  close() {
    this.modalEl?.close();
    if (this.refreshTimer !== null) {
      window.clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
  show() {
    this.visible = true;
    this.open();
  }
  hide() {
    this.visible = false;
    this.close();
  }

  private generatePlaceholderTechs(): TechNode[] {
    const t: TechNode[] = [];
    const mkId = (cat: Category, lvl: number) => `${cat}-${lvl}`;
    for (let lvl = 1; lvl <= 5; lvl++) {
      for (const cat of ["Land", "Sea", "Air", "Nuclear", "Economy"] as const) {
        const id = mkId(cat, lvl);
        const node: TechNode = {
          id,
          name: id === "Land-1" ? "WWII Lessons Learned" : `${cat} Tech ${lvl}`,
          category: cat,
          level: lvl,
          description:
            id === "Land-1"
              ? "Doctrine refined by hard-won experience improves defensive readiness, logistics, and counter-attack planning. Effects: While defending, your troop losses are reduced by 10% and the attacker's troop losses are increased by 10%."
              : undefined,
        };
        if (lvl > 1) node.requiresAllOf = [mkId(cat, lvl - 1)];
        t.push(node);
      }
    }
    // Remove cross-category links; keep same-category defaults only
    // Land-3 previously had cross-category one-of requirements; omit them
    // Air-4 previously added Land-3 as an extra requirement; keep only Air-3 (default)
    t.find((x) => x.id === "Nuclear-5")!.requiresAllOf = ["Nuclear-4"];
    // Nuclear-5 previously had cross-category one-of requirements; omit them

    // Add three extra techs to diversify the example tree
    // 1) Land level 2: a parallel tech at the same slot
    t.push({
      id: "Land-2B",
      name: "Land Tech 2B",
      category: "Land",
      level: 2,
      requiresAllOf: ["Land-1"],
    });
    // 2) Sea level 4: a parallel tech that can also satisfy Nuclear-5 one-of
    t.push({
      id: "Sea-4B",
      name: "Sea Tech 4B",
      category: "Sea",
      level: 4,
      requiresAllOf: ["Sea-3"],
    });
    // Include Sea-4B as an alternative prerequisite for Nuclear-5
    // Do not add Sea-4B as a cross-category prerequisite to Nuclear-5
    // 3) Economy level 3: a parallel tech mid-tree
    t.push({
      id: "Economy-3B",
      name: "Economy Tech 3B",
      category: "Economy",
      level: 3,
      requiresAllOf: ["Economy-2"],
    });

    // Within-category one-of example: Sea-5 accepts either Sea-4 or Sea-4B
    const sea5 = t.find((x) => x.id === "Sea-5");
    if (sea5) {
      sea5.requiresAllOf = undefined;
      sea5.requiresOneOf = ["Sea-4", "Sea-4B"];
    }
    return t;
  }

  private isAvailable(id: string, researched: Set<string>): boolean {
    const n = this.techs.find((x) => x.id === id)!;
    if (n.level === 1) return true;
    // Ignore cross-category requirements
    const sameCat = (p: string) =>
      this.techs.find((x) => x.id === p)?.category === n.category;
    n.requiresAllOf ??= [];
    n.requiresOneOf ??= [];

    const reqAll = n.requiresAllOf.filter(sameCat);
    const reqOne = n.requiresOneOf.filter(sameCat);
    if (reqAll.length && !reqAll.every((p) => researched.has(p))) return false;
    if (reqOne.length && !reqOne.some((p) => researched.has(p))) return false;
    return true;
  }

  // No mapping to existing UpgradeType; research tree is separate

  private researchedIDsFromGame(): Set<string> {
    const res = new Set<string>();
    const me = this.game?.myPlayer?.();
    if (!me) return res;
    // Use new per-match researched techs
    for (const t of this.techs) if (me.hasResearchedTech(t.id)) res.add(t.id);
    return res;
  }

  private onTechClick(id: string) {
    if (!this.game || !this.eventBus) return;
    const tech = this.techs.find((t) => t.id === id)!;
    const me = this.game.myPlayer();
    if (!me) return;

    // Merge real researched with optimistic selections for availability check
    const researched = new Set<string>([
      ...this.researchedIDsFromGame(),
      ...this.optimisticResearched,
    ]);
    if (!this.isAvailable(id, researched)) return; // unmet prereqs in tree
    if (me.hasResearchedTech?.(id) || me.data?.researchTreeTechs?.includes(id))
      return; // already owned

    this.eventBus.emit(new SendResearchTreeSelectIntentEvent(id));
    // Optimistically mark as researched for immediate feedback
    this.optimisticResearched = new Set(this.optimisticResearched);
    this.optimisticResearched.add(id);
    this.requestUpdate();
  }

  private renderLegend() {
    return html`
      <div
        class="legend"
        style="display:flex;gap:12px;font-size:12px;color:#d1d5db;margin-bottom:8px;"
      >
        <span
          ><span
            class="swatch"
            style="width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:6px;background: rgba(239,68,68,0.7)"
          ></span
          >Required</span
        >
        <span
          ><span
            class="swatch"
            style="width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:6px;background: rgba(245,158,11,0.8)"
          ></span
          >Requires one of</span
        >
        <span
          ><span
            class="swatch"
            style="width:10px;height:10px;border-radius:2px;display:inline-block;margin-right:6px;background:#4b5563"
          ></span
          >Researched</span
        >
        <span style="opacity:.7">Unmet requirements are grayed out</span>
      </div>
    `;
  }

  private computePositions(): { [id: string]: DOMRect } {
    const map: { [id: string]: DOMRect } = {};
    const cards = this.renderRoot.querySelectorAll(
      ".tech[data-id]",
    ) as NodeListOf<HTMLElement>;
    cards.forEach((el) => {
      const id = el.dataset.id!;
      map[id] = el.getBoundingClientRect();
    });
    return map;
  }

  // Apply fixed widths to each level grid so columns line up between rows
  private applyCategoryWidths() {
    const tree = this.renderRoot.querySelector(
      ".tree-container",
    ) as HTMLElement | null;
    if (!tree) return;
    const template = this.categories
      .map((cat) => `${this.categoryColumnWidths[cat]}px`)
      .join(" ");
    tree
      .querySelectorAll(".level-grid")
      .forEach(
        (grid) => ((grid as HTMLElement).style.gridTemplateColumns = template),
      );
  }

  // Position the colored category bands to match the computed column geometry
  private updateCategoryBandPositions() {
    const tree = this.renderRoot.querySelector(
      ".tree-container",
    ) as HTMLElement | null;
    if (!tree) return;
    const bands = this.renderRoot.querySelectorAll(
      ".category-bands .category-band",
    ) as NodeListOf<HTMLElement>;
    const firstGrid = tree.querySelector(".level-grid") as HTMLElement | null;
    if (!firstGrid || bands.length !== this.categories.length) return;
    const rootRect = tree.getBoundingClientRect();
    const scrollLeft = tree.scrollLeft;
    const slots = firstGrid.querySelectorAll(
      ":scope > .category-slot",
    ) as NodeListOf<HTMLElement>;
    slots.forEach((slot, i) => {
      const r = slot.getBoundingClientRect();
      const left = r.left - rootRect.left + scrollLeft;
      const width = r.width;
      const band = bands[i];
      band.style.position = "absolute";
      band.style.left = `${left}px`;
      band.style.width = `${width}px`;
      band.style.top = "0";
      band.style.bottom = "0";
    });
  }

  // Orchestrate layout updates and edge redraw
  private updateLayout() {
    // Apply fixed widths and then position bands/edges
    requestAnimationFrame(() => {
      this.applyCategoryWidths();
      requestAnimationFrame(() => {
        this.updateCategoryBandPositions();
        this.drawEdges();
      });
    });
  }

  private drawEdges() {
    const container = this.renderRoot.querySelector(
      ".line-layer",
    ) as HTMLElement | null;
    if (!container) return;
    const svg = container.querySelector("svg")!;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const pos = this.computePositions();
    const treeEl = this.renderRoot.querySelector(
      ".tree-container",
    ) as HTMLElement;
    const rootRect = treeEl.getBoundingClientRect();
    const scrollLeft = treeEl.scrollLeft;

    const addLine = (fromId: string, toId: string, cls: string) => {
      const a = pos[fromId];
      const b = pos[toId];
      if (!a || !b) return;
      const x1 = a.left - rootRect.left + scrollLeft + a.width / 2;
      const y1 = a.top - rootRect.top + a.height;
      const x2 = b.left - rootRect.left + scrollLeft + b.width / 2;
      const y2 = b.top - rootRect.top;
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      const mx = (x1 + x2) / 2;
      const d = `M ${x1},${y1} C ${mx},${y1 + 20} ${mx},${y2 - 20} ${x2},${y2}`;
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("class", `edge ${cls}`);
      svg.appendChild(path);
    };

    for (const t of this.techs) {
      const sameCat = (p: string) =>
        this.techs.find((x) => x.id === p)?.category === t.category;
      t.requiresAllOf ??= [];
      t.requiresOneOf ??= [];

      const reqAll = t.requiresAllOf.filter(sameCat);
      const reqOne = t.requiresOneOf.filter(sameCat);

      for (const p of reqAll) addLine(p, t.id, "req");
      for (const p of reqOne) addLine(p, t.id, "oneof");
    }
  }

  protected firstUpdated(): void {
    setTimeout(() => this.updateLayout(), 0);
    window.addEventListener("resize", this.handleResize);
    const content = (this.modalEl as any)?.shadowRoot?.querySelector(
      ".c-modal__content",
    );
    content?.addEventListener("scroll", this.handleResize, { passive: true });
    // Also watch horizontal scroll on the whole tree container
    const tree = this.renderRoot.querySelector(".tree-container");
    tree?.addEventListener(
      "scroll",
      this.handleResize as any,
      {
        passive: true,
      } as any,
    );
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("resize", this.handleResize);
    const content = (this.modalEl as any)?.shadowRoot?.querySelector(
      ".c-modal__content",
    );
    content?.removeEventListener("scroll", this.handleResize as any);
    const tree = this.renderRoot.querySelector(".tree-container");
    tree?.removeEventListener("scroll", this.handleResize as any);
  }

  private handleResize = () => {
    this.updateLayout();
  };

  // No per-match listener needed; UI reflects game state directly

  protected updated(): void {
    setTimeout(() => this.updateLayout(), 0);
  }

  render() {
    const levels = [1, 2, 3, 4, 5];
    // Combine actual and optimistic researched states
    const researched = new Set<string>([
      ...this.researchedIDsFromGame(),
      ...this.optimisticResearched,
    ]);
    const categoryColors: Record<Category, string> = {
      Land: "rgba(59,130,246,0.08)",
      Sea: "rgba(14,165,233,0.08)",
      Air: "rgba(168,85,247,0.08)",
      Nuclear: "rgba(239,68,68,0.08)",
      Economy: "rgba(34,197,94,0.08)",
    };

    return html`
      <o-modal title="Research Tree" max-width="90vw" max-height="85dvh">
        <style>
          .tree-container {
            display: grid;
            /* Size each category column to its content and allow overall horizontal scroll */
            grid-template-columns: repeat(5, minmax(160px, max-content));
            grid-auto-rows: auto;
            gap: 16px;
            position: relative;
            overflow-x: auto;
            overflow-y: hidden;
            width: 100%;
            padding-bottom: 4px; /* space for scrollbar overlay */
          }
          .category-bands {
            position: absolute;
            inset: 0;
            display: block; /* absolute children are positioned by JS */
            z-index: 0;
            pointer-events: none;
          }
          .category-band {
            border-left: 1px solid rgba(255, 255, 255, 0.05);
            border-right: 1px solid rgba(0, 0, 0, 0.25);
          }
          .level-band {
            grid-column: 1 / -1;
            border-radius: 8px;
            padding: 6px; /* slightly tighter vertical spacing */
          }
          .level-header {
            font-weight: bold;
            color: #d1d5db;
            margin-bottom: 6px; /* reduce header-bottom gap */
            padding-left: 6px; /* add a bit of left room */
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .level-grid {
            display: grid;
            /* Make each category column width fit its widest cell content */
            grid-template-columns: repeat(5, minmax(160px, max-content));
            gap: 10px; /* slightly less gap between categories */
          }
          .category-slot {
            display: flex;
            flex-direction: column;
            gap: 6px; /* slightly reduce space between title and row */
            width: auto; /* allow to grow */
            padding: 6px 12px; /* slightly reduce vertical padding */
            box-sizing: border-box;
          }
          .tech-row {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap; /* keep items horizontal, wrap if too many for fixed column */
            align-items: flex-start;
            justify-content: center; /* center techs within the category */
            gap: 6px; /* slightly tighter spacing between cards */
            /* No per-row scroll; the entire tree scrolls */
            overflow: visible;
            width: 100%;
          }
          .category-title {
            font-size: 12px;
            text-transform: uppercase;
            opacity: 0.7;
            margin-bottom: 4px;
          }
          .tech {
            background: #1f2937;
            border: 1px solid #374151;
            border-radius: 8px;
            padding: 8px;
            color: #e5e7eb;
            position: relative;
            cursor: pointer;
            transition:
              transform 0.12s ease,
              box-shadow 0.12s ease,
              opacity 0.2s;
            min-height: 64px;
            /* Let multiple techs sit side-by-side */
            flex: 0 0 auto;
            width: 160px;
            text-align: left;
          }
          .tech:hover {
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35) inset;
          }
          .tech.locked {
            opacity: 0.45;
            cursor: not-allowed;
          }
          .tech.researched {
            background: #374151;
            border-color: #4b5563;
          }
          .tech.researched::after {
            content: "\\2713";
            position: absolute;
            top: 6px;
            right: 8px;
            font-weight: bold;
            color: #86efac;
            text-shadow: 0 1px 0 rgba(0, 0, 0, 0.5);
          }
          /* Themed tooltip for tech descriptions (right-side) */
          .tech .tooltip {
            position: absolute;
            top: 50%;
            left: calc(100% + 8px);
            transform: translateY(-50%);
            background: #111827; /* modal dark */
            color: #e5e7eb;
            border: 1px solid #374151;
            border-radius: 8px;
            box-shadow:
              0 10px 20px rgba(0, 0, 0, 0.35),
              inset 0 0 0 1px rgba(255, 255, 255, 0.02);
            padding: 8px 10px;
            font-size: 12px;
            line-height: 1.25;
            max-width: 280px;
            width: max-content;
            z-index: 10;
            opacity: 0;
            visibility: hidden;
            transition: opacity 120ms ease;
            pointer-events: none;
            white-space: normal;
          }
          .tech .tooltip::after {
            content: "";
            position: absolute;
            left: -6px;
            top: 50%;
            transform: translateY(-50%);
            border-width: 6px;
            border-style: solid;
            border-color: transparent #111827 transparent transparent; /* caret pointing right */
            filter: drop-shadow(-1px 0 0 rgba(55, 65, 81, 0.9));
          }
          .tech:hover .tooltip {
            opacity: 1;
            visibility: visible;
          }
          .pill {
            font-size: 10px;
            border-radius: 999px;
            padding: 2px 6px;
            display: inline-block;
            margin-right: 6px;
          }
          .pill-req {
            background: rgba(239, 68, 68, 0.18);
            color: #fecaca;
            border: 1px solid rgba(239, 68, 68, 0.35);
          }
          .pill-oneof {
            background: rgba(245, 158, 11, 0.18);
            color: #fde68a;
            border: 1px solid rgba(245, 158, 11, 0.35);
          }
          .line-layer {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 1;
          }
          .line-layer svg {
            width: 100%;
            height: 100%;
            overflow: visible;
          }
          .edge {
            stroke-width: 2;
          }
          .edge.req {
            stroke: rgba(239, 68, 68, 0.8);
          }
          .edge.oneof {
            stroke: rgba(245, 158, 11, 0.85);
            stroke-dasharray: 6 4;
          }
        </style>
        ${this.renderLegend()}
        <div class="tree-container">
          <div class="category-bands">
            ${this.categories.map(
              (cat) =>
                html`<div
                  class="category-band"
                  style="background:${categoryColors[cat]}"
                ></div>`,
            )}
          </div>
          ${levels.map(
            (lvl) => html`
              <div class="level-band">
                <div class="level-header">Tech Level ${lvl}</div>
                <div class="level-grid">
                  ${this.categories.map((cat) => {
                    const techs = this.techs.filter(
                      (t) => t.level === lvl && t.category === cat,
                    );
                    return html`
                      <div class="category-slot">
                        <div class="category-title">${cat}</div>
                        <div class="tech-row">
                          ${techs.map((tech) => {
                            const available = this.isAvailable(
                              tech.id,
                              researched,
                            );
                            const isResearched = researched.has(tech.id);
                            const clickable = available && !isResearched;
                            const classes = [
                              "tech",
                              available ? "" : "locked",
                              isResearched ? "researched" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");
                            return html`
                              <button
                                class=${classes}
                                data-id=${tech.id}
                                @click=${() => this.onTechClick(tech.id)}
                                title=${""}
                                ?disabled=${!clickable}
                              >
                                ${tech.description
                                  ? html`<div class="tooltip">
                                      ${tech.description}
                                    </div>`
                                  : ""}
                                <div
                                  style="font-weight:600; margin-bottom:6px;"
                                >
                                  ${tech.name}
                                </div>
                                <div>
                                  ${tech.requiresAllOf?.length
                                    ? html`<span class="pill pill-req"
                                        >Requires:
                                        ${tech.requiresAllOf.length}</span
                                      >`
                                    : ""}
                                  ${tech.requiresOneOf?.length
                                    ? html`<span class="pill pill-oneof"
                                        >One of:
                                        ${tech.requiresOneOf.length}</span
                                      >`
                                    : ""}
                                </div>
                              </button>
                            `;
                          })}
                        </div>
                      </div>
                    `;
                  })}
                </div>
              </div>
            `,
          )}
          <div class="line-layer"><svg></svg></div>
        </div>
      </o-modal>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "research-tree-modal": ResearchTreeModal;
  }
}
