const { buildSanitizedErrorLog } = require("../utils/secureErrorLog");

describe("secure logging sanitization", () => {
  const prevLogLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    process.env.LOG_LEVEL = prevLogLevel;
  });

  test("should not leak stack traces or raw SQL in non-debug mode", () => {
    process.env.LOG_LEVEL = "info";

    const fakeError = new Error("Synthetic failure for test");
    fakeError.code = "E_DB_FAIL";
    fakeError.stack =
      "TypeError: Boom\\n    at Function.fake (/srv/app/file.js:10:2)\\n    at run (/srv/app/main.js:1:1)";
    fakeError.sql = "SELECT * FROM users WHERE email = 'attacker@example.com'";

    const logObj = buildSanitizedErrorLog(fakeError, "unit-test-operation", "op-test-1");
    const serialized = JSON.stringify(logObj);

    expect(serialized).toContain("Synthetic failure for test");
    expect(serialized).toContain("Database Operation Failed");
    expect(serialized).not.toMatch(/at Function/i);
    expect(serialized).not.toMatch(/TypeError/i);
    expect(serialized).not.toMatch(/SELECT\s+\*/i);
    expect(logObj).not.toHaveProperty("stack");
  });
});
