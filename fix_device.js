const fs = require('fs');

const apiPath = 'client/js/modules/api.js';
let apiCode = fs.readFileSync(apiPath, 'utf8');

apiCode = apiCode.replace(
  /export function getClientDeviceId\(\) \{[\s\S]*?return \`dev-fallback-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 12\)\}\`;\s*\n\s*\}/m,
  `const DEVICE_ID_REGEX = /^[a-zA-Z0-9_-]{10,50}$/;
export function getClientDeviceId() {
  function generateNewId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return \`dev-\${crypto.randomUUID()}\`;
    }
    return \`dev-\${Date.now().toString(36)}-\${Math.random().toString(36).slice(2, 12)}\`;
  }
  
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id || typeof id !== "string" || !DEVICE_ID_REGEX.test(id)) {
      id = generateNewId();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return \`dev-fb-\${Math.random().toString(36).slice(2, 12)}\`;
  }
}`
);

fs.writeFileSync(apiPath, apiCode);
console.log('Fixed api.js');
