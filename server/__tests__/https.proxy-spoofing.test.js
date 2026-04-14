const {
  enforceHttps,
} = require("../middleware/encryption-security");

describe("enforceHttps proxy trust hardening", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function createMockReq({
    protocol = "http",
    hostname = "app.example.com",
    host = "app.example.com",
    originalUrl = "/api/health",
    forwardedProto = "",
    remoteAddress = "203.0.113.10",
  } = {}) {
    return {
      protocol,
      hostname,
      originalUrl,
      socket: { remoteAddress },
      get: (header) => {
        const key = String(header || "").toLowerCase();
        if (key === "x-forwarded-proto") return forwardedProto;
        if (key === "host") return host;
        return "";
      },
    };
  }

  function createMockRes() {
    const res = {
      statusCode: 200,
      payload: null,
      redirectUrl: "",
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.payload = body;
        return this;
      },
      redirect(code, url) {
        this.statusCode = code;
        this.redirectUrl = url;
        return this;
      },
    };
    return res;
  }

  test("ignores spoofed X-Forwarded-Proto from untrusted source", () => {
    process.env.NODE_ENV = "production";
    process.env.TRUSTED_PROXY_IPS = "10.0.0.2";

    const req = createMockReq({
      protocol: "http",
      forwardedProto: "https",
      remoteAddress: "198.51.100.22",
    });
    const res = createMockRes();
    const next = jest.fn();

    enforceHttps(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(301);
    expect(res.redirectUrl).toBe("https://app.example.com/api/health");
  });

  test("trusts forwarded proto only from trusted proxy source", () => {
    process.env.NODE_ENV = "production";
    process.env.TRUSTED_PROXY_IPS = "10.0.0.2";

    const req = createMockReq({
      protocol: "http",
      forwardedProto: "https",
      remoteAddress: "10.0.0.2",
    });
    const res = createMockRes();
    const next = jest.fn();

    enforceHttps(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.redirectUrl).toBe("");
  });

  test("rejects invalid host header when building redirect", () => {
    process.env.NODE_ENV = "production";

    const req = createMockReq({
      host: "bad host value",
      hostname: "",
      forwardedProto: "",
    });
    const res = createMockRes();
    const next = jest.fn();

    enforceHttps(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({ error: "Invalid host header" });
  });
});
