import type { DailyHealthState, ActiveModifiers } from "./types";

export function computeBSpeedTier(steps: number): ActiveModifiers["bSpeedTier"] {
  if (steps >= 15_000) return "high";
  if (steps >= 10_000) return "medium";
  if (steps >= 3_000) return "low";
  return "none";
}

export function computeHealTier(sleepHours: number): ActiveModifiers["healTier"] {
  if (sleepHours >= 7) return "full_revive";
  if (sleepHours >= 5) return "partial_85";
  return "partial_60";
}

export function computeXpMultiplier(activeCalories: number): number {
  if (activeCalories >= 600) return 1.5;
  if (activeCalories >= 400) return 1.25;
  if (activeCalories >= 100) return 1.0;
  return 0.75;
}

export function computeMoneyMultiplier(workoutMinutes: number): number {
  if (workoutMinutes >= 60) return 1.5;
  if (workoutMinutes >= 30) return 1.25;
  if (workoutMinutes >= 1) return 1.0;
  return 0.75;
}

export function computeCatchMultiplier(workoutMinutes: number): number {
  if (workoutMinutes >= 60) return 1.35;
  if (workoutMinutes >= 30) return 1.2;
  if (workoutMinutes >= 1) return 1.0;
  return 0.9;
}

export function computeModifiers(state: DailyHealthState): ActiveModifiers {
  return {
    bSpeedTier: computeBSpeedTier(state.steps),
    healTier: computeHealTier(state.sleepHours),
    xpMultiplier: computeXpMultiplier(state.activeCalories),
    moneyMultiplier: computeMoneyMultiplier(state.workoutMinutes),
    catchMultiplier: computeCatchMultiplier(state.workoutMinutes),
  };
}

export function formatSpeedTier(tier: ActiveModifiers["bSpeedTier"]): string {
  return tier === "none" ? "OFF" : tier.toUpperCase();
}

export function formatHealTier(tier: ActiveModifiers["healTier"]): string {
  switch (tier) {
    case "partial_60":  return "60% HP";
    case "partial_85":  return "85% + PP";
    case "full_revive": return "Full + Revive";
  }
}

// Always 2 decimal places so columns align
export function formatMultiplier(mult: number): string {
  return `x${mult.toFixed(2)}`;
}
