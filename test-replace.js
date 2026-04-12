const fs = require('fs');
let content = fs.readFileSync('server/index.js', 'utf8');

const oldCsp = `    [
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
      "frame-ancestors 'none'",
    ].join("; "),`;

const newCsp = `    [
      "default-src 'self'",
      "script-src 'self' 'nonce-" + res.locals.nonce + "'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),`;

content = content.replace(oldCsp, newCsp);
fs.writeFileSync('server/index.js.new', content);
