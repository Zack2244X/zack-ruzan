const cache = new Map();

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
    cache.set(key, { value, expiry: Date.now() + (ttlSeconds * 1000) });
}

function clearCache(key) {
    if (key) cache.delete(key);
    else cache.clear();
}

module.exports = { getCache, setCache, clearCache };
