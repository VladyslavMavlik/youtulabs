import type { GenerationItem } from '../App';

const CACHE_KEY_PREFIX = 'story_history_';
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CachedHistory {
  version: number;
  userId: string;
  items: GenerationItem[];
  timestamp: number;
}

/**
 * Get cache key for a specific user
 */
function getCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}_v${CACHE_VERSION}`;
}

/**
 * Load cached history from localStorage
 */
export function loadCachedHistory(userId: string): GenerationItem[] | null {
  try {
    const cacheKey = getCacheKey(userId);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      console.log('📦 No cached history found');
      return null;
    }

    const parsed: CachedHistory = JSON.parse(cached);

    // Validate cache
    if (
      parsed.version !== CACHE_VERSION ||
      parsed.userId !== userId ||
      Date.now() - parsed.timestamp > MAX_CACHE_AGE_MS
    ) {
      console.log('📦 Cache invalid or expired, clearing...');
      localStorage.removeItem(cacheKey);
      return null;
    }

    console.log(`📦 Loaded ${parsed.items.length} items from cache (age: ${Math.round((Date.now() - parsed.timestamp) / 1000)}s)`);
    return parsed.items;
  } catch (err) {
    console.error('❌ Failed to load cache:', err);
    return null;
  }
}

/**
 * Save history to localStorage cache
 */
export function saveCachedHistory(userId: string, items: GenerationItem[]): void {
  try {
    const cacheKey = getCacheKey(userId);
    const cached: CachedHistory = {
      version: CACHE_VERSION,
      userId,
      items,
      timestamp: Date.now(),
    };

    localStorage.setItem(cacheKey, JSON.stringify(cached));
    console.log(`📦 Saved ${items.length} items to cache`);
  } catch (err) {
    console.error('❌ Failed to save cache:', err);
    // If quota exceeded, try clearing old caches
    if (err instanceof Error && err.name === 'QuotaExceededError') {
      clearOldCaches(userId);
      // Retry once
      try {
        const cacheKey = getCacheKey(userId);
        const cached: CachedHistory = {
          version: CACHE_VERSION,
          userId,
          items,
          timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch (retryErr) {
        console.error('❌ Failed to save cache after clearing:', retryErr);
      }
    }
  }
}

/**
 * Clear cache for a specific user
 */
export function clearUserCache(userId: string): void {
  try {
    const cacheKey = getCacheKey(userId);
    localStorage.removeItem(cacheKey);
    console.log('🗑️ Cleared cache for user:', userId);
  } catch (err) {
    console.error('❌ Failed to clear cache:', err);
  }
}

/**
 * Clear all old/invalid caches (except current user)
 */
function clearOldCaches(currentUserId: string): void {
  try {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(CACHE_KEY_PREFIX)) {
        const currentKey = getCacheKey(currentUserId);
        if (key !== currentKey) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`🗑️ Cleared ${keysToRemove.length} old caches`);
  } catch (err) {
    console.error('❌ Failed to clear old caches:', err);
  }
}
