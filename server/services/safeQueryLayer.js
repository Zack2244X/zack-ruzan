const sequelize = require("../models");

async function executeReadOnlyQuery(sql, options = {}) {
    const upperSql = String(sql).trim().toUpperCase();
    if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("SHOW") && !upperSql.startsWith("DESCRIBE")) {
        throw new Error("Security Violation: Only SELECT/SHOW/DESCRIBE permitted in read-only layer.");
    }
    return await sequelize.query(sql, options);
}

async function executeWriteQuery(sql, options = {}) {
    const upperSql = String(sql).trim().toUpperCase();
    if (!upperSql.startsWith("UPDATE") && !upperSql.startsWith("DELETE")) {
        throw new Error("Security Violation: Only UPDATE/DELETE permitted in write layer.");
    }
    return await sequelize.query(sql, options);
}

module.exports = { executeReadOnlyQuery, executeWriteQuery };
