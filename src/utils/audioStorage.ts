// Persistent Audio File Storage via IndexedDB
// Allows user-uploaded audio files (.mp3, .m4a, .wav, etc.) to persist across browser reloads and re-open from Gallery

const DB_NAME = 'echolingo_media_db';
const STORE_NAME = 'audio_files';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save an uploaded audio Blob/File to IndexedDB with book ID as key
 */
export async function saveAudioBlob(bookId: string, audioFile: Blob | File): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve, reject) => {
      const req = store.put(audioFile, bookId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to save audio file to IndexedDB:', err);
  }
}

/**
 * Retrieve stored Blob from IndexedDB and create a fresh Object URL
 */
export async function getAudioBlobUrl(bookId: string, fallbackUrl?: string): Promise<string> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const blob = await new Promise<Blob | undefined>((resolve) => {
      const req = store.get(bookId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });

    if (blob && blob instanceof Blob) {
      return URL.createObjectURL(blob);
    }
  } catch (err) {
    console.warn('IndexedDB read notice for book:', bookId, err);
  }
  return fallbackUrl || '';
}

/**
 * Delete audio file from IndexedDB when audiobook is removed
 */
export async function deleteAudioBlob(bookId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise<void>((resolve) => {
      const req = store.delete(bookId);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch (err) {
    console.warn('IndexedDB delete notice:', err);
  }
}
