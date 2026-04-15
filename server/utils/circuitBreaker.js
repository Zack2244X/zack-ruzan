const logger = require("./logger");

const STATE_CLOSED = "CLOSED";
const STATE_OPEN = "OPEN";
const STATE_HALF_OPEN = "HALF_OPEN";

function withTimeout(promiseFactory, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promiseFactory();

  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(`${label || "operation"} timed out`);
      err.code = "CIRCUIT_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });

  return Promise.race([promiseFactory(), timeoutPromise]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

function createCircuitBreaker({
  name,
  failureThreshold = 5,
  recoveryTimeMs = 30_000,
  halfOpenSuccesses = 2,
  halfOpenMaxInFlight = 1,
} = {}) {
  const breakerName = name || "unnamed";

  let state = STATE_CLOSED;
  let failureCount = 0;
  let lastFailureAt = 0;
  let halfOpenSuccessCount = 0;
  let halfOpenInFlight = 0;

  function moveToOpen(lastError) {
    state = STATE_OPEN;
    lastFailureAt = Date.now();
    halfOpenSuccessCount = 0;
    logger.warn(
      `⚠️ Circuit open: ${breakerName} (failures=${failureCount}, error=${lastError?.message || "unknown"})`,
    );
  }

  function moveToHalfOpen() {
    state = STATE_HALF_OPEN;
    halfOpenSuccessCount = 0;
    halfOpenInFlight = 0;
    logger.info(`🧪 Circuit half-open: ${breakerName}`);
  }

  function moveToClosed() {
    state = STATE_CLOSED;
    failureCount = 0;
    halfOpenSuccessCount = 0;
    halfOpenInFlight = 0;
    logger.info(`✅ Circuit closed: ${breakerName}`);
  }

  function mayProceed() {
    if (state !== STATE_OPEN) return true;
    const elapsed = Date.now() - lastFailureAt;
    if (elapsed >= recoveryTimeMs) {
      moveToHalfOpen();
      return true;
    }
    return false;
  }

  async function execute(operation, options = {}) {
    const { timeoutMs = 0, onOpenFailure } = options;

    if (typeof operation !== "function") {
      throw new TypeError("Circuit breaker execute requires a function.");
    }

    if (!mayProceed()) {
      const openErr = new Error(`Circuit is open for ${breakerName}`);
      openErr.code = "CIRCUIT_OPEN";
      if (typeof onOpenFailure === "function") {
        return onOpenFailure(openErr);
      }
      throw openErr;
    }

    if (state === STATE_HALF_OPEN && halfOpenInFlight >= halfOpenMaxInFlight) {
      const busyErr = new Error(`Circuit half-open is busy for ${breakerName}`);
      busyErr.code = "CIRCUIT_HALF_OPEN_BUSY";
      if (typeof onOpenFailure === "function") {
        return onOpenFailure(busyErr);
      }
      throw busyErr;
    }

    if (state === STATE_HALF_OPEN) {
      halfOpenInFlight += 1;
    }

    try {
      const result = await withTimeout(operation, timeoutMs, breakerName);

      if (state === STATE_HALF_OPEN) {
        halfOpenSuccessCount += 1;
        if (halfOpenSuccessCount >= halfOpenSuccesses) {
          moveToClosed();
        }
      } else {
        failureCount = 0;
      }

      return result;
    } catch (error) {
      failureCount += 1;
      halfOpenSuccessCount = 0;

      const mustOpen =
        state === STATE_HALF_OPEN || failureCount >= failureThreshold;
      if (mustOpen) {
        moveToOpen(error);
      }

      throw error;
    } finally {
      if (halfOpenInFlight > 0) {
        halfOpenInFlight -= 1;
      }
    }
  }

  function getState() {
    return {
      name: breakerName,
      state,
      failureCount,
      lastFailureAt,
      halfOpenSuccessCount,
      halfOpenInFlight,
      failureThreshold,
      recoveryTimeMs,
    };
  }

  function forceReset() {
    moveToClosed();
  }

  return {
    execute,
    getState,
    forceReset,
  };
}

module.exports = {
  createCircuitBreaker,
  STATE_CLOSED,
  STATE_OPEN,
  STATE_HALF_OPEN,
};
