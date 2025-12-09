/**
 * WaveSurfer Peaks Cache
 * Stores pre-computed waveform data in IndexedDB for instant loading
 */

const DB_NAME = 'youtulabs_waveform_cache';
const STORE_NAME = 'peaks';
const DB_VERSION = 1;

interface CachedPeaks {
  audioUrl: string;
  peaks: number[][];
  timestamp: number;
}

/**
 * Extract base URL without query parameters for cache key
 */
export function getCacheKey(audioUrl: string): string {
  try {
    const url = new URL(audioUrl);
    // Use pathname as key (e.g., /user-id/audio_001.mp3)
    return url.pathname;
  } catch {
    // Fallback to full URL if parsing fails
    return audioUrl;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize IndexedDB
 */
function initDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object store if it doesn't exist
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'audioUrl' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Save waveform peaks to cache
 */
export async function savePeaksToCache(audioUrl: string, peaks: number[][]): Promise<void> {
  try {
    const cacheKey = getCacheKey(audioUrl);
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const data: CachedPeaks = {
      audioUrl: cacheKey,
      peaks,
      timestamp: Date.now(),
    };

    await new Promise<void>((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[WaveformCache] 💾 Saved peaks for:', cacheKey);
  } catch (error) {
    console.error('[WaveformCache] Error saving peaks:', error);
  }
}

/**
 * Load waveform peaks from cache
 */
export async function loadPeaksFromCache(audioUrl: string): Promise<number[][] | null> {
  try {
    const cacheKey = getCacheKey(audioUrl);
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const data = await new Promise<CachedPeaks | undefined>((resolve, reject) => {
      const request = store.get(cacheKey);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (data?.peaks) {
      console.log('[WaveformCache] ⚡ Loaded peaks from cache for:', cacheKey);
      return data.peaks;
    }

    console.log('[WaveformCache] ❌ No cached peaks found for:', cacheKey);
    return null;
  } catch (error) {
    console.error('[WaveformCache] Error loading peaks:', error);
    return null;
  }
}

/**
 * Clear old cache entries (older than 30 days)
 */
export async function cleanupOldCache(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('timestamp');

    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    const request = index.openCursor();
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const data = cursor.value as CachedPeaks;
        if (data.timestamp < thirtyDaysAgo) {
          cursor.delete();
          console.log('[WaveformCache] Deleted old cache entry:', data.audioUrl.substring(0, 80));
        }
        cursor.continue();
      }
    };
  } catch (error) {
    console.error('[WaveformCache] Error cleaning up cache:', error);
  }
}

/**
 * Clear all cached peaks
 */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await initDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    await new Promise<void>((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    console.log('[WaveformCache] Cleared all cache');
  } catch (error) {
    console.error('[WaveformCache] Error clearing cache:', error);
  }
}
