describe("encryption startup guard", () => {
  const originalEnv = process.env.ENCRYPTION_KEY;

  afterEach(() => {
    if (typeof originalEnv === "string") {
      process.env.ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
    jest.resetModules();
  });

  test("should crash on startup when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    jest.resetModules();

    expect(() => require("../utils/encryption")).toThrow(
      "CRITICAL: Missing Encryption Key",
    );
  });
});
