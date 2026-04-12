const fs = require('fs');
let code = fs.readFileSync('server/middleware/auth.js', 'utf8');

// Add the import to the top if not exists
if (!code.includes('../services/safeQueryLayer')) {
  code = code.replace(
    'const jwt = require("jsonwebtoken");',
    'const jwt = require("jsonwebtoken");\nconst dbLayer = require("../services/safeQueryLayer");'
  );
}

// Remove lazy `require("../models/index")` inside checkBruteForce and others
code = code.replace(/const sequelize = require\("\.\.\/models\/index"\);\s*/g, '');

// Replace queries one by one
// 1. SELECT query in checkBruteForce
code = code.replace(
  /const \[\[record\]\] = await sequelize\.query\(/g,
  'const [[record]] = await dbLayer.executeReadOnlyQuery('
);

// 2. DELETE in checkBruteForce
code = code.replace(
  /sequelize\s*\.query\("DELETE FROM `login_attempts` WHERE `ip` = \?",/g,
  'dbLayer.executeWriteQuery("DELETE FROM `login_attempts` WHERE `ip` = ?",\n'
);

// 3. INSERT / UPDATE in recordFailedAttempt
code = code.replace(
  /await sequelize\.query\(\s*"INSERT INTO `login_attempts`/g,
  'await dbLayer.executeWriteQuery(\n    "INSERT INTO `login_attempts`'
);

// 4. DELETE in clearFailedAttempts
code = code.replace(
  /await sequelize\.query\("DELETE FROM `login_attempts` WHERE `ip` = \?",/g,
  'await dbLayer.executeWriteQuery("DELETE FROM `login_attempts` WHERE `ip` = ?",\n'
);

fs.writeFileSync('server/middleware/auth.js', code);
