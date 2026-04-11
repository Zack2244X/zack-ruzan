const fs = require("fs");
let code = fs.readFileSync("client/js/modules/quiz.js", "utf8");

code = code.replace(
  /el\.style\.borderColor = '#007bff';/g,
  "el.style.borderColor = '#3b82f6'; /* Tailwind blue-500 */",
);
code = code.replace(
  /el\.style\.backgroundColor = '#e6f2ff';/g,
  "el.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'; /* transparent blue for dark/light mode */",
);

code = code.replace(
  /optionEl\.style\.borderColor = '#007bff';/g,
  "optionEl.style.borderColor = '#3b82f6';",
);
code = code.replace(
  /optionEl\.style\.backgroundColor = '#e6f2ff';/g,
  "optionEl.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';",
);

fs.writeFileSync("client/js/modules/quiz.js", code);
