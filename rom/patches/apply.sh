#!/usr/bin/env bash
# apply.sh — Apply PokéHealth ROM patches to a fresh copy of pokered.
#
# Usage: ./apply.sh <pokered-source-dir> <build-dir>
#
# Architecture:
#   - ROM patches handle only what must live in the ROM:
#       1. WRAM allocation for health vars + hook protocol
#       2. B-held speed tier (must run inside the movement loop)
#       3. Health menu screen (must be an in-game UI)
#   - Everything else (XP, money, catch, heal math) uses a trap-hook:
#       - ROM writes a hook ID to wHealthHookRequest then spin-waits
#       - JS detects the non-zero byte after the frame, does all math in TS,
#         writes results directly to WRAM/HRAM, then clears wHealthHookRequest
#       - ROM exits the spin-wait and continues with the modified values
#
set -euo pipefail

SRC="${1:?Usage: apply.sh <pokered-source-dir> <build-dir>}"
BUILD="${2:?Usage: apply.sh <pokered-source-dir> <build-dir>}"
PATCHES_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▸ Copying pokered → $BUILD"
rm -rf "$BUILD"
cp -a "$SRC" "$BUILD"
rm -rf "$BUILD/.git"

# ─────────────────────────────────────────────────────────────────────
# 1. WRAM — health variables + hook protocol bytes
# ─────────────────────────────────────────────────────────────────────
echo "▸ [1/5] WRAM: health variables + hook protocol"
cat >> "$BUILD/ram/wram.asm" << 'ASM'

SECTION "PokeHealth WRAM", WRAM0
; Written by the JS host; read by ROM gameplay code.
; All initialised to 0 by JS before applying values.
wHealthInitialized:: db  ; JS sets to 1 after writing health values
wHealthBSpeedTier::  db  ; 0=none 1=low 2=medium 3=high
wHealthHealTier::    db  ; 0=partial_60 1=partial_85 2=full_revive
wHealthXPMult::      db  ; x100 (75 100 125 150)
wHealthMoneyMult::   db  ; x100 (75 100 125 150)
wHealthCatchMult::   db  ; x100 (90 100 120 135)
; Raw display values — big-endian pairs so PrintNumber works directly.
wHealthStepsHi::     db  ; (steps >> 8) & 0xFF   ← MSB first
wHealthStepsLo::     db  ; steps & 0xFF
wHealthSleepX10::    db  ; sleepHours * 10  (e.g. 72 = 7.2h)
wHealthCaloriesHi::  db  ; (activeCalories >> 8) & 0xFF  ← MSB first
wHealthCaloriesLo::  db
wHealthWorkoutMin::  db  ; workoutMinutes (capped at 255)
; Hook protocol: ROM writes non-zero then spin-waits; JS clears it to resume.
wHealthHookRequest:: db  ; 1=xp 2=money 3=catch 4=heal
; Scratch for HEALTH menu display (safe during menu — hooks not active)
wHealthMenuScratch:: ds 2
ASM

# ─────────────────────────────────────────────────────────────────────
# 2. B-held speed tier — overworld movement
# ─────────────────────────────────────────────────────────────────────
echo "▸ [2/5] Overworld: B-held speed tier"

python3 - "$BUILD/home/overworld.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = """\tld a, [wWalkBikeSurfState]
\tdec a ; riding a bike?
\tjr nz, .normalPlayerSpriteAdvancement
\tld a, [wMovementFlags]
\tbit BIT_LEDGE_OR_FISHING, a
\tjr nz, .normalPlayerSpriteAdvancement
\tcall DoBikeSpeedup
.normalPlayerSpriteAdvancement
\tcall AdvancePlayerSprite"""

new = """\tld a, [wWalkBikeSurfState]
\tdec a ; riding a bike?
\tjr nz, .checkHealthSpeed
\tld a, [wMovementFlags]
\tbit BIT_LEDGE_OR_FISHING, a
\tjr nz, .normalPlayerSpriteAdvancement
\tcall DoBikeSpeedup
\tjr .normalPlayerSpriteAdvancement

; PokéHealth: B-held speed tiers while walking.
; Calls AdvancePlayerSprite extra times = 2^tier - 1 (tier 1→+1, 2→+3, 3→+7).
.checkHealthSpeed
\tld a, [wWalkBikeSurfState] ; 0=walking, 2=surfing
\tand a
\tjr nz, .normalPlayerSpriteAdvancement ; surfing: skip
\tld a, [wHealthInitialized]
\tand a
\tjr z, .normalPlayerSpriteAdvancement ; not initialised: skip
\tldh a, [hJoyHeld]
\tand PAD_B
\tjr z, .normalPlayerSpriteAdvancement ; B not held: skip
\tld a, [wHealthBSpeedTier]
\tand a
\tjr z, .normalPlayerSpriteAdvancement ; tier 0 = OFF
; compute extra = 2^tier - 1  (1, 3, or 7)
\tld b, a
\tld c, 1
.healthSpeedShift
\tsla c
\tdec b
\tjr nz, .healthSpeedShift
\tdec c ; c = extra advance count
.healthSpeedExtra
\tpush bc
\tcall AdvancePlayerSprite
\tpop bc
\tdec c
\tjr nz, .healthSpeedExtra
.normalPlayerSpriteAdvancement
\tcall AdvancePlayerSprite"""

assert old in text, "ERROR: speed tier patch target not found in overworld.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ B-held speed tier applied")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 3. XP hook — trap in GainExperience (engine/battle/experience.asm)
#    Fires after hQuotient holds the final per-mon XP value.
#    JS multiplies hQuotient+1..+3 in-place, then clears wHealthHookRequest.
# ─────────────────────────────────────────────────────────────────────
echo "▸ [3/5] Battle: XP hook trap"

python3 - "$BUILD/engine/battle/experience.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = """\tinc hl
\tinc hl
\tinc hl
; add the gained exp to the party mon's exp"""

new = """\tinc hl
\tinc hl
\tinc hl
; PokéHealth XP hook: let JS scale hQuotient before we use it.
\tld a, [wHealthInitialized]
\tand a
\tjr z, .healthXPSkip
\tld a, 1 ; HOOK_XP
\tld [wHealthHookRequest], a
.healthXPWait
\tld a, [wHealthHookRequest]
\tand a
\tjr nz, .healthXPWait
.healthXPSkip
; add the gained exp to the party mon's exp"""

assert old in text, "ERROR: XP hook target not found in experience.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ XP hook trap applied")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 4. Money hook — trap in TrainerBattleVictory (engine/battle/core.asm)
#    Fires after wAmountMoneyWon is calculated.
#    JS scales the 3-byte BCD value in-place.
# ─────────────────────────────────────────────────────────────────────
echo "▸ [4/5] Battle: money hook trap"

python3 - "$BUILD/engine/battle/core.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = """; win money
\tld hl, MoneyForWinningText
\tcall PrintText"""

new = """; PokéHealth money hook: let JS scale wAmountMoneyWon (BCD) in-place.
\tld a, [wHealthInitialized]
\tand a
\tjr z, .healthMoneySkip
\tld a, 2 ; HOOK_MONEY
\tld [wHealthHookRequest], a
.healthMoneyWait
\tld a, [wHealthHookRequest]
\tand a
\tjr nz, .healthMoneyWait
.healthMoneySkip
; win money
\tld hl, MoneyForWinningText
\tcall PrintText"""

assert old in text, "ERROR: money hook target not found in core.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ Money hook trap applied")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 5. Catch hook — trap in ItemUseBall (engine/items/item_effects.asm)
#    Fires right before the catch rate comparison.
#    JS scales wEnemyMonActualCatchRate in-place.
# ─────────────────────────────────────────────────────────────────────
echo "▸ [5/5] Items: catch hook trap"

python3 - "$BUILD/engine/items/item_effects.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = """; If Rand1 - Status > CatchRate, the ball fails to capture the Pokémon.
\tld a, [wEnemyMonActualCatchRate]
\tcp b
\tjr c, .failedToCapture"""

new = """; PokéHealth catch hook: let JS scale wEnemyMonActualCatchRate in-place.
\tld a, [wHealthInitialized]
\tand a
\tjr z, .healthCatchSkip
\tld a, 3 ; HOOK_CATCH
\tld [wHealthHookRequest], a
.healthCatchWait
\tld a, [wHealthHookRequest]
\tand a
\tjr nz, .healthCatchWait
.healthCatchSkip
; If Rand1 - Status > CatchRate, the ball fails to capture the Pokémon.
\tld a, [wEnemyMonActualCatchRate]
\tcp b
\tjr c, .failedToCapture"""

assert old in text, "ERROR: catch hook target not found in item_effects.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ Catch hook trap applied")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 6. Heal hook — trap in pokecenter (engine/events/pokecenter.asm)
#    Fires after HealParty fully restores the party.
#    JS caps HP per tier, optionally halves PP, optionally adds Revive.
# ─────────────────────────────────────────────────────────────────────
echo "▸ [+] Pokémon Center: heal hook trap"

python3 - "$BUILD/engine/events/pokecenter.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = "\tpredef HealParty"

new = """\tpredef HealParty
; PokéHealth heal hook: let JS apply tier-based HP cap / PP penalty / Revive.
\tld a, [wHealthInitialized]
\tand a
\tjr z, .healthHealSkip
\tld a, 4 ; HOOK_HEAL
\tld [wHealthHookRequest], a
.healthHealWait
\tld a, [wHealthHookRequest]
\tand a
\tjr nz, .healthHealWait
.healthHealSkip"""

assert old in text, "ERROR: heal hook target not found in pokecenter.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ Heal hook trap applied")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 7. Start menu: add HEALTH item
# ─────────────────────────────────────────────────────────────────────
echo "▸ [+] Skip intro + Oak: boot straight into Red's room"
# 1. Skip PlayIntro in Init
python3 - "$BUILD/home/init.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

old = "\tpredef PlayIntro"
new = "\t; PokéHealth: skip Game Freak intro"

assert old in text, "ERROR: predef PlayIntro not found in home/init.asm"
text = text.replace(old, new, 1)

# 2. Replace "jp PrepareTitleScreen" with "jp QuickStartNewGame"
old2 = "\tjp PrepareTitleScreen"
new2 = "\tjp QuickStartNewGame"

assert old2 in text, "ERROR: jp PrepareTitleScreen not found in home/init.asm"
text = text.replace(old2, new2, 1)

open(path, 'w').write(text)
print("  ✓ PlayIntro skipped, boot redirected to QuickStartNewGame")
PYEOF

# 3. Add QuickStartNewGame to main_menu.asm (same pattern as PureRGB)
python3 - "$BUILD/engine/menus/main_menu.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

# Insert QuickStartNewGame right before SpecialEnterMap
old = "; enter map after using a special warp or loading the game from the main menu\nSpecialEnterMap::"

new = """
; PokéHealth: skip Oak's speech entirely, init game and go straight to Red's room.
; Player name = "RED", rival name = "BLUE" (debug defaults from PrepareOakSpeech).
; The PWA debug screen lets the user change names later if needed.
QuickStartNewGame::
\tcall InitOptions
\tcall ClearScreen
\tcall LoadTextBoxTilePatterns
\tcall LoadFontTilePatterns
\tcall PrepareOakSpeech
\tpredef InitPlayerData
\txor a
\tld [wDefaultMap], a
\tld [wDestinationMap], a
\tcall PrepareForSpecialWarp
\tld a, BANK(Music_PalletTown)
\tld [wAudioROMBank], a
\tld [wAudioSavedROMBank], a
\tcall GBPalNormal
\tld c, 1
\tcall DelayFrames
\tjp SpecialEnterMap

; enter map after using a special warp or loading the game from the main menu
SpecialEnterMap::"""

assert old in text, "ERROR: SpecialEnterMap not found in main_menu.asm"
text = text.replace(old, new, 1)

# Also cut the 20-frame delay in SpecialEnterMap down to 1
old2 = "\tcall ResetPlayerSpriteData\n\tld c, 20\n\tcall DelayFrames"
new2 = "\tcall ResetPlayerSpriteData\n\tld c, 1\n\tcall DelayFrames"
assert old2 in text, "ERROR: SpecialEnterMap delay not found"
text = text.replace(old2, new2, 1)

open(path, 'w').write(text)
print("  ✓ QuickStartNewGame added, SpecialEnterMap delay reduced")
PYEOF

echo "▸ [+] Start menu: HEALTH item"

python3 - "$BUILD/engine/menus/draw_start_menu.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

# Expand box: with Pokédex 14→16 rows, without 12→14
text = text.replace("ld b, $0e\n\tld c, $08", "ld b, $10\n\tld c, $08", 1)
text = text.replace("ld b, $0c\n\tld c, $08", "ld b, $0e\n\tld c, $08", 1)

# Item counts: with dex 7→8, without 6→7
text = text.replace(
    "ld a, $07\n.storeMenuItemCount",
    "ld a, $08\n.storeMenuItemCount",
    1
)
text = text.replace(
    "ld a, $06\n\tjr z, .storeMenuItemCount",
    "ld a, $07\n\tjr z, .storeMenuItemCount",
    1
)

# Insert HEALTH entry before EXIT
old = "\tld de, StartMenuExitText\n\tcall PlaceString"
new = """\tld de, StartMenuHealthText
\tcall PrintStartMenuItem
\tld de, StartMenuExitText
\tcall PlaceString"""
assert old in text, "ERROR: EXIT entry not found in draw_start_menu.asm"
text = text.replace(old, new, 1)

# Add text string after OPTION
old = 'StartMenuOptionText:\n\tdb "OPTION@"'
new = 'StartMenuOptionText:\n\tdb "OPTION@"\n\nStartMenuHealthText:\n\tdb "HEALTH@"'
assert old in text, "ERROR: OPTION text not found in draw_start_menu.asm"
text = text.replace(old, new, 1)

open(path, 'w').write(text)
print("  ✓ HEALTH menu text entry added")
PYEOF

python3 - "$BUILD/home/start_menu.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()

# Wrap-around upper bounds +1
text = text.replace(
    "ld a, 6 ; there are 7 menu items with the pokedex, so the max index is 6",
    "ld a, 7 ; 8 menu items with pokedex (includes HEALTH), max index 7",
    1
)
text = text.replace(
    "ld c, 7 ; there are 7 menu items with the pokedex",
    "ld c, 8 ; 8 menu items with pokedex (includes HEALTH)",
    1
)

# Add HEALTH dispatch before EXIT fallthrough
old = """\tcp 5
\tjp z, StartMenu_Option

; EXIT falls through to here"""
new = """\tcp 5
\tjp z, StartMenu_Option
\tcp 6
\tjp z, StartMenu_Health

; EXIT falls through to here"""
assert old in text, "ERROR: dispatch table end not found in start_menu.asm"
text = text.replace(old, new, 1)

open(path, 'w').write(text)
print("  ✓ HEALTH dispatch registered in start_menu.asm")
PYEOF

# ─────────────────────────────────────────────────────────────────────
# 8. Health menu screen + include it
# ─────────────────────────────────────────────────────────────────────
echo "▸ [+] Health menu screen"
cp "$PATCHES_DIR/health_menu.asm" "$BUILD/engine/menus/health_menu.asm"

python3 - "$BUILD/main.asm" << 'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()
# Include health_menu.asm in the SAME bank as start_sub_menus.asm (bank 4).
# DisplayStartMenu loads BANK(StartMenu_Pokedex) which is in start_sub_menus.
# If health_menu is in a different bank, jp StartMenu_Health crashes.
old = 'INCLUDE "engine/menus/start_sub_menus.asm"'
new = 'INCLUDE "engine/menus/start_sub_menus.asm"\nINCLUDE "engine/menus/health_menu.asm"'
assert old in text, "ERROR: start_sub_menus.asm not found in main.asm"
text = text.replace(old, new, 1)
open(path, 'w').write(text)
print("  ✓ health_menu.asm included in same bank as start_sub_menus")
PYEOF

echo ""
echo "✅  All patches applied."
