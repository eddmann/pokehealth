# PokéHealth

![PokéHealth](docs/heading.png)

A mobile-first PWA that runs a modified Pokémon Red inside the browser — where your real-world health data changes how the game plays.

Walk more today and your character moves faster. Sleep well and Pokémon Centers fully heal your team. Hit the gym and you earn more money, catch Pokémon more easily, and gain XP faster. Skip all of that and the game quietly pushes back.

The game reads daily health metrics from Apple HealthKit via [pwa-kit](https://github.com/eddmann/pwa-kit), maps them to gameplay modifiers, and injects those modifiers directly into a running Game Boy emulator. No server. No account. Everything runs locally in the browser.

---

## How it works

PokéHealth sits at the intersection of three systems:

1. **A patched Pokémon Red ROM** built from the [pret/pokered](https://github.com/pret/pokered) disassembly
2. **The binjgb Game Boy emulator** compiled to WebAssembly and running in the browser
3. **A React PWA** that ties everything together — touch controls, save states, health data, and the modifier pipeline

The health data flows through a simple pipeline:

```
HealthKit → DailyHealthState → ActiveModifiers → Emulator WRAM → ROM gameplay hooks
```

### Health inputs

| Input | Source |
|---|---|
| Steps | HealthKit (daily total) |
| Sleep hours | HealthKit (last night) |
| Active calories | HealthKit (daily total) |
| Workout minutes | HealthKit (daily total) |

A debug page lets you override these values manually for testing and development.

### Gameplay modifiers

Each health input maps to a gameplay modifier through simple tier tables:

**Steps → B-held movement speed**

| Steps | Effect |
|---|---|
| < 3,000 | B does nothing (vanilla walking) |
| 3,000 – 9,999 | Holding B = 2× speed |
| 10,000 – 14,999 | Holding B = 4× speed |
| 15,000+ | Holding B = 8× speed |

**Sleep → Pokémon Center healing**

| Sleep | Effect |
|---|---|
| < 5h | Heal to 60% HP, no PP restore |
| 5 – 6.9h | Heal to 85% HP, PP restored |
| 7h+ | Full heal, PP restored, +1 Revive |

**Active calories → XP multiplier**

| Calories | XP |
|---|---|
| < 100 | ×0.75 |
| 100 – 399 | ×1.00 |
| 400 – 599 | ×1.25 |
| 600+ | ×1.50 |

**Workout minutes → Money + catch rate**

| Minutes | Money | Catch |
|---|---|---|
| 0 | ×0.75 | ×0.90 |
| 1 – 29 | ×1.00 | ×1.00 |
| 30 – 59 | ×1.25 | ×1.20 |
| 60+ | ×1.50 | ×1.35 |

The player can inspect all active modifiers from the in-game START menu under **HEALTH**.

---

## Technical approach

### ROM patching

The pokered disassembly is included as a git submodule and never modified directly. A shell script (`scripts/build-rom.sh`) copies the source to a build directory, applies patches via Python text replacement, then runs `make` with the standard rgbds toolchain.

The patches are intentionally minimal:

- **16 bytes of WRAM** are reserved for health modifier values and a hook protocol byte. The JS host writes these; the ROM reads them.
- **A speed tier check** is inserted into the overworld movement loop. When the player holds B while walking, the ROM reads `wHealthBSpeedTier` and calls `AdvancePlayerSprite` extra times — 1, 3, or 7 additional calls for 2×, 4×, or 8× movement speed.
- **Four hook traps** are inserted at the XP award, trainer payout, catch calculation, and Pokémon Center heal routines. Each trap writes a hook ID to `wHealthHookRequest` and spin-waits until the JS host clears it.
- **The intro sequence is skipped** — `PlayIntro` is removed and `PrepareTitleScreen` is replaced with `QuickStartNewGame`, which initialises the game state and drops the player directly into Red's room.
- **A HEALTH menu item** is added to the START menu, displaying raw health values and active modifier tiers.

All modifier math — XP scaling, BCD money conversion, catch rate multiplication, HP capping, PP halving — is done in TypeScript, not assembly. The ROM's job is limited to signalling when an event occurs and reading the result.

### The hook protocol

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

### Emulator integration

[binjgb](https://github.com/binji/binjgb) is compiled to WebAssembly via Emscripten and loaded as a `<script>` tag. The emulator wrapper (`src/lib/emulator.ts`) manages:

- **The frame loop** — delta-time based with a `while(true)` event dispatch that handles `EVENT_AUDIO_BUFFER_FULL` by retrying, preventing the freeze that occurs when the audio buffer fills and `run_until` returns early.
- **Health WRAM sync** — every frame, checks if `wHealthInitialized` was zeroed (e.g. by the ROM's Init routine clearing all of WRAM on boot) and re-writes all modifier values if so.
- **Save states** — uses binjgb's FileData API with typed-array views directly into the WASM heap. The ROM pointer is kept alive for the emulator's lifetime because binjgb stores a reference, not a copy.
- **Tab-switch resilience** — the emulator singleton survives React component unmount/remount. When the user switches from Debug back to Game, the canvas is re-attached and the loop resumes without reloading the ROM.

### PWA shell

The app is a standard React + Vite + Tailwind stack with `vite-plugin-pwa` for service worker generation and offline caching. The ROM, WASM binary, and all app assets are precached on first load. IndexedDB stores save states, SRAM (battery saves), and health data — all of which persist across service worker updates.

On first launch the game boots directly into Red's room. On subsequent launches the autosave is restored. The user can Quick Save/Load, create named save slots, or start a New Game from the save panel.

---

## Setup

### Prerequisites

- [Bun](https://bun.sh) — runtime and package manager
- [rgbds](https://rgbds.gbdev.io) — Game Boy assembler/linker (`brew install rgbds` on macOS)
- [Emscripten](https://emscripten.org/docs/getting_started/downloads.html) — WASM compiler (emsdk)

> **Note:** Emscripten must be on your `PATH`. If you installed via emsdk, run `source <emsdk-dir>/emsdk_env.sh` first (or add it to your shell profile).

### Getting started

```bash
# 1. Clone with submodules (pokered + binjgb)
git clone --recursive <repo-url>
cd pokehealth2

# 2. Install JS dependencies
bun install

# 3. Build the binjgb WASM emulator (~60s first time, ~2s incremental)
bun run emu:build

# 4. Build the patched Pokémon Red ROM (~30s first time, ~5s incremental)
bun run rom:build

# 5. Start the dev server
bun run dev
```

Open `http://localhost:5173`. The game auto-boots into Red's room. Use the Debug tab to set health values and Apply them to the running game. Open the in-game START → HEALTH menu to verify.

> **Already cloned without `--recursive`?** Run `git submodule update --init --recursive` to fetch the submodules.

### Deploy

```bash
bun run build
# Deploy the dist/ directory to any static host (Cloudflare Pages, Vercel, etc.)
```

---

## Project structure

```
pokehealth/
├── rom/
│   ├── pokered/              # git submodule (pret/pokered, unmodified)
│   └── patches/
│       ├── apply.sh          # Copies pokered → applies all patches → make builds the ROM
│       └── health_menu.asm   # In-game HEALTH screen (assembly, included in bank 4)
├── emulator/
│   └── binjgb/               # git submodule (binji/binjgb, one CMake flag added)
├── scripts/
│   ├── build-rom.sh          # Patch + build ROM → public/roms/pokered.{gb,sym}
│   └── build-emu.sh          # Build binjgb WASM → public/wasm/binjgb.{js,wasm}
├── src/
│   ├── lib/
│   │   ├── emulator.ts       # binjgb wrapper: frame loop, save/load, WRAM sync, hooks
│   │   ├── hooks.ts          # Hook handlers: XP, money, catch, heal (all math in TS)
│   │   ├── health.ts         # Tier computation from raw health values
│   │   ├── db.ts             # IndexedDB persistence
│   │   └── presets.ts        # Debug presets (Bad Day, Average Day, etc.)
│   ├── stores/
│   │   └── healthStore.tsx   # React context for health state + derived modifiers
│   ├── hooks/
│   │   └── useEmulator.ts    # React hook: ROM loading, auto-save, tab-switch resume
│   └── components/
│       ├── GameScreen.tsx     # Canvas + touch controls + save panel
│       ├── DebugScreen.tsx    # Health inputs, presets, Apply button, modifier display
│       ├── TouchControls.tsx  # D-pad, A, B, Start, Select
│       ├── SaveLoadPanel.tsx  # Quick Save/Load, named slots, New Game
│       └── Nav.tsx            # Bottom tab bar
```
