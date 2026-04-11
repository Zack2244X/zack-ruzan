const fs = require('fs');
const file = 'server/index.js';
let code = fs.readFileSync(file, 'utf8');

const newHelmet = \`// 1. Add Nonce generation middleware
// app.use crypto generated nonce
app.use((req, res, next) => {
  res.locals.nonce = require('crypto').randomBytes(16).toString('base64');
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

const startIdx = code.indexOf("app.use(helmet({");
if (startIdx !== -1) {
   let endIdx = code.indexOf("}));", startIdx);
   if (endIdx !== -1) {
       endIdx += 4;
       code = code.substring(0, startIdx) + newHelmet + code.substring(endIdx);
       fs.writeFileSync(file, code);
       console.log("Helmet matched and replaced!");
   } else {
       console.log("Could not find }));");
   }
} else { console.log("Could not find start"); }
