const fs = require('fs');
let html = fs.readFileSync('client/index.html', 'utf-8');

// A simplistic parser
let lines = html.split('\n');
let lastLabelIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<label')) {
    lastLabelIdx = i;
  }
  if (lines[i].includes('<input') && lastLabelIdx !== -1) {
    let idMatch = lines[i].match(/id="([^"]+)"/);
    if (!idMatch) {
       idMatch = lines[i+1] && lines[i+1].match(/id="([^"]+)"/);
    }
    if (!idMatch) {
       idMatch = lines[i-1] && lines[i-1].match(/id="([^"]+)"/);
    }
    if (idMatch) {
       let id = idMatch[1];
       if (!lines[lastLabelIdx].includes('for=')) {
          lines[lastLabelIdx] = lines[lastLabelIdx].replace('<label', `<label for="${id}"`);
       }
    }
    lastLabelIdx = -1;
  }
}
fs.writeFileSync('client/index.html', lines.join('\n'));
