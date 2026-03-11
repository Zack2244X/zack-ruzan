// Minify all JS files in client/js/modules and app.js using esbuild
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const jsDir = path.join(__dirname, '../client/js');
const modulesDir = path.join(jsDir, 'modules');
const files = [
  // Only source files — exclude any already-minified or bundled files to prevent .min.min chains
  ...fs.readdirSync(modulesDir)
    .filter(f => f.endsWith('.js') && !f.includes('.min') && !f.includes('.bundle'))
    .map(f => path.join(modulesDir, f)),
  path.join(jsDir, 'app.js')
];

files.forEach(file => {
  const outFile = file.replace(/\.js$/, '.min.js');
  esbuild.buildSync({
    entryPoints: [file],
    outfile: outFile,
    minify: true,
    bundle: false,
    format: 'iife',
    target: ['es2017'],
  });
  console.log('Minified:', outFile);
});
