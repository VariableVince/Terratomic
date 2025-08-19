/**
 * @jest-environment jsdom
 */

import { UILayer } from "../../../src/client/graphics/layers/UILayer";

describe("UILayer", () => {
  let game: any;
  let eventBus: any;
  let transformHandler: any;

  beforeEach(() => {
    game = {
      width: () => 100,
      height: () => 100,
      config: () => ({
        theme: () => ({
          territoryColor: () => ({
            lighten: () => ({ alpha: () => ({ toRgbString: () => "#fff" }) }),
          }),
        }),
      }),
      x: () => 10,
      y: () => 10,
      unitInfo: () => ({ maxHealth: 10, constructionDuration: 5 }),
      myPlayer: () => ({ id: () => 1 }),
      ticks: () => 1,
      updatesSinceLastTick: () => undefined,
    };
    eventBus = { on: jest.fn() };
    transformHandler = {};
  });

  it("should initialize and redraw canvas", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();
    expect((ui as any)["canvas"].width).toBe(100);
    expect((ui as any)["canvas"].height).toBe(100);
    expect((ui as any)["context"]).not.toBeNull();
  });

  it("should handle unit selection event", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      type: () => "Warship",
      isActive: () => true,
      tile: () => ({}),
      owner: () => ({}),
    };
    const event: any = { isSelected: true, unit };

    (ui as any).drawSelectionBox = jest.fn();
    // call private handler via index access
    (ui as any)["onUnitSelection"](event);
    expect((ui as any).drawSelectionBox).toHaveBeenCalledWith(unit);
  });

  it("should add and clear health bars", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      id: () => 1,
      type: () => "Warship",
      health: () => 5,
      tile: () => ({}),
      owner: () => ({}),
      isActive: () => true,
    };

    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(true);

    // a full hp unit doesnt have a health bar
    unit.health = () => 10;
    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(false);

    // a dead unit doesnt have a health bar
    unit.health = () => 5;
    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(true);
    unit.health = () => 0;
    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(false);
  });

  it("should remove health bars for inactive units", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      id: () => 1,
      type: () => "Warship",
      health: () => 5,
      tile: () => ({}),
      owner: () => ({}),
      isActive: () => true,
    };

    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(true);

    // an inactive unit doesnt have a health bar
    unit.isActive = () => false;
    ui.drawHealthBar(unit);
    expect((ui as any)["allHealthBars"].has(1)).toBe(false);
  });

  it("should add loading bar for unit", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      id: () => 2,
      tile: () => ({}),
      isActive: () => true,
      ticksLeftInCooldown: (): number | undefined => 0,
    };

    ui.drawLoadingBar(unit, 5);
    expect((ui as any)["allProgressBars"].has(2)).toBe(true);
  });

  it("should remove loading bar for inactive unit", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      id: () => 2,
      type: () => "Construction",
      constructionType: () => "City",
      owner: () => ({ id: () => 1 }),
      tile: () => ({}),
      isActive: () => true,
      ticksLeftInCooldown: (): number | undefined => 0,
    };

    (ui as any).onUnitEvent(unit);
    expect((ui as any)["allProgressBars"].has(2)).toBe(true);

    // an inactive unit should not have a loading bar
    unit.isActive = () => false;
    ui.tick();
    expect((ui as any)["allProgressBars"].has(2)).toBe(false);
  });

  it("should remove loading bar for a finished progress bar", () => {
    const ui = new UILayer(game, eventBus, transformHandler);
    ui.redraw();

    const unit: any = {
      id: () => 2,
      type: () => "Construction",
      constructionType: () => "City",
      owner: () => ({ id: () => 1 }),
      tile: () => ({}),
      isActive: () => true,
      ticksLeftInCooldown: (): number | undefined => 0,
    };

    (ui as any).onUnitEvent(unit);
    expect((ui as any)["allProgressBars"].has(2)).toBe(true);

    // simulate enough ticks for completion
    game.ticks = () => 6;
    ui.tick();
    expect((ui as any)["allProgressBars"].has(2)).toBe(false);
  });
});
