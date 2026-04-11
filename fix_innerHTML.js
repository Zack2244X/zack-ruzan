const fs = require('fs');
const path = require('path');

function replaceInnerHTML(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        replaceInnerHTML(fullPath);
      }
    } else if (file.endsWith('.js') && file !== 'sanitize.js') {
      let original = fs.readFileSync(fullPath, 'utf8');
      
      // Basic heuristic to replace known patterns
      let updated = original.replace(/\.innerHTML\s*=\s*([^;]+);/g, (match, expr) => {
        // if it's explicitly purely a string without variables or tags (a bit risky to guess),
        // or a known safe construct, skip.
        if (expr.trim() === '""' || expr.trim() === "''") return match;
        
        // Let's replace with sanitize(expr) to cover the requirement "el.innerHTML = sanitize(userInput)"
        // If it starts with DOMPurify or sanitize, skip.
        if (expr.includes('sanitize(') || expr.includes('DOMPurify')) return match;

        // If it concatenates html with variables (e.g., `<div>${quiz.title}</div>`), sanitize it
        // If it's just a variable (e.g., data.name), sanitize it
        return \`.innerHTML = window.sanitize ? window.sanitize(\${expr}) : \${expr};\`;
      });

      if (original !== updated) {
        fs.writeFileSync(fullPath, updated);
        console.log(\`Sanitized innerHTML in \${fullPath}\`);
      }
    }
  }
}

replaceInnerHTML('client/js');
