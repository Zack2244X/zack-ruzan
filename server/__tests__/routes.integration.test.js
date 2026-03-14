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

    test('should include Strict-Transport-Security header', async () => {
        const res = await request(app).get('/api/health');
        expect(res.headers['strict-transport-security']).toBeDefined();
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

    test('GET /api/auth/accounts-overview should require authentication', async () => {
        const res = await request(app).get('/api/auth/accounts-overview');
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/auth/blocked-devices should require authentication', async () => {
        const res = await request(app).get('/api/auth/blocked-devices');
        expect(res.statusCode).toBe(401);
    });
});

describe('CSRF Protection', () => {
    test('POST /api/auth/logout without CSRF token should return 403', async () => {
        const res = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', 'jwt=fake-token')
            .send({});
        expect(res.statusCode).toBe(403);
    });

    test('POST /api/quizzes without CSRF token should return 403', async () => {
        const res = await request(app)
            .post('/api/quizzes')
            .set('Cookie', 'jwt=fake-token')
            .send({ title: 'test' });
        expect(res.statusCode).toBe(403);
    });

    test('GET /api/quizzes skips CSRF (read-only)', async () => {
        // GET requests must NOT be blocked by CSRF — they return 401 (no auth), not 403
        const res = await request(app).get('/api/quizzes');
        expect(res.statusCode).toBe(401);
    });

    test('POST /api/auth/google skips CSRF (initial login exemption)', async () => {
        // /api/auth/google is explicitly exempt — returns 400 (bad token), not 403
        const res = await request(app)
            .post('/api/auth/google')
            .send({ idToken: 'bad-token' });
        expect([400, 401]).toContain(res.statusCode);
    });
});

describe('Leaderboard endpoint', () => {
    test('GET /api/scores/leaderboard should require authentication', async () => {
        const res = await request(app).get('/api/scores/leaderboard');
        expect(res.statusCode).toBe(401);
    });
});

describe('Rate limiting', () => {
    test('should not block the first request', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
    });
});
