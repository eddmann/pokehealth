import { openDB, type IDBPDatabase } from "idb";
import type { DailyHealthState, SaveSlot } from "./types";

const DB_NAME = "pokehealth";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Save states: binary blobs keyed by slot id
        if (!db.objectStoreNames.contains("saves")) {
          db.createObjectStore("saves");
        }
        // Save slot metadata
        if (!db.objectStoreNames.contains("save-meta")) {
          db.createObjectStore("save-meta");
        }
        // Health state
        if (!db.objectStoreNames.contains("health")) {
          db.createObjectStore("health");
        }
        // SRAM (battery save / in-game save)
        if (!db.objectStoreNames.contains("sram")) {
          db.createObjectStore("sram");
        }
      },
    });
  }
  return dbPromise;
}

// --- Save States ---

export async function saveState(
  slotId: string,
  name: string,
  stateData: ArrayBuffer,
  thumbnail?: string
): Promise<void> {
  const db = await getDb();
  const meta: SaveSlot = {
    id: slotId,
    name,
    timestamp: Date.now(),
    thumbnail,
  };
  const tx = db.transaction(["saves", "save-meta"], "readwrite");
  await Promise.all([
    tx.objectStore("saves").put(stateData, slotId),
    tx.objectStore("save-meta").put(meta, slotId),
    tx.done,
  ]);
}

export async function loadState(slotId: string): Promise<ArrayBuffer | null> {
  const db = await getDb();
  return (await db.get("saves", slotId)) ?? null;
}

export async function listSaves(): Promise<SaveSlot[]> {
  const db = await getDb();
  const keys = await db.getAllKeys("save-meta");
  const slots: SaveSlot[] = [];
  for (const key of keys) {
    const meta = await db.get("save-meta", key);
    if (meta) slots.push(meta);
  }
  return slots.sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteSave(slotId: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["saves", "save-meta"], "readwrite");
  await Promise.all([
    tx.objectStore("saves").delete(slotId),
    tx.objectStore("save-meta").delete(slotId),
    tx.done,
  ]);
}

// --- SRAM (battery save) ---

export async function saveSRAM(data: ArrayBuffer): Promise<void> {
  const db = await getDb();
  await db.put("sram", data, "current");
}

export async function loadSRAM(): Promise<ArrayBuffer | null> {
  const db = await getDb();
  return (await db.get("sram", "current")) ?? null;
}

// --- Health State ---

export async function saveHealthState(
  state: DailyHealthState
): Promise<void> {
  const db = await getDb();
  await db.put("health", state, "current");
}

export async function loadHealthState(): Promise<DailyHealthState | null> {
  const db = await getDb();
  return (await db.get("health", "current")) ?? null;
}
