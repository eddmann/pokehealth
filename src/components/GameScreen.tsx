import { useState, useEffect } from "react";
import { useEmulator } from "../hooks/useEmulator";
import TouchControls from "./TouchControls";
import SaveLoadPanel from "./SaveLoadPanel";
import CheatPanel from "./CheatPanel";
import { emulator } from "../lib/emulator";
import { useHealth } from "../stores/healthStore";
import { formatSpeedTier, formatMultiplier } from "../lib/health";
import type { JoypadButton } from "../lib/types";

const KEY_MAP: Record<string, JoypadButton> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  z: "a",
  x: "b",
  Enter: "start",
  Shift: "select",
};

export default function GameScreen() {
  const {
    canvasRef, romLoaded, running, error,
    loadRom, start, stop, resume,
    saveToSlot, quickSave, loadFromSlot, quickLoad,
  } = useEmulator();

  const { modifiers } = useHealth();
  const [showSaveLoad, setShowSaveLoad] = useState(false);
  const [showModifiers, setShowModifiers] = useState(false);
  const [showCheats, setShowCheats] = useState(false);

  // Auto-load ROM on mount — skip reload if emulator is already initialized
  useEffect(() => {
    if (!emulator.isReady) {
      loadRom(`/roms/pokered.gb?v=${Date.now()}`);
    } else if (canvasRef.current) {
      // Emulator already initialized (user navigated away and back).
      // Re-attach the new canvas and resume.
      resume(canvasRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard controls
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const btn = KEY_MAP[e.key];
      if (btn) {
        e.preventDefault();
        emulator.setButton(btn, true);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const btn = KEY_MAP[e.key];
      if (btn) {
        e.preventDefault();
        emulator.setButton(btn, false);
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);


  return (
    <div className="flex flex-col items-center gap-3 h-full">
      {/* Top bar */}
      <div className="w-full max-w-md flex items-center justify-between px-4 pt-2">
        <h1 className="text-sm font-bold text-emerald-400 tracking-wider">
          POKéHEALTH
        </h1>
        <div className="flex gap-2">
          {romLoaded && (
            <>
              <button
                onClick={() => setShowModifiers(!showModifiers)}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
              >
                HP
              </button>
              <button
                onClick={() => setShowCheats(true)}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
              >
                🛠
              </button>
              <button
                onClick={() => setShowSaveLoad(true)}
                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
              >
                💾
              </button>
            </>
          )}
        </div>
      </div>

      {/* Active modifiers strip */}
      {showModifiers && romLoaded && (
        <div className="w-full max-w-md px-4">
          <div className="bg-slate-800 rounded-lg p-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>
              🏃 B:{" "}
              <span className="text-white">
                {formatSpeedTier(modifiers.bSpeedTier)}
              </span>
            </span>
            <span>
              ⚔️ XP:{" "}
              <span className="text-white">
                {formatMultiplier(modifiers.xpMultiplier)}
              </span>
            </span>
            <span>
              💰 $:{" "}
              <span className="text-white">
                {formatMultiplier(modifiers.moneyMultiplier)}
              </span>
            </span>
            <span>
              🎯 Catch:{" "}
              <span className="text-white">
                {formatMultiplier(modifiers.catchMultiplier)}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Emulator canvas */}
      <div className="w-full max-w-md px-4 flex-shrink-0">
        <div className="relative bg-black rounded-xl overflow-hidden border-2 border-slate-700 aspect-[10/9]">
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />

          {/* Loading / error overlay */}
          {!romLoaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 gap-3">
              {error ? (
                <>
                  <p className="text-red-400 text-sm font-medium">Failed to load ROM</p>
                  <p className="text-slate-500 text-xs text-center px-4">{error}</p>
                  <button
                    onClick={() => loadRom("/roms/pokered.gb")}
                    className="mt-2 text-xs text-slate-400 underline"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500 text-xs">Loading…</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Play controls */}
      {romLoaded && (
        <div className="flex gap-2">
          {!running ? (
            <button
              onClick={start}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-bold text-sm"
            >
              ▶ Play
            </button>
          ) : (
            <button
              onClick={stop}
              className="bg-amber-700 hover:bg-amber-600 text-white px-6 py-2 rounded-lg font-bold text-sm"
            >
              ⏸ Pause
            </button>
          )}
        </div>
      )}

      {/* Touch controls */}
      {romLoaded && running && <TouchControls />}

      {/* Cheat panel */}
      <CheatPanel
        isOpen={showCheats}
        onClose={() => setShowCheats(false)}
      />

      {/* Save/Load panel */}
      <SaveLoadPanel
        isOpen={showSaveLoad}
        onClose={() => setShowSaveLoad(false)}
        onSave={saveToSlot}
        onLoad={loadFromSlot}
        onQuickSave={quickSave}
        onQuickLoad={quickLoad}
        onNewGame={async () => {
          emulator.destroy();
          await loadRom("/roms/pokered.gb");
        }}
      />
    </div>
  );
}
