const fs = require('fs');
let code = fs.readFileSync('client/js/modules/dashboard.js', 'utf8');

// Add import
if (!code.includes("import { wrapComponent }")) {
  code = "import { wrapComponent } from '../utils/ui.js';\n" + code;
}

// Find leaderboard logic
const targetStart = `  const leaderboardList = document.getElementById("leaderboard-list");`;
const targetEndStr = `    leaderboardList.innerHTML = lbHtml;\n  }`;

let startIdx = code.indexOf(targetStart);
let endIdx = code.indexOf(targetEndStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  let before = code.substring(0, startIdx);
  // Add another wrapper around leaderboard
  let replaceCode = `  const leaderboardList = document.getElementById("leaderboard-list");
  if (leaderboardList) {
    await wrapComponent(leaderboardList, async () => {
      // Let's pretend to have an error simulation check if we type something like state.simulateError === true
      // Here is the normal leaderboard logic:
` + code.substring(startIdx + targetStart.length, endIdx + targetEndStr.length) + `
    });
  }`;
  let after = code.substring(endIdx + targetEndStr.length);
  code = before + replaceCode + after;
  fs.writeFileSync('client/js/modules/dashboard.js', code);
  console.log("Successfully wrapped leaderboard component!");
} else {
  console.log("Could not find leaderboard logic");
}
