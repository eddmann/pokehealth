/**
 * binjgb WebAssembly emulator wrapper.
 *
 * The WASM module (public/wasm/binjgb.js + binjgb.wasm) is built from
 * emulator/binjgb via scripts/build-emu.sh.
 *
 * Real binjgb API (from src/emscripten/wrapper.c + exported.json):
 *
 *   Lifecycle
 *     _emulator_new_simple(romPtr, romSize, audioFreq, audioFrames, cgbCurve) → emuPtr
 *     _emulator_delete(emuPtr)
 *     _emulator_run_until_f64(emuPtr, ticks)                → EmulatorEvent
 *     _emulator_get_ticks_f64(emuPtr)                       → f64
 *
 *   Video
 *     _get_frame_buffer_ptr(emuPtr)                         → ptr  (RGBA u32 × 160×144)
 *     _get_frame_buffer_size(emuPtr)                        → size
 *
 *   Joypad  (individual button setters — no combined call)
 *     _set_joyp_up/down/left/right/A/B/start/select(emuPtr, bool)
 *     _emulator_set_default_joypad_callback(emuPtr, joypadBufPtr)
 *     _joypad_new() → joypadBufPtr
 *
 *   Audio
 *     _get_audio_buffer_ptr(emuPtr)                         → ptr  (f32 stereo)
 *     _get_audio_buffer_size(emuPtr)                        → current fill (bytes)
 *     _get_audio_buffer_capacity(emuPtr)                    → max capacity (bytes)
 *
 *   Memory
 *     _emulator_read_mem(emuPtr, u16 addr)                  → u8
 *     _emulator_write_mem(emuPtr, u16 addr, u8 val)
 *     _emulator_get_wram_ptr(emuPtr)                        → ptr
 *     _emulator_get_hram_ptr(emuPtr)                        → ptr
 *
 *   Save state  (uses FileData heap objects)
 *     _state_file_data_new(emuPtr)                          → fileDataPtr
 *     _ext_ram_file_data_new(emuPtr)                        → fileDataPtr
 *     _emulator_read_state(emuPtr, fileDataPtr)             → Result
 *     _emulator_write_state(emuPtr, fileDataPtr)            → Result
 *     _emulator_read_ext_ram(emuPtr, fileDataPtr)           → Result
 *     _emulator_write_ext_ram(emuPtr, fileDataPtr)          → Result
 *     _get_file_data_ptr(fileDataPtr)                       → ptr
 *     _get_file_data_size(fileDataPtr)                      → size
 *     _file_data_delete(fileDataPtr)
 */

import type { JoypadButton, ActiveModifiers, DailyHealthState } from "./types";
import { parseSymFile, validateSymbols, handleHook } from "./hooks";

export const GB_WIDTH = 160;
export const GB_HEIGHT = 144;
const TICKS_PER_SECOND = 4_194_304;
const CGB_COLOR_CURVE_NONE = 0;

type BinjgbModule = {
  // Lifecycle
  _emulator_new_simple(
    romPtr: number, romSize: number,
    audioFreq: number, audioFrames: number,
    cgbColorCurve: number
  ): number;
  _emulator_delete(ptr: number): void;
  _emulator_run_until_f64(ptr: number, ticks: number): number;
  _emulator_get_ticks_f64(ptr: number): number;

  // Video
  _get_frame_buffer_ptr(ptr: number): number;
  _get_frame_buffer_size(ptr: number): number;

  // Joypad
  _joypad_new(): number;
  _joypad_delete(joypadPtr: number): void;
  _emulator_set_default_joypad_callback(ptr: number, joypadPtr: number): void;
  _set_joyp_up(ptr: number, val: number): void;
  _set_joyp_down(ptr: number, val: number): void;
  _set_joyp_left(ptr: number, val: number): void;
  _set_joyp_right(ptr: number, val: number): void;
  _set_joyp_A(ptr: number, val: number): void;
  _set_joyp_B(ptr: number, val: number): void;
  _set_joyp_start(ptr: number, val: number): void;
  _set_joyp_select(ptr: number, val: number): void;

  // Audio
  _get_audio_buffer_ptr(ptr: number): number;
  _get_audio_buffer_size(ptr: number): number;
  _get_audio_buffer_capacity(ptr: number): number;

  // Memory
  _emulator_read_mem(ptr: number, addr: number): number;
  _emulator_write_mem(ptr: number, addr: number, val: number): void;
  _emulator_get_wram_ptr(ptr: number): number;
  _emulator_get_hram_ptr(ptr: number): number;

  // Save state / SRAM
  _state_file_data_new(ptr: number): number;
  _ext_ram_file_data_new(ptr: number): number;
  _emulator_read_state(ptr: number, fileDataPtr: number): number;
  _emulator_write_state(ptr: number, fileDataPtr: number): number;
  _emulator_read_ext_ram(ptr: number, fileDataPtr: number): number;
  _emulator_write_ext_ram(ptr: number, fileDataPtr: number): number;
  _get_file_data_ptr(fileDataPtr: number): number;
  _get_file_data_size(fileDataPtr: number): number;
  _file_data_delete(fileDataPtr: number): void;
  _emulator_was_ext_ram_updated(ptr: number): number;

  _malloc(size: number): number;
  _free(ptr: number): void;

  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
};

export class Emulator {
  private mod: BinjgbModule | null = null;
  private emuPtr = 0;
  private joypadPtr = 0;
  private romPtr = 0; // must stay alive — binjgb stores a pointer, not a copy
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrame = 0;
  private running = false;

  // Symbol table + health state
  private symbols: Record<string, number> = {};
  private symLoaded = false;
  private currentHealth: DailyHealthState | null = null;
  private currentModifiers: ActiveModifiers | null = null;

  // ── Init ─────────────────────────────────────────────────────────

  async init(): Promise<void> {
    if (this.mod) return;
    try {
      // binjgb.js is loaded via <script src="/wasm/binjgb.js"> in index.html
      // and registers itself as window.Binjgb (EXPORT_NAME="Binjgb" in CMakeLists).
      const factory = (window as unknown as { Binjgb?: () => Promise<BinjgbModule> }).Binjgb;
      if (!factory) throw new Error("window.Binjgb not found — binjgb.js not loaded");
      this.mod = await factory();
      console.log("binjgb WASM loaded");
    } catch (e) {
      console.warn("binjgb not found, running in stub mode:", e);
      this.mod = createStub();
    }
  }

  async loadRom(romData: Uint8Array, canvas: HTMLCanvasElement): Promise<void> {
    if (!this.mod) await this.init();
    const mod = this.mod!;

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    canvas.width = GB_WIDTH;
    canvas.height = GB_HEIGHT;

    // Round up to 32KB boundary and zero-fill (matches reference implementation)
    const romSize = (romData.length + 0x7fff) & ~0x7fff;
    this.romPtr = mod._malloc(romSize);
    const romBuf = new Uint8Array(mod.HEAPU8.buffer, this.romPtr, romSize);
    romBuf.fill(0);
    romBuf.set(romData);

    this.emuPtr = mod._emulator_new_simple(
      this.romPtr, romSize, 44100, 2048, CGB_COLOR_CURVE_NONE
    );
    // DO NOT free romPtr — binjgb stores a pointer to it, not a copy.
    // It's freed in destroy().

    if (!this.emuPtr) throw new Error("emulator_new_simple returned null");

    // Wire up joypad
    this.joypadPtr = mod._joypad_new();
    mod._emulator_set_default_joypad_callback(this.emuPtr, this.joypadPtr);

    // emulator initialized — timing is set by start()
  }

  /** Re-attach a new canvas element (e.g. after React remount) */
  setCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    canvas.width = GB_WIDTH;
    canvas.height = GB_HEIGHT;
  }

  // ── Symbols ───────────────────────────────────────────────────────

  loadSymbols(symText: string): void {
    this.symbols = parseSymFile(symText);
    this.symLoaded = validateSymbols(this.symbols);
    if (this.symLoaded) {
      console.log(`PokéHealth: ${Object.keys(this.symbols).length} symbols loaded — hooks active`);
    } else {
      console.warn("PokéHealth: symbol validation failed — hooks disabled");
    }
  }

  // ── Health modifiers ──────────────────────────────────────────────

  writeHealthModifiers(state: DailyHealthState, modifiers: ActiveModifiers): void {
    if (!this.mod || !this.emuPtr) return;
    this.currentHealth = state;
    this.currentModifiers = modifiers;
    if (!this.symLoaded) return;

    const w = (name: string, val: number) => {
      const addr = this.symbols[name];
      if (addr !== undefined) this.mod!._emulator_write_mem(this.emuPtr, addr, val & 0xff);
    };

    // When debug values are off AND we're not in the native app (no HealthKit),
    // disable all PokéHealth effects. When HealthKit is active, the values in
    // the store come from useHealthKit and should be written normally.
    if (!state.useDebugValues) {
      // Check if we're running inside the PWAKit native wrapper
      const native = typeof window !== "undefined" &&
        (typeof (window as any).webkit?.messageHandlers?.pwakit?.postMessage === "function" ||
         navigator.userAgent.includes("PWAKit"));
      if (!native) {
        w("wHealthInitialized", 0);
        return;
      }
    }

    const speedMap = { none: 0, low: 1, medium: 2, high: 3 } as const;
    const healMap  = { partial_60: 0, partial_85: 1, full_revive: 2 } as const;

    w("wHealthBSpeedTier", speedMap[modifiers.bSpeedTier]);
    w("wHealthHealTier",   healMap[modifiers.healTier]);
    w("wHealthXPMult",     Math.round(modifiers.xpMultiplier    * 100));
    w("wHealthMoneyMult",  Math.round(modifiers.moneyMultiplier * 100));
    w("wHealthCatchMult",  Math.round(modifiers.catchMultiplier * 100));

    // Big-endian pairs so the in-game HEALTH menu PrintNumber calls work directly
    const steps = Math.min(state.steps, 65535);
    w("wHealthStepsHi",    (steps >> 8) & 0xff);
    w("wHealthStepsLo",     steps & 0xff);
    w("wHealthSleepX10",   Math.round(Math.min(state.sleepHours, 25.5) * 10));
    const cal = Math.min(state.activeCalories, 65535);
    w("wHealthCaloriesHi", (cal >> 8) & 0xff);
    w("wHealthCaloriesLo",  cal & 0xff);
    w("wHealthWorkoutMin", Math.min(state.workoutMinutes, 255));

    // Set last — the ROM guards every hook on this byte, so values are fully
    // written before the ROM is allowed to read them.
    w("wHealthInitialized", 1);
  }

  // ── Emulation loop ────────────────────────────────────────────────

  start(): void {
    if (this.running || !this.emuPtr) return;
    this.running = true;
    this.lastRafSec = 0;
    this.leftoverTicks = 0;
    this.animFrame = requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    if (this.animFrame) { cancelAnimationFrame(this.animFrame); this.animFrame = 0; }
  }

  // ── Joypad ────────────────────────────────────────────────────────

  setButton(button: JoypadButton, pressed: boolean): void {
    if (!this.mod || !this.emuPtr) return;
    const v = pressed ? 1 : 0;
    const m = this.mod;
    const p = this.emuPtr;
    switch (button) {
      case "up":     m._set_joyp_up(p, v);     break;
      case "down":   m._set_joyp_down(p, v);   break;
      case "left":   m._set_joyp_left(p, v);   break;
      case "right":  m._set_joyp_right(p, v);  break;
      case "a":      m._set_joyp_A(p, v);      break;
      case "b":      m._set_joyp_B(p, v);      break;
      case "start":  m._set_joyp_start(p, v);  break;
      case "select": m._set_joyp_select(p, v); break;
    }
  }

  // ── Memory ───────────────────────────────────────────────────────

  readMem(addr: number): number {
    if (!this.mod || !this.emuPtr) return 0;
    return this.mod._emulator_read_mem(this.emuPtr, addr);
  }

  writeMem(addr: number, value: number): void {
    if (!this.mod || !this.emuPtr) return;
    this.mod._emulator_write_mem(this.emuPtr, addr, value);
  }

  // ── Save state ────────────────────────────────────────────────────
  // Matches the proven pattern from pokemon-pwa's BinjgbEmulatorCore:
  //   - typed-array VIEW directly into WASM heap via makeWasmBuffer
  //   - .slice() for save, .set() for load
  //   - exact size validation on load
  //   - FileData always freed in finally block

  private withFileData<T>(
    fdPtr: number,
    fn: (fdPtr: number, buffer: Uint8Array) => T
  ): T {
    const ptr  = this.mod!._get_file_data_ptr(fdPtr);
    const size = this.mod!._get_file_data_size(fdPtr);
    const buffer = new Uint8Array(this.mod!.HEAPU8.buffer, ptr, size);
    try {
      return fn(fdPtr, buffer);
    } finally {
      this.mod!._file_data_delete(fdPtr);
    }
  }

  saveState(): ArrayBuffer | null {
    if (!this.mod || !this.emuPtr) return null;
    return this.withFileData(
      this.mod._state_file_data_new(this.emuPtr),
      (fd, buffer) => {
        this.mod!._emulator_write_state(this.emuPtr, fd);
        return buffer.slice().buffer;
      }
    );
  }

  loadStateFromBuffer(data: ArrayBuffer): boolean {
    if (!this.mod || !this.emuPtr) return false;
    const state = new Uint8Array(data);
    try {
      this.withFileData(
        this.mod._state_file_data_new(this.emuPtr),
        (fd, buffer) => {
          if (buffer.byteLength !== state.byteLength) {
            throw new Error(`State size mismatch: expected ${buffer.byteLength}, got ${state.byteLength}`);
          }
          buffer.set(state);
          this.mod!._emulator_read_state(this.emuPtr, fd);
        }
      );
      this.lastRafSec = 0;
      this.leftoverTicks = 0;
      return true;
    } catch (e) {
      console.warn("loadState failed:", e);
      return false;
    }
  }

  // ── SRAM (ext RAM / battery save) ─────────────────────────────────

  getSRAM(): ArrayBuffer | null {
    if (!this.mod || !this.emuPtr) return null;
    if (!this.mod._emulator_was_ext_ram_updated(this.emuPtr)) return null;
    return this.withFileData(
      this.mod._ext_ram_file_data_new(this.emuPtr),
      (fd, buffer) => {
        this.mod!._emulator_write_ext_ram(this.emuPtr, fd);
        return buffer.slice().buffer as ArrayBuffer;
      }
    );
  }

  loadSRAM(data: ArrayBuffer): boolean {
    if (!this.mod || !this.emuPtr) return false;
    const sram = new Uint8Array(data);
    try {
      this.withFileData(
        this.mod._ext_ram_file_data_new(this.emuPtr),
        (fd, buffer) => {
          if (buffer.byteLength !== sram.byteLength) {
            throw new Error(`SRAM size mismatch: expected ${buffer.byteLength}, got ${sram.byteLength}`);
          }
          buffer.set(sram);
          this.mod!._emulator_read_ext_ram(this.emuPtr, fd);
        }
      );
      return true;
    } catch (e) {
      console.warn("loadSRAM failed:", e);
      return false;
    }
  }

  // ── Misc ──────────────────────────────────────────────────────────
  // ── Misc ──────────────────────────────────────────────────────────

  captureThumbnail(): string | undefined {
    try { return this.canvas?.toDataURL("image/png"); }
    catch { return undefined; }
  }

  get isReady(): boolean { return this.mod !== null && this.emuPtr !== 0; }
  get isRunning(): boolean { return this.running; }

  destroy(): void {
    this.stop();
    if (this.mod) {
      if (this.joypadPtr) { this.mod._joypad_delete(this.joypadPtr); this.joypadPtr = 0; }
      if (this.emuPtr) { this.mod._emulator_delete(this.emuPtr); this.emuPtr = 0; }
      if (this.romPtr) { this.mod._free(this.romPtr); this.romPtr = 0; }
    }
  }

  // ── Private: main loop ────────────────────────────────────────────

  // binjgb event flags returned by _emulator_run_until_f64
  static readonly EVENT_NEW_FRAME = 1;
  static readonly EVENT_AUDIO_BUFFER_FULL = 2;
  static readonly EVENT_UNTIL_TICKS = 4;
  static readonly EVENT_BREAKPOINT = 8;

  private lastRafSec = 0;
  private leftoverTicks = 0;

  private loop = (rafMs: number): void => {
    if (!this.running || !this.mod || !this.emuPtr) return;

    const rafSec = rafMs / 1000;
    const deltaSec = Math.max(rafSec - (this.lastRafSec || rafSec), 0);
    // Cap to 5/60s (~83ms) to avoid massive catch-up after tab-switch / save
    const deltaTicks = Math.min(deltaSec, 5 / 60) * TICKS_PER_SECOND;
    const targetTicks = this.ticks + deltaTicks - this.leftoverTicks;

    this.runUntil(targetTicks);
    this.leftoverTicks = Math.max(0, (this.ticks - targetTicks) | 0);
    this.lastRafSec = rafSec;

    this.syncHealthToWRAM();
    this.pollHooks();
    this.renderFrame();

    this.animFrame = requestAnimationFrame(this.loop);
  };

  private get ticks(): number {
    return this.mod!._emulator_get_ticks_f64(this.emuPtr);
  }

  /** Run emulator until target ticks, handling audio-full and breakpoint events */
  private runUntil(ticks: number): void {
    const mod = this.mod!;
    while (true) {
      const event = mod._emulator_run_until_f64(this.emuPtr, ticks);

      if (event & Emulator.EVENT_NEW_FRAME) {
        // frame buffer updated — we render after the loop
      }

      if (event & Emulator.EVENT_BREAKPOINT) {
        this.pollHooks();
      }

      if (event & Emulator.EVENT_AUDIO_BUFFER_FULL) {
        // Audio buffer full — binjgb stopped early. Re-run to keep advancing.
        continue;
      }

      if (event & Emulator.EVENT_UNTIL_TICKS) {
        break; // Reached target ticks
      }
    }
  }

  private renderFrame(): void {
    if (!this.mod || !this.emuPtr || !this.ctx || !this.canvas) return;
    const mod = this.mod;
    const fbPtr  = mod._get_frame_buffer_ptr(this.emuPtr);
    const fbSize = GB_WIDTH * GB_HEIGHT * 4; // RGBA
    if (!fbPtr) return;
    const pixels = new Uint8ClampedArray(mod.HEAPU8.buffer, fbPtr, fbSize);
    this.ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), GB_WIDTH, GB_HEIGHT), 0, 0);
  }

  // ── Private: health WRAM sync ─────────────────────────────────────

  /** Re-apply health values if the ROM's Init zeroed them (happens on boot) */
  private syncHealthToWRAM(): void {
    if (!this.currentHealth || !this.currentModifiers || !this.symLoaded) return;
    const initAddr = this.symbols["wHealthInitialized"];
    if (initAddr === undefined) return;
    // Re-write if the ROM zeroed the flag (e.g. during Init's WRAM clear)
    if (this.readMem(initAddr) === 0) {
      this.writeHealthModifiers(this.currentHealth, this.currentModifiers);
    }
  }

  // ── Private: hook polling ─────────────────────────────────────────

  private pollHooks(): void {
    if (!this.symLoaded || !this.currentModifiers) return;
    const hookAddr = this.symbols["wHealthHookRequest"];
    if (hookAddr === undefined) return;
    const hookId = this.readMem(hookAddr);
    if (hookId === 0) return;
    handleHook(
      hookId, this.symbols,
      (addr) => this.readMem(addr),
      (addr, val) => this.writeMem(addr, val),
      this.currentModifiers
    );
  }
}

// ── Stub for UI development without binjgb ────────────────────────
function createStub(): BinjgbModule {
  const mem = new ArrayBuffer(32 * 1024 * 1024);
  const heapU8  = new Uint8Array(mem);
  const heapF32 = new Float32Array(mem);
  const heap32  = new Int32Array(mem);
  const wram = new Uint8Array(0x10000);
  let nextPtr = 8192;

  // Paint a DMG-green test pattern into the framebuffer area
  const fbOff = 128 * 1024;
  for (let y = 0; y < GB_HEIGHT; y++) {
    for (let x = 0; x < GB_WIDTH; x++) {
      const i = fbOff + (y * GB_WIDTH + x) * 4;
      const t = (x + y) & 7;
      heapU8[i]     = t < 4 ? 15 : 52;   // R
      heapU8[i + 1] = t < 4 ? 56 : 104;  // G
      heapU8[i + 2] = t < 4 ? 15 : 15;   // B
      heapU8[i + 3] = 255;
    }
  }

  // Dummy FileData layout: [u8* data (4 bytes), size_t size (4 bytes)]
  const fdOff = 256 * 1024;
  const stateOff = 512 * 1024;
  const STATE_SIZE = 65536;
  // Write data pointer and size into FileData struct
  heap32[fdOff / 4]     = stateOff;
  heap32[fdOff / 4 + 1] = STATE_SIZE;

  return {
    _emulator_new_simple: () => 1,
    _emulator_delete: () => {},
    _emulator_run_until_f64: () => 0,
    _emulator_get_ticks_f64: () => 0,
    _get_frame_buffer_ptr: () => fbOff,
    _get_frame_buffer_size: () => GB_WIDTH * GB_HEIGHT * 4,
    _joypad_new: () => 2,
    _joypad_delete: () => {},
    _emulator_set_default_joypad_callback: () => {},
    _set_joyp_up: () => {}, _set_joyp_down: () => {}, _set_joyp_left: () => {},
    _set_joyp_right: () => {}, _set_joyp_A: () => {}, _set_joyp_B: () => {},
    _set_joyp_start: () => {}, _set_joyp_select: () => {},
    _get_audio_buffer_ptr: () => 0,
    _get_audio_buffer_size: () => 0,
    _get_audio_buffer_capacity: () => 0,
    _emulator_read_mem: (_p, addr) => wram[addr] ?? 0,
    _emulator_write_mem: (_p, addr, val) => { wram[addr] = val; },
    _emulator_get_wram_ptr: () => 0,
    _emulator_get_hram_ptr: () => 0,
    _state_file_data_new: () => fdOff,
    _ext_ram_file_data_new: () => fdOff,
    _emulator_read_state: () => 1,
    _emulator_write_state: () => 1,
    _emulator_read_ext_ram: () => 1,
    _emulator_write_ext_ram: () => 1,
    _get_file_data_ptr: () => stateOff,
    _get_file_data_size: () => STATE_SIZE,
    _file_data_delete: () => {},
    _emulator_was_ext_ram_updated: () => 0,
    _malloc: (size) => { const p = nextPtr; nextPtr += size + 7 & ~7; return p; },
    _free: () => {},
    HEAPU8: heapU8,
    HEAPF32: heapF32,
    HEAP32: heap32,
  };
}

export const emulator = new Emulator();
