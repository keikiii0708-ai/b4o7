const DB_NAME = "b4o7";
const DB_VERSION = 1;

export const STORE_NAMES = [
  "goals",
  "dailyRecords",
  "sleepRecords",
  "milestones",
  "journal",
  "weeklyReviews",
  "weekSnapshots",
  "rewardClaims",
  "images",
  "settings",
];

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const create = (name, indexes = []) => {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath: "id" });
        for (const [indexName, key] of indexes) store.createIndex(indexName, key, { unique: false });
      };
      create("goals");
      create("dailyRecords", [["goalId", "goalId"], ["date", "date"]]);
      create("sleepRecords", [["wakeDate", "wakeDate"]]);
      create("milestones", [["goalId", "goalId"]]);
      create("journal");
      create("weeklyReviews");
      create("weekSnapshots", [["goalId", "goalId"]]);
      create("rewardClaims", [["goalId", "goalId"]]);
      create("images");
      create("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open the database."));
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(store) {
  const db = await openDb();
  return requestToPromise(db.transaction(store, "readonly").objectStore(store).getAll());
}

export async function put(store, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function bulkPut(store, rows) {
  if (!rows?.length) return;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const objectStore = tx.objectStore(store);
    for (const row of rows) objectStore.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function del(store, id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const name of STORE_NAMES) tx.objectStore(name).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState() {
  const entries = await Promise.all(STORE_NAMES.map(async (name) => [name, await getAll(name)]));
  const data = Object.fromEntries(entries);
  const settings = data.settings.find((item) => item.id === "app") || null;
  return { ...data, settings };
}
