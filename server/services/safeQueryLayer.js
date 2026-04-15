const sequelize = require("../models");
const { createCircuitBreaker } = require("../utils/circuitBreaker");

const dbQueryBreaker = createCircuitBreaker({
    name: "db-query-layer",
    failureThreshold: Number(process.env.DB_CIRCUIT_FAILURE_THRESHOLD || 5),
    recoveryTimeMs: Number(process.env.DB_CIRCUIT_RECOVERY_MS || 30_000),
    halfOpenSuccesses: Number(process.env.DB_CIRCUIT_HALF_OPEN_SUCCESSES || 2),
});

async function runQueryWithCircuitBreaker(queryFn) {
    return dbQueryBreaker.execute(queryFn, {
        timeoutMs: Number(process.env.DB_CIRCUIT_TIMEOUT_MS || 4_000),
    });
}

async function executeReadOnlyQuery(sql, options = {}) {
    const upperSql = String(sql).trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("SHOW") && !upperSql.startsWith("DESCRIBE")) {
        throw new Error("Security Violation: Only SELECT/SHOW/DESCRIBE permitted in read-only layer.");
    }
    return await runQueryWithCircuitBreaker(() => sequelize.query(sql, options));
}

async function executeWriteQuery(sql, options = {}) {
    const upperSql = String(sql).trim().toUpperCase();
    if (
        !upperSql.startsWith("UPDATE") &&
        !upperSql.startsWith("DELETE") &&
        !upperSql.startsWith("INSERT")
    ) {
        throw new Error("Security Violation: Only INSERT/UPDATE/DELETE permitted in write layer.");
    }
    return await runQueryWithCircuitBreaker(() => sequelize.query(sql, options));
}

module.exports = { executeReadOnlyQuery, executeWriteQuery };
