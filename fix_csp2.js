const fs = require('fs');

const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

// replace helmet completely using a regular expression that matches from app.use(helmet to }));
const goodHelmet = \`app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    permissionsPolicy: {
        features: {
            camera: [],
            microphone: [],
            geolocation: []
        }
    }
}));

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
});\`;

code = code.replace(/app\.use\(helmet\(\{\s*contentSecurityPolicy:[\s\S]*?\}\)\);/m, goodHelmet);

// Let's also fix the nonce middleware logic in case it's still broken
code = code.replace(/app\.use\(\(req,\s*res,\s*next\)\s*=>\s*\{\n\n\nconst authLimiter = rateLimit\(\{[\s\S]*?\}\);\napp\.use\('\/api\/auth\/login',\s*authLimiter\);\napp\.use\('\/api\/auth\/register',\s*authLimiter\);\n\s*res\.locals\.cspNonce\s*=\s*crypto\.randomBytes\(16\)\.toString\('base64'\);\s*next\(\);\n\}\);/gm, 
\`const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'محاولات كثيرة، حاول بعد 15 دقيقة'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = res.locals.nonce; // Keep backward compat
  next();
});\`);

fs.writeFileSync(file, code);
