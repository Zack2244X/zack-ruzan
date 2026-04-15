const rateLimit = require("express-rate-limit");
const logger = require("../utils/logger");

const suspiciousUserAgentPattern =
  /(curl|wget|python|scrapy|sqlmap|nikto|nmap|masscan|zgrab|headless|postmanruntime|insomnia)/i;

const inMemoryCounters = new Map();
const inMemoryBans = new Map();
const isProduction = process.env.NODE_ENV === "production";
const failClosed =
  process.env.DDOS_FAIL_CLOSED === "true" ||
  (process.env.NODE_ENV === "production" && process.env.DDOS_FAIL_CLOSED !== "false");

let redisClient = null;
let RedisStore = null;
const redisStoreCache = new Map();

(function initRedisSupport() {
  const redisUrl = String(process.env.REDIS_URL || "").trim();
  if (!redisUrl) {
    if (isProduction) {
      throw new Error("REDIS_URL is required in production for distributed DDoS controls.");
    }
    return;
  }

  try {
    const IORedis = require("ioredis");
    ({ RedisStore } = require("rate-limit-redis"));
    redisClient = new IORedis(redisUrl, {
      maxRetriesPerRequest: 2,
      enableAutoPipelining: true,
      enableOfflineQueue: true,
      lazyConnect: false,
      tls: redisUrl.startsWith("rediss://") ? {} : undefined,
    });

    redisClient.on("connect", () => {
      logger.info("✅ Redis connected for distributed security controls.");
    });

    redisClient.on("error", (err) => {
      logger.warn(`⚠️ Redis security backend warning: ${err.message}`);
    });
  } catch (err) {
    if (isProduction) {
      throw new Error(
        `Redis security backend failed to initialize in production: ${err.message}`,
      );
    }
    logger.warn(
      `⚠️ Redis/rate-limit-redis packages unavailable, fallback to memory guards: ${err.message}`,
    );
    redisClient = null;
    RedisStore = null;
  }
})();

function now() {
  return Date.now();
}

function normalizeIp(rawIp) {
  if (!rawIp) return "unknown";
  const value = String(rawIp).trim();
  if (value.startsWith("::ffff:")) return value.substring(7);
  return value;
}

function pruneExpiredMemoryEntries() {
  const ts = now();
  for (const [key, record] of inMemoryCounters.entries()) {
    if (record.expiresAt <= ts) {
      inMemoryCounters.delete(key);
    }
  }

  for (const [key, record] of inMemoryBans.entries()) {
    if (record.expiresAt <= ts) {
      inMemoryBans.delete(key);
    }
  }
}

function getExpressRateLimitStore(redisPrefix) {
  if (!redisClient || !RedisStore) return {};

  if (!redisStoreCache.has(redisPrefix)) {
    redisStoreCache.set(
      redisPrefix,
      new RedisStore({
        prefix: redisPrefix,
        // ioredis uses `.call(command, ...args)`.
        sendCommand: (command, ...args) => redisClient.call(command, ...args),
      }),
    );
  }

  return { store: redisStoreCache.get(redisPrefix) };
}

function createUserAwareRateLimiter({
  windowMs,
  max,
  message,
  keyGenerator,
  skip,
  redisPrefix,
}) {
  return rateLimit({
    windowMs,
    max,
    keyGenerator,
    skip,
    ...getExpressRateLimitStore(redisPrefix),
    standardHeaders: true,
    legacyHeaders: false,
    message,
  });
}

async function redisIncrWithWindow(key, ttlMs) {
  if (!redisClient) {
    throw new Error("Redis client is not available for distributed limiter increment.");
  }
  const multi = redisClient.multi();
  multi.incr(key);
  multi.pexpire(key, ttlMs);
  const results = await multi.exec();
  const value = Array.isArray(results) ? Number(results[0]?.[1] ?? 0) : 0;
  return Number.isFinite(value) ? value : 0;
}

function memoryIncrWithWindow(key, ttlMs) {
  pruneExpiredMemoryEntries();
  const existing = inMemoryCounters.get(key);
  const ts = now();
  if (!existing || existing.expiresAt <= ts) {
    inMemoryCounters.set(key, { count: 1, expiresAt: ts + ttlMs });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

async function getBan(key) {
  if (redisClient) {
    return redisClient.get(key);
  }

  if (isProduction) {
    throw new Error("Redis security backend unavailable while checking ban state.");
  }

  pruneExpiredMemoryEntries();
  const record = inMemoryBans.get(key);
  if (!record || record.expiresAt <= now()) return null;
  return String(record.value || "1");
}

async function setBan(key, ttlMs, value = "1") {
  if (redisClient) {
    await redisClient.psetex(key, ttlMs, String(value));
    return;
  }

  if (isProduction) {
    throw new Error("Redis security backend unavailable while setting ban state.");
  }

  inMemoryBans.set(key, { value: String(value), expiresAt: now() + ttlMs });
}

async function incrementWindowCounter(key, ttlMs) {
  if (redisClient) {
    return redisIncrWithWindow(key, ttlMs);
  }
  return memoryIncrWithWindow(key, ttlMs);
}

function getHeaderCount(rawHeaderValue) {
  if (!rawHeaderValue || typeof rawHeaderValue !== "string") return 0;
  return rawHeaderValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function createDdosAnomalyGuard({
  bucketMs = 10_000,
  maxPerBucket = 120,
  scoreThreshold = 4,
  banMs = 10 * 60 * 1000,
} = {}) {
  return async (req, res, next) => {
    try {
      const ip = normalizeIp(req.ip);
      const banKey = `ddos:ban:${ip}`;
      const banned = await getBan(banKey);
      if (banned) {
        return res.status(429).json({ error: "Suspicious traffic temporarily blocked." });
      }

      const userAgent = String(req.get("user-agent") || "");
      const xffCount = getHeaderCount(String(req.get("x-forwarded-for") || ""));
      let score = 0;

      if (!userAgent || suspiciousUserAgentPattern.test(userAgent)) score += 3;
      if (!req.get("accept")) score += 1;
      if (req.method === "POST" && !req.get("content-type")) score += 1;
      if (xffCount > 5) score += 2;

      const bucket = Math.floor(now() / bucketMs);
      const burstKey = `ddos:burst:${ip}:${bucket}`;
      const burstCount = await incrementWindowCounter(burstKey, bucketMs + 2500);
      if (burstCount > maxPerBucket) score += 3;

      if (score >= scoreThreshold) {
        await setBan(
          banKey,
          banMs,
          JSON.stringify({ score, at: new Date().toISOString() }),
        );
        logger.warn(`🚫 Temporary DDoS ban applied to ${ip} (score=${score})`);
        return res.status(429).json({ error: "Suspicious traffic temporarily blocked." });
      }
    } catch (err) {
      logger.warn(`⚠️ ddos anomaly guard fallback open: ${err.message}`);
      if (failClosed) {
        return res.status(503).json({ error: "Security protection temporarily unavailable." });
      }
    }

    return next();
  };
}

function createDistributedWindowLimiter({
  keyPrefix,
  windowMs,
  max,
  message,
  getKey,
}) {
  return async (req, res, next) => {
    try {
      const keyPart = String(getKey(req));
      const bucket = Math.floor(now() / windowMs);
      const key = `${keyPrefix}:${keyPart}:${bucket}`;
      const count = await incrementWindowCounter(key, windowMs + 2500);

      if (count > max) {
        res.setHeader("Retry-After", Math.ceil(windowMs / 1000));
        return res.status(429).json({ error: message });
      }
    } catch (err) {
      logger.warn(`⚠️ distributed limiter fallback open: ${err.message}`);
      if (failClosed) {
        return res.status(503).json({ error: "Security protection temporarily unavailable." });
      }
    }

    return next();
  };
}

async function closeDdosRedisClient() {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch {
    try {
      redisClient.disconnect();
    } catch {
      // ignore
    }
  }
}

module.exports = {
  createDdosAnomalyGuard,
  createDistributedWindowLimiter,
  createUserAwareRateLimiter,
  closeDdosRedisClient,
};
