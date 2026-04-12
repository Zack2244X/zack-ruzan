const fs = require('fs');

// 1. Update index.html
const indexPath = 'client/index.html';
let indexHtml = fs.readFileSync(indexPath, 'utf8');

const newVariables = `:root {
        --motion-sheet-ms: 320ms;
        --z-base: 0;
        --z-normal: 100;
        --z-dropdown: 200;
        --z-modal: 300;
        --z-toast: 400;
        --z-overlay: 500;
        --motion-fast: 150ms;
        --motion-base: 250ms;
        --motion-slow: 400ms;
      }`;

indexHtml = indexHtml.replace(/:root\s*\{\s*--motion-sheet-ms: 320ms;\s*--z-overlay: 60;\s*--z-sheet: 80;\s*--z-nav: 90;\s*--z-modal: 100;\s*--z-modal-elevated: 110;\s*--z-toast: 120;\s*--motion-fast: 150ms;\s*--motion-base: 250ms;\s*--motion-slow: 400ms;\s*\}/m, newVariables);

indexHtml = indexHtml.replace(/z-index:\s*var\(--z-nav\)\s*!important;/g, 'z-index: var(--z-normal) !important;');
indexHtml = indexHtml.replace(/z-index:\s*var\(--z-sheet\)\s*!important;/g, 'z-index: var(--z-modal) !important;');
indexHtml = indexHtml.replace(/z-index:\s*var\(--z-overlay\)\s*!important;/g, 'z-index: var(--z-overlay) !important;');
indexHtml = indexHtml.replace(/z-index:\s*var\(--z-modal-elevated\)\s*!important;/g, 'z-index: var(--z-modal) !important;');
// The user asked for "Modals: 300, Toasts: 400, Overlays: 500"
// So login-screen, results-screen should be overlays maybe? 

fs.writeFileSync(indexPath, indexHtml);
console.log('updated index.html');
