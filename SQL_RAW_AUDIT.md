# SQL Raw Audit
| File | Query | Justification |
|------|-------|---------------|
| server/routes/auth.js | \`SELECT ... account_sessions\` | Safe: Uses structured parameters \`^{...}\` for boolean toggle. No user input dynamically injected. |
| server/routes/auth.js | \`UPDATE blocked_devices SET \${updateFields.join(", ")} WHERE id = ?\` | Safe: \`updateFields\` are generated internally from controller logic mapped statically, values passed as parameterized bound array. |
| server/middleware/auth.js | \`SELECT count, last_attempt FROM login_attempts WHERE ip = ?\` | Safe: Uses \`?\` placeholders. |
| server/index.js | \`SHOW COLUMNS FROM blocked_devices\` | Safe: System query, no user input. |

