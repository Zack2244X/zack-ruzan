/**
 * @file Unit tests for sanitize middleware
 */
process.env.NODE_ENV = 'test';

const { sanitizeBody } = require('../middleware/sanitize');

describe('sanitizeBody middleware', () => {
    const mockRes = () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        return res;
    };

    test('should escape/strip HTML tags from string body values', () => {
        const req = { body: { name: '<script>alert("xss")</script>Hello' } };
        const res = mockRes();
        const next = jest.fn();
        sanitizeBody(req, res, next);
        // disallowedTagsMode: recursiveEscape → encodes disallowed tags
        expect(req.body.name).not.toContain('<script>');
        expect(req.body.name).toContain('Hello');
        expect(next).toHaveBeenCalled();
    });

    test('should recursively sanitize nested objects', () => {
        const req = {
            body: {
                config: {
                    title: '<img onerror=alert(1) src=x>Test',
                    description: 'Clean text'
                }
            }
        };
        const res = mockRes();
        const next = jest.fn();
        sanitizeBody(req, res, next);
        expect(req.body.config.title).not.toContain('<img');
        expect(req.body.config.title).toContain('Test');
        expect(req.body.config.description).toBe('Clean text');
        expect(next).toHaveBeenCalled();
    });

    test('should sanitize strings in arrays', () => {
        const req = {
            body: {
                items: ['<b>bold</b>', '<script>x</script>clean']
            }
        };
        const res = mockRes();
        const next = jest.fn();
        sanitizeBody(req, res, next);
        expect(req.body.items[0]).not.toContain('<b>');
        expect(req.body.items[1]).toContain('clean');
        expect(req.body.items[1]).not.toContain('<script>');
        expect(next).toHaveBeenCalled();
    });

    test('should not modify non-string values', () => {
        const req = { body: { count: 42, active: true, items: null } };
        const res = mockRes();
        const next = jest.fn();
        sanitizeBody(req, res, next);
        expect(req.body.count).toBe(42);
        expect(req.body.active).toBe(true);
        expect(req.body.items).toBeNull();
        expect(next).toHaveBeenCalled();
    });

    test('should call next() even with empty body', () => {
        const req = { body: {} };
        const res = mockRes();
        const next = jest.fn();
        sanitizeBody(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});
