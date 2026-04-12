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
content = content.replace(
    /let accountSessionsColumnsCache[\s\S]*?async function getBlockedDevicesColumns\([^)]*\)\s*\{[\s\S]*?return blockedDevicesColumnsCache;\n\}/g,
    ''
);

// 3. Replace findActiveBlock
content = content.replace(
    /async function findActiveBlock[\s\S]*?  \);[\s\S]*?  return rows\.length > 0 \? rows\[0\] : null;\n\}/,
`async function findActiveBlock({ email = "", deviceId = "", ipAddress = "" }) {
  const normalizedEmail = sanitizeText(email, 255).toLowerCase();
  const normalizedDeviceId = sanitizeText(deviceId, 120);
  const normalizedIp = sanitizeText(ipAddress, 64);

  const whereConditions = [];
  if (normalizedEmail) whereConditions.push({ email: normalizedEmail });
  if (normalizedDeviceId) whereConditions.push({ deviceId: normalizedDeviceId });
  if (normalizedIp) whereConditions.push({ ipAddress: normalizedIp });

  if (whereConditions.length === 0) return null;

  return await BlockedDevice.findOne({
    attributes: ['id', 'reason', 'email', 'deviceId', 'ipAddress'],
    where: {
      isActive: true,
      [Op.or]: whereConditions
    },
    order: [['id', 'DESC']]
  });
}`
);

// 4. blockDevice()
content = content.replace(
    /async function blockDevice[\s\S]*?const \[existingRows\] = await sequelize\.query\([\s\S]*?\]\n    \);[\s\S]*?await sequelize\.query\([\s\S]*?\);\n      \}\n    \}\n  \} catch \(err\) \{/,
`async function blockDevice({ deviceId, ipAddress, deviceName, email, reason, adminEmail }) {
  try {
    if (!deviceId && !ipAddress) return;

    const normalizedDeviceId = sanitizeText(deviceId, 120);
    const normalizedIp = sanitizeText(ipAddress, 64);
    const normalizedName = sanitizeText(deviceName, 120);
    const normalizedEmail = sanitizeText(email, 255).toLowerCase();
    const normalizedReason = sanitizeText(reason, 255);
    const normalizedAdmin = sanitizeText(adminEmail, 255).toLowerCase();

    let whereQuery;
    if (normalizedDeviceId && normalizedIp) {
      whereQuery = { deviceId: normalizedDeviceId, ipAddress: normalizedIp };
    } else if (normalizedDeviceId) {
      whereQuery = { deviceId: normalizedDeviceId };
    } else {
      whereQuery = { ipAddress: normalizedIp };
    }

    const existingBlock = await BlockedDevice.findOne({
      where: Object.assign({ isActive: true }, whereQuery)
    });

    if (!existingBlock) {
      await BlockedDevice.create({
        deviceId: normalizedDeviceId,
        ipAddress: normalizedIp,
        deviceName: normalizedName,
        email: normalizedEmail,
        reason: normalizedReason,
        blockedBy: normalizedAdmin
      });
    }
  } catch (err) {`
);

// 5. unblockDevice()
content = content.replace(
    /async function unblockDevice\({ id }\) \{[\s\S]*?  try \{[\s\S]*?    await sequelize\.query\([\s\S]*?\);[\s\S]*?  \} catch \(err\) \{/,
`async function unblockDevice({ id }) {
  try {
    await BlockedDevice.update(
      { isActive: false },
      { where: { id } }
    );
  } catch (err) {`
);

// 6. logAccountSession()
content = content.replace(
    /async function logAccountSession[\s\S]*?  try \{[\s\S]*?    const params = \[userId || null,.*?\n    const cols = await getAccountSessionsColumns\(\);[\s\S]*?await sequelize\.query\([\s\S]*?\);[\s\S]*?  } catch \(err\) \{/,
`async function logAccountSession({ userId, email, loginType = "google", ipAddress, macAddress, deviceName, deviceId, userAgent }) {
  try {
    await AccountSession.create({
      userId: userId || null,
      email: sanitizeText(email, 255).toLowerCase(),
      loginType: sanitizeText(loginType, 30),
      ipAddress: sanitizeText(ipAddress, 64),
      macAddress: sanitizeText(macAddress, 64),
      deviceName: sanitizeText(deviceName, 120),
      deviceId: sanitizeText(deviceId, 120),
      userAgent: sanitizeText(userAgent, 500)
    });
  } catch (err) {`
);

// We save the updated content
fs.writeFileSync(authJsPath, content, 'utf8');
console.log('Successfully patched Phase 1 raw SQLs!');

