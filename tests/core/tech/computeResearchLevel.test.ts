import {
  computeResearchLevel,
  getTechNodes,
} from "../../../src/core/tech/ResearchTree";

// Helper to pick IDs for a specific level
function idsForLevel(level: number): string[] {
  return getTechNodes()
    .filter((n) => n.level === level)
    .map((n) => n.id);
}

describe("computeResearchLevel", () => {
  it("returns 0 with no researched techs", () => {
    const T = computeResearchLevel([]);
    expect(T).toBe(0);
  });

  it("returns 1.0 when all level 1 techs are researched", () => {
    const level1 = idsForLevel(1);
    expect(level1.length).toBeGreaterThan(0);
    const T = computeResearchLevel(level1);
    expect(T).toBeCloseTo(1, 6);
  });

  it("damps higher levels by lower level completion", () => {
    const level1 = idsForLevel(1);
    const level2 = idsForLevel(2);
    // Half of level 1 researched
    const halfL1 = new Set<string>(
      level1.slice(0, Math.floor(level1.length / 2)),
    );
    const T_halfL1 = computeResearchLevel(halfL1);
    // Expect between 0 and 1
    expect(T_halfL1).toBeGreaterThan(0);
    expect(T_halfL1).toBeLessThan(1);

    // Now add all level 2 techs; contribution should be damped by 0.5 prereq
    const withL2 = new Set<string>([...halfL1, ...level2]);
    const T_withL2 = computeResearchLevel(withL2);
    // Should be T_halfL1 + 1 * 0.5 (approximately 0.5 extra)
    expect(T_withL2).toBeCloseTo(T_halfL1 + 0.5, 1);
  });

  it("gives 1.5 when L1 complete and L2 50% complete (approx)", () => {
    const level1 = idsForLevel(1);
    const level2 = idsForLevel(2);
    const halfL2Count = Math.floor(level2.length / 2);
    const chosenL2 = level2.slice(0, halfL2Count);
    const T = computeResearchLevel([...level1, ...chosenL2]);
    // Allow small tolerance due to extras (e.g., branch nodes)
    expect(T).toBeCloseTo(1 + 0.5, 1);
  });
});
