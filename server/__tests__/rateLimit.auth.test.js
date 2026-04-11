/**
 * @file Security test: strict auth rate limiter
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.ADMIN_EMAILS = "admin@test.com";

const request = require("supertest");
const app = require("../index");

describe("Strict auth rate limit", () => {
  test("POST /api/auth/google should be rate-limited after repeated attempts", async () => {
    let saw429 = false;

    for (let i = 0; i < 8; i += 1) {
      const res = await request(app)
        .post("/api/auth/google")
        .send({ idToken: `bad-token-${i}` });

      if (res.statusCode === 429) {
        saw429 = true;
        break;
      }
    }

    expect(saw429).toBe(true);
  });
});
