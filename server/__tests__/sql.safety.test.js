const fs = require("fs");
const path = require("path");

const TARGET_DIRS = ["routes", "middleware"];

function collectJsFiles(rootDir) {
  const out = [];

  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.forEach((entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        return;
      }
      if (entry.isFile() && fullPath.endsWith(".js")) {
        out.push(fullPath);
      }
    });
  };

  TARGET_DIRS.forEach((dirName) => {
    const dirPath = path.join(rootDir, dirName);
    if (fs.existsSync(dirPath)) walk(dirPath);
  });

  return out;
}

describe("SQL safety", () => {
  test("no direct user-input interpolation in sequelize.query template strings", () => {
    const root = path.resolve(__dirname, "..");
    const files = collectJsFiles(root);
    const offenders = [];
    const pattern =
      /sequelize\.query\s*\(\s*`[^`]*\$\{[^`]*(req\.|body\.|query\.|params\.|headers\.|cookies\.|x-device-id|authorization)[^`]*`/g;

    files.forEach((filePath) => {
      const content = fs.readFileSync(filePath, "utf8");
      if (pattern.test(content)) offenders.push(path.relative(root, filePath));
    });

    expect(offenders).toEqual([]);
  });
});
