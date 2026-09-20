const DB_NAME = "puzzles-db";
const DB_VER = 2;
const META = "puzzles";
const IMAGES = "images";
const PROFILE = "profile";
const PROFILE_ID = "me";

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(IMAGES)) {
          db.createObjectStore(IMAGES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PROFILE)) {
          db.createObjectStore(PROFILE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("aborted"));
  });
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listPuzzles() {
  const db = await openDb();
  const tx = db.transaction(META, "readonly");
  const all = await reqToPromise(tx.objectStore(META).getAll());
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}

export async function getPuzzle(id) {
  const db = await openDb();
  const tx = db.transaction([META, IMAGES], "readonly");
  const meta = await reqToPromise(tx.objectStore(META).get(id));
  const imgs = await reqToPromise(tx.objectStore(IMAGES).get(id));
  if (!meta || !imgs) return null;
  return { ...meta, image: imgs.image };
}

export async function savePuzzle(puzzle) {
  const { image, ...meta } = puzzle;
  const db = await openDb();
  const tx = db.transaction([META, IMAGES], "readwrite");
  tx.objectStore(META).put(meta);
  tx.objectStore(IMAGES).put({ id: puzzle.id, image });
  await txDone(tx);
}

export async function updateProgress(id, patch) {
  const db = await openDb();
  const tx = db.transaction(META, "readwrite");
  const store = tx.objectStore(META);
  const meta = await reqToPromise(store.get(id));
  if (!meta) return;
  Object.assign(meta, patch, { updatedAt: Date.now() });
  store.put(meta);
  await txDone(tx);
}

export async function deletePuzzle(id) {
  const db = await openDb();
  const tx = db.transaction([META, IMAGES], "readwrite");
  tx.objectStore(META).delete(id);
  tx.objectStore(IMAGES).delete(id);
  await txDone(tx);
}

export function isQuotaError(err) {
  if (!err) return false;
  return err.name === "QuotaExceededError" || err.code === 22;
}

const emptyProfile = () => ({ id: PROFILE_ID, stars: 0, dollars: 0, completedCount: 0 });

export async function getProfile() {
  const db = await openDb();
  const tx = db.transaction(PROFILE, "readonly");
  const rec = await reqToPromise(tx.objectStore(PROFILE).get(PROFILE_ID));
  return rec ? { ...emptyProfile(), ...rec } : emptyProfile();
}

// Начисляет звёзды и оставшиеся доллары за пазл ровно один раз (флаг
// starsAwarded в записи пазла защищает от повторного начисления, если
// пользователь просто открыл уже собранный пазл снова).
export async function awardCompletion(puzzleId, { stars, dollars }) {
  const db = await openDb();
  const tx = db.transaction([META, PROFILE], "readwrite");
  const metaStore = tx.objectStore(META);
  const profileStore = tx.objectStore(PROFILE);

  const meta = await reqToPromise(metaStore.get(puzzleId));
  if (!meta || meta.starsAwarded) {
    const existing = (await reqToPromise(profileStore.get(PROFILE_ID))) || emptyProfile();
    await txDone(tx);
    return { awarded: false, profile: existing };
  }

  meta.starsAwarded = true;
  meta.updatedAt = Date.now();
  metaStore.put(meta);

  const current = { ...emptyProfile(), ...((await reqToPromise(profileStore.get(PROFILE_ID))) || {}) };
  const updated = {
    id: PROFILE_ID,
    stars: current.stars + stars,
    dollars: current.dollars + dollars,
    completedCount: current.completedCount + 1,
  };
  profileStore.put(updated);

  await txDone(tx);
  return { awarded: true, profile: updated };
}
