const fs = require('fs');
const path = 'client/index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Unify versions to ?v=44
html = html.replace(/\/css\/tailwind\.min\.css\?v=[0-9]+/g, '/css/tailwind.min.css?v=44');
html = html.replace(/\/css\/styles\.min\.css\?v=[0-9]+/g, '/css/styles.min.css?v=44');
html = html.replace(/\/css\/dark-fixes\.min\.css\?v=[0-9]+/g, '/css/dark-fixes.min.css?v=44');
html = html.replace(/\/css\/login-extra\.min\.css\?v=[0-9]+/g, '/css/login-extra.min.css?v=44')
;                                                                                               html = html.replace(/\/css\/fonts\.css\?v=[0-9]+/g, '/css/fonts.css?v=44');

// 2. Add preload tags for critical CSS
// Find the tailwind stylesheet link using regex that accounts for spaces and self-closing tags
html = html.replace(
  /<link rel="stylesheet" href="\/css\/tailwind\.min\.css\?v=[0-9]+"[\s]*\/?>/,
  `<link rel="preload" href="/css/tailwind.min.css?v=44" as="style" />
    <link rel="preload" href="/css/styles.min.css?v=44" as="style" />
    <link rel="stylesheet" href="/css/tailwind.min.css?v=44" />`
);

// 3. Update body tag
html = html.replace(/<body class="p-4 sm:p-8">/, '<body class="p-4 sm:p-8 hidden" id="app-body">');

// 4. Add script just before </head>
const scriptTag = `
    <- delete-exam-modal: added to anyOpen list + MutationObserver FOUC Prevention Script -->
    <script>
      // Show body immediately when content is ready, preventing FOUC
      document.addEventListener('DOMContentLoaded', function() {
        var appBody = document.getElementById('app-body');
        if(appBody) appBody.classList.remove('hidden');
      });
      // Fallback
      window.addEventListener('load', function() {
        var appBody = document.getElementById('app-body');
        if(appBody) appBody.classList.remove('hidden');
      });
    </script>
  </head>`;
  
html = html.replace(/<\/head>/, scriptTag);

fs.writeFileSync(path, html);
console.log('Done');
