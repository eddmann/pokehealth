#!/usr/bin/env bash
# Build the PokéHealth-patched Pokémon Red ROM.
#
# Outputs:
#   public/roms/pokered.gb   — patched ROM
#   public/roms/pokered.sym  — symbol table (for JS hook addresses)
#
# Requirements:
#   rgbds (rgbasm, rgblink, rgbfix, rgbgfx) — brew install rgbds
#   The pokered git submodule must be initialised:
#     git submodule update --init rom/pokered
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POKERED_SRC="$ROOT/rom/pokered"
PATCHES_DIR="$ROOT/rom/patches"
BUILD_DIR="$ROOT/rom/build"
OUT_DIR="$ROOT/public/roms"

# ── Toolchain check ──────────────────────────────────────────────────
for tool in rgbasm rgblink rgbfix rgbgfx; do
  if ! command -v "$tool" &>/dev/null; then
    echo "✗ $tool not found.  brew install rgbds"
    exit 1
  fi
done

# ── Submodule check ──────────────────────────────────────────────────
if [ ! -f "$POKERED_SRC/Makefile" ]; then
  echo "✗ rom/pokered not found."
  echo "  Run: git submodule update --init rom/pokered"
  exit 1
fi

# ── Apply patches to a clean working copy ───────────────────────────
bash "$PATCHES_DIR/apply.sh" "$POKERED_SRC" "$BUILD_DIR"

# ── Build the ROM via pokered's Makefile ─────────────────────────────
echo "▸ Building ROM (this takes ~30 s on first run)..."
cd "$BUILD_DIR"

# Build native tools (pkmncompress, gfx) if needed
make tools -j"$(nproc 2>/dev/null || sysctl -n hw.logicalcpu)" 2>&1 | grep -v "^make\[" || true

# Build the Red ROM only
NPROCS="$(nproc 2>/dev/null || sysctl -n hw.logicalcpu)"
make pokered.gbc -j"$NPROCS" 2>&1 \
  | grep -v "^make\[" \
  | grep -v "Nothing to be done" \
  || true

if [ ! -f pokered.gbc ]; then
  echo "✗ Build failed — pokered.gbc not produced"
  exit 1
fi

# ── Copy outputs ─────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
cp pokered.gbc "$OUT_DIR/pokered.gb"

# rgblink writes the .sym next to the .gbc by default
if [ -f pokered.sym ]; then
  cp pokered.sym "$OUT_DIR/pokered.sym"
  echo "  SYM : $OUT_DIR/pokered.sym"
else
  echo "  WARN: pokered.sym not produced — hooks will use symbol-less fallback"
fi

SIZE=$(wc -c < pokered.gbc | tr -d ' ')
echo ""
echo "✅  ROM build complete"
echo "    ROM : $OUT_DIR/pokered.gb  ($SIZE bytes)"
