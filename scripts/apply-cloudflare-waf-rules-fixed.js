const fs = require('fs');
const https = require('https');

const API_TOKEN = process.env.CF_API_TOKEN;
const ZONE_ID = process.env.CF_ZONE_ID;
const WAF_RULES = require('./cloudflare/waf-custom-rules.json');
const RATE_LIMIT = require('./cloudflare/rate-limit-auth.json');

const request = (method, path, body = null) => {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.cloudflare.com',
      port: 443,
      path: '/client/v4' + path,
      method,
      headers: {
        'Authorization': 'Bearer ' + API_TOKEN,
        'Content-Type': 'application/json'
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const applyRuleset = async (phase, customRulesPayload) => {
  const customRules = Array.isArray(customRulesPayload.rules) ? customRulesPayload.rules : [customRulesPayload.rule];
  
  const entrypointInfo = await request('GET', `/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint`);
  
  if (entrypointInfo.success) {
    // entrypoint exists, we must put to it to update
    const existingRules = Array.isArray(entrypointInfo.result.rules) ? entrypointInfo.result.rules : [];
    
    const descriptions = new Set(
      customRules
        .map((r) => (typeof r.description === 'string' ? r.description.trim() : ''))
        .filter(Boolean)
    );

    const preserved = existingRules.filter((rule) => {
      const desc = typeof rule.description === 'string' ? rule.description.trim() : '';
      return !descriptions.has(desc);
    });

    const merged = [...preserved, ...customRules];
    console.log(`Updating existing entrypoint ruleset for phase: ${phase}`);
    const updateRes = await request('PUT', `/zones/${ZONE_ID}/rulesets/phases/${phase}/entrypoint`, {
      description: 'Managed by WAF script',
      rules: merged
    });
    if (!updateRes.success) console.error(JSON.stringify(updateRes, null, 2));
    else console.log(`✓ Ruleset updated successfully for ${phase}`);
  } else {
    // Check if error is 10003 (not found)
    const err = entrypointInfo.errors && entrypointInfo.errors[0];
    if (err && err.code === 10003) {
      console.log(`Entrypoint doesn't exist for phase ${phase}. Creating a new ruleset...`);
      const createRes = await request('POST', `/zones/${ZONE_ID}/rulesets`, {
        kind: 'zone',
        phase: phase,
        description: 'Managed by WAF script',
        rules: customRules
      });
      if (!createRes.success) console.error(JSON.stringify(createRes, null, 2));
      else console.log(`✓ Ruleset created successfully for ${phase}`);
    } else {
      console.error(`Status error fetching ruleset for ${phase}:`, JSON.stringify(entrypointInfo, null, 2));
    }
  }
};

(async () => {
  try {
    await applyRuleset('http_request_firewall_custom', WAF_RULES);
    await applyRuleset('http_ratelimit', RATE_LIMIT);
  } catch (e) {
    console.error(e);
  }
})();
