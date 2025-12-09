import { SpawnExecution } from "../../../src/core/execution/SpawnExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
} from "../../../src/core/game/Game";
import {
  getTechNodes,
  isTechAvailable,
} from "../../../src/core/tech/ResearchTree";
import { setup } from "../../util/Setup";

let game: Game;
let player: Player;

describe("Research Priority Allocation", () => {
  beforeEach(async () => {
    game = await setup("ocean_and_land", {
      infiniteGold: true,
      instantBuild: true,
    });

    const pInfo = new PlayerInfo(
      "us",
      "TestPlayer",
      PlayerType.Human,
      "client1",
      "p1",
    );

    game.addPlayer(pInfo);

    const spawn = game.ref(0, 10);
    game.addExecution(new SpawnExecution(game.player(pInfo.id).info(), spawn));

    let safety = 0;
    while (game.inSpawnPhase() && safety++ < 500) {
      game.executeNextTick();
    }
    expect(safety).toBeLessThan(500);

    player = game.player(pInfo.id);
  });

  describe("buildMissingPrereqPath logic validation", () => {
    it("should identify all prerequisites for Economy-4 when nothing is researched", () => {
      // Simulate the buildMissingPrereqPath logic
      const nodes = getTechNodes();
      const researched = new Set<string>();
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      const sameCat = (a: string, b: string) =>
        (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

      const buildMissingPrereqPath = (targetId: string): Set<string> => {
        const path = new Set<string>();
        const seen = new Set<string>();
        const dfs = (tid: string) => {
          if (seen.has(tid)) return;
          seen.add(tid);
          const node = byId.get(tid);
          if (!node) return;

          const reqAll = (node.requiresAllOf ?? []).filter((p) =>
            sameCat(p, tid),
          );
          const reqOne = (node.requiresOneOf ?? []).filter((p) =>
            sameCat(p, tid),
          );

          for (const r of reqAll) {
            if (!researched.has(r)) {
              path.add(r);
              dfs(r);
            }
          }

          if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
            const sorted = [...reqOne].sort(
              (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
            );
            const choice = sorted[0];
            if (choice && !researched.has(choice)) {
              path.add(choice);
              dfs(choice);
            }
          }
        };
        dfs(targetId);
        return path;
      };

      // Test: When setting priority to Economy-4, it should identify Economy-1, Economy-2, Economy-3 as prerequisites
      const pathSet = buildMissingPrereqPath("Economy-4");

      expect(pathSet.has("Economy-1")).toBe(true);
      expect(pathSet.has("Economy-2")).toBe(true);
      expect(pathSet.has("Economy-3")).toBe(true);
      expect(pathSet.has("Economy-4")).toBe(false); // Target itself should not be in path
      expect(pathSet.size).toBe(3);
    });

    it("should identify correct frontier when Economy-1 is already researched", () => {
      const nodes = getTechNodes();
      const researched = new Set<string>(["Economy-1"]); // Already researched Economy-1
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      const sameCat = (a: string, b: string) =>
        (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

      const buildMissingPrereqPath = (targetId: string): Set<string> => {
        const path = new Set<string>();
        const seen = new Set<string>();
        const dfs = (tid: string) => {
          if (seen.has(tid)) return;
          seen.add(tid);
          const node = byId.get(tid);
          if (!node) return;

          const reqAll = (node.requiresAllOf ?? []).filter((p) =>
            sameCat(p, tid),
          );
          const reqOne = (node.requiresOneOf ?? []).filter((p) =>
            sameCat(p, tid),
          );

          for (const r of reqAll) {
            if (!researched.has(r)) {
              path.add(r);
              dfs(r);
            }
          }

          if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
            const sorted = [...reqOne].sort(
              (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
            );
            const choice = sorted[0];
            if (choice && !researched.has(choice)) {
              path.add(choice);
              dfs(choice);
            }
          }
        };
        dfs(targetId);
        return path;
      };

      // Test: When Economy-1 is researched and priority is Economy-4, path should only include Economy-2, Economy-3
      const pathSet = buildMissingPrereqPath("Economy-4");

      expect(pathSet.has("Economy-1")).toBe(false); // Already researched
      expect(pathSet.has("Economy-2")).toBe(true);
      expect(pathSet.has("Economy-3")).toBe(true);
      expect(pathSet.size).toBe(2);
    });

    it("should correctly compute frontier intersection with available techs", () => {
      const nodes = getTechNodes();
      const researched = new Set<string>(); // Nothing researched
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      const sameCat = (a: string, b: string) =>
        (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

      const buildMissingPrereqPath = (targetId: string): Set<string> => {
        const path = new Set<string>();
        const seen = new Set<string>();
        const dfs = (tid: string) => {
          if (seen.has(tid)) return;
          seen.add(tid);
          const node = byId.get(tid);
          if (!node) return;

          const reqAll = (node.requiresAllOf ?? []).filter((p) =>
            sameCat(p, tid),
          );
          const reqOne = (node.requiresOneOf ?? []).filter((p) =>
            sameCat(p, tid),
          );

          for (const r of reqAll) {
            if (!researched.has(r)) {
              path.add(r);
              dfs(r);
            }
          }

          if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
            const sorted = [...reqOne].sort(
              (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
            );
            const choice = sorted[0];
            if (choice && !researched.has(choice)) {
              path.add(choice);
              dfs(choice);
            }
          }
        };
        dfs(targetId);
        return path;
      };

      // Get available techs (those with all prerequisites met)
      const available = nodes.filter(
        (n) => !researched.has(n.id) && isTechAvailable(n.id, researched),
      );

      // Only level-1 techs should be available when nothing is researched
      const availableIds = available.map((n) => n.id);
      expect(availableIds).toContain("Economy-1");
      expect(availableIds).toContain("Land-1");
      expect(availableIds).toContain("Sea-1");
      expect(availableIds).toContain("Air-1");
      expect(availableIds).toContain("Nuclear-1");

      // Set priority to Economy-4
      const pathSet = buildMissingPrereqPath("Economy-4");

      // Frontier = intersection of pathSet and available
      const frontier = available.filter((n) => pathSet.has(n.id));

      // Only Economy-1 should be in the frontier (the only available prereq)
      expect(frontier.length).toBe(1);
      expect(frontier[0].id).toBe("Economy-1");
    });

    it("should prioritize frontier techs when priority target is not directly available", () => {
      const nodes = getTechNodes();
      const researched = new Set<string>();
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      const sameCat = (a: string, b: string) =>
        (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

      const buildMissingPrereqPath = (targetId: string): Set<string> => {
        const path = new Set<string>();
        const seen = new Set<string>();
        const dfs = (tid: string) => {
          if (seen.has(tid)) return;
          seen.add(tid);
          const node = byId.get(tid);
          if (!node) return;

          const reqAll = (node.requiresAllOf ?? []).filter((p) =>
            sameCat(p, tid),
          );
          const reqOne = (node.requiresOneOf ?? []).filter((p) =>
            sameCat(p, tid),
          );

          for (const r of reqAll) {
            if (!researched.has(r)) {
              path.add(r);
              dfs(r);
            }
          }

          if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
            const sorted = [...reqOne].sort(
              (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
            );
            const choice = sorted[0];
            if (choice && !researched.has(choice)) {
              path.add(choice);
              dfs(choice);
            }
          }
        };
        dfs(targetId);
        return path;
      };

      const priorityId = "Economy-4";
      const available = nodes.filter(
        (n) => !researched.has(n.id) && isTechAvailable(n.id, researched),
      );

      const priorityInSet = available.some((n) => n.id === priorityId);
      expect(priorityInSet).toBe(false); // Economy-4 should NOT be directly available

      // Simulate allocation logic
      const xTotal = 1000; // arbitrary total research points
      const alloc: Record<string, number> = {};

      if (priorityId && !priorityInSet) {
        const pathSet = buildMissingPrereqPath(priorityId);
        const frontier = available.filter((n) => pathSet.has(n.id));

        expect(frontier.length).toBeGreaterThan(0); // Should have frontier

        const half = 0.5 * xTotal;
        const shareFrontier = half / frontier.length;
        for (const n of frontier) {
          alloc[n.id] = (alloc[n.id] ?? 0) + shareFrontier;
        }

        const others = available.filter((n) => !pathSet.has(n.id));
        const remaining = xTotal - half;
        const shareOthers = others.length > 0 ? remaining / others.length : 0;
        for (const n of others) {
          alloc[n.id] = (alloc[n.id] ?? 0) + shareOthers;
        }
      }

      // Economy-1 should receive 50% of the total (500 points)
      expect(alloc["Economy-1"]).toBe(500);

      // Other level-1 techs should share the remaining 50%
      const otherTechs = ["Land-1", "Sea-1", "Air-1", "Nuclear-1"];
      const expectedShareOthers = 500 / otherTechs.length; // 125 each
      for (const techId of otherTechs) {
        expect(alloc[techId]).toBeCloseTo(expectedShareOthers, 5);
      }
    });
  });

  describe("priority tech progression", () => {
    it("should eventually progress frontier as prerequisite techs complete", () => {
      const nodes = getTechNodes();

      // Simulate: Economy-1 is now researched
      const researched = new Set<string>(["Economy-1"]);
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      const sameCat = (a: string, b: string) =>
        (byId.get(a)?.category ?? "") === (byId.get(b)?.category ?? "");

      const buildMissingPrereqPath = (targetId: string): Set<string> => {
        const path = new Set<string>();
        const seen = new Set<string>();
        const dfs = (tid: string) => {
          if (seen.has(tid)) return;
          seen.add(tid);
          const node = byId.get(tid);
          if (!node) return;

          const reqAll = (node.requiresAllOf ?? []).filter((p) =>
            sameCat(p, tid),
          );
          const reqOne = (node.requiresOneOf ?? []).filter((p) =>
            sameCat(p, tid),
          );

          for (const r of reqAll) {
            if (!researched.has(r)) {
              path.add(r);
              dfs(r);
            }
          }

          if (reqOne.length > 0 && !reqOne.some((p) => researched.has(p))) {
            const sorted = [...reqOne].sort(
              (a, b) => (byId.get(a)?.level ?? 0) - (byId.get(b)?.level ?? 0),
            );
            const choice = sorted[0];
            if (choice && !researched.has(choice)) {
              path.add(choice);
              dfs(choice);
            }
          }
        };
        dfs(targetId);
        return path;
      };

      const priorityId = "Economy-4";
      const available = nodes.filter(
        (n) => !researched.has(n.id) && isTechAvailable(n.id, researched),
      );

      // Now Economy-2 should be available (since Economy-1 is researched)
      expect(available.some((n) => n.id === "Economy-2")).toBe(true);

      // Path should now only include Economy-2 and Economy-3
      const pathSet = buildMissingPrereqPath(priorityId);
      expect(pathSet.has("Economy-1")).toBe(false); // Already researched
      expect(pathSet.has("Economy-2")).toBe(true);
      expect(pathSet.has("Economy-3")).toBe(true);

      // Frontier should be Economy-2 (the only currently available prereq)
      const frontier = available.filter((n) => pathSet.has(n.id));
      expect(frontier.length).toBe(1);
      expect(frontier[0].id).toBe("Economy-2");
    });
  });
});
