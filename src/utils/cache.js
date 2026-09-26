/**
 * In-Memory Cache Utility for High-Performance Readora Backend
 * Caches frequently read, rarely changed data (Categories, Banners, Settings, Authors, Publishers)
 * to eliminate repeated MongoDB Atlas roundtrips and slash response latency from seconds to milliseconds.
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get cached item if present and not expired
   * @param {string} key
   * @returns {any|null}
   */
  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * Set cached item with TTL in seconds (default: 600s / 10 mins)
   * @param {string} key
   * @param {any} data
   * @param {number} ttlSeconds
   */
  set(key, data, ttlSeconds = 600) {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  /**
   * Delete a specific cache key
   * @param {string} key
   */
  del(key) {
    this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a prefix or pattern
   * @param {string} prefix
   */
  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();
export default memoryCache;
