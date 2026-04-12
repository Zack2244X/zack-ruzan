const fs = require('fs');
const path = require('path');

const modulesDir = path.join(__dirname, 'client', 'js', 'modules');

function processFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if the file has any of the target consoles
    if (!content.includes('console.log') && !content.includes('console.warn') && !content.includes('console.debug') && !content.includes('alert(')) {
        return; // nothing to do
    }

    // Add import statement if not present and if there are actual replacements
    if (!content.includes("import logger from '../utils/logger.js'")) {
        // Find the block of imports and insert it, or just at the top
        const importStatement = "import logger from '../utils/logger.js';\n";
        
        if (content.startsWith('import')) {
            // Put it after the first couple of lines if it's imports
            content = importStatement + content;
        } else {
            content = importStatement + content;
        }
    }

    // Replace consoles with logger
    content = content.replace(/console\.log/g, 'logger.log');
    // Ensure we don't accidentally replace logger.error's internals if we ran it on logger itself but this only runs on modules
    content = content.replace(/console\.warn/g, 'logger.warn');
    content = content.replace(/console\.debug/g, 'logger.debug');
    content = content.replace(/alert\(/g, 'logger.warn("Alert removed: " + ');

    // fix syntax for alert replacement : `alert("message")` -> `logger.warn("Alert removed: " + "message")`
    content = content.replace(/logger\.warn\("Alert removed: " \+ (.*?)\)/g, 'logger.warn("Alert:", $1)');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Processed ${path.basename(filePath)}`);
}

fs.readdirSync(modulesDir).forEach(file => {
    if (file.endsWith('.js') && !file.endsWith('.min.js')) {
        processFile(path.join(modulesDir, file));
    }
});
