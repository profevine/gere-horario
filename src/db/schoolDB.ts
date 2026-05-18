let _db: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('gere-horario', 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('data'))
        req.result.createObjectStore('data');
    };
    req.onsuccess = () => { _db = req.result; resolve(_db!); };
    req.onerror = () => reject(req.error);
  });
}

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('data', 'readonly').objectStore('data').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbSet(key: string, value: unknown): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('data', 'readwrite').objectStore('data').put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function dbClear(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction('data', 'readwrite').objectStore('data').clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
