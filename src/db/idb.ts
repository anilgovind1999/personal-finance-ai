/**
 * Minimal IndexedDB wrapper.
 *
 * The whole app state lives in one record so a save is atomic; receipt images
 * live in their own store as blobs, which would blow past the localStorage
 * quota. Nothing here ever leaves the device.
 */

const DB_NAME = 'personal-finance-ai';
const DB_VERSION = 1;
const STATE_STORE = 'state';
const BLOB_STORE = 'attachments';
const STATE_KEY = 'app';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STATE_STORE)) db.createObjectStore(STATE_STORE);
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const req = fn(transaction.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function loadState<T>(): Promise<T | null> {
  try {
    const value = await tx<T | undefined>(STATE_STORE, 'readonly', (s) => s.get(STATE_KEY));
    return value ?? null;
  } catch {
    // A private window or a blocked database should not stop the app booting.
    return null;
  }
}

export async function saveState<T>(state: T): Promise<void> {
  try {
    await tx(STATE_STORE, 'readwrite', (s) => s.put(state, STATE_KEY));
  } catch (err) {
    console.warn('Could not persist state', err);
  }
}

export async function clearState(): Promise<void> {
  try {
    await tx(STATE_STORE, 'readwrite', (s) => s.delete(STATE_KEY));
    await tx(BLOB_STORE, 'readwrite', (s) => s.clear());
  } catch (err) {
    console.warn('Could not clear state', err);
  }
}

export async function putAttachment(id: string, blob: Blob): Promise<void> {
  await tx(BLOB_STORE, 'readwrite', (s) => s.put(blob, id));
}

export async function getAttachment(id: string): Promise<Blob | null> {
  try {
    const blob = await tx<Blob | undefined>(BLOB_STORE, 'readonly', (s) => s.get(id));
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteAttachment(id: string): Promise<void> {
  try {
    await tx(BLOB_STORE, 'readwrite', (s) => s.delete(id));
  } catch {
    /* nothing to do — the record is already gone */
  }
}

/** Object URL for a stored attachment, or null when it is missing. */
export async function attachmentUrl(id: string): Promise<string | null> {
  const blob = await getAttachment(id);
  return blob ? URL.createObjectURL(blob) : null;
}
