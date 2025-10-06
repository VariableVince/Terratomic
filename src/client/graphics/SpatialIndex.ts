import { Game } from "../../core/game/Game";
import { GameView, UnitView } from "../../core/game/GameView";

const CELL_SIZE = 100; // for the spatial grid

export class SpatialIndex {
  private grid: Map<string, UnitView[]> = new Map();
  private game: Game | GameView;

  constructor(game: Game | GameView) {
    this.game = game;
  }

  private getKey(x: number, y: number): string {
    return `${Math.floor(x / CELL_SIZE)},${Math.floor(y / CELL_SIZE)}`;
  }

  add(unit: UnitView) {
    const key = this.getKey(this.game.x(unit.tile()), this.game.y(unit.tile()));
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)!.push(unit);
  }

  remove(unit: UnitView) {
    const key = this.getKey(
      this.game.x(unit.lastTile()),
      this.game.y(unit.lastTile()),
    );
    if (this.grid.has(key)) {
      const cell = this.grid.get(key)!;
      const index = cell.indexOf(unit);
      if (index > -1) {
        cell.splice(index, 1);
      }
    }
  }

  getInRange(x: number, y: number, range: number): UnitView[] {
    const units: UnitView[] = [];
    const minX = Math.floor((x - range) / CELL_SIZE);
    const maxX = Math.floor((x + range) / CELL_SIZE);
    const minY = Math.floor((y - range) / CELL_SIZE);
    const maxY = Math.floor((y + range) / CELL_SIZE);

    for (let i = minX; i <= maxX; i++) {
      for (let j = minY; j <= maxY; j++) {
        const key = `${i},${j}`;
        if (this.grid.has(key)) {
          for (const unit of this.grid.get(key)!) {
            const dx = this.game.x(unit.tile()) - x;
            const dy = this.game.y(unit.tile()) - y;
            if (dx * dx + dy * dy <= range * range) {
              units.push(unit);
            }
          }
        }
      }
    }
    return units;
  }
}
