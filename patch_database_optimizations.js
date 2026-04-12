const fs = require('fs');

// Fix models/Quiz.js syntax
let quizFile = fs.readFileSync('server/models/Quiz.js', 'utf8');
quizFile = quizFile.replace(
  /\},\n  \{\n    tableName: "quizzes",\n    timestamps: true,\n    paranoid: true,\n    indexes: \[\{ unique: true, fields: \["title"\] \}\],\n  \},\n\);/,
  '}, // End hooks\n);\n'
);
fs.writeFileSync('server/models/Quiz.js', quizFile);

// Fix models/User.js to add indexes
let userFile = fs.readFileSync('server/models/User.js', 'utf8');
if (!userFile.includes('indexes:')) {
  userFile = userFile.replace(
    /paranoid: true,\n  \},\n\);/,
    'paranoid: true,\n    indexes: [\n      { fields: ["role"] },\n      { fields: ["createdAt"] },\n      { fields: ["deletedAt"] }\n    ],\n  },\n);'
  );
  fs.writeFileSync('server/models/User.js', userFile);
}

// Fix models/index.js to add explain + benchmark
let indexFile = fs.readFileSync('server/models/index.js', 'utf8');
if (!indexFile.includes('benchmark: true')) {
  indexFile = indexFile.replace(
    /logging:[\s\S]*?process\.env\.NODE_ENV === "development"[\s\S]*?\? \(msg\) => require\([^)]+\)\.debug\(msg\)[\s\S]*?: false,/,
    `logging:\n      process.env.NODE_ENV === "development"\n        ? (msg, benchmark) => require("../utils/logger").debug(msg + " [" + benchmark + "ms]")\n        : false,\n    benchmark: true,\n    // إضافة explain للـ queries البطيئة في الديف (عن طريق hooks أو خيارات logging المتقدمة)\n    // لكننا نكتفي بـ benchmark هنا`
  );
  fs.writeFileSync('server/models/index.js', indexFile);
}

console.log("Database optimizations mapped.");
