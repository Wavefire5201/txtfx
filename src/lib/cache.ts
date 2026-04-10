/**
 * IndexedDB-backed cache for large assets (images) and scene metadata.
 * localStorage has a ~5MB limit which data URLs easily exceed.
 * IndexedDB handles 50MB+ blobs reliably.
 */

const DB_NAME = "txtfx";
const DB_VERSION = 1;
const STORE_NAME = "autosave";
const KEY = "current";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface CachedState {
  scene: unknown;
  imageUrl: string | null;
  maskData: string;
  maskWidth: number;
  maskHeight: number;
}

export async function saveState(data: CachedState): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(data, KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — fall back to localStorage
    try {
      localStorage.setItem("txtfx-autosave", JSON.stringify(data));
    } catch {
      // Storage completely unavailable — ignore
    }
  }
}

export async function loadState(): Promise<CachedState | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    const result = await new Promise<CachedState | null>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (result) return result;
  } catch {
    // IndexedDB failed
  }

  // Fall back to localStorage (migration path from old saves)
  try {
    const saved = localStorage.getItem("txtfx-autosave");
    if (saved) {
      const data = JSON.parse(saved) as CachedState;
      // Migrate: save to IndexedDB for next time, then remove from localStorage
      saveState(data).then(() => {
        localStorage.removeItem("txtfx-autosave");
      }).catch(() => {});
      return data;
    }
  } catch {
    // Corrupt localStorage — ignore
  }

  return null;
}

export async function clearState(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(KEY);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
  try {
    localStorage.removeItem("txtfx-autosave");
  } catch {
    // Ignore
  }
}
