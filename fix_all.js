const fs = require('fs');
const path = require('path');

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip minified
    if (filePath.endsWith('.min.js')) return;

    let hasChange = false;
    
    // Add import statement if not present and if there are actual replacements
    let isApp = filePath.endsWith('app.js') || filePath.endsWith('bootstrap.js');
    let importPath = isApp ? "./utils/logger.js" : "../utils/logger.js";
    let isRootLevel = filePath.indexOf('/modules/') === -1 && filePath.indexOf('/js/') !== -1;
    if (isRootLevel) {
       importPath = "./utils/logger.js";
    } else {
       importPath = "../utils/logger.js";
    }

    if ((content.includes('console.log') || content.includes('console.warn') || content.includes('console.debug') || content.includes('alert('))) {
        if (!content.includes("utils/logger.js")) {
            content = "import logger from '" + importPath + "';\n" + content;
        }

        content = content.replace(/console\.log/g, 'logger.log');
        content = content.replace(/console\.warn/g, 'logger.warn');
        content = content.replace(/console\.debug/g, 'logger.debug');
        content = content.replace(/alert\(/g, 'logger.warn("Alert removed: " + ');
        content = content.replace(/logger\.warn\("Alert removed: " \+ (.*?)\)/g, 'logger.warn("Alert:", $1)');
        
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Processed ${filePath}`);
    }
}

const walk = (dir) => {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (fullPath.endsWith('.js')) {
            processFile(fullPath);
        }
    });
};

walk(path.join(__dirname, 'client', 'js'));
