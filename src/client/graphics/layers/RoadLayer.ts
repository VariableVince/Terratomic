import { Theme } from "../../../core/configuration/Config";
import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType, RoadsUpdate } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

export class RoadLayer implements Layer {
  private roadSegments = new Set<string>();
  // Keep this threshold aligned with StructureLayer's ICON_GROW_ZOOM_THRESHOLD
  private static readonly ROAD_GROW_ZOOM_THRESHOLD = 2;
  private static readonly BASE_ROAD_WIDTH = 1.8; // base inner stroke width in screen px at/under threshold
  private static readonly OUTLINE_EXTRA = 1.6; // extra px for outline relative to inner stroke
  private theme: Theme;
  // Cache geometry as a Path2D to avoid re-tracing every frame
  private path: Path2D | null = null;
  private dirty = true;
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(
    private game: GameView,
    private transform: TransformHandler,
  ) {
    // initialize theme from game config to match StructureLayer
    this.theme = this.game.config().theme();
  }

  shouldTransform(): boolean {
    return true;
  }

  init() {
    // No offscreen canvas needed; we'll draw vector paths directly each frame
    this.dirty = true;
    this.path = null;
    this.lastWidth = this.game.width();
    this.lastHeight = this.game.height();
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    if (!updates) return;

    const roadUpdates = updates[GameUpdateType.Roads] as
      | RoadsUpdate[]
      | undefined;
    if (roadUpdates && roadUpdates.length > 0) {
      let changed = false;
      for (const update of roadUpdates) {
        if (update.added.length > 0) {
          changed = true;
          for (const segment of update.added) {
            this.roadSegments.add(segment);
          }
        }
        if (update.removed.length > 0) {
          changed = true;
          for (const segment of update.removed) {
            this.roadSegments.delete(segment);
          }
        }
      }
      // No immediate redraw required; we render paths each frame
      if (changed) this.dirty = true; // mark geometry cache dirty
    }
  }

  redraw() {
    // No-op: kept for interface compatibility
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (this.roadSegments.size === 0) return;

    // Draw vector paths directly under the active transform to avoid pixelation
    // Note: Coordinates are in game space; offset by half map size to align with transform origin
    // Rebuild cached geometry if needed (road changes or size changed)
    if (
      this.dirty ||
      this.lastWidth !== this.game.width() ||
      this.lastHeight !== this.game.height()
    ) {
      this.path = this.buildPath();
      this.dirty = false;
      this.lastWidth = this.game.width();
      this.lastHeight = this.game.height();
    }

    if (!this.path) return;

    const s = this.transform.scale || 1;
    const t = RoadLayer.ROAD_GROW_ZOOM_THRESHOLD;
    // Match StructureLayer behavior: stable up to threshold, then grow with zoom
    const screenScale = s <= t ? Math.min(1, s) : s / t;
    // Convert desired on-screen widths to world units by compensating for current transform scale
    const innerWorldWidth = (RoadLayer.BASE_ROAD_WIDTH * screenScale) / s;
    const outlineWorldWidth =
      ((RoadLayer.BASE_ROAD_WIDTH + RoadLayer.OUTLINE_EXTRA) * screenScale) / s;
    context.lineJoin = "round";
    context.lineCap = "round";

    // Outline color identical to StructureLayer icon border color:
    // theme.borderColor(player).darken(0.17)
    const player = this.game.focusedPlayer() ?? this.game.myPlayer();
    const outlineRgb = player
      ? this.theme.borderColor(player).darken(0.17).toRgbString()
      : "rgb(128, 127, 127)"; // fallback similar to UNDER_CONSTRUCTION_BORDER
    context.strokeStyle = outlineRgb;
    context.lineWidth = outlineWorldWidth;
    context.stroke(this.path);

    // Inner semi-transparent white stroke similar to structure icon fill
    context.strokeStyle = "rgba(255, 255, 255, 1)";
    context.lineWidth = innerWorldWidth;
    context.stroke(this.path);
  }

  // Minimal sink interface implemented by both CanvasRenderingContext2D and Path2D
  private traceSegment(
    ctx: {
      moveTo(x: number, y: number): void;
      lineTo(x: number, y: number): void;
    },
    tile1: TileRef,
    tile2: TileRef,
  ) {
    // Align world coordinates with the transform's centered origin
    const ox = this.game.width() / 2;
    const oy = this.game.height() / 2;
    const x1 = this.game.x(tile1) - ox + 0.5;
    const y1 = this.game.y(tile1) - oy + 0.5;
    const x2 = this.game.x(tile2) - ox + 0.5;
    const y2 = this.game.y(tile2) - oy + 0.5;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }

  private buildPath(): Path2D | null {
    if (this.roadSegments.size === 0) return null;
    const p = new Path2D();
    for (const segment of this.roadSegments) {
      const [tile1Str, tile2Str] = segment.split("-");
      const tile1 = parseInt(tile1Str, 10) as TileRef;
      const tile2 = parseInt(tile2Str, 10) as TileRef;
      this.traceSegment(p, tile1, tile2);
    }
    return p;
  }
}
