/**
 * @file API docs endpoint tests
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";

const request = require("supertest");
const app = require("../index");

describe("API docs endpoints", () => {
  test("GET /api/docs.json should return OpenAPI document", async () => {
    const res = await request(app).get("/api/docs.json");
    expect(res.statusCode).toBe(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.paths).toBeDefined();
  });

  test("GET /api/docs should return docs HTML", async () => {
    const res = await request(app).get("/api/docs");
    expect(res.statusCode).toBe(200);
    expect(String(res.text || "")).toContain("/api/docs.json");
  });
});
