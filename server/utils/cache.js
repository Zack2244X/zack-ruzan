const cache = new Map();
const DEFAULT_MAX_ITEMS = 1000;

function getMaxItems() {
    const configured = Number(process.env.CACHE_MAX_ITEMS || DEFAULT_MAX_ITEMS);
    if (!Number.isFinite(configured) || configured < 100) {
        return DEFAULT_MAX_ITEMS;
    }
    return Math.floor(configured);
}

function pruneExpired() {
    const now = Date.now();
    for (const [key, item] of cache.entries()) {
        if (!item || now > item.expiry) cache.delete(key);
    }
}

function evictOldestEntries(targetSize) {
    const deleteCount = Math.max(0, cache.size - targetSize);
    if (deleteCount === 0) return;
    let removed = 0;
    for (const key of cache.keys()) {
        cache.delete(key);
        removed += 1;
        if (removed >= deleteCount) break;
    }
}

function getCache(key) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }
    return item.value;
}

function setCache(key, value, ttlSeconds = 60) {
    pruneExpired();

    const maxItems = getMaxItems();
    if (!cache.has(key) && cache.size >= maxItems) {
        evictOldestEntries(maxItems - 1);
    }

    cache.set(key, { value, expiry: Date.now() + (ttlSeconds * 1000) });
}

function clearCache(key) {
    if (key) cache.delete(key);
    else cache.clear();
}

module.exports = { getCache, setCache, clearCache };
