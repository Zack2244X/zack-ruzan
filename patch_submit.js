const fs = require('fs');
const path = 'client/js/modules/quiz.js';
let code = fs.readFileSync(path, 'utf8');

if (!code.includes('await apiCall(\'DELETE\', `/api/attempts/progress/${quizId}`);')) {
    code = code.replace(
        /async function submitScoreWithRetry\(payload, maxRetries = MAX_SCORE_RETRIES, baseDelayMs = SCORE_RETRY_BASE_DELAY_MS\) \{/,
        `async function submitScoreWithRetry(payload, maxRetries = MAX_SCORE_RETRIES, baseDelayMs = SCORE_RETRY_BASE_DELAY_MS) {
    try {
        await apiCall('DELETE', \`/api/attempts/progress/\$\{payload.quizId\}\`);
    } catch(e) {
        console.error('Failed to cleanup progress', e);
    }`
    );
    fs.writeFileSync(path, code);
}
