/**
 * @file API docs endpoint tests
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.ENABLE_API_DOCS = "true";

const request = require("supertest");
const app = require("../index");

describe("API docs endpoints", () => {
  test("GET /api-docs should serve or redirect to docs UI", async () => {
    const res = await request(app).get("/api-docs");
    expect([200, 301, 302]).toContain(res.statusCode);
  });

  test("GET /api-docs/ should return docs HTML", async () => {
    const res = await request(app).get("/api-docs/");
    expect(res.statusCode).toBe(200);
    expect(String(res.text || "").toLowerCase()).toContain("swagger");
  });
});
