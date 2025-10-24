import { ResearchTreeSelectExecution } from "../../../src/core/execution/ResearchTreeSelectExecution";
import { Game, Player, UpgradeType } from "../../../src/core/game/Game";
import { RESEARCH_TECH_IDS } from "../../../src/core/tech/TechEffects";

describe("ResearchTreeSelectExecution", () => {
  let mockPlayer: jest.Mocked<Player> & {
    addResearchedTech?: (id: string) => void;
  };
  let mockGame: jest.Mocked<Game>;

  beforeEach(() => {
    mockPlayer = {
      hasUpgrade: jest.fn().mockReturnValue(false),
      addUpgrade: jest.fn(),
      // addResearchedTech is duck-typed; the execution checks at runtime
      addResearchedTech: jest.fn(),
    } as any;

    mockGame = {
      markPlayerNodesForReconnection: jest.fn(),
    } as any;
  });

  it("adds researched tech ID to the player's set", () => {
    const exec = new ResearchTreeSelectExecution(
      mockPlayer as any,
      RESEARCH_TECH_IDS.WWII_LESSONS,
    );
    exec.init(mockGame as any, 0);
    exec.tick(0);

    expect(mockPlayer.addResearchedTech as jest.Mock).toHaveBeenCalledWith(
      RESEARCH_TECH_IDS.WWII_LESSONS,
    );
  });

  it("grants Roads and reconnects when Economy-1 is selected", () => {
    const exec = new ResearchTreeSelectExecution(
      mockPlayer as any,
      RESEARCH_TECH_IDS.POST_WAR_RECONSTRUCTION,
    );
    exec.init(mockGame as any, 0);
    exec.tick(0);

    expect(mockPlayer.addUpgrade).toHaveBeenCalledWith(UpgradeType.Roads);
    expect(mockGame.markPlayerNodesForReconnection).toHaveBeenCalledWith(
      mockPlayer,
    );
  });

  it("does not double-grant Roads if already owned", () => {
    (mockPlayer.hasUpgrade as jest.Mock).mockReturnValue(true);
    const exec = new ResearchTreeSelectExecution(
      mockPlayer as any,
      RESEARCH_TECH_IDS.POST_WAR_RECONSTRUCTION,
    );
    exec.init(mockGame as any, 0);
    exec.tick(0);

    // No additional addUpgrade call for Roads when already owned
    expect(mockPlayer.addUpgrade).not.toHaveBeenCalled();
    // Still acceptable to avoid reconnection in this case; ensure it's not called
    expect(mockGame.markPlayerNodesForReconnection).not.toHaveBeenCalled();
  });
});
