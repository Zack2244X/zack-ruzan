const http = require('http');

async function test() {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => {
      const req = http.request('http://localhost:3000/api/auth/guest-session', { method: 'POST' }, (res) => {
        console.log(`Req ${i+1}: status ${res.statusCode}, Remaining: ${res.headers['x-ratelimit-remaining'] || res.headers['ratelimit-remaining']}`);
        resolve();
      });
      req.on('error', (err) => resolve());
      req.end();
    });
  }
}
test();
