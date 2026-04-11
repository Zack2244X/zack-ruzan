const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const files = [
  "client/js/app.bundle.min.js",
  "client/js/app.features.bundle.min.js",
  "client/js/app.admin.bundle.min.js",
  "client/css/tailwind.min.css",
  "client/css/styles.min.css",
  "client/css/icons.css",
];

for (const rel of files) {
  const filePath = path.resolve(process.cwd(), rel);
  if (!fs.existsSync(filePath)) {
    console.log(`${rel} | missing`);
    continue;
  }

  const content = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(content);
  const kb = (content.length / 1024).toFixed(1);
  const gzKb = (gz.length / 1024).toFixed(1);
  console.log(`${rel} | raw ${kb} KB | gzip ${gzKb} KB`);
}
