const fs = require('fs');
const path = require('path');
function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      if (!filePath.includes('node_modules') && !filePath.includes('.git') && !filePath.includes('vendor')) {
        getAllFiles(filePath, fileList);
      }
    } else if (filePath.endsWith('.js') && !filePath.includes('.min.js')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}
let files = getAllFiles('.');
let backendFiles = files.filter(f => f.startsWith('server/') || f === 'dbsync.js' || f === 'checkQuizzes.js');
let frontendFiles = files.filter(f => f.startsWith('client/'));

logger.info("Found " + backendFiles.length + " backend files and " + frontendFiles.length + " frontend files.");
