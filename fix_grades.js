const fs = require('fs');
let code = fs.readFileSync('client/js/modules/grades.js', 'utf8');

if (!code.includes("import { wrapComponent }")) {
  code = "import { wrapComponent } from '../utils/ui.js';\n" + code;
}

const targetStart = `export function renderGradesList() {`;
const targetEndStr = `  container.innerHTML = gradesHtml;\n}`;

let startIdx = code.indexOf(targetStart);
let endIdx = code.indexOf(targetEndStr, startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  let before = code.substring(0, startIdx);
  // Add another wrapper around leaderboard
  let replaceCode = `export async function renderGradesList() {
  logFunctionStatus("renderGradesList", false);
  const container = document.getElementById("grades-list-container");
  if (!container) return;

  await wrapComponent(container, async () => {
    // 1. تجميع البيانات
    const userMap = {};
    const sourceScores =
      state.serverScores?.length > 0 ? state.serverScores : state.allUserScores;
    sourceScores.forEach((s) => {
      // إهمال الإجابات التدريبية (إذا لم يتم تجاوزها)
      if (s.isOfficial === false) return;

      const userName = s.userName || "طالب";
      const userKey = s.userId ? "id:" + s.userId : "name:" + userName;
      const score = Number(s.score) || 0;
      const total = Number(s.total) || 1;
      const date = new Date(s.date || 0);

      // استبعاد النتيجة إن كانت صفرية أو الإجمالي 0
      if (total <= 0 || score <= 0) return;

      if (!userMap[userKey]) {
        userMap[userKey] = {
          name: userName,
          scores: [],
          totalScore: 0,
          totalMax: 0,
          latestDate: 0,
        };
      }
      userMap[userKey].scores.push({
        quizTitle: s.quizTitle,
        score,
        total,
        date: date.getTime(),
      });
      userMap[userKey].totalScore += score;
      userMap[userKey].totalMax += total;
      userMap[userKey].latestDate = Math.max(
        userMap[userKey].latestDate,
        date.getTime(),
      );
    });

    // 2. ترتيب الطلاب وحساب التميز
    const rankedUsers = Object.values(userMap)
      .map((data) => {
        const avgPercent = (data.totalScore / data.totalMax) * 100;
        let bestEntry = null;
        let maxPercent = -1;
        data.scores.forEach((sc) => {
          const p = (sc.score / sc.total) * 100;
          if (p > maxPercent) {
            maxPercent = p;
            bestEntry = sc;
          }
        });
        const name = data.name;
        return {
          name,
          avg: avgPercent.toFixed(1),
          scores: data.scores,
          takenCount: data.scores.length,
          bestQuizTitle: bestEntry?.quizTitle || "امتحان",
          isComplete: data.scores.length === state.allQuizzes.length,
        };
      })
      .filter((u) => u.scores.length > 0)
      .sort((a, b) => b.avg - a.avg);

    if (rankedUsers.length === 0) {
      container.innerHTML = \`<div class="text-center text-gray-400 py-16"><i class="fas fa-folder-open text-4xl mb-4"></i><br>لا توجد نتائج مسجلة بعد.</div>\`;
      return;
    }

    // 3. عرض الشجرة (Tree View)
    let gradesHtml = "";
    rankedUsers.forEach((user, idx) => {
      const nameBgClass = user.isComplete
        ? "bg-green-50 hover:bg-green-100 border-green-200"
        : "bg-gray-50 hover:bg-gray-100 border-gray-200";
      const completionText = user.isComplete
        ? \`<span class="text-green-600 font-bold text-xs mr-2">(أكمل الكل)</span>\`
        : \`<span class="text-gray-400 text-xs mr-2">(\${user.takenCount}/\${state.allQuizzes.length} امتحانات)</span>\`;

      let quizzesHTML = "";
      const safeName = escapeHtml(user.name);
      user.scores.forEach((s) => {
        const isBest = s.quizTitle === user.bestQuizTitle;
        const itemClass = isBest
          ? "bg-yellow-50 border-r-4 border-yellow-400 text-yellow-700"
          : "bg-white border border-gray-100";

        quizzesHTML += \`
                  <div class="flex justify-between items-center p-2 rounded-lg \${itemClass} mb-1 text-sm shadow-sm">
                      <span class="font-medium truncate">\${escapeHtml(s.quizTitle)} \${
          isBest ? '<i class="fas fa-crown text-yellow-500 text-xs mr-1"></i>' : ""
        }</span>
                      <span class="font-bold">\${s.score}/\${s.total}</span>
                  </div>
              \`;
      });

      gradesHtml += \`
              <div class="mb-2">
                  <button onclick="toggleTreeNode('content-user-\${idx}', this)" class="flex items-center justify-between w-full text-right p-3 rounded-xl border \${nameBgClass} transition group">
                      <div class="flex items-center gap-2">
                          <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-300 transform rotate-180"></i>
                          <span class="font-bold text-gray-800 group-hover:text-blue-600 transition">\${safeName}</span>
                          \${completionText}
                      </div>
                      <span class="font-bold text-blue-600 text-lg">\${user.avg}%</span>
                  </button>
                  <div id="content-user-\${idx}" class="pr-5 mt-1 space-y-1 border-r-2 border-blue-100 hidden">
                      \${quizzesHTML}
                  </div>
              </div>
          \`;
    });
    container.innerHTML = gradesHtml;
  });
}`;
  let after = code.substring(endIdx + targetEndStr.length);
  code = before + replaceCode + after;
  fs.writeFileSync('client/js/modules/grades.js', code);
  console.log("Successfully wrapped renderGradesList component!");
} else {
  console.log("Could not find grades logic");
}
