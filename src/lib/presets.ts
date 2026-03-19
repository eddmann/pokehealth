import type { HealthPreset } from "./types";

export const PRESETS: HealthPreset[] = [
  {
    name: "Bad Day",
    values: {
      steps: 1_200,
      sleepHours: 4.5,
      activeCalories: 60,
      workoutMinutes: 0,
    },
  },
  {
    name: "Average Day",
    values: {
      steps: 6_000,
      sleepHours: 6.5,
      activeCalories: 250,
      workoutMinutes: 15,
    },
  },
  {
    name: "Strong Day",
    values: {
      steps: 12_000,
      sleepHours: 8.0,
      activeCalories: 550,
      workoutMinutes: 45,
    },
  },
  {
    name: "Walker",
    values: {
      steps: 18_000,
      sleepHours: 7.0,
      activeCalories: 350,
      workoutMinutes: 10,
    },
  },
  {
    name: "Gym Day",
    values: {
      steps: 5_000,
      sleepHours: 7.5,
      activeCalories: 650,
      workoutMinutes: 75,
    },
  },
];

export const DEFAULT_HEALTH = PRESETS[1].values; // Average Day
