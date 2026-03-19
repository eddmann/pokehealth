#!/usr/bin/env bash
# Build binjgb to WebAssembly.
#
# Outputs:
#   public/wasm/binjgb.js    — Emscripten JS glue (MODULARIZE=1, export name "Binjgb")
#   public/wasm/binjgb.wasm  — WASM binary
#
# Requirements:
#   Emscripten (emsdk) — https://emscripten.org/docs/getting_started/downloads.html
#   The binjgb git submodule must be initialised:
#     git submodule update --init emulator/binjgb
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BINJGB_SRC="$ROOT/emulator/binjgb"
BUILD_DIR="$ROOT/emulator/build"
OUT_DIR="$ROOT/public/wasm"

# ── Locate emsdk ──────────────────────────────────────────────────────
# Try common locations; can also be overridden with EMSDK env var.
EMSDK_SEARCH=(
  "$HOME/emsdk"
  "/opt/emsdk"
  "/usr/local/emsdk"
)
if [ -z "${EMSDK:-}" ]; then
  for candidate in "${EMSDK_SEARCH[@]}"; do
    if [ -f "$candidate/emsdk_env.sh" ]; then
      EMSDK="$candidate"
      break
    fi
  done
fi

if [ -z "${EMSDK:-}" ]; then
  echo "✗ emsdk not found."
  echo "  Install from https://emscripten.org/docs/getting_started/downloads.html"
  echo "  or set EMSDK=/path/to/emsdk before running this script."
  exit 1
fi

# Activate emsdk environment
# shellcheck source=/dev/null
source "$EMSDK/emsdk_env.sh" >/dev/null 2>&1

if ! command -v emcc &>/dev/null; then
  echo "✗ emcc not on PATH after sourcing emsdk_env.sh"
  exit 1
fi
echo "▸ emcc: $(emcc --version | head -1)"

# ── Submodule check ──────────────────────────────────────────────────
if [ ! -f "$BINJGB_SRC/CMakeLists.txt" ]; then
  echo "✗ emulator/binjgb submodule not initialised."
  echo "  Run: git submodule update --init emulator/binjgb"
  exit 1
fi

# ── Patch CMakeLists.txt ──────────────────────────────────────────────
# binjgb doesn't export HEAPU8/HEAPF32/HEAP32 by default. We need direct
# heap access for WRAM reads/writes and save state typed-array views.
echo "▸ Patching CMakeLists.txt (EXPORTED_RUNTIME_METHODS)"
CMAKELISTS="$BINJGB_SRC/CMakeLists.txt"
if ! grep -q 'EXPORTED_RUNTIME_METHODS' "$CMAKELISTS"; then
  sed -i.bak 's|-s EXPORTED_FUNCTIONS=|-s EXPORTED_RUNTIME_METHODS=["HEAPU8","HEAPF32","HEAP32"]\n    -s EXPORTED_FUNCTIONS=|' "$CMAKELISTS"
  rm -f "$CMAKELISTS.bak"
  echo "  ✓ Patch applied"
else
  echo "  ✓ Already patched"
fi

# ── Configure + build ────────────────────────────────────────────────
echo "▸ Configuring binjgb WASM build in $BUILD_DIR"
mkdir -p "$BUILD_DIR"

emcmake cmake \
  -S "$BINJGB_SRC" \
  -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DWASM=1 \
  2>&1 | grep -v "^--" | grep -v "^$" || true

echo "▸ Building binjgb (this takes ~60 s on first run)..."
cmake --build "$BUILD_DIR" \
  --target binjgb \
  --parallel "$(sysctl -n hw.logicalcpu 2>/dev/null || nproc)" \
  2>&1

if [ ! -f "$BUILD_DIR/binjgb.js" ] || [ ! -f "$BUILD_DIR/binjgb.wasm" ]; then
  echo "✗ Build failed — binjgb.js or binjgb.wasm not produced"
  ls "$BUILD_DIR"/*.js "$BUILD_DIR"/*.wasm 2>/dev/null || true
  exit 1
fi

# ── Copy outputs ─────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
cp "$BUILD_DIR/binjgb.js"   "$OUT_DIR/binjgb.js"
cp "$BUILD_DIR/binjgb.wasm" "$OUT_DIR/binjgb.wasm"

JS_SIZE=$(wc -c < "$BUILD_DIR/binjgb.js"   | tr -d ' ')
WA_SIZE=$(wc -c < "$BUILD_DIR/binjgb.wasm" | tr -d ' ')

echo ""
echo "✅  binjgb WASM build complete"
echo "    JS   : $OUT_DIR/binjgb.js   ($JS_SIZE bytes)"
echo "    WASM : $OUT_DIR/binjgb.wasm ($WA_SIZE bytes)"
