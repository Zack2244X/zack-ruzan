/**
 * @file Jest global setup – sets environment to 'test'
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests';
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.ADMIN_EMAILS = 'admin@test.com';
