# Architecture

PokéHealth is a mashup of three systems: a patched Game Boy ROM, a WASM emulator, and a React PWA. This document covers how they fit together.

## ROM patching

The [pret/pokered](https://github.com/pret/pokered) disassembly is included as a git submodule and never modified directly. A shell script (`scripts/build-rom.sh`) copies the source to a build directory, applies patches via Python text replacement, then runs `make` with the standard rgbds toolchain.

The patches are intentionally minimal:

- **16 bytes of WRAM** are reserved for health modifier values and a hook protocol byte. The JS host writes these; the ROM reads them.
- **A speed tier check** is inserted into the overworld movement loop. When the player holds B while walking, the ROM reads `wHealthBSpeedTier` and calls `AdvancePlayerSprite` extra times — 1, 3, or 7 additional calls for 2×, 4×, or 8× movement speed.
- **Four hook traps** are inserted at the XP award, trainer payout, catch calculation, and Pokémon Center heal routines. Each trap writes a hook ID to `wHealthHookRequest` and spin-waits until the JS host clears it.
- **The intro sequence is skipped** — `PlayIntro` is removed and `PrepareTitleScreen` is replaced with `QuickStartNewGame`, which initialises the game state and drops the player directly into Red's room.
- **A HEALTH menu item** is added to the START menu, displaying raw health values and active modifier tiers.

All modifier math — XP scaling, BCD money conversion, catch rate multiplication, HP capping, PP halving — is done in TypeScript, not assembly. The ROM's job is limited to signalling when an event occurs and reading the result.

## The hook protocol

When the ROM reaches one of the four patched routines, it writes a non-zero hook ID to a known WRAM address and enters a tight spin-wait loop:

```asm
ld a, 1              ; HOOK_XP
ld [wHealthHookRequest], a
.wait
ld a, [wHealthHookRequest]
and a
jr nz, .wait         ; spin until JS clears it
```

After each emulated frame, the JS event loop checks this byte. If non-zero, the corresponding TypeScript handler runs — reading values from WRAM/HRAM, performing the calculation, writing results back, and clearing the hook byte. The ROM's spin-wait exits on the next frame and continues with the modified values.

This adds exactly one frame of latency to discrete game events (healing, catching, earning XP/money), which is imperceptible.

## In-game health messages

After each hook completes, the ROM displays a contextual message explaining the health modifier that was applied. JS writes a message ID (1–12) to `wHealthMsgId` in WRAM, and the ROM's `ShowHealthMsg` routine looks up the corresponding text from a jump table and displays it via `PrintText`.

Each event has three messages — penalty, normal, and bonus — and every message names the health input (sleep, calories, workout) so the player understands why the effect occurred. For example, after a Pokémon Center heal with poor sleep: *"Poor sleep last night… Partial heal only!"*

The heal message is deferred until after the healing animation completes, so it appears naturally after the nurse says *"Your Pokémon are fighting fit!"*. XP messages are shown only once per battle to avoid spam when multiple party members gain experience.

## Emulator integration

[binjgb](https://github.com/binji/binjgb) is compiled to WebAssembly via Emscripten and loaded as a `<script>` tag. The emulator wrapper (`src/lib/emulator.ts`) manages:

- **The frame loop** — delta-time based with a `while(true)` event dispatch that handles `EVENT_AUDIO_BUFFER_FULL` by retrying, preventing the freeze that occurs when the audio buffer fills and `run_until` returns early.
- **Health WRAM sync** — every frame, checks if `wHealthInitialized` was zeroed (e.g. by the ROM's Init routine clearing all of WRAM on boot) and re-writes all modifier values if so.
- **Save states** — uses binjgb's FileData API with typed-array views directly into the WASM heap. The ROM pointer is kept alive for the emulator's lifetime because binjgb stores a reference, not a copy.
- **Tab-switch resilience** — the emulator singleton survives React component unmount/remount. When the user switches from Debug back to Game, the canvas is re-attached and the loop resumes without reloading the ROM.

## HealthKit integration

Health data comes from Apple HealthKit via [pwa-kit](https://github.com/eddmann/pwa-kit), which bridges the native iOS HealthKit API to the PWA over a message-passing protocol.

The app polls HealthKit every 5 minutes. All data is from **yesterday**, not today — so your activity from the previous day is what shapes today's gameplay:

- **Steps, active calories, workout minutes** — queried over yesterday's full 24-hour window (midnight to midnight).
- **Sleep** — queried over a shifted window: 6pm two days ago → noon yesterday. This captures the typical overnight sleep period regardless of when the user fell asleep.

When running outside a native pwa-kit shell (e.g. during development in a desktop browser), HealthKit is unavailable. The Debug tab lets you manually set health values and apply them to the running game.

Health state is persisted to IndexedDB so it survives page reloads and service worker updates.

## Save system

All persistence uses IndexedDB via the `idb` library, across four object stores:

- **`saves`** — emulator save state blobs (full snapshot of CPU, memory, PPU, etc.), keyed by slot ID.
- **`save-meta`** — metadata for each save slot (name, timestamp, optional canvas thumbnail).
- **`sram`** — the Game Boy's battery-backed RAM (the in-game SAVE file), persisted after every emulated frame that writes to SRAM.
- **`health`** — the current `DailyHealthState`, so health data survives reloads.

The save UI offers autosave (saved on tab-switch/close), Quick Save/Load (single slot, one tap), and named save slots. Starting a New Game wipes the autosave and SRAM but preserves named slots.

## Cheats / debug tools

A debug cheat system (`src/lib/cheats.ts`) manipulates game WRAM directly through the emulator's `readMem`/`writeMem` interface. This lets you set up test scenarios without playing through the early game:

- Give yourself any Pokémon (species, level, moves, stats)
- Set money, badges, inventory items
- Warp to specific maps
- Set player name

All addresses come from the pokered `.sym` file. The cheat panel (`src/components/CheatPanel.tsx`) exposes these as a UI during development.

## PWA shell

The app is a standard React + Vite + Tailwind stack with `vite-plugin-pwa` for service worker generation and offline caching. The ROM, WASM binary, and all app assets are precached on first load.

On first launch the game boots directly into Red's room. On subsequent launches the autosave is restored. Touch controls provide a D-pad, A, B, Start, and Select buttons, laid out for mobile play.
