const fs = require('fs');
const path = 'client/index.html';
let html = fs.readFileSync(path, 'utf8');

// 1. Unify versions to ?v=44
html = html.replace(/href="\/css\/tailwind\.min\.css\?v=[0-9]+"/g, 'href="/css/tailwind.min.css?v=44"');
html = html.replace(/href="\/css\/styles\.min\.css\?v=[0-9]+"/g, 'href="/css/styles.min.css?v=44"');
html = html.replace(/href="\/css\/dark-fixes\.min\.css\?v=[0-9]+"/g, 'href="/css/dark-fixes.min.css?v=44"');
html = html.replace(/href="\/css\/login-extra\.min\.css\?v=[0-9]+"/g, 'href="/css/login-extra.min.css?v=44"');
html = html.replace(/href="\/css\/fonts\.css\?v=[0-9]+"/g, 'href="/css/fonts.css?v=44"');

// 2. Add preload tags for critical CSS
html = html.replace(
  /<link rel="stylesheet" href="\/css\/tailwind\.min\.css\?v=[0-9]+" \/>/,
  `<link rel="preload" href="/css/tailwind.min.css?v=44" as="style" />
    <link rel="preload" href="/css/styles.min.css?v=44" as="style" />
    <link rel="stylesheet" href="/css/tailwind.min.css?v=44" />`
);

// 3. Add hidden to body with an ID
html = html.replace(/<body class="p-4 sm:p-8">/, '<body class="p-4 sm:p-8 hidden" id="app-body">');

// 4. Add script to head to remove hidden
const scriptTag = `
    <- delete-exam-modal: added to anyOpen list + MutationObserver FOUC Prevention Script -->
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        var appBody = document.getElementById('app-body');
        if(appBody) appBody.classList.remove('hidden');
      });
      window.addEventListener('load', function() {
        var appBody = document.getElementById('app-body');
        if(appBody) appBody.classList.remove('hidden');
      });
    </script>
  </head>
`;
// find the last </head> correctly
let parts = html.split('</head>');
if (parts.length > 1) {
    let lastPart = parts.pop();
    html = parts.join('</head>') + scriptTag + lastPart;
}

fs.writeFileSync(path, html);
console.log('FOUC patched clean');
