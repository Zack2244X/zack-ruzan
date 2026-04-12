const fs = require('fs');

const authJsPath = 'server/routes/auth.js';
let content = fs.readFileSync(authJsPath, 'utf8');

// 1. Add imports
if (!content.includes('const BlockedDevice')) {
    content = content.replace(
        'const User = require("../models/User");',
        `const User = require("../models/User");\nconst BlockedDevice = require("../models/BlockedDevice");\nconst AccountSession = require("../models/AccountSession");\nconst { Op } = require("sequelize");`
    );
}

// 2. Remove caching and column-check functions safely
function replaceBetween(startStr, endStr, newStr) {
  const start = content.indexOf(startStr);
  if (start === -1) return;
  const end = content.indexOf(endStr, start);
  if (end === -1) return;
  content = content.substring(0, start) + newStr + content.substring(end + endStr.length);
}

replaceBetween(
  'let accountSessionsColumnsCache = null;',
  'async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {',
  'async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {'
);

replaceBetween(
  'async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {',
  '  return rows && rows.length > 0 ? rows[0] : null;\n}',
`async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {
  const normalizedEmail = sanitizeText(email, 255).toLowerCase();
  const normalizedDeviceId = sanitizeText(deviceId, 120);
  const normalizedIp = sanitizeText(ipAddress, 64);

  const whereConditions = [];
  if (normalizedEmail) whereConditions.push({ email: normalizedEmail });
  if (normalizedDeviceId) whereConditions.push({ deviceId: normalizedDeviceId });
  if (normalizedIp) whereConditions.push({ ipAddress: normalizedIp });

  if (whereConditions.length === 0) return null;

  const b = await BlockedDevice.findOne({
    attributes: ['id', 'reason', 'email', 'deviceId', 'ipAddress'],
    where: { isActive: true, [Op.or]: whereConditions },
    order: [['id', 'DESC']]
  });
  return b ? b.toJSON() : null;
}`
);

fs.writeFileSync(authJsPath, content, 'utf8');
