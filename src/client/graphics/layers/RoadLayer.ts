import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType, RoadsUpdate } from "../../../core/game/GameUpdates";
import { GameView } from "../../../core/game/GameView";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

export class RoadLayer implements Layer {
  private roadSegments = new Set<string>();

  constructor(
    private game: GameView,
    private transform: TransformHandler,
  ) {}

  shouldTransform(): boolean {
    return true;
  }

  init() {
    // No offscreen canvas needed; we'll draw vector paths directly each frame
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
    }
  }

  redraw() {
    // No-op: kept for interface compatibility
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (this.roadSegments.size === 0) return;

    // Draw vector paths directly under the active transform to avoid pixelation
    // Note: Coordinates are in game space; offset by half map size to align with transform origin
    const roadWidth = 1.2; // thinner roads; world units, scales with zoom
    context.lineJoin = "round";
    context.lineCap = "round";

    // Outline (subtle shadow) for contrast on light backgrounds
    context.strokeStyle = "rgba(0, 0, 0, 0.18)";
    context.lineWidth = roadWidth + 0.6;
    context.beginPath();
    for (const segment of this.roadSegments) {
      const [tile1Str, tile2Str] = segment.split("-");
      const tile1 = parseInt(tile1Str, 10) as TileRef;
      const tile2 = parseInt(tile2Str, 10) as TileRef;
      this.traceSegment(context, tile1, tile2);
    }
    context.stroke();

    // Inner semi-transparent white stroke similar to structure icon fill
    context.strokeStyle = "rgba(255, 255, 255, 0.55)";
    context.lineWidth = roadWidth;
    context.beginPath();
    for (const segment of this.roadSegments) {
      const [tile1Str, tile2Str] = segment.split("-");
      const tile1 = parseInt(tile1Str, 10) as TileRef;
      const tile2 = parseInt(tile2Str, 10) as TileRef;
      this.traceSegment(context, tile1, tile2);
    }
    context.stroke();
  }

  private traceSegment(
    ctx: CanvasRenderingContext2D,
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
}
