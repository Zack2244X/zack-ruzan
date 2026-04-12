const fs = require('fs');

const authJsPath = 'server/routes/auth.js';
let content = fs.readFileSync(authJsPath, 'utf8');

function replaceBetween(startStr, endStr, newStr) {
  const start = content.indexOf(startStr);
  if (start === -1) {
    console.log("NOT FOUND START:", startStr.substring(0, 30));
    return;
  }
  const end = content.indexOf(endStr, start);
  if (end === -1) {
    console.log("NOT FOUND END:", endStr.substring(0, 30));
    return;
  }
  content = content.substring(0, start) + newStr + content.substring(end + endStr.length);
}

replaceBetween(
  'async function recordAccountSession(',
  '} catch (err) {',
`async function recordAccountSession({
  userId = null,
  email = "",
  deviceId = "",
  loginType = "google",
  ipAddress = "",
  deviceName = "",
  userAgent = "",
}) {
  try {
    const normalizedEmail = sanitizeText(email.toLowerCase(), 255) || null;
    const normalizedDeviceId = sanitizeText(deviceId, 120);
    const normalizedIpAddress = sanitizeText(ipAddress, 64);
    
    await AccountSession.create({
      userId: userId || null,
      email: normalizedEmail,
      ipAddress: normalizedIpAddress,
      deviceId: normalizedDeviceId,
      loginType,
      deviceName,
      userAgent: sanitizeText(userAgent, 500)
    });
`
);

replaceBetween(
  'async function blockDevice(',
  "module.exports = router;",
`async function blockDevice({ deviceId, ipAddress, deviceName, email, reason, adminEmail }) {
  try {
    if (!deviceId && !ipAddress && !email) return;
    
    await BlockedDevice.create({
      deviceId: sanitizeText(deviceId, 120),
      ipAddress: sanitizeText(ipAddress, 64),
      deviceName: sanitizeText(deviceName, 120),
      email: sanitizeText(email, 255).toLowerCase(),
      reason: sanitizeText(reason, 255),
      blockedBy: sanitizeText(adminEmail, 255)
    });
  } catch(err) {
    logger.error("Block device error", err);
  }
}

async function unblockDevice({ id }) {
  try {
    await BlockedDevice.update({ isActive: false }, { where: { id } });
  } catch(err) {
    logger.error("Unblock device error", err);
  }
}

module.exports = router;`
);

fs.writeFileSync(authJsPath, content, 'utf8');
