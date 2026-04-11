const fs = require('fs');

const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

// The replacement code
const newHelmet = \`// 1. Add Nonce generation middleware
const crypto = require('crypto');
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// 2. Helmet — هيدرز أمان شاملة
app.use(helmet({
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
});
\`;

function replaceHelmetBlock() {
   const startIdx = code.indexOf("app.use(helmet({");
   if (startIdx === -1) return;
   const searchEnd = "    }\n}));";
   const endIdx = code.indexOf(searchEnd, startIdx);
   if (endIdx === -1) return;
   
   const oldBlock = code.substring(startIdx, endIdx + searchEnd.length);
   code = code.replace(oldBlock, newHelmet);
}
replaceHelmetBlock();

// Ensure res.locals.cspNonce uses res.locals.nonce for any injectNonceIntoHtml fallback
code = code.replace(/const nonce = res\.locals\.cspNonce;/g, "const nonce = res.locals.nonce;");

fs.writeFileSync(file, code);
