import { useState, useEffect, useCallback } from "react";
import * as db from "../lib/db";
import type { SaveSlot } from "../lib/types";

type Props = {
  onSave: (name: string) => Promise<string | undefined>;
  onLoad: (slotId: string) => Promise<boolean>;
  onQuickSave: () => Promise<void>;
  onQuickLoad: () => Promise<boolean | undefined>;
  onNewGame: () => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
};

export default function SaveLoadPanel({
  onSave,
  onLoad,
  onQuickSave,
  onQuickLoad,
  onNewGame,
  isOpen,
  onClose,
}: Props) {
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [saveName, setSaveName] = useState("");
  const [message, setMessage] = useState("");

  const refreshSlots = useCallback(async () => {
    const saves = await db.listSaves();
    setSlots(saves);
  }, []);

  useEffect(() => {
    if (isOpen) refreshSlots();
  }, [isOpen, refreshSlots]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-slate-800 rounded-xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-lg font-bold text-white">Save / Load</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl"
          >
            ✕
          </button>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 p-4 border-b border-slate-700">
          <button
            onClick={async () => {
              await onQuickSave();
              flash("Quick saved!");
              refreshSlots();
            }}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 rounded-lg font-medium text-sm"
          >
            ⚡ Quick Save
          </button>
          <button
            onClick={async () => {
              const ok = await onQuickLoad();
              flash(ok ? "Loaded!" : "No quick save found");
            }}
            className="flex-1 bg-blue-700 hover:bg-blue-600 text-white py-2 rounded-lg font-medium text-sm"
          >
            ⚡ Quick Load
          </button>
        </div>

        {/* New Game */}
        <div className="px-4 py-3 border-b border-slate-700">
          <button
            onClick={async () => {
              if (!confirm("Start a new game? This will delete your autosave.")) return;
              await db.deleteSave("autosave");
              await onNewGame();
              flash("New game started");
              refreshSlots();
              onClose();
            }}
            className="w-full bg-slate-700/50 hover:bg-red-900/40 text-slate-400 hover:text-red-300 border border-slate-600 hover:border-red-700/50 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            🗑 New Game
          </button>
        </div>

        {/* New Save */}
        <div className="flex gap-2 p-4 border-b border-slate-700">
          <input
            type="text"
            placeholder="Save name..."
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            className="flex-1 bg-slate-900 text-white rounded-lg px-3 py-2 text-sm placeholder-slate-500 outline-none focus:ring-2 ring-emerald-500"
          />
          <button
            onClick={async () => {
              const name = saveName.trim() || `Save ${slots.length + 1}`;
              await onSave(name);
              setSaveName("");
              flash(`Saved: ${name}`);
              refreshSlots();
            }}
            className="bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            Save
          </button>
        </div>

        {/* Slot List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {slots.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-4">
              No saves yet
            </p>
          )}
          {slots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-3"
            >
              {slot.thumbnail && (
                <img
                  src={slot.thumbnail}
                  alt=""
                  className="w-12 h-11 rounded border border-slate-600 object-cover"
                  style={{ imageRendering: "pixelated" }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">
                  {slot.name}
                </p>
                <p className="text-slate-400 text-xs">
                  {new Date(slot.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={async () => {
                    const ok = await onLoad(slot.id);
                    flash(ok ? "Loaded!" : "Load failed");
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium"
                >
                  Load
                </button>
                <button
                  onClick={async () => {
                    await db.deleteSave(slot.id);
                    flash("Deleted");
                    refreshSlots();
                  }}
                  className="bg-red-800/50 hover:bg-red-700 text-red-300 px-2 py-1.5 rounded text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Message */}
        {message && (
          <div className="p-3 text-center text-emerald-400 text-sm font-medium bg-slate-900/50">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
