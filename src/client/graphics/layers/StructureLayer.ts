import * as PIXI from "pixi.js";
import airfieldIcon from "../../../../resources/images/AirfieldIcon.svg";
import anchorIcon from "../../../../resources/images/AnchorIcon.png";
import academyIcon from "../../../../resources/images/buildings/academy_icon.png";
import cityIcon from "../../../../resources/images/CityIcon.png";
import hospitalIcon from "../../../../resources/images/HospitalIconWhite.svg";
import missileSiloIcon from "../../../../resources/images/MissileSiloUnit.png";
import SAMMissileIcon from "../../../../resources/images/SamLauncherUnit.png";
// Use the new non-commercial shield icon
import shieldIcon from "../../../../resources/non-commercial/images/buildings/fortAlt3.png";
import { Theme } from "../../../core/configuration/Config";
import { EventBus } from "../../../core/EventBus";
import { Cell, PlayerID, UnitType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { GameView, UnitView } from "../../../core/game/GameView";
import { MouseUpEvent } from "../../InputHandler";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";
import { UnitInfoModal } from "./UnitInfoModal";
class StructureRenderInfo {
  public isOnScreen: boolean = false;
  constructor(
    public unit: UnitView,
    public owner: PlayerID,
    public pixiSprite: PIXI.Sprite,
    public underConstruction: boolean,
  ) {}
}

const ICON_SIZE = 24;
const UNDER_CONSTRUCTION_FILL = "rgb(198, 198, 198)";
const UNDER_CONSTRUCTION_BORDER = "rgb(128, 127, 127)";

// Background shape per structure type
type BgShape = "circle" | "square" | "hex";
const STRUCTURE_BG_SHAPES: Partial<Record<UnitType, BgShape>> = {
  [UnitType.City]: "circle",
  [UnitType.Port]: "circle",
  [UnitType.DefensePost]: "hex",
  [UnitType.MissileSilo]: "square",
  [UnitType.SAMLauncher]: "square",
  [UnitType.Airfield]: "square",
  [UnitType.Hospital]: "square",
  [UnitType.Academy]: "square",
};

export class StructureLayer implements Layer {
  private pixicanvas: HTMLCanvasElement;
  private stage: PIXI.Container;
  private shouldRedraw: boolean = true;
  private textureCache: Map<string, PIXI.Texture> = new Map();
  private theme: Theme;
  private renderer: PIXI.Renderer;
  private renders: StructureRenderInfo[] = [];
  private seenUnits: Set<UnitView> = new Set();

  // Interaction state
  private selectedStructureUnit: UnitView | null = null;
  private previouslySelected: UnitView | null = null;

  // Icons registry
  private structures: Map<
    UnitType,
    { iconPath: string; image: HTMLImageElement | null }
  > = new Map([
    [UnitType.City, { iconPath: cityIcon, image: null }],
    [UnitType.Airfield, { iconPath: airfieldIcon, image: null }],
    [UnitType.Hospital, { iconPath: hospitalIcon, image: null }],
    [UnitType.Academy, { iconPath: academyIcon, image: null }],
    [UnitType.DefensePost, { iconPath: shieldIcon, image: null }],
    [UnitType.Port, { iconPath: anchorIcon, image: null }],
    [UnitType.MissileSilo, { iconPath: missileSiloIcon, image: null }],
    [UnitType.SAMLauncher, { iconPath: SAMMissileIcon, image: null }],
  ]);

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transformHandler: TransformHandler,
    private unitInfoModal: UnitInfoModal | null,
  ) {
    if (!unitInfoModal) {
      throw new Error(
        "UnitInfoModal instance must be provided to StructureLayer.",
      );
    }
    this.theme = game.config().theme();
    this.structures.forEach((u, unitType) => this.loadIcon(u, unitType));
  }

  private loadIcon(
    unitInfo: {
      iconPath: string;
      image: HTMLImageElement | null;
    },
    unitType: UnitType,
  ) {
    const image = new Image();
    image.src = unitInfo.iconPath;
    image.onload = () => {
      unitInfo.image = image;
    };
    image.onerror = () => {
      console.error(
        `Failed to load icon for ${unitType}: ${unitInfo.iconPath}`,
      );
    };
  }

  shouldTransform(): boolean {
    // We manually handle transforms when positioning sprites
    return false;
  }

  async init() {
    window.addEventListener("resize", () => this.resizeCanvas());
    await this.setupRenderer();
    this.redraw();
    this.eventBus.on(MouseUpEvent, (e) => this.onMouseUp(e));
  }

  async setupRenderer() {
    this.renderer = new PIXI.WebGLRenderer();
    this.pixicanvas = document.createElement("canvas");
    this.pixicanvas.width = window.innerWidth;
    this.pixicanvas.height = window.innerHeight;
    this.stage = new PIXI.Container();
    this.stage.position.set(0, 0);
    this.stage.width = this.pixicanvas.width;
    this.stage.height = this.pixicanvas.height;
    await this.renderer.init({
      canvas: this.pixicanvas,
      resolution: 1,
      width: this.pixicanvas.width,
      height: this.pixicanvas.height,
      clearBeforeRender: true,
      backgroundAlpha: 0,
      backgroundColor: 0x00000000,
    });
  }

  resizeCanvas() {
    if (this.renderer.view) {
      this.pixicanvas.width = window.innerWidth;
      this.pixicanvas.height = window.innerHeight;
      this.renderer.resize(innerWidth, innerHeight, 1);
      this.shouldRedraw = true;
    }
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    const unitUpdates = updates !== null ? updates[GameUpdateType.Unit] : [];
    for (const u of unitUpdates) {
      const unitView = this.game.unit(u.id);
      if (unitView === undefined) continue;

      if (unitView.isActive()) {
        if (this.seenUnits.has(unitView)) {
          const render = this.renders.find(
            (r) => r.unit.id() === unitView.id(),
          );
          if (render) {
            this.updateRenderState(render, unitView);
          }
        } else if (
          this.structures.has(unitView.type()) ||
          unitView.type() === UnitType.Construction
        ) {
          this.seenUnits.add(unitView);
          const render = new StructureRenderInfo(
            unitView,
            unitView.owner().id(),
            this.createPixiSprite(unitView),
            unitView.type() === UnitType.Construction,
          );
          this.renders.push(render);
          this.computeNewLocation(render);
          this.shouldRedraw = true;
        }
      }

      if (!unitView.isActive() && this.seenUnits.has(unitView)) {
        const render = this.renders.find((r) => r.unit.id() === unitView.id());
        if (render) {
          this.deleteStructure(render);
        }
        this.shouldRedraw = true;
      }
    }
  }

  redraw() {
    this.resizeCanvas();
  }

  renderLayer(mainContext: CanvasRenderingContext2D) {
    if (!this.renderer) return;

    if (this.transformHandler.hasChanged()) {
      for (const render of this.renders) {
        this.computeNewLocation(render);
      }
    }

    if (this.transformHandler.hasChanged() || this.shouldRedraw) {
      this.renderer.render(this.stage);
      this.shouldRedraw = false;
    }
    mainContext.drawImage(this.renderer.canvas, 0, 0);
  }

  private updateRenderState(render: StructureRenderInfo, unit: UnitView) {
    const isConstruction = unit.type() === UnitType.Construction;
    const ownerChanged = render.owner !== unit.owner().id();
    const constructionStateChanged =
      render.underConstruction !== isConstruction;
    if (ownerChanged || constructionStateChanged) {
      render.owner = unit.owner().id();
      render.underConstruction = isConstruction;
      render.pixiSprite?.destroy();
      render.pixiSprite = this.createPixiSprite(unit);
      this.shouldRedraw = true;
    }
  }

  private createTexture(unit: UnitView): PIXI.Texture {
    const isConstruction = unit.type() === UnitType.Construction;
    const structureType = isConstruction
      ? (unit.constructionType() ?? unit.type())
      : unit.type();
    const cacheKey = isConstruction
      ? `construction-${structureType}`
      : `${unit.owner().id()}-${structureType}`;
    if (this.textureCache.has(cacheKey)) {
      return this.textureCache.get(cacheKey)!;
    }
    const structureCanvas = document.createElement("canvas");
    structureCanvas.width = ICON_SIZE;
    structureCanvas.height = ICON_SIZE;
    const context = structureCanvas.getContext("2d")!;
    let borderColor: string;
    if (isConstruction) {
      context.fillStyle = UNDER_CONSTRUCTION_FILL;
      borderColor = UNDER_CONSTRUCTION_BORDER;
    } else {
      // Subtler shading per cherry-pick
      context.fillStyle = this.theme
        .territoryColor(unit.owner())
        .lighten(0.06)
        .toRgbString();
      borderColor = this.theme
        .borderColor(unit.owner())
        .darken(0.08)
        .toRgbString();
    }
    context.strokeStyle = borderColor;
    context.beginPath();
    // Draw background shape
    const shape: BgShape =
      STRUCTURE_BG_SHAPES[structureType as UnitType] ?? "circle";
    if (shape === "circle") {
      context.arc(
        ICON_SIZE / 2,
        ICON_SIZE / 2,
        ICON_SIZE / 2 - 1,
        0,
        Math.PI * 2,
      );
    } else if (shape === "square") {
      const pad = 1;
      context.rect(pad, pad, ICON_SIZE - pad * 2, ICON_SIZE - pad * 2);
    } else if (shape === "hex") {
      const r = ICON_SIZE / 2 - 1;
      const cx = ICON_SIZE / 2;
      const cy = ICON_SIZE / 2;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6; // flat-top hex
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
    }
    context.fill();
    context.lineWidth = 1;
    context.stroke();
    const structureInfo = this.structures.get(structureType);
    if (!structureInfo?.image) {
      console.warn(`Image not loaded for unit type: ${structureType}`);
      return PIXI.Texture.from(structureCanvas);
    }
    context.drawImage(
      this.getImageColored(structureInfo.image, borderColor),
      4,
      4,
    );
    const texture = PIXI.Texture.from(structureCanvas);
    this.textureCache.set(cacheKey, texture);
    return texture;
  }

  private createPixiSprite(unit: UnitView): PIXI.Sprite {
    const sprite = new PIXI.Sprite(this.createTexture(unit));
    sprite.anchor.set(0.5, 0.5);
    const tile = unit.tile();
    const worldX = this.game.x(tile);
    const worldY = this.game.y(tile);
    const screenPos = this.transformHandler.worldToScreenCoordinates(
      new Cell(worldX, worldY),
    );
    sprite.x = screenPos.x;
    sprite.y = screenPos.y;
    sprite.scale.set(Math.min(1, this.transformHandler.scale));
    this.stage.addChild(sprite);
    return sprite;
  }

  private getImageColored(
    image: HTMLImageElement,
    color: string,
  ): HTMLCanvasElement {
    const imageCanvas = document.createElement("canvas");
    imageCanvas.width = image.width;
    imageCanvas.height = image.height;
    const ctx = imageCanvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(image, 0, 0);
    return imageCanvas;
  }

  private computeNewLocation(render: StructureRenderInfo) {
    const tile = render.unit.tile();
    const worldX = this.game.x(tile);
    const worldY = this.game.y(tile);
    const screenPos = this.transformHandler.worldToScreenCoordinates(
      new Cell(worldX, worldY),
    );
    screenPos.x = Math.round(screenPos.x);
    screenPos.y = Math.round(screenPos.y);

    const margin = ICON_SIZE;
    const onScreen =
      screenPos.x + margin > 0 &&
      screenPos.x - margin < this.pixicanvas.width &&
      screenPos.y + margin > 0 &&
      screenPos.y - margin < this.pixicanvas.height;

    if (onScreen) {
      render.pixiSprite.x = screenPos.x;
      render.pixiSprite.y = screenPos.y;
      render.pixiSprite.scale.set(Math.min(1, this.transformHandler.scale));
    }
    if (render.isOnScreen !== onScreen) {
      render.isOnScreen = onScreen;
      render.pixiSprite.visible = onScreen;
    }
  }

  private isUnitTypeSupported(unitType: UnitType): boolean {
    return this.structures.has(unitType);
  }

  private findStructureUnitAtCell(
    cell: { x: number; y: number },
    maxDistance: number = 10,
  ): UnitView | null {
    const targetRef = this.game.ref(cell.x, cell.y);
    const allUnitTypes = Object.values(UnitType);
    const nearby = this.game.nearbyUnits(targetRef, maxDistance, allUnitTypes);
    for (const { unit } of nearby) {
      if (unit.isActive() && this.isUnitTypeSupported(unit.type())) {
        return unit;
      }
    }
    return null;
  }

  private onMouseUp(event: MouseUpEvent) {
    const cell = this.transformHandler.screenToWorldCoordinates(
      event.x,
      event.y,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      return;
    }

    const clickedUnit = this.findStructureUnitAtCell(cell);
    this.previouslySelected = this.selectedStructureUnit;

    if (clickedUnit) {
      if (clickedUnit.owner() !== this.game.myPlayer()) {
        return;
      }
      const wasSelected = this.previouslySelected === clickedUnit;
      if (wasSelected) {
        this.selectedStructureUnit = null;
        this.unitInfoModal?.onCloseStructureModal();
      } else {
        this.selectedStructureUnit = clickedUnit;
        const screenPos = this.transformHandler.worldToScreenCoordinates(cell);
        const unitTile = clickedUnit.tile();
        this.unitInfoModal?.onOpenStructureModal({
          unit: clickedUnit,
          x: screenPos.x,
          y: screenPos.y,
          tileX: this.game.x(unitTile),
          tileY: this.game.y(unitTile),
        });
      }
    } else {
      this.selectedStructureUnit = null;
      this.unitInfoModal?.onCloseStructureModal();
    }
  }

  public unSelectStructureUnit() {
    if (this.selectedStructureUnit) {
      this.previouslySelected = this.selectedStructureUnit;
      this.selectedStructureUnit = null;
    }
  }

  private deleteStructure(render: StructureRenderInfo) {
    render.pixiSprite?.destroy();
    this.renders = this.renders.filter((r) => r.unit !== render.unit);
    this.seenUnits.delete(render.unit);
  }
}
