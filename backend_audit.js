const fs = require('fs');
const { execSync } = require('child_process');

console.log("🟠 المرحلة 2: التشريح الجراحي للـ Backend\n");

try {
// Check index.js for cors, error handler, limits
const indexJs = fs.readFileSync('server/index.js', 'utf-8');
if (indexJs.includes('cors(')) {
    console.log("✅ CORS is configured.");
    const corsMatch = indexJs.match(/cors\(\{[\s\S]*?\}\)/);
    if (corsMatch) console.log("CORS config found:\n" + corsMatch[0].substring(0, 100) + "...\n");
}
if (!indexJs.includes('app.use((err, req, res, next)')) {
    console.log("🚨 Missing global error handler in index.js");
}

// Check Routes for express-validator and try-catch
const routesFiles = execSync('ls server/routes/*.js').toString().trim().split('\n');
routesFiles.forEach(file => {
    const code = fs.readFileSync(file, 'utf-8');
    const tryCatchCount = (code.match(/try\s*\{/g) || []).length;
    const reqBodyCount = (code.match(/req\.body/g) || []).length;
    const validatorCount = (code.match(/validationResult/g) || []).length;
    console.log(`📌 File: ${file} | try-catch blocks: ${tryCatchCount} | req.body usages: ${reqBodyCount} | express-validator usage: ${validatorCount}`);
});

// Check middleware auth
const authJs = fs.readFileSync('server/middleware/auth.js', 'utf-8');
if (authJs.includes('jwt.verify')) {
    console.log("✅ JWT verification found in authentication middleware.");
} else {
    console.log("🚨 No jwt.verify found in auth.js");
}

} catch(e) { console.error(e.message); }
