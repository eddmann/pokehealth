import { useState } from "react";
import { useHealth } from "../stores/healthStore";
import { PRESETS } from "../lib/presets";
import { emulator } from "../lib/emulator";
import { isNative } from "@pwa-kit/sdk";
import {
  formatSpeedTier,
  formatHealTier,
  formatMultiplier,
} from "../lib/health";

// ── Toggle ────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        on ? "bg-emerald-500" : "bg-slate-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
          on ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ── NumberInput ───────────────────────────────────────────────────
function NumberInput({
  label, value, onChange, min = 0, max = 99999, step = 1, unit = "",
}: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <div className="flex items-baseline gap-1">
          <input
            type="number" min={min} max={max} step={step} value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-20 bg-slate-900 text-white text-right text-sm rounded-lg px-2 py-1 outline-none focus:ring-2 ring-emerald-500 border border-slate-700"
          />
          {unit && <span className="text-xs text-slate-500 w-6">{unit}</span>}
        </div>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full accent-emerald-500 cursor-pointer"
      />
    </div>
  );
}

// ── StatRow (read-only health value) ─────────────────────────────
function StatRow({ icon, label, value, unit }: {
  icon: string; label: string; value: string; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400 flex items-center gap-2">
        <span className="w-5 text-center">{icon}</span>
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-white">
        {value}{unit && <span className="text-slate-500 font-normal ml-1">{unit}</span>}
      </span>
    </div>
  );
}

// ── ModifierRow ──────────────────────────────────────────────────
function ModifierRow({ icon, label, value, tone }: {
  icon: string; label: string; value: string;
  tone: "red" | "amber" | "green" | "neutral";
}) {
  const color = {
    red: "text-red-400", amber: "text-amber-400",
    green: "text-emerald-400", neutral: "text-slate-300",
  }[tone];

  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-sm text-slate-400 flex items-center gap-2">
        <span className="w-5 text-center">{icon}</span>
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────
export default function DebugScreen() {
  const { health, modifiers, setHealth, resetHealth, applyPreset } = useHealth();
  const [applyFlash, setApplyFlash] = useState(false);

  const debugMode = health.useDebugValues;
  const healthKitActive = !debugMode && isNative;
  const noSource = !debugMode && !isNative;

  function handleApply() {
    emulator.writeHealthModifiers(health, modifiers);
    setApplyFlash(true);
    setTimeout(() => setApplyFlash(false), 1500);
  }

  const speedTone =
    modifiers.bSpeedTier === "none" ? "red" as const :
    modifiers.bSpeedTier === "high" ? "green" as const : "amber" as const;

  const healTone =
    modifiers.healTier === "partial_60" ? "red" as const :
    modifiers.healTier === "full_revive" ? "green" as const : "amber" as const;

  const multTone = (m: number) =>
    m < 1 ? "red" as const : m > 1 ? "green" as const : "neutral" as const;

  return (
    <div className="max-w-md mx-auto px-4 py-6 space-y-4 pb-10">

      {/* Header */}
      <div className="pb-1">
        <h1 className="text-xl font-bold text-white tracking-tight">
          {healthKitActive ? "Today's Health" : "Debug Health"}
        </h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {healthKitActive
            ? "Yesterday's health data is driving your game modifiers."
            : "Set health values and push them to the game."}
        </p>
      </div>

      {/* Source toggle */}
      <div className="flex items-center justify-between bg-slate-800 rounded-2xl px-4 py-3.5 border border-slate-700/50">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-white">
            {debugMode ? "Debug Mode" : "HealthKit"}
          </p>
          <p className="text-xs text-slate-500">
            {healthKitActive
              ? "Using yesterday's HealthKit data"
              : noSource
                ? "HealthKit requires the native iOS app"
                : "Overriding with manual values"}
          </p>
        </div>
        <Toggle on={debugMode} onChange={(v) => setHealth({ useDebugValues: v })} />
      </div>

      {/* ── HealthKit mode: show live values read-only ── */}
      {healthKitActive && (
        <>
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Yesterday's Data
            </p>
            <StatRow icon="👟" label="Steps"    value={health.steps.toLocaleString()} />
            <StatRow icon="😴" label="Sleep"    value={health.sleepHours.toFixed(1)} unit="hrs" />
            <StatRow icon="🔥" label="Calories" value={health.activeCalories.toLocaleString()} unit="cal" />
            <StatRow icon="💪" label="Workout"  value={health.workoutMinutes.toString()} unit="min" />
          </div>

          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Active Modifiers
            </p>
            <ModifierRow icon="🏃" label="B-Held Speed"  value={formatSpeedTier(modifiers.bSpeedTier)}       tone={speedTone} />
            <ModifierRow icon="🏥" label="Heal Behavior" value={formatHealTier(modifiers.healTier)}           tone={healTone} />
            <ModifierRow icon="⚔️" label="XP Rate"       value={formatMultiplier(modifiers.xpMultiplier)}    tone={multTone(modifiers.xpMultiplier)} />
            <ModifierRow icon="💰" label="Money Rate"    value={formatMultiplier(modifiers.moneyMultiplier)} tone={multTone(modifiers.moneyMultiplier)} />
            <ModifierRow icon="🎯" label="Catch Rate"    value={formatMultiplier(modifiers.catchMultiplier)} tone={multTone(modifiers.catchMultiplier)} />
          </div>
        </>
      )}

      {/* ── No source (browser, not native) ── */}
      {noSource && (
        <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700/50 text-center space-y-2">
          <p className="text-3xl">📱</p>
          <p className="text-sm text-slate-300 font-medium">
            Install the iOS app to use HealthKit
          </p>
          <p className="text-xs text-slate-500">
            Or enable Debug Mode above to set values manually.
          </p>
        </div>
      )}

      {/* ── Debug mode: full controls ── */}
      {debugMode && (
        <>
          {/* Presets */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => applyPreset(p.values)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-700 hover:bg-slate-600 active:bg-slate-500 text-slate-200 transition-colors"
                >
                  {p.name}
                </button>
              ))}
              <button
                onClick={resetHealth}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-transparent border border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Inputs */}
          <div className="bg-slate-800 rounded-2xl p-4 space-y-5 border border-slate-700/50">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Health Inputs</p>
            <NumberInput label="Steps"           value={health.steps}           onChange={(v) => setHealth({ steps: v })}           max={50000} step={500} />
            <NumberInput label="Sleep"           value={health.sleepHours}      onChange={(v) => setHealth({ sleepHours: v })}      max={14}    step={0.5} unit="hrs" />
            <NumberInput label="Active Calories" value={health.activeCalories}  onChange={(v) => setHealth({ activeCalories: v })} max={2000}  step={25}  unit="cal" />
            <NumberInput label="Workout"         value={health.workoutMinutes}  onChange={(v) => setHealth({ workoutMinutes: v })} max={180}   step={5}   unit="min" />
          </div>

          {/* Apply */}
          <button
            onClick={handleApply}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-150 ${
              applyFlash
                ? "bg-emerald-400 text-white scale-[0.98]"
                : "bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white shadow-lg shadow-emerald-900/30"
            }`}
          >
            {applyFlash ? "✓  Applied to game" : "Apply To Game Now"}
          </button>

          {/* Modifiers */}
          <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700/50 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Active Modifiers
            </p>
            <ModifierRow icon="🏃" label="B-Held Speed"  value={formatSpeedTier(modifiers.bSpeedTier)}       tone={speedTone} />
            <ModifierRow icon="🏥" label="Heal Behavior" value={formatHealTier(modifiers.healTier)}           tone={healTone} />
            <ModifierRow icon="⚔️" label="XP Rate"       value={formatMultiplier(modifiers.xpMultiplier)}    tone={multTone(modifiers.xpMultiplier)} />
            <ModifierRow icon="💰" label="Money Rate"    value={formatMultiplier(modifiers.moneyMultiplier)} tone={multTone(modifiers.moneyMultiplier)} />
            <ModifierRow icon="🎯" label="Catch Rate"    value={formatMultiplier(modifiers.catchMultiplier)} tone={multTone(modifiers.catchMultiplier)} />
          </div>
        </>
      )}

    </div>
  );
}
