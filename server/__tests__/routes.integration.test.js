/**
 * @file Integration tests for the health endpoint and static serving
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.ADMIN_EMAILS = 'admin@test.com';

const request = require('supertest');
const app = require('../index');

describe('GET /api/health', () => {
    test('should return 200 with status healthy', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.uptime).toBeDefined();
    });
});

describe('Security headers', () => {
    test('should include X-Content-Type-Options header', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    test('should include X-Frame-Options header', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['x-frame-options']).toBeDefined();
    });
});

describe('API routes return proper errors without auth', () => {
    test('GET /api/quizzes should require authentication', async () => {
        const res = await request(app).get('/api/quizzes');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/scores/my should require authentication', async () => {
        const res = await request(app).get('/api/scores/my');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/notes should require authentication', async () => {
        const res = await request(app).get('/api/notes');
        expect(res.statusCode).toBe(401);
    });

    test('POST /api/auth/google with empty body should return 400', async () => {
        const res = await request(app)
            .post('/api/auth/google')
            .send({});
        expect(res.statusCode).toBe(400);
    });
});

describe('Rate limiting', () => {
    test('should not block the first request', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
    });
});
