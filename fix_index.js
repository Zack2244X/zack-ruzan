const fs = require('fs');

const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Fix the top level middleware for nonce
const badChunk = \`const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'محاولات كثيرة، حاول بعد 15 دقيقة'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

    res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
    next();
});\`;

const goodChunk = \`
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
});\`;

if (code.includes(badChunk)) {
  code = code.replace(badChunk, goodChunk);
}

// 2. Remove the helmet setup completely and replace it with custom + reduced helmet
let newHelmet = \`// 1. Helmet — هيدرز أمان شاملة (بدون CSP حيث يتم إضافته مخصصاً)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
        maxAge: 31536000, // 1 سنة
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
});
\`;

// Replace from "app.use(helmet({" up to "}));" before "// ✅ ENCRYPTION"
const startStr = "// 1. Helmet — هيدرز أمان شاملة\napp.use(helmet({";
const endStr = "}));\n\n// ✅ ENCRYPTION";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
    const toReplace = code.substring(startIndex, endIndex + "}));".length);
    code = code.replace(toReplace, newHelmet);
}

fs.writeFileSync(file, code);

