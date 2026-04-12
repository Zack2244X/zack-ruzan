const fs = require('fs');

let authJs = fs.readFileSync('client/js/modules/auth.js', 'utf8');

// 1. Add safeParseToken
if (!authJs.includes('function safeParseToken')) {
  authJs = authJs.replace(
    /export async function handleCredentialResponse\(/,
    `export function safeParseToken(token) {
  try {
    if (typeof token !== "string" || !token) return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch (error) {
    console.error("[auth] Internal token parsing failed silently");
    return null;
  }
}

export async function handleCredentialResponse(`
  );
}

// 2. Replace first parse
const oldBlock1 = `      const payload = JSON.parse(
        atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (payload.nonce !== expectedNonce) {
        showAlert(
          "❌ فشل التحقق من تسجيل Google (nonce mismatch). حاول مرة أخرى.",
          "error",
        );
        return true;
      }`;

const newBlock1 = `      const payload = safeParseToken(idToken);
      if (!payload) {
        logoutUser().catch(() => {});
        return true;
      }
      if (payload.nonce !== expectedNonce) {
        showAlert("❌ فشل التحقق من تسجيل Google (nonce mismatch). حاول مرة أخرى.", "error");
        return true;
      }`;

authJs = authJs.replace(oldBlock1, newBlock1);

// 3. Replace second parse
const oldBlock2 = `      const payload = JSON.parse(atob(response.credential.split(".")[1]));
      const fullName = payload.name || payload.email.split("@")[0];`;

const newBlock2 = `      const payload = safeParseToken(response.credential);
      if (!payload) {
        logoutUser().catch(() => {});
        return;
      }
      const fullName = payload.name || payload.email.split("@")[0];`;

authJs = authJs.replace(oldBlock2, newBlock2);

fs.writeFileSync('client/js/modules/auth.js', authJs);
console.log("auth.js patched!");
