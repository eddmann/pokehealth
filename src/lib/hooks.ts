/**
 * PokéHealth emulator hook handlers.
 *
 * The patched ROM implements a "trap" protocol:
 *   1. ROM writes a hook ID (1-4) to wHealthHookRequest and spin-waits.
 *   2. After each emulated frame, JS polls wHealthHookRequest.
 *   3. If non-zero, JS performs the modifier logic in TypeScript (no ASM math),
 *      writes results directly into emulator WRAM/HRAM, then clears the byte.
 *   4. ROM exits the spin-wait and continues with the modified values.
 *
 * Hook IDs:
 *   1 = XP    – hQuotient+1..+3 holds the XP to award; JS scales it in-place.
 *   2 = MONEY – wAmountMoneyWon (3-byte BCD) holds prize money; JS scales it.
 *   3 = CATCH – wEnemyMonActualCatchRate holds catch rate; JS scales it.
 *   4 = HEAL  – HealParty just ran (full heal); JS caps HP and halves PP for
 *               low sleep tiers, or adds a Revive item for the top tier.
 */

import type { ActiveModifiers } from "./types";

// ── Hook IDs ──────────────────────────────────────────────────────
export const HOOK_XP = 1;
export const HOOK_MONEY = 2;
export const HOOK_CATCH = 3;
export const HOOK_HEAL = 4;

// ── Symbol table (populated at runtime from the .sym file) ────────
export type HealthSymbols = {
  wHealthHookRequest: number;
  wHealthInitialized: number;
  wHealthBSpeedTier: number;
  wHealthHealTier: number;
  wHealthXPMult: number;
  wHealthMoneyMult: number;
  wHealthCatchMult: number;
  wHealthStepsHi: number;
  wHealthStepsLo: number;
  wHealthSleepX10: number;
  wHealthCaloriesHi: number;
  wHealthCaloriesLo: number;
  wHealthWorkoutMin: number;
  wAmountMoneyWon: number;
  wEnemyMonActualCatchRate: number;
  wPartyCount: number;
  wPartyMon1: number;
  hQuotient: number;
  hRemainder: number;
  wNumBagItems: number;
  wBagItems: number;
};

/** Parse a rgblink .sym file into a symbol → address map */
export function parseSymFile(symText: string): Record<string, number> {
  const symbols: Record<string, number> = {};
  for (const line of symText.split("\n")) {
    const m = line.trim().match(/^[0-9a-fA-F]{2}:([0-9a-fA-F]{4})\s+(\w+)$/);
    if (m) {
      symbols[m[2]] = parseInt(m[1], 16);
    }
  }
  return symbols;
}

/** Check if the sym file has all required PokéHealth symbols */
export function validateSymbols(
  sym: Record<string, number>
): sym is Record<string, number> & HealthSymbols {
  const required: (keyof HealthSymbols)[] = [
    "wHealthHookRequest",
    "wHealthInitialized",
    "wAmountMoneyWon",
    "wEnemyMonActualCatchRate",
    "wPartyCount",
    "wPartyMon1",
    "hQuotient",
  ];
  return required.every((k) => k in sym);
}

// ── HRAM base address (hQuotient is in HRAM overlay at 0xFF00+offset) ──
// In pokered, HRAM starts at 0xFF80. hQuotient is at offset ~114 in hram.asm.
// We read the actual address from the .sym file.

type ReadMem = (addr: number) => number;
type WriteMem = (addr: number, val: number) => void;

export function handleHook(
  hookId: number,
  sym: Record<string, number>,
  readMem: ReadMem,
  writeMem: WriteMem,
  modifiers: ActiveModifiers
): void {
  switch (hookId) {
    case HOOK_XP:
      handleXP(sym, readMem, writeMem, modifiers.xpMultiplier);
      break;
    case HOOK_MONEY:
      handleMoney(sym, readMem, writeMem, modifiers.moneyMultiplier);
      break;
    case HOOK_CATCH:
      handleCatch(sym, readMem, writeMem, modifiers.catchMultiplier);
      break;
    case HOOK_HEAL:
      handleHeal(sym, readMem, writeMem, modifiers);
      break;
  }
  // Clear the request to let the ROM's spin-wait exit
  writeMem(sym["wHealthHookRequest"], 0);
}

// ── Hook 1: XP multiplier ─────────────────────────────────────────
// hQuotient+1..+3 is the 24-bit XP value (big-endian).
function handleXP(
  sym: Record<string, number>,
  readMem: ReadMem,
  writeMem: WriteMem,
  mult: number
): void {
  if (mult === 1.0) return;
  const hq = sym["hQuotient"];
  const hi = readMem(hq + 1);
  const mid = readMem(hq + 2);
  const lo = readMem(hq + 3);
  const xp = (hi << 16) | (mid << 8) | lo;
  const scaled = Math.min(Math.round(xp * mult), 0xffffff);
  writeMem(hq + 1, (scaled >> 16) & 0xff);
  writeMem(hq + 2, (scaled >> 8) & 0xff);
  writeMem(hq + 3, scaled & 0xff);
}

// ── Hook 2: Money multiplier ──────────────────────────────────────
// wAmountMoneyWon is 3 bytes of packed BCD (big-endian: [0x00, 0x12, 0x34] = 1234).
function handleMoney(
  sym: Record<string, number>,
  readMem: ReadMem,
  writeMem: WriteMem,
  mult: number
): void {
  if (mult === 1.0) return;
  const base = sym["wAmountMoneyWon"];
  const bytes = [readMem(base), readMem(base + 1), readMem(base + 2)];
  const value = bcdToNum(bytes);
  const scaled = Math.min(Math.round(value * mult), 999999);
  const out = numToBcd(scaled, 3);
  writeMem(base, out[0]);
  writeMem(base + 1, out[1]);
  writeMem(base + 2, out[2]);
}

// ── Hook 3: Catch multiplier ──────────────────────────────────────
// wEnemyMonActualCatchRate is a single byte (0–255).
function handleCatch(
  sym: Record<string, number>,
  readMem: ReadMem,
  writeMem: WriteMem,
  mult: number
): void {
  if (mult === 1.0) return;
  const addr = sym["wEnemyMonActualCatchRate"];
  const rate = readMem(addr);
  const scaled = Math.min(Math.round(rate * mult), 255);
  writeMem(addr, scaled);
}

// ── Hook 4: Heal modifier ─────────────────────────────────────────
// Called after HealParty has fully restored the party (full HP + PP).
// Reads wPartyCount party mons and modifies their HP (and PP) in-place.
//
// Party struct layout (PARTYMON_STRUCT_LENGTH = 0x2C = 44 bytes):
//   offset 0x00  species (1 byte)
//   offset 0x01  HP  (2 bytes, big-endian current HP)
//   offset 0x22  MaxHP (2 bytes, big-endian)
//   offset 0x1C  PP  (4 bytes, one per move)
// wPartyMon1 is the base of the first struct.
const STRUCT_LEN = 0x2c;
const HP_OFF = 0x01;
const MAXHP_OFF = 0x22;
const PP_OFF = 0x1c;
const NUM_MOVES = 4;
const PP_UP_MASK = 0xc0; // top 2 bits are PP-Up count

function handleHeal(
  sym: Record<string, number>,
  readMem: ReadMem,
  writeMem: WriteMem,
  modifiers: ActiveModifiers
): void {
  const count = readMem(sym["wPartyCount"]);
  if (count === 0) return;

  const base = sym["wPartyMon1"];

  for (let i = 0; i < count; i++) {
    const monBase = base + i * STRUCT_LEN;
    const maxHpH = readMem(monBase + MAXHP_OFF);
    const maxHpL = readMem(monBase + MAXHP_OFF + 1);
    const maxHp = (maxHpH << 8) | maxHpL;
    if (maxHp === 0) continue;

    switch (modifiers.healTier) {
      case "partial_60": {
        // Cap HP to 60%; halve all PP
        const capHp = Math.max(1, Math.floor(maxHp * 0.6));
        writeHp(monBase, capHp, writeMem);
        halvePP(monBase, readMem, writeMem);
        break;
      }
      case "partial_85": {
        // Cap HP to 85%; PP already restored (kept as-is)
        const capHp = Math.max(1, Math.floor(maxHp * 0.85));
        writeHp(monBase, capHp, writeMem);
        break;
      }
      case "full_revive": {
        // Full heal (no change); Revive added once at the end (see below)
        break;
      }
    }
  }

  // For full_revive tier: add 1 Revive to the bag via direct WRAM manipulation.
  // Bag layout: wNumBagItems (1 byte), then pairs of [item_id, count], terminated by 0xFF.
  // If Revive already in bag, increment count (cap 99). Otherwise append if room (max 20 types).
  if (modifiers.healTier === "full_revive") {
    const REVIVE_ID = 0x35;
    const BAG_MAX_TYPES = 20;
    const numItems = sym["wNumBagItems"];
    const bagBase = sym["wBagItems"]; // sym lookup; fallback to numItems+1
    if (numItems !== undefined && bagBase !== undefined) {
      addItemToBag(numItems, bagBase, REVIVE_ID, 1, BAG_MAX_TYPES, readMem, writeMem);
    }
  }
}

function writeHp(
  monBase: number,
  hp: number,
  writeMem: WriteMem
): void {
  writeMem(monBase + HP_OFF, (hp >> 8) & 0xff);
  writeMem(monBase + HP_OFF + 1, hp & 0xff);
}

function halvePP(
  monBase: number,
  readMem: ReadMem,
  writeMem: WriteMem
): void {
  for (let m = 0; m < NUM_MOVES; m++) {
    const addr = monBase + PP_OFF + m;
    const ppByte = readMem(addr);
    const ppUpBits = ppByte & PP_UP_MASK;
    const ppValue = ppByte & ~PP_UP_MASK;
    writeMem(addr, ppUpBits | (ppValue >> 1));
  }
}

// ── Bag manipulation ──────────────────────────────────────────────
// Bag layout in WRAM:
//   wNumBagItems: u8 count of item types
//   wBagItems:    [item_id, count] pairs × wNumBagItems, then 0xFF terminator
//
// If the item already exists, increment its count (cap at 99).
// Otherwise append a new entry if there's room (max BAG_MAX_TYPES).

function addItemToBag(
  numItemsAddr: number,
  bagBaseAddr: number,
  itemId: number,
  qty: number,
  maxTypes: number,
  readMem: ReadMem,
  writeMem: WriteMem,
): void {
  const count = readMem(numItemsAddr);

  // Search for existing entry
  for (let i = 0; i < count; i++) {
    const addr = bagBaseAddr + i * 2;
    if (readMem(addr) === itemId) {
      // Found — increment count, cap at 99
      const cur = readMem(addr + 1);
      writeMem(addr + 1, Math.min(cur + qty, 99));
      return;
    }
  }

  // Not found — append if there's room
  if (count >= maxTypes) return; // bag full

  const newAddr = bagBaseAddr + count * 2;
  writeMem(newAddr, itemId);
  writeMem(newAddr + 1, qty);
  writeMem(newAddr + 2, 0xff); // new terminator
  writeMem(numItemsAddr, count + 1);
}

// ── BCD utilities ─────────────────────────────────────────────────
// 3-byte BCD: [0x00, 0x12, 0x34] represents the number 1234.
// Each nibble is one decimal digit.

function bcdToNum(bytes: number[]): number {
  let n = 0;
  for (const b of bytes) {
    n = n * 100 + ((b >> 4) & 0xf) * 10 + (b & 0xf);
  }
  return n;
}

function numToBcd(n: number, len: number): number[] {
  const result: number[] = new Array(len).fill(0);
  for (let i = len - 1; i >= 0; i--) {
    const lo = n % 10;
    n = Math.floor(n / 10);
    const hi = n % 10;
    n = Math.floor(n / 10);
    result[i] = (hi << 4) | lo;
  }
  return result;
}
