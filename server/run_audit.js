const fs = require('fs');
const execSync = require('child_process').execSync;

let files = execSync('find . -name "*.js" ! -path "*/node_modules/*" ! -path "*/vendor/*" ! -path "*/.git/*" ! -name "*.min.js*"').toString().split('\n').filter(Boolean);

let backendFiles = files.filter(f => f.startsWith('./server/') || f === './dbsync.js' || f === './checkQuizzes.js');
let frontendFiles = files.filter(f => f.startsWith('./client/'));

logger.info("Found " + backendFiles.length + " backend files and " + frontendFiles.length + " frontend files.");
