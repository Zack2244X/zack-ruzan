const fs = require('fs');
const path = require('path');
const modulesDir = path.join(process.cwd(), 'client', 'js', 'modules');
let count = 0;
fs.readdirSync(modulesDir).forEach(file => {
    if (file.endsWith('.js') && !file.endsWith('.min.js')) {
        let filePath = path.join(modulesDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        
        let changed = false;
        if (content.includes('console.log') || content.includes('console.warn') || content.includes('console.debug') || content.includes('alert(')) {
            let importStatement = "import logger from '../utils/logger.js';\n";
            if (!content.includes("import logger from '../utils/logger.js'")) {
                content = importStatement + content;
            }
            content = content.replace(/console\.log/g, 'logger.log');
            content = content.replace(/console\.warn/g, 'logger.warn');
            content = content.replace(/console\.debug/g, 'logger.debug');
            content = content.replace(/alert\(/g, 'logger.warn("Alert removed:", ');
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Processed', file);
            count++;
        }
    }
});
console.log('Total processed:', count);
