const APP_ENV = import.meta.env.DEV ? "dev" : "prod";
const DB_NAME = `clis.${APP_ENV}.local.v1`;
const DB_VERSION = 1;
const STORE_NAME = "kv";

type StoredRecord<T> = {
  key: string;
  value: T;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openLocalDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB를 열 수 없습니다."));
  });

  return dbPromise;
}

export async function readLocalRecord<T>(key: string): Promise<T | null> {
  const db = await openLocalDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const record = request.result as StoredRecord<T> | undefined;
      resolve(record?.value ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("로컬 데이터를 읽을 수 없습니다."));
  });
}

export async function writeLocalRecord<T>(key: string, value: T): Promise<void> {
  const db = await openLocalDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ key, value } satisfies StoredRecord<T>);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("로컬 데이터를 저장할 수 없습니다."));
  });
}
