import { Player } from "../game/Game";

// Central tech IDs for research tree items that have gameplay effects.
// Keep IDs aligned with ResearchTreeModal generation (e.g., "Land-1").
export const RESEARCH_TECH_IDS = {
  WWII_LESSONS: "Land-1",
  POST_WAR_RECONSTRUCTION: "Economy-1",
} as const;

export interface TechMeta {
  name: string;
  description?: string;
}

// Central metadata registry for tech names and descriptions.
// UI should consult this map for display, instead of hardcoding strings.
export const TECH_METADATA: Readonly<Record<string, TechMeta>> = Object.freeze({
  [RESEARCH_TECH_IDS.WWII_LESSONS]: {
    name: "WWII Lessons Learned",
    description:
      "Doctrine refined by hard-won experience improves defensive readiness, logistics, and counter-attack planning. Effects: While defending, your troop losses are reduced by 10% and the attacker's troop losses are increased by 10%.",
  },
  [RESEARCH_TECH_IDS.POST_WAR_RECONSTRUCTION]: {
    name: "Post-War Reconstruction",
    description:
      "Revitalize infrastructure and industry by mobilizing civilian labor and resources to rebuild the national economy. Effects: Unlocks Roads investment and enables construction/expansion of your road network.",
  },
});

export interface DefenseCasualtyModifiers {
  // Multiplier to apply to the attacker's troop loss when the defender is a player
  attackerLossMul: number;
  // Multiplier to apply to the defender's troop loss when the defender is a player
  defenderLossMul: number;
}

/**
 * Compute casualty multipliers when a player is defending, based on researched techs.
 * - attackerLossMul > 1 increases enemy losses
 * - defenderLossMul < 1 reduces own losses
 */
export function defenseCasualtyModifiers(
  defender: Player,
): DefenseCasualtyModifiers {
  let attackerLossMul = 1.0;
  let defenderLossMul = 1.0;

  // WWII Lessons Learned: When defending, reduce own casualties by 10% and
  // increase enemy casualties by 10%.
  if (defender.hasResearchedTech?.(RESEARCH_TECH_IDS.WWII_LESSONS)) {
    attackerLossMul *= 1.1; // enemy (attacker) takes more losses
    defenderLossMul *= 0.9; // defender takes fewer losses
  }

  return { attackerLossMul, defenderLossMul };
}

/**
 * Compute casualty multipliers when a player is attacking, based on researched techs.
 * Returned multipliers stack multiplicatively with defender-side modifiers.
 * - attackerLossMul < 1 reduces own losses
 * - defenderLossMul > 1 increases enemy losses
 * Currently no attacker-side techs are defined; this is ready for future use.
 */
export function attackCasualtyModifiers(
  attacker: Player,
): DefenseCasualtyModifiers {
  const attackerLossMul = 1.0;
  const defenderLossMul = 1.0;

  // Placeholder for future attack-side techs that affect casualties.
  // Example (future): if (attacker.hasResearchedTech(RESEARCH_TECH_IDS.MODERN_TACTICS)) {
  //   attackerLossMul *= 0.95;
  //   defenderLossMul *= 1.05;
  // }

  return { attackerLossMul, defenderLossMul };
}
