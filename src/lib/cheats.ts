/**
 * Debug cheat utilities for PokéHealth testing.
 *
 * Manipulates game WRAM via the emulator's readMem/writeMem to set up
 * test scenarios without playing through the early game manually.
 *
 * All addresses come from the pokered .sym file and pokered constants.
 */

import { emulator } from "./emulator";

// ── Pokémon Red text encoding ───────────────────────────────────────
// pokered uses a custom character map, NOT ASCII.
const CHAR_MAP: Record<string, number> = {
  A: 0x80, B: 0x81, C: 0x82, D: 0x83, E: 0x84, F: 0x85, G: 0x86, H: 0x87,
  I: 0x88, J: 0x89, K: 0x8a, L: 0x8b, M: 0x8c, N: 0x8d, O: 0x8e, P: 0x8f,
  Q: 0x90, R: 0x91, S: 0x92, T: 0x93, U: 0x94, V: 0x95, W: 0x96, X: 0x97,
  Y: 0x98, Z: 0x99,
  a: 0xa0, b: 0xa1, c: 0xa2, d: 0xa3, e: 0xa4, f: 0xa5, g: 0xa6, h: 0xa7,
  i: 0xa8, j: 0xa9, k: 0xaa, l: 0xab, m: 0xac, n: 0xad, o: 0xae, p: 0xaf,
  q: 0xb0, r: 0xb1, s: 0xb2, t: 0xb3, u: 0xb4, v: 0xb5, w: 0xb6, x: 0xb7,
  y: 0xb8, z: 0xb9,
  "0": 0xf6, "1": 0xf7, "2": 0xf8, "3": 0xf9, "4": 0xfa, "5": 0xfb,
  "6": 0xfc, "7": 0xfd, "8": 0xfe, "9": 0xff,
  " ": 0x7f, "@": 0x50, // @ = string terminator
};

function encodeString(str: string, maxLen: number): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < Math.min(str.length, maxLen - 1); i++) {
    bytes.push(CHAR_MAP[str[i]] ?? 0x7f);
  }
  bytes.push(0x50); // terminator
  // Pad remaining with 0x50
  while (bytes.length < maxLen) bytes.push(0x50);
  return bytes;
}

// ── WRAM addresses (from pokered.sym) ───────────────────────────────
const ADDR = {
  // Party
  wPartyCount:      0xd163,
  wPartySpecies:    0xd164,  // 6 bytes + terminator
  wPartyMon1:       0xd16b,  // start of first party mon struct
  wPartyMon1OT:     0xd273,
  wPartyMonNicks:   0xd2b5,

  // Bag
  wNumBagItems:     0xd31d,
  wBagItems:        0xd31e,  // pairs of (item_id, count), terminated by 0xFF

  // Player
  wPlayerMoney:     0xd347,  // 3 bytes BCD big-endian
  wPlayerName:      0xd158,  // 11 bytes (name + terminator)
  wRivalName:       0xd34a,
  wPlayerID:        0xd359,  // 2 bytes
  wObtainedBadges:  0xd356,

  // Map / position
  wCurMap:          0xd35e,
  wYCoord:          0xd361,
  wXCoord:          0xd362,

  // Status flags
  wStatusFlags4:    0xd72e,  // BIT_GOT_STARTER = bit 3
  wStatusFlags6:    0xd732,  // BIT_FLY_WARP = bit 3, BIT_FLY_OR_DUNGEON_WARP = bit 2
  wStatusFlags7:    0xd733,  // BIT_USED_FLY = bit 7
  wDestinationMap:  0xd71a,
  wLastBlackoutMap: 0xd719,

  // Pokedex
  wPokedexOwned:    0xd2f7,  // 19 bytes bitfield (151 pokemon)
  wPokedexSeen:     0xd30a,

  // Options
  wOptions:         0xd355,  // bit7=anim off, bit6=shift/set, low 3=text speed
  wLetterPrintingDelayFlags: 0xd358,

  // Event flags
  wEventFlags:      0xd747,
} as const;

// ── Pokémon species IDs (internal, NOT Pokédex numbers) ─────────────
export const SPECIES = {
  CHARMANDER: 0xb0,
  SQUIRTLE:   0xb1,
  BULBASAUR:  0x99,
  PIKACHU:    0x54,
  PIDGEY:     0x24,
  RATTATA:    0xa5,
  NIDORAN_M:  0x03,
  GEODUDE:    0xa9,
  ABRA:       0x94,
  GASTLY:     0x19,
} as const;

// Pokédex numbers (for owned/seen bitfields)
const DEX = {
  CHARMANDER: 4,
  SQUIRTLE:   7,
  BULBASAUR:  1,
  PIKACHU:    25,
  PIDGEY:     16,
  RATTATA:    19,
} as const;

// ── Move IDs ────────────────────────────────────────────────────────
const MOVES = {
  SCRATCH:   0x0a,
  GROWL:     0x2d,
  EMBER:     0x34,
  TACKLE:    0x21,
  TAIL_WHIP: 0x27,
  BUBBLE:    0x91,
  VINE_WHIP: 0x16,
  LEER:      0x2b,
} as const;

// Move PP values
const MOVE_PP: Record<number, number> = {
  [MOVES.SCRATCH]:   35,
  [MOVES.GROWL]:     40,
  [MOVES.EMBER]:     25,
  [MOVES.TACKLE]:    35,
  [MOVES.TAIL_WHIP]: 30,
  [MOVES.BUBBLE]:    30,
  [MOVES.VINE_WHIP]: 10,
  [MOVES.LEER]:      30,
};

// ── Item IDs ────────────────────────────────────────────────────────
export const ITEMS = {
  MASTER_BALL:  0x01,
  ULTRA_BALL:   0x02,
  GREAT_BALL:   0x03,
  POKE_BALL:    0x04,
  POTION:       0x14,
  SUPER_POTION: 0x13,
  HYPER_POTION: 0x12,
  MAX_POTION:   0x11,
  FULL_RESTORE: 0x10,
  REVIVE:       0x35,
  POKEDEX:      0x09,
  TOWN_MAP:     0x05,
  ANTIDOTE:     0x0b,
  ESCAPE_ROPE:  0x1d,
} as const;

// ── Map IDs ─────────────────────────────────────────────────────────
export const MAPS = {
  PALLET_TOWN:         0x00,
  VIRIDIAN_CITY:       0x01,
  PEWTER_CITY:         0x02,
  ROUTE_1:             0x0c,
  ROUTE_2:             0x0d,
  ROUTE_22:            0x21,
  REDS_HOUSE_1F:       0x25,
  REDS_HOUSE_2F:       0x26,
  OAKS_LAB:            0x28,
  VIRIDIAN_POKECENTER: 0x29,
  VIRIDIAN_FOREST:     0x33,
} as const;

// Fly warp landing coordinates (from data/maps/special_warps.asm)
// These are the coordinates the game uses for Fly destinations.
const FLY_COORDS: Partial<Record<number, { y: number; x: number }>> = {
  [MAPS.PALLET_TOWN]:   { y: 6,  x: 5  },
  [MAPS.VIRIDIAN_CITY]:  { y: 26, x: 23 },
  [MAPS.PEWTER_CITY]:    { y: 26, x: 13 },
};

// ── Pokémon type IDs ────────────────────────────────────────────────
const TYPES = {
  NORMAL:  0x00,
  FIRE:    0x14,
  WATER:   0x15,
  GRASS:   0x16,
  POISON:  0x03,
  FLYING:  0x02,
} as const;

// ── PARTYMON_STRUCT_LENGTH = 0x2C = 44 bytes ────────────────────────
const STRUCT_LEN = 0x2c;
const OT_NAME_LEN = 11;
const NICK_LEN = 11;

// ── Helper: write multiple bytes ────────────────────────────────────
function writeBytes(baseAddr: number, bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) {
    emulator.writeMem(baseAddr + i, bytes[i] & 0xff);
  }
}

function writeBE16(addr: number, val: number): void {
  emulator.writeMem(addr, (val >> 8) & 0xff);
  emulator.writeMem(addr + 1, val & 0xff);
}

// ── Pokémon preset definitions ──────────────────────────────────────
export type PokemonPreset = {
  species: number;
  nickname: string;
  level: number;
  moves: number[];
  type1: number;
  type2: number;
  catchRate: number;
  baseExp: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  special: number;
  dexNum: number;
};

const CHARMANDER_LV10: PokemonPreset = {
  species: SPECIES.CHARMANDER,
  nickname: "CHARMANDER",
  level: 10,
  moves: [MOVES.SCRATCH, MOVES.GROWL, MOVES.EMBER, 0],
  type1: TYPES.FIRE, type2: TYPES.FIRE,
  catchRate: 45, baseExp: 65,
  hp: 32, maxHp: 32,
  attack: 20, defense: 17, speed: 24, special: 20,
  dexNum: DEX.CHARMANDER,
};

const SQUIRTLE_LV10: PokemonPreset = {
  species: SPECIES.SQUIRTLE,
  nickname: "SQUIRTLE",
  level: 10,
  moves: [MOVES.TACKLE, MOVES.TAIL_WHIP, MOVES.BUBBLE, 0],
  type1: TYPES.WATER, type2: TYPES.WATER,
  catchRate: 45, baseExp: 66,
  hp: 33, maxHp: 33,
  attack: 18, defense: 23, speed: 17, special: 20,
  dexNum: DEX.SQUIRTLE,
};

const BULBASAUR_LV10: PokemonPreset = {
  species: SPECIES.BULBASAUR,
  nickname: "BULBASAUR",
  level: 10,
  moves: [MOVES.TACKLE, MOVES.GROWL, MOVES.VINE_WHIP, MOVES.LEER],
  type1: TYPES.GRASS, type2: TYPES.POISON,
  catchRate: 45, baseExp: 64,
  hp: 34, maxHp: 34,
  attack: 18, defense: 18, speed: 18, special: 23,
  dexNum: DEX.BULBASAUR,
};

const PIDGEY_LV5: PokemonPreset = {
  species: SPECIES.PIDGEY,
  nickname: "PIDGEY",
  level: 5,
  moves: [MOVES.TACKLE, MOVES.GROWL, 0, 0],
  type1: TYPES.NORMAL, type2: TYPES.FLYING,
  catchRate: 255, baseExp: 55,
  hp: 22, maxHp: 22,
  attack: 12, defense: 11, speed: 15, special: 10,
  dexNum: DEX.PIDGEY,
};

// ── Core cheat functions ────────────────────────────────────────────

/** Write a single Pokémon into a party slot (0-indexed) */
function writePartyMon(slot: number, mon: PokemonPreset, otName: string): void {
  const base = ADDR.wPartyMon1 + slot * STRUCT_LEN;

  // Species
  emulator.writeMem(base + 0x00, mon.species);

  // Current HP (big-endian)
  writeBE16(base + 0x01, mon.hp);

  // Box level (used in box storage, mirrors level)
  emulator.writeMem(base + 0x03, mon.level);

  // Status (0 = healthy)
  emulator.writeMem(base + 0x04, 0);

  // Types
  emulator.writeMem(base + 0x05, mon.type1);
  emulator.writeMem(base + 0x06, mon.type2);

  // Catch rate
  emulator.writeMem(base + 0x07, mon.catchRate);

  // Moves (4 bytes)
  for (let i = 0; i < 4; i++) {
    emulator.writeMem(base + 0x08 + i, mon.moves[i] ?? 0);
  }

  // OT ID
  writeBE16(base + 0x0c, 0x6152); // "aR" = player ID placeholder

  // Experience (3 bytes, medium slow growth, enough for the level)
  const exp = Math.pow(mon.level, 3); // rough approximation
  emulator.writeMem(base + 0x0e, (exp >> 16) & 0xff);
  emulator.writeMem(base + 0x0f, (exp >> 8) & 0xff);
  emulator.writeMem(base + 0x10, exp & 0xff);

  // HP EV, Attack EV, Defense EV, Speed EV, Special EV (2 bytes each = 10 bytes)
  for (let i = 0; i < 10; i++) {
    emulator.writeMem(base + 0x11 + i, 0);
  }

  // DVs (2 bytes) — decent IVs
  emulator.writeMem(base + 0x1b, 0xaa); // Atk=10, Def=10
  emulator.writeMem(base + 0x1c, 0xaa); // Spd=10, Spc=10

  // PP (4 bytes — current PP for each move)
  for (let i = 0; i < 4; i++) {
    const moveId = mon.moves[i] ?? 0;
    emulator.writeMem(base + 0x1d + i, moveId ? (MOVE_PP[moveId] ?? 20) : 0);
  }

  // Level
  emulator.writeMem(base + 0x21, mon.level);

  // Max HP (big-endian)
  writeBE16(base + 0x22, mon.maxHp);

  // Stats (big-endian, 2 bytes each: Attack, Defense, Speed, Special)
  writeBE16(base + 0x24, mon.attack);
  writeBE16(base + 0x26, mon.defense);
  writeBE16(base + 0x28, mon.speed);
  writeBE16(base + 0x2a, mon.special);

  // OT Name (11 bytes)
  const otAddr = ADDR.wPartyMon1OT + slot * OT_NAME_LEN;
  writeBytes(otAddr, encodeString(otName, OT_NAME_LEN));

  // Nickname (11 bytes)
  const nickAddr = ADDR.wPartyMonNicks + slot * NICK_LEN;
  writeBytes(nickAddr, encodeString(mon.nickname, NICK_LEN));

  // Species list entry
  emulator.writeMem(ADDR.wPartySpecies + slot, mon.species);
}

/** Set party to the given Pokémon array */
export function setParty(mons: PokemonPreset[], otName = "RED"): void {
  if (!emulator.isReady) { console.warn("Emulator not ready"); return; }

  const count = Math.min(mons.length, 6);
  emulator.writeMem(ADDR.wPartyCount, count);

  for (let i = 0; i < count; i++) {
    writePartyMon(i, mons[i], otName);
    // Mark as seen+owned in Pokédex
    setPokedexBit(ADDR.wPokedexOwned, mons[i].dexNum);
    setPokedexBit(ADDR.wPokedexSeen, mons[i].dexNum);
  }

  // Terminator after last species
  emulator.writeMem(ADDR.wPartySpecies + count, 0xff);

  console.log(`Party set: ${count} Pokémon`);
}

function setPokedexBit(baseAddr: number, dexNum: number): void {
  if (dexNum <= 0) return;
  const byteIndex = Math.floor((dexNum - 1) / 8);
  const bitIndex = (dexNum - 1) % 8;
  const current = emulator.readMem(baseAddr + byteIndex);
  emulator.writeMem(baseAddr + byteIndex, current | (1 << bitIndex));
}

/** Set bag contents. Items is array of [itemId, count] pairs. */
export function setBag(items: [number, number][]): void {
  if (!emulator.isReady) { console.warn("Emulator not ready"); return; }

  emulator.writeMem(ADDR.wNumBagItems, items.length);
  for (let i = 0; i < items.length; i++) {
    emulator.writeMem(ADDR.wBagItems + i * 2, items[i][0]);
    emulator.writeMem(ADDR.wBagItems + i * 2 + 1, items[i][1]);
  }
  // Terminator
  emulator.writeMem(ADDR.wBagItems + items.length * 2, 0xff);

  console.log(`Bag set: ${items.length} item types`);
}

/** Set player money (0–999999, stored as 3-byte BCD) */
export function setMoney(amount: number): void {
  if (!emulator.isReady) { console.warn("Emulator not ready"); return; }

  amount = Math.min(Math.max(0, Math.round(amount)), 999999);
  const d5 = amount % 10; amount = Math.floor(amount / 10);
  const d4 = amount % 10; amount = Math.floor(amount / 10);
  const d3 = amount % 10; amount = Math.floor(amount / 10);
  const d2 = amount % 10; amount = Math.floor(amount / 10);
  const d1 = amount % 10; amount = Math.floor(amount / 10);
  const d0 = amount % 10;

  emulator.writeMem(ADDR.wPlayerMoney,     (d0 << 4) | d1);
  emulator.writeMem(ADDR.wPlayerMoney + 1, (d2 << 4) | d3);
  emulator.writeMem(ADDR.wPlayerMoney + 2, (d4 << 4) | d5);

  console.log(`Money set to ¥${(d0*100000 + d1*10000 + d2*1000 + d3*100 + d4*10 + d5)}`);
}

/** Set the GOT_STARTER flag so the game thinks Oak's lab sequence is done */
export function setGotStarterFlag(): void {
  if (!emulator.isReady) return;
  const current = emulator.readMem(ADDR.wStatusFlags4);
  emulator.writeMem(ADDR.wStatusFlags4, current | (1 << 3)); // BIT_GOT_STARTER
  console.log("GOT_STARTER flag set");
}

/** Set text speed to fast */
export function setFastText(): void {
  if (!emulator.isReady) return;
  // Options: bit7=anim on(0), bit6=shift(0), text speed = 1 (fast)
  emulator.writeMem(ADDR.wOptions, 0x01);
  emulator.writeMem(ADDR.wLetterPrintingDelayFlags, 0x01); // BIT_FAST_TEXT_DELAY
  console.log("Text speed set to FAST");
}

/**
 * Trigger a fly-warp to an outdoor map.
 *
 * Uses the same mechanism as the in-game Fly HM:
 *   1. Write target map to wDestinationMap
 *   2. Set BIT_FLY_WARP (bit 3) in wStatusFlags6
 *   3. Set BIT_USED_FLY (bit 7) in wStatusFlags7
 * The overworld loop picks this up on the next frame, plays the
 * fly animation, and loads the target map at its fly-warp coordinates.
 *
 * Only works for maps with entries in FlyWarpDataPtr:
 *   Pallet Town, Viridian City, Pewter City, etc.
 * Must be called while in the overworld (not in battle/menu).
 */
export function flyWarp(mapId: number): void {
  if (!emulator.isReady) { console.warn("Emulator not ready"); return; }

  // Set destination
  emulator.writeMem(ADDR.wDestinationMap, mapId);

  // Set last blackout map so Teleport/whiteout returns here
  emulator.writeMem(ADDR.wLastBlackoutMap, mapId);

  // Set BIT_FLY_WARP (bit 3) in wStatusFlags6
  const flags6 = emulator.readMem(ADDR.wStatusFlags6);
  emulator.writeMem(ADDR.wStatusFlags6, flags6 | (1 << 3));

  // Set BIT_USED_FLY (bit 7) in wStatusFlags7
  const flags7 = emulator.readMem(ADDR.wStatusFlags7);
  emulator.writeMem(ADDR.wStatusFlags7, flags7 | (1 << 7));

  const coords = FLY_COORDS[mapId];
  const mapName = Object.entries(MAPS).find(([, v]) => v === mapId)?.[0] ?? `0x${mapId.toString(16)}`;
  console.log(`Fly warp → ${mapName}${coords ? ` (${coords.x}, ${coords.y})` : ""}`);
}

/** Read current player money */
export function readMoney(): number {
  if (!emulator.isReady) return 0;
  const b0 = emulator.readMem(ADDR.wPlayerMoney);
  const b1 = emulator.readMem(ADDR.wPlayerMoney + 1);
  const b2 = emulator.readMem(ADDR.wPlayerMoney + 2);
  return ((b0 >> 4) & 0xf) * 100000 + (b0 & 0xf) * 10000 +
         ((b1 >> 4) & 0xf) * 1000 + (b1 & 0xf) * 100 +
         ((b2 >> 4) & 0xf) * 10 + (b2 & 0xf);
}

/** Read current party mon 1 HP */
export function readPartyHP(slot = 0): { hp: number; maxHp: number } {
  if (!emulator.isReady) return { hp: 0, maxHp: 0 };
  const base = ADDR.wPartyMon1 + slot * STRUCT_LEN;
  const hp = (emulator.readMem(base + 0x01) << 8) | emulator.readMem(base + 0x02);
  const maxHp = (emulator.readMem(base + 0x22) << 8) | emulator.readMem(base + 0x23);
  return { hp, maxHp };
}

/** Read current party mon 1 PP */
export function readPartyPP(slot = 0): number[] {
  if (!emulator.isReady) return [0, 0, 0, 0];
  const base = ADDR.wPartyMon1 + slot * STRUCT_LEN;
  return [
    emulator.readMem(base + 0x1d) & 0x3f,
    emulator.readMem(base + 0x1e) & 0x3f,
    emulator.readMem(base + 0x1f) & 0x3f,
    emulator.readMem(base + 0x20) & 0x3f,
  ];
}

// ── Pre-built test scenarios ────────────────────────────────────────

/**
 * Scenario: XP + wild battle test.
 * Warps to Viridian City. Walk south to Route 1 or west to Route 22.
 * Both have grass with low-level wild Pokémon for testing XP gain.
 * (We avoid Pallet Town because Oak intercepts you on a fresh game.)
 */
export function setupXPTest(): void {
  setParty([CHARMANDER_LV10]);
  setBag([
    [ITEMS.POKE_BALL, 20],
    [ITEMS.POTION, 10],
  ]);
  setMoney(3000);
  setGotStarterFlag();
  setFastText();
  flyWarp(MAPS.VIRIDIAN_CITY); // lands at (23,26) — walk south to Route 1 or west to Route 22
  console.log("✅ XP test: fly to Viridian City → walk south to Route 1 grass");
}

/**
 * Scenario: Money (trainer battle) test.
 * Warps to Pewter City — Viridian Forest trainers are south.
 * Walk south through Route 2 gate into Viridian Forest for Bug Catchers.
 */
export function setupMoneyTest(): void {
  setParty([{ ...CHARMANDER_LV10, level: 12, hp: 38, maxHp: 38, attack: 24 }]);
  setBag([
    [ITEMS.POTION, 20],
    [ITEMS.SUPER_POTION, 10],
  ]);
  setMoney(500);
  setGotStarterFlag();
  setFastText();
  flyWarp(MAPS.PEWTER_CITY); // lands at (13,26) — walk south to Viridian Forest
  console.log("✅ Money test: fly to Pewter City → walk south to Viridian Forest trainers");
}

/**
 * Scenario: Catch rate test.
 * Warps to Viridian City — walk south to Route 1 or west to Route 22.
 * Lots of Pokéballs to test catch multiplier.
 */
export function setupCatchTest(): void {
  setParty([{ ...CHARMANDER_LV10, level: 15, hp: 45, maxHp: 45, attack: 28 }]);
  setBag([
    [ITEMS.POKE_BALL, 99],
    [ITEMS.GREAT_BALL, 50],
    [ITEMS.ULTRA_BALL, 20],
    [ITEMS.POTION, 30],
  ]);
  setMoney(5000);
  setGotStarterFlag();
  setFastText();
  flyWarp(MAPS.VIRIDIAN_CITY); // walk south to Route 1 or west to Route 22
  console.log("✅ Catch test: fly to Viridian City → walk south to Route 1 grass");
}

/**
 * Scenario: Heal (Pokémon Center) test.
 * Warps to Viridian City — Pokémon Center is nearby.
 * Party has reduced HP to make the heal effect obvious.
 */
export function setupHealTest(): void {
  const weakChar: PokemonPreset = {
    ...CHARMANDER_LV10,
    hp: 10, // low HP
  };
  const weakSquirt: PokemonPreset = {
    ...SQUIRTLE_LV10,
    hp: 5,
  };
  setParty([weakChar, weakSquirt]);
  setBag([[ITEMS.POTION, 5]]);
  setMoney(1000);
  setGotStarterFlag();
  setFastText();
  flyWarp(MAPS.VIRIDIAN_CITY); // lands at (23,26) — Pokémon Center is north-west
  console.log("✅ Heal test: fly to Viridian City → walk to Pokémon Center (north-west)");
}

/**
 * Scenario: B-speed test.
 * Warps to Viridian City — large open area to walk around.
 */
export function setupSpeedTest(): void {
  setParty([CHARMANDER_LV10]);
  setBag([[ITEMS.POTION, 5]]);
  setMoney(1000);
  setGotStarterFlag();
  setFastText();
  flyWarp(MAPS.VIRIDIAN_CITY);
  console.log("✅ B-speed test: fly to Viridian City → hold B while walking");
}

// ── Exported presets for the UI ─────────────────────────────────────
export const POKEMON_PRESETS = {
  CHARMANDER_LV10,
  SQUIRTLE_LV10,
  BULBASAUR_LV10,
  PIDGEY_LV5,
};

export const SCENARIO_LIST = [
  {
    id: "xp",
    name: "⚔️ XP Test",
    desc: "Charmander Lv10 → Viridian City. Walk south to Route 1 grass.",
    hook: "XP multiplier (Active Calories)",
    fn: setupXPTest,
  },
  {
    id: "money",
    name: "💰 Money Test",
    desc: "Charmander Lv12 → Pewter City. Walk south to Viridian Forest trainers.",
    hook: "Money multiplier (Workout Minutes)",
    fn: setupMoneyTest,
  },
  {
    id: "catch",
    name: "🎯 Catch Test",
    desc: "Charmander Lv15, 99 balls → Viridian City. Walk south to Route 1 grass.",
    hook: "Catch rate (Workout Minutes)",
    fn: setupCatchTest,
  },
  {
    id: "heal",
    name: "🏥 Heal Test",
    desc: "Weak party (10/32 HP) → Viridian City. Walk to Pokémon Center.",
    hook: "Heal tier (Sleep Hours)",
    fn: setupHealTest,
  },
  {
    id: "speed",
    name: "🏃 B-Speed Test",
    desc: "Charmander Lv10 → Viridian City. Hold B while walking.",
    hook: "Walk speed (Steps)",
    fn: setupSpeedTest,
  },
] as const;
