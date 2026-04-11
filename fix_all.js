const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function replaceInFile(filePath, search, replace) {
  if (fs.existsSync(filePath)) {
    const original = fs.readFileSync(filePath, "utf8");
    const updated = original.replace(search, replace);
    if (original !== updated) {
      fs.writeFileSync(filePath, updated);
      console.log(`Updated ${filePath}`);
    }
  }
}

function globalReplace(dir, regex, replaceFn) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== "node_modules" && file !== ".git") {
        globalReplace(fullPath, regex, replaceFn);
      }
    } else if (file.endsWith(".js") || file.endsWith(".html")) {
      const original = fs.readFileSync(fullPath, "utf8");
      const updated = original.replace(regex, replaceFn);
      if (original !== updated) {
        fs.writeFileSync(fullPath, updated);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

// 1 & 2. Add express-rate-limit and cookie-parser to index.js
const indexFile = "server/index.js";
if (fs.existsSync(indexFile)) {
  let content = fs.readFileSync(indexFile, "utf8");

  if (!content.includes("cookie-parser")) {
    content = content.replace(
      /(const express = require\('express'\);)/,
      "$1\nconst cookieParser = require('cookie-parser');",
    );
    content = content.replace(
      /(app\.use\(express\.json\(\)\);)/,
      "$1\napp.use(cookieParser());",
    );
  }

  // Find authLimiter
  if (!content.includes("app.use('/api/auth/login', authLimiter);")) {
    content = content.replace(/app\.use\('\/api\/auth'.*authLimiter.*\n?/g, "");
    const limiterCode = `
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'محاولات كثيرة، حاول بعد 15 دقيقة'
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
`;
    content = content.replace(
      /const authLimiter = rateLimit\(\{[\s\S]*?\}\);/g,
      "",
    ); // remove previous
    content = content.replace(/(app\.use\(.*\n){1}/, `$1\n${limiterCode}\n`);
  }

  fs.writeFileSync(indexFile, content);
  console.log("Updated server/index.js with rateLimit and cookie-parser");
}

// Update routes to set cookie instead of just returning token
globalReplace(
  "server/routes",
  /(res\.json\(\s*\{\s*success:\s*true,\s*[^}]*token[^\n]*\};?)/g,
  (match) => {
    return (
      `res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    ` + match
    );
  },
);
globalReplace(
  "server/routes",
  /res\.status\((200|201)\)\.json\(\s*\{[\s\S]*?token[\s\S]*?\}\s*\);?/g,
  (match) => {
    if (match.includes("res.cookie")) return match;
    return (
      `res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });\n    ` + match
    );
  },
);

globalReplace("server", /res\.json\(\s*\{[^}]*token[^}]*\}\s*\)/g, (match) => {
  if (match.includes("res.cookie")) return match;
  return (
    `res.cookie('token', token || typeof token !== "undefined" ? token : jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });\n    ` + match
  );
});

// 3. Update frontend logic to fetch with credentials and remove localStorage token logic
globalReplace(
  "client/js",
  /localStorage\.setItem\(['"`]token['"`],\s*([^)]+)\);?/g,
  "// Token handled by cookies",
);
globalReplace(
  "client/js",
  /['"`]Authorization['"`]:\s*[`'"]Bearer\s*[`'"]\s*\+\s*localStorage\.getItem\(['"`]token['"`]\)/g,
  "",
);
globalReplace(
  "client/js",
  /Authorization:\s*`Bearer \$\{localStorage\.getItem\(['"`]token['"`]\)\}`/g,
  "",
);
globalReplace(
  "client/js",
  /localStorage\.getItem\(['"`]token['"`]\)/g,
  "null /* using cookies */",
);
globalReplace(
  "client/js",
  /fetch\s*\(([^,]+),\s*\{/g,
  "fetch($1, {\n      credentials: 'include',",
);

console.log("Fixes applied.");
