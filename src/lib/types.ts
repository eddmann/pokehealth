/** Raw daily health inputs */
export type DailyHealthState = {
  steps: number;
  sleepHours: number;
  activeCalories: number;
  workoutMinutes: number;
  useDebugValues: boolean;
};

/** Derived gameplay modifiers computed from health state */
export type ActiveModifiers = {
  bSpeedTier: "none" | "low" | "medium" | "high";
  healTier: "partial_60" | "partial_85" | "full_revive";
  xpMultiplier: number;
  moneyMultiplier: number;
  catchMultiplier: number;
};

/** A debug preset with a name and health values */
export type HealthPreset = {
  name: string;
  values: Omit<DailyHealthState, "useDebugValues">;
};

/** Emulator joypad button names */
export type JoypadButton =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "start"
  | "select";

/** Save slot metadata */
export type SaveSlot = {
  id: string;
  name: string;
  timestamp: number;
  thumbnail?: string;
};

// WRAM addresses are resolved at runtime from the ROM's .sym file.
// See src/lib/hooks.ts → parseSymFile() and src/lib/emulator.ts → loadSymbols().
