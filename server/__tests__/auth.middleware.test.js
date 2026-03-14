/**
 * @file Unit tests for auth middleware — generateToken, authenticate, requireAdmin, brute-force
 */
const jwt = require('jsonwebtoken');

// Must be set before requiring auth module
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.ADMIN_EMAILS = 'admin@test.com';
process.env.NODE_ENV = 'test';

const { generateToken, authenticate, requireAdmin } = require('../middleware/auth');

describe('generateToken()', () => {
    test('should return a valid JWT string', () => {
        const token = generateToken(1, 'student', 0);
        expect(typeof token).toBe('string');
        expect(token.split('.')).toHaveLength(3);
    });

    test('should embed correct payload (userId, role, tokenVersion, jti)', () => {
        const token = generateToken(42, 'admin', 3);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.userId).toBe(42);
        expect(decoded.role).toBe('admin');
        expect(decoded.tokenVersion).toBe(3);
        expect(decoded.jti).toBeDefined();
    });

    test('should default tokenVersion to 0', () => {
        const token = generateToken(1, 'student');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.tokenVersion).toBe(0);
    });

    test('should set expiry (7d)', () => {
        const token = generateToken(1, 'student', 0);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.exp).toBeDefined();
        const now = Math.floor(Date.now() / 1000);
        // Should expire between 6 and 8 days from now
        expect(decoded.exp - now).toBeGreaterThan(6 * 24 * 3600);
        expect(decoded.exp - now).toBeLessThan(8 * 24 * 3600);
    });

    test('should include normalized email claim when provided', () => {
        const token = generateToken(9, 'student', 1, 'Student@Test.COM');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.email).toBe('student@test.com');
    });

    test('should keep email claim undefined when not provided', () => {
        const token = generateToken(9, 'student', 1);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        expect(decoded.email).toBeUndefined();
    });
});

describe('authenticate middleware', () => {
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };

    test('should return 401 if no Authorization header', async () => {
        const req = { headers: {} };
        const res = mockRes();
        const next = jest.fn();
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 401 if token is malformed', async () => {
        const req = { headers: { authorization: 'Bearer invalid.token.here' } };
        const res = mockRes();
        const next = jest.fn();
        await authenticate(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('requireAdmin middleware', () => {
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };

    test('should call next() if user is admin', () => {
        const req = { user: { role: 'admin' } };
        const res = mockRes();
        const next = jest.fn();
        requireAdmin(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('should return 403 if user is not admin', () => {
        const req = { user: { role: 'student' } };
        const res = mockRes();
        const next = jest.fn();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('should return 403 if req.user is missing', () => {
        const req = {};
        const res = mockRes();
        const next = jest.fn();
        requireAdmin(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});
