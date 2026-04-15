/**
 * @file Unit tests for circuit breaker utility
 */

const { createCircuitBreaker } = require("../utils/circuitBreaker");

describe("createCircuitBreaker", () => {
  test("opens after threshold failures and blocks immediate retries", async () => {
    const breaker = createCircuitBreaker({
      name: "test-db",
      failureThreshold: 2,
      recoveryTimeMs: 100,
      halfOpenSuccesses: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error("db failure 1");
      }),
    ).rejects.toThrow("db failure 1");

    await expect(
      breaker.execute(async () => {
        throw new Error("db failure 2");
      }),
    ).rejects.toThrow("db failure 2");

    await expect(breaker.execute(async () => "ok")).rejects.toMatchObject({
      code: "CIRCUIT_OPEN",
    });
    expect(breaker.getState().state).toBe("OPEN");
  });

  test("recovers via half-open and closes after successful probe", async () => {
    const breaker = createCircuitBreaker({
      name: "test-recovery",
      failureThreshold: 1,
      recoveryTimeMs: 25,
      halfOpenSuccesses: 1,
    });

    await expect(
      breaker.execute(async () => {
        throw new Error("temporary failure");
      }),
    ).rejects.toThrow("temporary failure");

    await new Promise((resolve) => setTimeout(resolve, 40));

    await expect(breaker.execute(async () => "healthy")).resolves.toBe("healthy");
    expect(breaker.getState().state).toBe("CLOSED");
  });
});
