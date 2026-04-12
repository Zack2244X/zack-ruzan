const fs = require('fs');
let code = fs.readFileSync('server/routes/auth.js', 'utf8');

const validationCode = `
    const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/;

    // استخراج المعرف من الطلب
    const { deviceId } = req.body;

    // التحقق من وجوده ومطابقته للنمط
    if (!deviceId || !DEVICE_ID_REGEX.test(deviceId)) {
        console.warn(\`[Security] Rejected invalid Device ID: \${deviceId ? deviceId.substring(0, 10) + '...' : 'MISSING'}\`);
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid Device ID format. Must be alphanumeric, 10-50 characters, allowing underscores and hyphens.' 
        });
    }

    const userAgent = req.get("user-agent") || "";
    const ipAddress = getClientIp(req);
    // Remove redeclaration since we did destructuring above
`;

// Patch guest-session
code = code.replace(
`  try {
    const userAgent = req.get("user-agent") || "";
    const ipAddress = getClientIp(req);
    const deviceId = sanitizeText(
      req.body?.deviceId || req.get("x-device-id"),
      120,
    );`,
`  try {${validationCode}
    // keep deviceName assignment below as is
`
);

// Patch /google
code = code.replace(
`      const userAgent = req.get("user-agent") || "";
      const ipAddress = getClientIp(req);
      const deviceId = sanitizeText(
        req.body?.deviceId || req.get("x-device-id"),
        120,
      );`,
`${validationCode}
`
);

fs.writeFileSync('server/routes/auth.js', code);
console.log('Patched');
