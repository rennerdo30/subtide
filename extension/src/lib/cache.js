/**
 * Translation cache management
 * Uses Chrome's local storage with LRU eviction
 */

const CACHE_KEY = 'translationCache';
const MAX_CACHE_ENTRIES = 100; // Maximum number of cached translations
const CACHE_VERSION = 1;

/**
 * Generate cache key for a video translation
 */
export function generateCacheKey(videoId, sourceLanguage, targetLanguage) {
    return `${videoId}_${sourceLanguage}_${targetLanguage}`;
}

/**
 * Get all cached translations
 */
async function getAllCache() {
    return new Promise((resolve) => {
        chrome.storage.local.get([CACHE_KEY], (result) => {
            const cache = result[CACHE_KEY] || { version: CACHE_VERSION, entries: {} };
            resolve(cache);
        });
    });
}

/**
 * Save cache to storage
 */
async function saveCache(cache) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [CACHE_KEY]: cache }, resolve);
    });
}

/**
 * Get cached translation for a video
 */
export async function getCachedTranslation(videoId, sourceLanguage, targetLanguage) {
    const cache = await getAllCache();
    const key = generateCacheKey(videoId, sourceLanguage, targetLanguage);
    const entry = cache.entries[key];

    if (entry) {
        // Update access time for LRU
        entry.lastAccess = Date.now();
        await saveCache(cache);
        console.log(`[VideoTranslate] Cache hit for ${key}`);
        return entry.translations;
    }

    console.log(`[VideoTranslate] Cache miss for ${key}`);
    return null;
}

/**
 * Cache a translation
 */
export async function cacheTranslation(videoId, sourceLanguage, targetLanguage, translations) {
    const cache = await getAllCache();
    const key = generateCacheKey(videoId, sourceLanguage, targetLanguage);

    // Add new entry
    cache.entries[key] = {
        translations,
        createdAt: Date.now(),
        lastAccess: Date.now(),
    };

    // LRU eviction if cache is too large
    const entries = Object.entries(cache.entries);
    if (entries.length > MAX_CACHE_ENTRIES) {
        // Sort by last access time (oldest first)
        entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);

        // Remove oldest entries
        const toRemove = entries.length - MAX_CACHE_ENTRIES;
        for (let i = 0; i < toRemove; i++) {
            delete cache.entries[entries[i][0]];
        }
        console.log(`[VideoTranslate] Evicted ${toRemove} cache entries`);
    }

    await saveCache(cache);
    console.log(`[VideoTranslate] Cached translation for ${key}`);
}

/**
 * Clear all cached translations
 */
export async function clearCache() {
    await saveCache({ version: CACHE_VERSION, entries: {} });
    console.log('[VideoTranslate] Cache cleared');
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
    const cache = await getAllCache();
    const entries = Object.keys(cache.entries).length;
    return {
        entries,
        maxEntries: MAX_CACHE_ENTRIES,
    };
}
