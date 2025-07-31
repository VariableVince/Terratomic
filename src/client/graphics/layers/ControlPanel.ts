import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { translateText } from "../../../client/Utils";
import { EventBus } from "../../../core/EventBus";
import { Gold, PlayerID, PlayerType, UnitType } from "../../../core/game/Game";
import { GameView, PlayerView } from "../../../core/game/GameView";
import { AttackRatioEvent } from "../../InputHandler";
import {
  SendBomberIntentEvent,
  SendSetAutoBombingEvent,
  SendSetInvestmentRateEvent,
  SendSetTargetTroopRatioEvent,
} from "../../Transport";
import { renderNumber, renderTroops } from "../../Utils";
import { UIState } from "../UIState";
import { Layer } from "./Layer";

@customElement("control-panel")
export class ControlPanel extends LitElement implements Layer {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.3;

  @state()
  private targetTroopRatio = 0.6;

  @state()
  private currentTroopRatio = 0.6;

  @state()
  private investmentRate: number = 0.5; // default to 50%

  @state()
  private _population: number;

  @state()
  private _maxPopulation: number;

  @state()
  private popRate: number;

  @state()
  private _hospitalReturns: number = 0;

  @state()
  private _troops: number;

  @state()
  private _workers: number;

  @state()
  private _isVisible = false;

  @state()
  private _manpower: number = 0;

  @state()
  private _gold: Gold;

  @state()
  private _productivity: number;

  @state()
  private _productivityGrowth: number;

  @state()
  private _goldPerSecond: Gold;

  private _lastPopulationIncreaseRate: number;

  private _popRateIsIncreasing: boolean = true;

  private init_: boolean = false;

  @state()
  private activeTab: "Controls" | "Bombers" | "Options" = "Controls";

  @state()
  private _lastAirfieldCount: number = 0;

  @state()
  private _lastPlayersHash: string = "";

  @state()
  private _reachablePlayersHash: string = "";

  @state()
  private _hasAirfields: boolean = false;

  @state()
  private _highlightBombersTab: boolean = false;

  @state()
  private _currentTargetPlayerId: PlayerID | null = null;

  @state()
  private _currentTargetStructureType: UnitType | null = null;

  @state()
  private _currentTargetPlayerName: string | null = null;

  @state()
  private _isAutoBombingEnabled: boolean = false;

  private unitIconMap: { [key: string]: string } = {
    City: "/images/CityIconWhite.svg",
    Hospital: "/images/HospitalIconWhite.svg",
    Academy: "/images/AcademyIconWhite.png",
    Port: "/images/PortIcon.svg",
    "Missile Silo": "/images/MissileSiloIconWhite.svg",
    "SAM Launcher": "/images/SamLauncherIconWhite.svg",
    "Air Field": "/images/AirfieldIcon.svg",
    "Defense Post": "/images/ShieldIconWhite.svg",
  };

  init() {
    this.attackRatio = Number(
      localStorage.getItem("settings.attackRatio") ?? "0.3",
    );
    this.targetTroopRatio = Number(
      localStorage.getItem("settings.troopRatio") ?? "0.6",
    );
    this.investmentRate = Number(
      localStorage.getItem("settings.investmentRate") ?? "0.5",
    );
    this.uiState.investmentRate = this.investmentRate;
    this.init_ = true;
    this.uiState.attackRatio = this.attackRatio;
    this.currentTroopRatio = this.targetTroopRatio;
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio =
        (parseInt(
          (document.getElementById("attack-ratio") as HTMLInputElement).value,
        ) +
          event.attackRatio) /
        100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (this.init_) {
      this.eventBus.emit(
        new SendSetTargetTroopRatioEvent(this.targetTroopRatio),
      );
      this.eventBus.emit(new SendSetInvestmentRateEvent(this.investmentRate));
      this.init_ = false;
    }

    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    const popIncreaseRate = player.population() - this._population;
    if (this.game.ticks() % 5 === 0) {
      this._popRateIsIncreasing =
        popIncreaseRate >= this._lastPopulationIncreaseRate;
      this._lastPopulationIncreaseRate = popIncreaseRate;
    }

    this._population = player.population();
    this._maxPopulation = this.game.config().maxPopulation(player);
    this._hospitalReturns = player.hospitalReturns() * 10;
    this._gold = player.gold();
    this._productivity = player.productivity();
    this._productivityGrowth = player.productivityGrowthPerMinute();
    this._troops = player.troops();
    this._workers = player.workers();
    this.popRate = this.game.config().populationIncreaseRate(player) * 10;
    this._goldPerSecond = this.game.config().goldAdditionRate(player) * 10n;

    this.currentTroopRatio = player.troops() / player.population();

    // Track relevant state for dynamic updates
    const currentAirfieldCount = player.units(UnitType.Airfield).length;
    this._hasAirfields = currentAirfieldCount > 0;
    const currentPlayersHash = this.game
      .players()
      .map((p) => p.id())
      .sort()
      .join(","); // Simple hash for player list changes

    const currentReachablePlayersHash = this._getPlayersInAirfieldRange()
      .map((p) => p.id())
      .sort()
      .join(",");

    if (
      this.activeTab === "Bombers" &&
      (this._lastAirfieldCount !== currentAirfieldCount ||
        this._lastPlayersHash !== currentPlayersHash ||
        this._reachablePlayersHash !== currentReachablePlayersHash)
    ) {
      this._refreshBomberPlayerLists();
      this._lastAirfieldCount = currentAirfieldCount;
      this._lastPlayersHash = currentPlayersHash;
      this._reachablePlayersHash = currentReachablePlayersHash;
    }

    if (this.activeTab === "Bombers" && !this._hasAirfields) {
      this.activeTab = "Controls";
    }

    this.requestUpdate();
  }

  onAttackRatioChange(newRatio: number) {
    this.uiState.attackRatio = newRatio;
  }
  onInvestmentRateChange(newRate: number) {
    this.eventBus.emit(new SendSetInvestmentRateEvent(newRate));
  }

  renderLayer(context: CanvasRenderingContext2D) {
    // Render any necessary canvas elements
  }

  shouldTransform(): boolean {
    return false;
  }

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  targetTroops(): number {
    return this._manpower * this.targetTroopRatio;
  }

  onTroopChange(newRatio: number) {
    this.eventBus.emit(new SendSetTargetTroopRatioEvent(newRatio));
  }

  delta(): number {
    const d = this._population - this.targetTroops();
    return d;
  }

  private _getPlayersInAirfieldRange(): PlayerView[] {
    const myPlayer = this.game.myPlayer();
    if (!myPlayer || !myPlayer.isAlive()) {
      return [];
    }

    const myAirfields = myPlayer
      .units(UnitType.Airfield)
      .filter((u) => u.isActive());
    if (myAirfields.length === 0) {
      return []; // No active airfields, no reachable targets
    }

    // Pre-compute squared range for efficiency
    const bomberRangeSquared = this.game.config().bomberTargetRange() ** 2;
    const reachablePlayers: PlayerView[] = [];
    const checkedPlayerIDs = new Set<PlayerID>(); // To avoid adding the same player multiple times

    // Define all targetable structure types for bombers
    const targetableStructures: UnitType[] = [
      UnitType.City,
      UnitType.Hospital,
      UnitType.Academy,
      UnitType.Port,
      UnitType.MissileSilo,
      UnitType.SAMLauncher,
      UnitType.Airfield,
      UnitType.DefensePost,
    ];

    for (const otherPlayer of this.game.players()) {
      // Skip self and players already identified as reachable
      if (
        otherPlayer.id() === myPlayer.id() ||
        myPlayer.isFriendly(otherPlayer) ||
        checkedPlayerIDs.has(otherPlayer.id())
      ) {
        continue;
      }
      // Only consider human or fake human players as targets
      if (
        otherPlayer.type() !== PlayerType.Human &&
        otherPlayer.type() !== PlayerType.FakeHuman
      ) {
        continue;
      }

      let isReachable = false;
      // Get all relevant structures for the other player
      const otherPlayerAllStructures = targetableStructures.flatMap((type) =>
        otherPlayer.units(type),
      );

      // Check if any of my airfields can reach any of their structures
      for (const myAirfield of myAirfields) {
        for (const otherStructure of otherPlayerAllStructures) {
          const distanceSquared = this.game.euclideanDistSquared(
            myAirfield.tile(),
            otherStructure.tile(),
          );
          if (distanceSquared <= bomberRangeSquared) {
            isReachable = true;
            break; // Found a reachable structure, no need to check more for this player
          }
        }
        if (isReachable) {
          break; // Found a reachable structure for this player, no need to check more airfields
        }
      }

      if (isReachable) {
        reachablePlayers.push(otherPlayer);
        checkedPlayerIDs.add(otherPlayer.id());
      }
    }
    // Sort players alphabetically by name for consistent display
    return reachablePlayers.sort((a, b) => a.name().localeCompare(b.name()));
  }

  private _refreshBomberPlayerLists() {
    this.populateBomberForm(); // Populates the main player select list
  }

  updated(changedProperties: Map<string | number | symbol, unknown>) {
    if (this.activeTab === "Bombers") {
      if (
        changedProperties.has("activeTab") ||
        changedProperties.has("_hasAirfields")
      ) {
        this._refreshBomberPlayerLists();
      }
    }

    if (changedProperties.has("_hasAirfields")) {
      const oldHasAirfields = changedProperties.get("_hasAirfields");
      if (this._hasAirfields && !oldHasAirfields) {
        // Airfields just became available, highlight the tab
        this._highlightBombersTab = true;
        setTimeout(() => {
          this._highlightBombersTab = false;
        }, 3000); // Highlight for 3 seconds
      }
    }
  }

  populateBomberForm() {
    const playerSelect = this.querySelector(
      "#bomber-player-select",
    ) as HTMLSelectElement | null;
    if (!this.game || !playerSelect) return;

    const me = this.game.myPlayer();
    if (!me) return;

    const playersToDisplay: PlayerView[] = this._getPlayersInAirfieldRange();

    if (playersToDisplay.length === 0) {
      playerSelect.innerHTML = `<option value="" disabled selected>No building in bomber reach.</option>`;
      playerSelect.disabled = true;
    } else {
      const optsPlayers = playersToDisplay
        .map((p) => `<option value="${p.id()}">${p.name()}</option>`)
        .join("");
      playerSelect.innerHTML = optsPlayers;
      playerSelect.disabled = false;
    }
  }

  handleBomberIntent() {
    const playerSelect = this.querySelector(
      "#bomber-player-select",
    ) as HTMLSelectElement;
    const selectedStructure = this.querySelector(
      "input[name='structure']:checked",
    ) as HTMLInputElement | null;

    if (!playerSelect || !selectedStructure) return;

    const targetID = String(playerSelect.value);
    const structure = selectedStructure.value as unknown as UnitType;

    this.sendBomberIntent(targetID, structure);
  }

  sendBomberIntent(targetID: string | null, structure: UnitType | null) {
    if (!this.eventBus) return;
    this._currentTargetPlayerId = targetID;
    this._currentTargetStructureType = structure;
    if (targetID) {
      const targetPlayer = this.game.players().find((p) => p.id() === targetID);
      this._currentTargetPlayerName = targetPlayer ? targetPlayer.name() : null;
    } else {
      this._currentTargetPlayerName = null;
    }
    this.eventBus.emit(new SendBomberIntentEvent(targetID, structure));
  }

  _startAutoBombing() {
    this._isAutoBombingEnabled = true;
    this.eventBus.emit(new SendSetAutoBombingEvent(true));
    // Clear any manual target when auto-bombing is enabled
    this.sendBomberIntent(null, null);
  }

  _stopAutoBombing() {
    this._isAutoBombingEnabled = false;
    this.eventBus.emit(new SendSetAutoBombingEvent(false));
    // Clear any manual target when auto-bombing is disabled
    this.sendBomberIntent(null, null);
  }

  handleStructureChange(e: Event) {
    const changedCheckbox = e.target as HTMLInputElement;
    if (changedCheckbox.checked) {
      const checkboxes = this.querySelectorAll(
        "input[name='structure']",
      ) as NodeListOf<HTMLInputElement>;
      checkboxes.forEach((checkbox) => {
        if (checkbox !== changedCheckbox) {
          checkbox.checked = false;
        }
      });
    }
  }

  render() {
    return html`
      <style>
        input[type="range"] {
          -webkit-appearance: none;
          background: transparent;
          outline: none;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        input[type="range"]::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          cursor: pointer;
        }
        .targetTroopRatio::-webkit-slider-thumb {
          border-color: rgb(59 130 246);
        }
        .targetTroopRatio::-moz-range-thumb {
          border-color: rgb(59 130 246);
        }
        .attackRatio::-webkit-slider-thumb {
          border-color: rgb(239 68 68);
        }
        .attackRatio::-moz-range-thumb {
          border-color: rgb(239 68 68);
        }
        .highlight-tab {
          animation: pulse 1s infinite alternate;
        }
        @keyframes pulse {
          from {
            background-color: rgba(59, 130, 246, 0.5);
          }
          to {
            background-color: rgba(59, 130, 246, 1);
          }
        }
      </style>
      <div
        class="${this._isVisible
          ? "w-full text-sm lg:text-m lg:w-72 bg-slate-800/40 backdrop-blur-sm shadow-xs p-2 pr-3 lg:p-4 shadow-lg lg:rounded-lg"
          : "hidden"}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="flex border-b border-gray-700 mb-4">
          <button
            class="py-2 px-4 text-center ${this.activeTab === "Controls"
              ? "bg-gray-700 text-white"
              : "text-white"}"
            @click=${() => (this.activeTab = "Controls")}
          >
            Controls
          </button>
          ${this._hasAirfields
            ? html`
                <button
                  class="py-2 px-4 text-center ${this.activeTab === "Bombers"
                    ? "bg-gray-700 text-white"
                    : "text-white"} ${this._highlightBombersTab
                    ? "highlight-tab"
                    : ""}"
                  @click=${() => (this.activeTab = "Bombers")}
                >
                  Bombers
                </button>
              `
            : ""}
        </div>

        <div class="tab-content min-h-[320px]">
          ${this.activeTab === "Controls"
            ? html`
                <div
                  class="hidden lg:block bg-black/30 text-white mb-4 p-2 rounded"
                >
                  <div class="flex justify-between mb-1">
                    <span class="font-bold"
                      >${translateText("control_panel.pop")}:</span
                    >
                    <span translate="no"
                      >${renderTroops(this._population)} /
                      ${renderTroops(this._maxPopulation)}
                      <span
                        class="${this._popRateIsIncreasing
                          ? "text-green-500"
                          : "text-yellow-500"}"
                        translate="no"
                      >
                        (+${renderTroops(this.popRate)}${this._hospitalReturns >
                        0
                          ? `/ +${renderTroops(this._hospitalReturns)}`
                          : ""})
                      </span>
                    </span>
                  </div>
                  <div class="flex justify-between">
                    <span class="font-bold"
                      >${translateText("control_panel.gold")}:</span
                    >
                    <span translate="no"
                      >${renderNumber(this._gold)}
                      (+${renderNumber(this._goldPerSecond)})</span
                    >
                  </div>
                </div>

                <div class="relative mb-4 lg:mb-4">
                  <label class="block text-white mb-1" translate="no"
                    >${translateText("control_panel.troops")}:
                    <span translate="no">${renderTroops(this._troops)}</span>
                    | ${translateText("control_panel.workers")}:
                    <span translate="no"
                      >${renderTroops(this._workers)}</span
                    ></label
                  >
                  <div class="relative h-8">
                    <!-- Background track -->
                    <div
                      class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
                    ></div>
                    <!-- Fill track -->
                    <div
                      class="absolute left-0 top-3 h-2 bg-blue-500/60 rounded transition-all duration-300"
                      style="width: ${this.currentTroopRatio * 100}%"
                    ></div>
                    <!-- Range input - exactly overlaying the visual elements -->
                    <input
                      type="range"
                      min="1"
                      max="100"
                      .value=${(this.targetTroopRatio * 100).toString()}
                      @input=${(e: Event) => {
                        this.targetTroopRatio =
                          parseInt((e.target as HTMLInputElement).value) / 100;
                        this.onTroopChange(this.targetTroopRatio);
                      }}
                      class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer targetTroopRatio"
                    />
                  </div>
                </div>

                <div class="relative mb-0 lg:mb-4">
                  <label class="block text-white mb-1" translate="no"
                    >${translateText("control_panel.attack_ratio")}:
                    ${(this.attackRatio * 100).toFixed(0)}%
                    (${renderTroops(
                      (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio,
                    )})</label
                  >
                  <div class="relative h-8">
                    <!-- Background track -->
                    <div
                      class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
                    ></div>
                    <!-- Fill track -->
                    <div
                      class="absolute left-0 top-3 h-2 bg-red-500/60 rounded transition-all duration-300"
                      style="width: ${this.attackRatio * 100}%"
                    ></div>
                    <!-- Range input - exactly overlaying the visual elements -->
                    <input
                      id="attack-ratio"
                      type="range"
                      min="1"
                      max="100"
                      .value=${(this.attackRatio * 100).toString()}
                      @input=${(e: Event) => {
                        this.attackRatio =
                          parseInt((e.target as HTMLInputElement).value) / 100;
                        this.onAttackRatioChange(this.attackRatio);
                      }}
                      class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer attackRatio"
                    />
                  </div>
                </div>
                <div class="relative mt-4 lg:mb-4">
                  <label class="block text-white mb-1" translate="no">
                    Production Investment Rate:
                    ${(this.investmentRate * 100).toFixed(0)}%
                  </label>
                  <div
                    class="text-white text-right text-xs opacity-60 mt-1"
                    translate="no"
                  >
                    Prod: ${Math.round(this._productivity * 100)}%
                    (${this._productivityGrowth >= 0 ? "+" : ""}${(
                      this._productivityGrowth * 100
                    ).toFixed(1)}%/min)
                  </div>
                  <div class="relative h-8">
                    <div
                      class="absolute left-0 right-0 top-3 h-2 bg-white/20 rounded"
                    ></div>
                    <div
                      class="absolute left-0 top-3 h-2 bg-green-400/60 rounded transition-all duration-300"
                      style="width: ${this.investmentRate * 100}%"
                    ></div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      .value=${(this.investmentRate * 100).toString()}
                      @input=${(e: Event) => {
                        this.investmentRate =
                          parseInt((e.target as HTMLInputElement).value) / 100;
                        this.onInvestmentRateChange(this.investmentRate);
                      }}
                      class="absolute left-0 right-0 top-2 m-0 h-4 cursor-pointer"
                    />
                  </div>
                </div>
              `
            : ""}
          ${this.activeTab === "Bombers"
            ? html`
                <div class="text-white">
                  <form @submit=${(e) => e.preventDefault()}>
                    <div class="flex gap-2 mt-3">
                      <button
                        type="button"
                        class="flex-1 px-2 py-1 text-xs bg-green-600 hover:bg-green-500 text-white border border-gray-500 rounded"
                        @click=${this._startAutoBombing}
                      >
                        Start Auto Bombing
                      </button>
                      <button
                        type="button"
                        class="flex-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white border border-gray-500 rounded"
                        @click=${this._stopAutoBombing}
                      >
                        Stop Auto Bombing
                      </button>
                    </div>

                    <div class="relative min-h-[250px]">
                      <div
                        class="absolute inset-0 flex flex-col gap-2 mt-3 ${this
                          ._isAutoBombingEnabled
                          ? "hidden"
                          : ""}"
                      >
                        <label class="inline-flex items-center text-sm">
                          Select Target
                          <select
                            id="bomber-player-select"
                            class="ml-1 p-1 bg-gray-700 text-white border border-gray-500 rounded"
                          ></select>
                        </label>

                        <label class="block mt-2 text-sm"
                          >Select Structure</label
                        >
                        <div class="grid grid-cols-3 gap-2 mt-1">
                          ${[
                            UnitType.City,
                            UnitType.DefensePost,
                            UnitType.SAMLauncher,
                            UnitType.MissileSilo,
                            UnitType.Port,
                            UnitType.Airfield,
                            UnitType.Hospital,
                            UnitType.Academy,
                          ].map((s) => {
                            return html`
                              <label
                                class="flex items-center space-x-1 p-1 border border-gray-700 rounded cursor-pointer has-checked:border-blue-500"
                              >
                                <img
                                  src="${this.unitIconMap[s]}"
                                  alt="${s}"
                                  class="w-4 h-4"
                                />
                                <input
                                  type="checkbox"
                                  name="structure"
                                  value="${s}"
                                  ?checked=${s === UnitType.City}
                                  class="form-checkbox h-4 w-4 text-blue-600 bg-gray-700 border-gray-500 rounded focus:ring-blue-500"
                                  @change=${this.handleStructureChange}
                                />
                              </label>
                            `;
                          })}
                        </div>

                        <div class="text-white text-sm">
                          ${this._currentTargetPlayerId &&
                          this._currentTargetStructureType
                            ? html`<span class="text-red-500 font-bold"
                                  >Current target:</span
                                >
                                ${this._currentTargetPlayerName}
                                <img
                                  src="${this.unitIconMap[
                                    this._currentTargetStructureType
                                  ]}"
                                  alt="${this._currentTargetStructureType}"
                                  class="inline-block w-4 h-4 align-top mr-1"
                                />`
                            : html`No target selected`}
                        </div>

                        <div class="flex flex-col gap-2 mt-3">
                          <button
                            type="button"
                            class="w-full p-1 bg-blue-600 hover:bg-blue-500 text-white border border-gray-500 rounded"
                            @click=${this.handleBomberIntent}
                          >
                            Set Target
                          </button>
                          <button
                            type="button"
                            class="w-full p-1 bg-gray-600 hover:bg-gray-500 text-white border border-gray-500 rounded"
                            @click=${() => this.sendBomberIntent(null, null)}
                          >
                            Clear Target
                          </button>
                        </div>
                      </div>
                      <div
                        class="absolute inset-0 text-white text-center mt-4 ${!this
                          ._isAutoBombingEnabled
                          ? "hidden"
                          : ""}"
                      >
                        Automatic bombing is enabled.
                      </div>
                    </div>
                  </form>
                </div>
              `
            : ""}
          ${this.activeTab === "Options"
            ? html`
                <div class="text-white">
                  <h2>Options Tab Content</h2>
                  <p>This is where general options will go.</p>
                </div>
              `
            : ""}
        </div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
