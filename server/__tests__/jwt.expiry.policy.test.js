const jwt = require("jsonwebtoken");

describe("JWT expiry policy", () => {
  const baseEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...baseEnv };
    jest.resetModules();
  });

  test("caps unsafe production JWT_EXPIRES_IN to hardened default", () => {
    process.env.NODE_ENV = "production";
    process.env.DB_PASSWORD = "test-db-password";
    process.env.DB_HOST = "localhost";
    process.env.DB_NAME = "test_db";
    process.env.DB_USER = "test_user";
    process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.JWT_EXPIRES_IN = "7d";

    jest.resetModules();
    const { generateToken } = require("../middleware/auth");

    const token = generateToken(1, "student", 0, "student@example.com");
    const decoded = jwt.decode(token);

    const ttlSeconds = Number(decoded.exp) - Number(decoded.iat);
    expect(ttlSeconds).toBeGreaterThanOrEqual(7190);
    expect(ttlSeconds).toBeLessThanOrEqual(7210);
  });

  test("keeps secure production JWT_EXPIRES_IN values", () => {
    process.env.NODE_ENV = "production";
    process.env.DB_PASSWORD = "test-db-password";
    process.env.DB_HOST = "localhost";
    process.env.DB_NAME = "test_db";
    process.env.DB_USER = "test_user";
    process.env.JWT_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.JWT_EXPIRES_IN = "6h";

    jest.resetModules();
    const { generateToken } = require("../middleware/auth");

    const token = generateToken(2, "admin", 0, "admin@example.com");
    const decoded = jwt.decode(token);

    const ttlSeconds = Number(decoded.exp) - Number(decoded.iat);
    expect(ttlSeconds).toBeGreaterThanOrEqual(21590);
    expect(ttlSeconds).toBeLessThanOrEqual(21610);
  });
});
