/**
 * Debug cheat panel for setting up test scenarios.
 *
 * Allows manipulating game state (party, bag, money) via WRAM writes
 * to quickly reach scenarios that test each PokéHealth hook.
 */

import { useState, useCallback } from "react";
import { emulator } from "../lib/emulator";
import {
  SCENARIO_LIST,
  readMoney,
  readPartyHP,
  readPartyPP,
  setMoney,
  setBag,
  setFastText,
  flyWarp,
  ITEMS,
  MAPS,
} from "../lib/cheats";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

function StatusReadout() {
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!emulator.isReady) {
      setInfo("Emulator not ready");
      return;
    }
    const money = readMoney();
    const lines: string[] = [`Money: ¥${money.toLocaleString()}`];

    for (let i = 0; i < 6; i++) {
      const { hp, maxHp } = readPartyHP(i);
      if (maxHp === 0) break;
      const pp = readPartyPP(i);
      lines.push(`  Mon ${i + 1}: HP ${hp}/${maxHp}  PP [${pp.join(", ")}]`);
    }
    setInfo(lines.join("\n"));
  }, []);

  return (
    <div className="space-y-2">
      <button
        onClick={refresh}
        className="w-full text-xs bg-slate-600 hover:bg-slate-500 text-slate-200 py-2 rounded-lg font-medium"
      >
        🔍 Read Game State
      </button>
      {info && (
        <pre className="text-xs text-emerald-300 bg-slate-900 rounded-lg p-3 font-mono whitespace-pre-wrap">
          {info}
        </pre>
      )}
    </div>
  );
}

function QuickActions() {
  const [flash, setFlash] = useState<string | null>(null);

  const doFlash = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2000);
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Quick Actions
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setMoney(99999); doFlash("¥99999"); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-yellow-800/50 hover:bg-yellow-700/50 text-yellow-300 transition-colors"
        >
          💰 Max Money
        </button>
        <button
          onClick={() => {
            setBag([
              [ITEMS.POKE_BALL, 99],
              [ITEMS.GREAT_BALL, 50],
              [ITEMS.ULTRA_BALL, 20],
              [ITEMS.POTION, 50],
              [ITEMS.SUPER_POTION, 30],
              [ITEMS.HYPER_POTION, 20],
              [ITEMS.FULL_RESTORE, 10],
            ]);
            doFlash("Bag stocked!");
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-800/50 hover:bg-blue-700/50 text-blue-300 transition-colors"
        >
          🎒 Stock Bag
        </button>
        <button
          onClick={() => { setFastText(); doFlash("Text speed: FAST"); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
        >
          ⚡ Fast Text
        </button>
      </div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3">
        Warp To
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { flyWarp(MAPS.VIRIDIAN_CITY); doFlash("→ Viridian City"); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-800/50 hover:bg-emerald-700/50 text-emerald-300 transition-colors"
        >
          🏙 Viridian City
        </button>
        <button
          onClick={() => { flyWarp(MAPS.PEWTER_CITY); doFlash("→ Pewter City"); }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-800/50 hover:bg-emerald-700/50 text-emerald-300 transition-colors"
        >
          🏔 Pewter City
        </button>
      </div>
      {flash && (
        <p className="text-xs text-emerald-400 font-medium">{flash}</p>
      )}
    </div>
  );
}

export default function CheatPanel({ isOpen, onClose }: Props) {
  const [applied, setApplied] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">🛠 Cheat Panel</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set up test scenarios via WRAM writes
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Warning */}
          <div className="bg-amber-900/30 border border-amber-700/50 rounded-lg p-3">
            <p className="text-xs text-amber-300">
              ⚠️ Apply cheats while in the <strong>overworld</strong> (not in
              battle or menus). Writing to WRAM during battle can corrupt state.
              After applying a scenario, save state so you can reload it.
            </p>
          </div>

          {/* Test Scenarios */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Test Scenarios
            </p>
            <p className="text-xs text-slate-500">
              Each scenario sets party, bag & money. Apply while standing in the overworld.
            </p>
            <div className="space-y-2">
              {SCENARIO_LIST.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    s.fn();
                    setApplied(s.id);
                    setTimeout(() => setApplied(null), 2500);
                  }}
                  className={`w-full text-left rounded-lg p-3 border transition-all ${
                    applied === s.id
                      ? "bg-emerald-900/40 border-emerald-500/50"
                      : "bg-slate-700/50 border-slate-600/50 hover:bg-slate-700 hover:border-slate-500/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      {s.name}
                    </span>
                    {applied === s.id && (
                      <span className="text-xs text-emerald-400 font-medium">
                        ✓ Warping…
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                  <p className="text-xs text-cyan-400/70 mt-0.5">
                    Hook: {s.hook}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Hook Testing Guide */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Testing Workflow
            </p>
            <div className="bg-slate-700/30 rounded-lg p-3 text-xs text-slate-400 space-y-2">
              <p>
                <span className="text-white font-medium">1.</span> Pick a scenario above — it sets your party, bag, money and
                <span className="text-cyan-400"> warps you</span> to the right location.
              </p>
              <p>
                <span className="text-white font-medium">2.</span> Close this panel, then
                <span className="text-emerald-400"> save state</span> (💾 → Quick Save).
              </p>
              <p>
                <span className="text-white font-medium">3.</span> Go to
                <span className="text-emerald-400"> Debug tab</span> → adjust the health slider for the hook you're testing.
              </p>
              <p>
                <span className="text-white font-medium">4.</span> Play through the scenario (fight/catch/heal).
                Quick-load and try different values.
              </p>
            </div>
            <div className="bg-slate-700/30 rounded-lg p-3 text-xs text-slate-400 space-y-1">
              <p className="text-white font-medium mb-1">Debug Slider → Hook Mapping</p>
              <p>🔥 <strong>Active Calories</strong> → XP multiplier (×0.75 – ×1.50)</p>
              <p>💪 <strong>Workout Minutes</strong> → Money + Catch multiplier</p>
              <p>😴 <strong>Sleep Hours</strong> → Heal tier (60% / 85% / Full+Revive)</p>
              <p>👟 <strong>Steps</strong> → B-button walk speed (OFF / Low / Med / High)</p>
            </div>
          </div>

          {/* Quick Actions */}
          <QuickActions />

          {/* State Readout */}
          <StatusReadout />
        </div>
      </div>
    </div>
  );
}
