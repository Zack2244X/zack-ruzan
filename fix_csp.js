const fs = require('fs');

const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Fix the broken app.use containing rateLimiter by extracting it
code = code.replace(/app\.use\(\(req,\s*res,\s*next\)\s*=>\s*\{\s*const authLimiter = rateLimit\(\{[\s\S]*?\}\);\s*app\.use\('\/api\/auth\/login',\s*authLimiter\);\s*app\.use\('\/api\/auth\/register',\s*authLimiter\);\s*res\.locals\.cspNonce\s*=\s*crypto\.randomBytes\(16\)\.toString\('base64'\);\s*next\(\);\s*\}\);/, \`
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'محاولات كثيرة، حاول بعد 15 دقيقة'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  // For backwards compatibility in this file
  res.locals.cspNonce = res.locals.nonce;
  next();
});
\`);

// Also fix if it was slightly differently formatted
code = code.replace(/app\.use\(\(req,\s*res,\s*next\)\s*=>\s*\{\s*\n\nconst authLimiter = rateLimit\(\{[\s\S]*?\}\);\napp\.use\('\/api\/auth\/login',\s*authLimiter\);\napp\.use\('\/api\/auth\/register',\s*authLimiter\);\n\s*res\.locals\.cspNonce\s*=\s*crypto\.randomBytes\(16\)\.toString\('base64'\);\s*next\(\);\n\}\);/, \`
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'محاولات كثيرة، حاول بعد 15 دقيقة'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = res.locals.nonce;
  next();
});
\`);

// 2. Remove Helmet's CSP and replace with raw custom middleware
// First, disable helmet CSP
code = code.replace(/app\.use\(helmet\(\{\s*contentSecurityPolicy:\s*\{[\s\S]*?\},\s*crossOriginEmbedderPolicy:\s*\{[\s\S]*?\}\s*\}\)\);/g, "app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));");
code = code.replace(/app\.use\(helmet\(\{[\s\S]*?contentSecurityPolicy:[\s\S]*?\}\)\);/g, "app.use(helmet({ contentSecurityPolicy: false }));");

// Add custom CSP middleware directly after helmet
if (!code.includes("res.setHeader('Content-Security-Policy'")) {
    const cspMiddleware = \`
// Custom strict CSP
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + res.locals.nonce + "'",
    "script-src-attr 'none'",
    "style-src 'self' 'nonce-" + res.locals.nonce + "'",
    "style-src-attr 'none'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https://api.example.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});
\`;
  code = code.replace(/app\.use\(helmet\(\{ contentSecurityPolicy: false \}\)\);/, "app.use(helmet({ contentSecurityPolicy: false }));\n" + cspMiddleware);
}

fs.writeFileSync(file, code);
