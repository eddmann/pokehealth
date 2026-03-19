import { useRef, useEffect, useCallback, useState } from "react";
import { emulator } from "../lib/emulator";
import { useHealth } from "../stores/healthStore";
import * as db from "../lib/db";

export function useEmulator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [romLoaded, setRomLoaded] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { health, modifiers } = useHealth();

  // Push health modifiers to emulator WRAM whenever they change
  useEffect(() => {
    if (romLoaded) {
      emulator.writeHealthModifiers(health, modifiers);
    }
  }, [health, modifiers, romLoaded]);

  /** Load a ROM (.gb) plus its companion .sym file, then start the emulator */
  const loadRom = useCallback(async (source: File | string) => {
    try {
      setError(null);
      await emulator.init();

      let romData: Uint8Array;
      let symText: string | null = null;

      if (typeof source === "string") {
        // Fetch ROM
        const resp = await fetch(source);
        if (!resp.ok) throw new Error(`ROM fetch failed: ${resp.status}`);
        romData = new Uint8Array(await resp.arrayBuffer());

        // Try to fetch the companion .sym file (same path, .sym extension)
        const symUrl = source.replace(/\.[^.]+(\?.*)?$/, ".sym");
        try {
          const symResp = await fetch(symUrl);
          if (symResp.ok) symText = await symResp.text();
        } catch {
          console.info("No .sym file found at", symUrl);
        }
      } else {
        // File input — user selected the ROM; look for a .sym sidecar in the
        // same directory if the browser File API exposes the path (it won't in
        // practice), so we just proceed without symbols when loading via file.
        romData = new Uint8Array(await source.arrayBuffer());
      }

      if (!canvasRef.current) throw new Error("Canvas not mounted");

      await emulator.loadRom(romData, canvasRef.current);

      if (symText) {
        emulator.loadSymbols(symText);
      }

      // Restore SRAM (in-game battery save)
      const sram = await db.loadSRAM();
      if (sram) {
        const ok = emulator.loadSRAM(sram);
        console.log(ok ? `SRAM restored (${sram.byteLength}b)` : "SRAM restore failed");
      }

      // Auto-load autosave state if one exists — drops straight into the game,
      // skipping the intro entirely. If no autosave the patched ROM boots
      // directly to Red's room.
      const autoState = await db.loadState("autosave");
      if (autoState) {
        const ok = emulator.loadStateFromBuffer(autoState);
        console.log(ok ? "Autosave restored" : "Autosave load failed — starting fresh");
      }

      // Write health modifiers AFTER state restore so they aren't overwritten
      // by the autosave's stale WRAM values.
      emulator.writeHealthModifiers(health, modifiers);

      setRomLoaded(true);
      emulator.start();
      setRunning(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load ROM";
      setError(msg);
      console.error("loadRom error:", e);
    }
  }, [health, modifiers]);

  const start = useCallback(() => {
    if (!romLoaded) return;
    emulator.start();
    setRunning(true);
  }, [romLoaded]);

  /** Resume after tab switch — re-attach canvas and restart if needed */
  const resume = useCallback((canvas: HTMLCanvasElement) => {
    emulator.setCanvas(canvas);
    if (!emulator.isRunning) emulator.start();
    setRomLoaded(true);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    emulator.stop();
    setRunning(false);
  }, []);

  const saveToSlot = useCallback(async (name: string) => {
    if (!emulator.isReady) return undefined;
    const state = emulator.saveState();
    if (!state) return undefined;
    const thumb = emulator.captureThumbnail();
    const id = `slot_${Date.now()}`;
    await db.saveState(id, name, state, thumb);
    const sram = emulator.getSRAM();
    if (sram) await db.saveSRAM(sram);
    return id;
  }, []);

  const quickSave = useCallback(async () => {
    if (!emulator.isReady) return;
    const state = emulator.saveState();
    if (!state) return;
    await db.saveState("autosave", "Autosave", state, emulator.captureThumbnail());
    const sram = emulator.getSRAM();
    if (sram) await db.saveSRAM(sram);
  }, []);

  const loadFromSlot = useCallback(async (slotId: string) => {
    if (!emulator.isReady) return false;
    const state = await db.loadState(slotId);
    if (!state) return false;
    const ok = emulator.loadStateFromBuffer(state);
    // Re-apply health modifiers after state load
    if (ok) emulator.writeHealthModifiers(health, modifiers);
    return ok;
  }, [health, modifiers]);

  const quickLoad = useCallback(async () => {
    return loadFromSlot("autosave");
  }, [loadFromSlot]);

  // Don't stop the emulator on unmount — it keeps running in the background
  // so health modifier writes from the Debug tab take effect immediately.

  return {
    canvasRef, romLoaded, running, error,
    loadRom, start, stop, resume,
    saveToSlot, quickSave, loadFromSlot, quickLoad,
  };
}
