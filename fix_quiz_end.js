const fs = require('fs');
let code = fs.readFileSync('client/js/modules/quiz.js', 'utf8');

// Replace `initializeQuiz();\n}` with `initializeQuiz();\n});\n}`
code = code.replace(/  initializeQuiz\(\);\n\}/, "  initializeQuiz();\n  });\n}");

// Add the import for wrapComponent
if (!code.includes("wrapComponent")) {
  code = "import { wrapComponent } from '../utils/ui.js';\n" + code;
} else if (!code.includes("import { wrapComponent }")) {
  code = "import { wrapComponent } from '../utils/ui.js';\n" + code;
}

fs.writeFileSync('client/js/modules/quiz.js', code);
