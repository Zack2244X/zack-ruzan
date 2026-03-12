// Build script: minify CSS + JS modules + full bundle
// Usage: node scripts/minify-js.js
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const root    = path.join(__dirname, '..');
const jsDir   = path.join(root, 'client/js');
const cssDir  = path.join(root, 'client/css');
const modDir  = path.join(jsDir, 'modules');

// ── CSS: tailwind / styles / dark-fixes ──────────────────────────────────────
const cssFiles = [
  { in: 'tailwind.css',    out: 'tailwind.min.css'   },
  { in: 'styles.css',      out: 'styles.min.css'     },
  { in: 'dark-fixes.css',  out: 'dark-fixes.min.css' },
];
cssFiles.forEach(({ in: src, out }) => {
  esbuild.buildSync({
    entryPoints: [path.join(cssDir, src)],
    outfile: path.join(cssDir, out),
    minify: true,
    bundle: false,
    loader: { '.css': 'css' },
  });
  const s = (fs.statSync(path.join(cssDir, out)).size / 1024).toFixed(1);
  console.log(`CSS  ${out} (${s} KB)`);
});

// ── JS: individual module .min.js files ─────────────────────────────────────
const modFiles = fs.readdirSync(modDir)
  .filter(f => f.endsWith('.js') && !f.includes('.min') && !f.includes('.bundle'))
  .map(f => path.join(modDir, f));

[...modFiles, path.join(jsDir, 'app.js'), path.join(jsDir, 'bootstrap.js')].forEach(file => {
  const out = file.replace(/\.js$/, '.min.js');
  esbuild.buildSync({
    entryPoints: [file],
    outfile: out,
    minify: true,
    bundle: false,
    format: 'iife',
    target: ['es2017'],
  });
  console.log('JS   ' + path.relative(root, out));
});

// ── JS: full IIFE bundle (core — no builder/grades, those are loaded lazily) ──
esbuild.buildSync({
  entryPoints: [path.join(jsDir, 'app.js')],
  outfile: path.join(jsDir, 'app.bundle.min.js'),
  minify: true,
  bundle: true,
  format: 'iife',
  globalName: '__app',
  target: ['es2017'],
});
const bundleSz = (fs.statSync(path.join(jsDir, 'app.bundle.min.js')).size / 1024).toFixed(1);
console.log(`Bundle app.bundle.min.js (${bundleSz} KB)`);

// ── JS: admin IIFE bundle (builder + grades — lazy loaded after first admin action) ──
esbuild.buildSync({
  entryPoints: [path.join(jsDir, 'app-admin.js')],
  outfile: path.join(jsDir, 'app.admin.bundle.min.js'),
  minify: true,
  bundle: true,
  format: 'iife',
  target: ['es2017'],
});
const adminSz = (fs.statSync(path.join(jsDir, 'app.admin.bundle.min.js')).size / 1024).toFixed(1);
console.log(`Bundle app.admin.bundle.min.js (${adminSz} KB)`);

// ── JS: features IIFE bundle (quiz + tree + notes — lazy loaded on first feature interaction) ──
esbuild.buildSync({
  entryPoints: [path.join(jsDir, 'app-features.js')],
  outfile: path.join(jsDir, 'app.features.bundle.min.js'),
  minify: true,
  bundle: true,
  format: 'iife',
  target: ['es2017'],
});
const featuresSz = (fs.statSync(path.join(jsDir, 'app.features.bundle.min.js')).size / 1024).toFixed(1);
console.log(`Bundle app.features.bundle.min.js (${featuresSz} KB)`);
