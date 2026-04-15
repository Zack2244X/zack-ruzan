ssh root@46.101.209.56 "sed -i 's/return callback(new Error(\"CORS: Origin missing\"));/return callback(null, { credentials: true, origin: true });/' /root/quiz-platform/server/index.js"
