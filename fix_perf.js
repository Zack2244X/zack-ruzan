const fs = require('fs');
const path = require('path');

const tailwindCfg = 'tailwind.config.js';
if (fs.existsSync(tailwindCfg)) {
    let cfg = fs.readFileSync(tailwindCfg, 'utf8');
    cfg = cfg.replace(/"\.\/public\/\*\*\/\*\.\{html,js\}"/g, "'./client/**/*.{html,js}'");
    cfg = cfg.replace(/'\.\/client\/index\.html',\s*'\.\/client\/js\/\*\*\/\*\.js'/g, "'./client/**/*.{html,js}', './src/**/*.{js,jsx}'");
    if (!cfg.includes('./client/**/*.{html,js}')) {
       cfg = cfg.replace(/content:\s*\[[\s\S]*?\]/, "content: [\n    './client/**/*.{html,js}',\n    './src/**/*.{js,jsx}'\n  ]");
    }
    fs.writeFileSync(tailwindCfg, cfg);
    console.log('Fixed tailwind.config.js content paths');
}

// Ensure fonts.css has font-display swap
const fontsCss = 'client/css/fonts.css';
if (fs.existsSync(fontsCss)) {
    let css = fs.readFileSync(fontsCss, 'utf8');
    if (!css.includes('font-display: swap')) {
        css = css.replace(/@font-face\s*{([^}]+)}/g, (match, inner) => {
            if (!inner.includes('font-display')) {
                return match.replace('}', '    font-display: swap;\n}');
            }
            return match;
        });
        fs.writeFileSync(fontsCss, css);
        console.log('Added font-display: swap to CSS');
    }
}

// Provide critical preload
const indexPath = 'client/index.html';
if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    if (!html.includes('<link rel="preload" href="/fonts/')) {
        const preloads = \`
  <link rel="preload" href="/fonts/Cairo-Bold.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/Cairo-Regular.woff2" as="font" type="font/woff2" crossorigin>
\`;
        html = html.replace(/<head>/i, '<head>' + preloads);
    }
    
    // Replace all images to have loading="lazy" except the Gemini image
    html = html.replace(/<img(.*?)>/gi, (match, p1) => {
        let newP1 = p1.replace(/\s*loading\s*=\s*['"]?[a-zA-Z]*['"]?/gi, '');
        newP1 = newP1.replace(/\s*fetchpriority\s*=\s*['"]?[a-zA-Z]*['"]?/gi, '');
        
        if (newP1.includes('Gemini_Generated_Image_t3vu3xt3vu3xt3vu.webp') || newP1.includes('Gemini_Generated_Image_t3vu3xt3vu3xt3vu.avif')) {
             return \`<img\${newP1} loading="eager" fetchpriority="high">\`;
        } else {
             return \`<img\${newP1} loading="lazy">\`;
        }
    });

    fs.writeFileSync(indexPath, html);
    console.log('Fixed index.html preloads and lazy loading');
}

function updateJsImages(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            updateJsImages(fullPath);
        } else if (file.endsWith('.js') && !file.endsWith('.min.js')) {
            let code = fs.readFileSync(fullPath, 'utf8');
            let updated = false;

            // Handle new Image()
            if (code.match(/new\s+Image\(\)/)) {
                code = code.replace(/(const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*new\s+Image\(\);/g, "$1 $2 = new Image();\n$2.loading = 'lazy';");
                updated = true;
            }
            // Handle document.createElement('img')
            if (code.match(/document\.createElement\(['"`]img['"`]\)/)) {
                code = code.replace(/(const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*document\.createElement\(['"`]img['"`]\);/g, "$1 $2 = document.createElement('img');\n$2.loading = 'lazy';");
                updated = true;
            }
            if (updated) {
               fs.writeFileSync(fullPath, code);
               console.log('Updated ' + fullPath);
            }
        }
    }
}
updateJsImages('client/js');
