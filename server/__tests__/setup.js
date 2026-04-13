/**
 * @file Jest global setup – sets environment to 'test'
 */
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests";
process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
process.env.ADMIN_EMAILS = "admin@test.com";
process.env.ENCRYPTION_KEY =
	"9f1c3b0a7e6d5c4b2a1908172635445566778899aabbccddeeff001122334455";
