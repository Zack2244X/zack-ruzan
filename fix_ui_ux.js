const fs = require('fs');
const path = require('path');

// 1. CSS Modifications
const cssDir = 'client/css';
if (fs.existsSync(cssDir)) {
  const files = fs.readdirSync(cssDir).filter(f => f.endsWith('.css') && !f.endsWith('.min.css'));

  const varsCss = \`:root {
  /* z-index layers */
  --z-base: 1;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
  
  /* motion durations */
  --motion-fast: 150ms;
  --motion-base: 250ms;
  --motion-slow: 400ms;
}\n\`;

  const fixBottomSheet = \`\n@media (max-width: 375px) {
  .bottom-sheet, .modal-bottom {
    max-height: 85dvh;
    border-radius: 1rem 1rem 0 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
}\n\`;

  for (const file of files) {
    const filePath = path.join(cssDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Inject variables and fixes into styles.css
    if (file === 'styles.css') {
      if (!content.includes('--motion-fast: 150ms')) {
        content = varsCss + '\n' + content;
      }
      if (!content.includes('max-height: 85dvh')) {
        content = content + fixBottomSheet;
      }
    }

    // 2. Replace arbitrary z-indexes
    content = content.replace(/z-index\s*:\s*99999?/g, 'z-index: var(--z-modal)');
    content = content.replace(/z-index\s*:\s*1000/g, 'z-index: var(--z-dropdown)');

    // 3. Replace transition durations
    content = content.replace(/(\s|:)0\.3s/g, '$1var(--motion-base)');
    content = content.replace(/(\s|:)200ms/g, '$1var(--motion-fast)');
    content = content.replace(/(\s|:)500ms/g, '$1var(--motion-slow)');

    fs.writeFileSync(filePath, content);
    console.log(\`Updated CSS: \${filePath}\`);
  }
}

// 4. Update JS files for transitions just in case they set it inline
const jsFilesDir = 'client/js';
function processJsDir(dir) {
   if (!fs.existsSync(dir)) return;
   const items = fs.readdirSync(dir);
   for (const item of items) {
       const fullPath = path.join(dir, item);
       if (fs.statSync(fullPath).isDirectory()) {
           processJsDir(fullPath);
       } else if (fullPath.endsWith('.js') && !fullPath.endsWith('.min.js')) {
           let code = fs.readFileSync(fullPath, 'utf8');
           code = code.replace(/z-index['"`]?\s*:\s*['"`]?99999?['"`]?/g, "zIndex: 'var(--z-modal)'");
           code = code.replace(/z-index['"`]?\s*:\s*['"`]?1000['"`]?/g, "zIndex: 'var(--z-dropdown)'");
           fs.writeFileSync(fullPath, code);
       }
   }
}
processJsDir(jsFilesDir);

// 5. Index.html Modifications - Flash Theme prevention
const indexPath = 'client/index.html';
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  
  const themeScript = \`
    <script>
      const theme = localStorage.getItem('theme');
      if (theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    </script>\`;

  if (!html.includes("localStorage.getItem('theme')")) {
    html = html.replace(/<head>/i, \`<head>\${themeScript}\`);
    fs.writeFileSync(indexPath, html);
    console.log('Injected Theme Flash Prevention script into client/index.html');
  }
}
