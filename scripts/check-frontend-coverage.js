#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const lcovPath = process.argv[2] || "coverage/lcov.info";

const thresholds = {
  "client/js/modules/notes.js": {
    lines: 22,
    functions: 16,
    branches: 15,
  },
  "client/js/modules/helpers.js": {
    lines: 1.2,
  },
};

function percent(hit, found) {
  if (!Number.isFinite(found) || found <= 0) return 100;
  return (hit / found) * 100;
}

function parseLcov(content) {
  const records = [];
  const lines = content.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    if (line.startsWith("SF:")) {
      if (current) records.push(current);
      current = {
        file: line.slice(3).trim(),
        LF: 0,
        LH: 0,
        FNF: 0,
        FNH: 0,
        BRF: 0,
        BRH: 0,
      };
      continue;
    }

    if (!current) continue;

    if (line.startsWith("LF:")) current.LF = Number(line.slice(3));
    else if (line.startsWith("LH:")) current.LH = Number(line.slice(3));
    else if (line.startsWith("FNF:")) current.FNF = Number(line.slice(4));
    else if (line.startsWith("FNH:")) current.FNH = Number(line.slice(4));
    else if (line.startsWith("BRF:")) current.BRF = Number(line.slice(4));
    else if (line.startsWith("BRH:")) current.BRH = Number(line.slice(4));
    else if (line === "end_of_record") {
      records.push(current);
      current = null;
    }
  }

  if (current) records.push(current);
  return records;
}

if (!fs.existsSync(lcovPath)) {
  console.error(`[coverage-gate] Missing lcov file: ${lcovPath}`);
  process.exit(1);
}

const content = fs.readFileSync(lcovPath, "utf8");
const records = parseLcov(content);

let failed = false;

for (const [relativeFile, rule] of Object.entries(thresholds)) {
  const targetSuffix = relativeFile.split(path.sep).join("/");
  const record = records.find((r) =>
    r.file.split(path.sep).join("/").endsWith(targetSuffix),
  );

  if (!record) {
    console.error(`[coverage-gate] Missing coverage record for ${relativeFile}`);
    failed = true;
    continue;
  }

  const metrics = {
    lines: percent(record.LH, record.LF),
    functions: percent(record.FNH, record.FNF),
    branches: percent(record.BRH, record.BRF),
  };

  for (const [metric, min] of Object.entries(rule)) {
    const actual = metrics[metric];
    if (actual + Number.EPSILON < min) {
      console.error(
        `[coverage-gate] ${relativeFile} ${metric} ${actual.toFixed(2)}% < required ${min}%`,
      );
      failed = true;
    } else {
      console.log(
        `[coverage-gate] PASS ${relativeFile} ${metric}: ${actual.toFixed(2)}% (min ${min}%)`,
      );
    }
  }
}

if (failed) {
  process.exit(1);
}
