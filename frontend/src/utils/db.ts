export const DB_NAME = 'UnweaveDB';
export const STORE_NAME = 'merged_blobs';
export const DB_VERSION = 1;

/**
 * Open or create the IndexedDB.
 */
function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };

        request.onsuccess = (event) => {
            resolve((event.target as IDBOpenDBRequest).result);
        };

        request.onerror = (event) => {
            reject((event.target as IDBOpenDBRequest).error);
        };
    });
}

/**
 * Save a Blob to IndexedDB against a track name.
 */
export async function saveBlobToDB(name: string, blob: Blob): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(blob, name);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

/**
 * Retrieve a Blob from IndexedDB by track name.
 */
export async function getBlobFromDB(name: string): Promise<Blob | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(name);

        request.onsuccess = () => {
            if (request.result) {
                resolve(request.result as Blob);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(request.error);
    });
}

/**
 * Delete a Blob from IndexedDB by track name.
 */
export async function deleteBlobFromDB(name: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(name);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
