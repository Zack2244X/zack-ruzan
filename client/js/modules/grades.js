import { wrapComponent } from '../utils/ui.js';
import logger from '../utils/logger.js';
/**
 * @module grades
 * @description وحدة الدرجات والإحصائيات — عرض النتائج، لوحة الشرف، وتبويب التعديل
 */
import { escapeHtml, logFunctionStatus } from "./helpers.js";
// State is provided by the core bundle via window.__appState before any admin function is called
const state = window.__appState;
// api + navigation are provided by the core bundle via window globals
const fetchScoresFromServer = () => window.__api.fetchScoresFromServer();
const fetchLeaderboardFromServer = () =>
  window.__api.fetchLeaderboardFromServer();

/**
 * فتح مودل الدرجات — يجلب أحدث بيانات من السيرفر ثم يعرضها
 */
export async function openGradesModal() {
  logFunctionStatus("openGradesModal", true);
  const dock = document.getElementById("ios-bottom-nav");
  if (dock) dock.classList.add("hidden");
  document.getElementById("grades-modal").classList.remove("hidden");

  // عرض حالة تحميل مؤقتة
  const container = document.getElementById("grades-list-container");
  container.innerHTML = `<div class="text-center text-gray-500 py-16"><i class="fas fa-spinner fa-spin text-3xl mb-3"></i><p class="font-medium">جاري تحميل البيانات من السيرفر...</p></div>`;

  // جلب أحدث البيانات من السيرفر
  try {
    const [freshScores, freshLeaderboard] = await Promise.all([
      fetchScoresFromServer().catch(() => []),
      fetchLeaderboardFromServer().catch(() => []),
    ]);
    state.serverScores = freshScores;
    state.allUserScores = freshScores.map((s) => ({
      userName: s.userName || "طالب",
      userId: s.userId || null,
      quizTitle: s.quizTitle || "امتحان",
      quizSubject: s.quizSubject || "",
      score: Number(s.score) || 0,
      total: Number(s.total) || 0,
      percentage: Number(s.percentage) || 0,
      date: s.date || new Date().toISOString(),
    }));
    state.serverLeaderboard = freshLeaderboard;
    logger.log(
      `[grades] ✓ تم جلب ${freshScores.length} نتيجة و ${freshLeaderboard.length} لوحة شرف من السيرفر`,
    );
  } catch (e) {
    logger.error("[grades] ✗ فشل تحديث البيانات:", e.message);
  }

  renderGradesList();
}

/**
 * إغلاق مودل الدرجات
 */
export function closeGradesModal() {
  logFunctionStatus("closeGradesModal", false);
  document.getElementById("grades-modal").classList.add("hidden");
  const dock = document.getElementById("ios-bottom-nav");
  if (dock) dock.classList.remove("hidden");
}

/**
 * رسم قائمة الدرجات بشكل شجري — تجميع المستخدمين وترتيبهم حسب المتوسط
 */
export async function renderGradesList() {
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
      container.innerHTML = `<div class="text-center text-gray-500 py-16"><i class="fas fa-folder-open text-4xl mb-4"></i><br>لا توجد نتائج مسجلة بعد.</div>`;
      return;
    }

    // 3. عرض الشجرة (Tree View)
    let gradesHtml = "";
    rankedUsers.forEach((user, idx) => {
      const nameBgClass = user.isComplete
        ? "bg-green-50 hover:bg-green-100 border-green-200"
        : "bg-gray-50 hover:bg-gray-100 border-gray-200";
      const completionText = user.isComplete
        ? `<span class="text-green-600 font-bold text-xs mr-2">(أكمل الكل)</span>`
        : `<span class="text-gray-500 text-xs mr-2">(${user.takenCount}/${state.allQuizzes.length} امتحانات)</span>`;

      let quizzesHTML = "";
      const safeName = escapeHtml(user.name);
      user.scores.forEach((s) => {
        const isBest = s.quizTitle === user.bestQuizTitle;
        const itemClass = isBest
          ? "bg-yellow-50 border-r-4 border-yellow-400 text-yellow-700"
          : "bg-white border border-gray-100";

        quizzesHTML += `
                  <div class="flex justify-between items-center p-2 rounded-lg ${itemClass} mb-1 text-sm shadow-sm">
                      <span class="font-medium truncate">${escapeHtml(s.quizTitle)} ${
          isBest ? '<i class="fas fa-crown text-yellow-600 text-xs mr-1"></i>' : ""
        }</span>
                      <span class="font-bold">${s.score}/${s.total}</span>
                  </div>
              `;
      });

      gradesHtml += `
              <div class="mb-2">
                  <button onclick="toggleTreeNode('content-user-${idx}', this)" class="flex items-center justify-between w-full text-right p-3 rounded-xl border ${nameBgClass} transition group">
                      <div class="flex items-center gap-2">
                          <i class="fas fa-chevron-down text-gray-500 text-xs transition-transform duration-300 transform rotate-180"></i>
                          <span class="font-bold text-gray-800 group-hover:text-blue-600 transition">${safeName}</span>
                          ${completionText}
                      </div>
                      <span class="font-bold text-blue-600 text-lg">${user.avg}%</span>
                  </button>
                  <div id="content-user-${idx}" class="pr-5 mt-1 space-y-1 border-r-2 border-blue-100 hidden">
                      ${quizzesHTML}
                  </div>
              </div>
          `;
    });
    container.innerHTML = gradesHtml;
  });
}

/**
 * فتح مودل الإحصائيات — يجلب أحدث بيانات من السيرفر ثم يعرضها
 */
export async function openStatsModal() {
  logFunctionStatus("openStatsModal", true);
  const dock = document.getElementById("ios-bottom-nav");
  if (dock) dock.classList.add("hidden");
  document.getElementById("stats-modal").classList.remove("hidden");

  const container = document.getElementById("stats-list-container");
  container.innerHTML = `<div class="text-center text-gray-500 py-16"><i class="fas fa-spinner fa-spin text-3xl mb-3"></i><p class="font-medium">جاري تحميل البيانات من السيرفر...</p></div>`;

  try {
    const [freshScores, freshLeaderboard] = await Promise.all([
      fetchScoresFromServer().catch(() => []),
      fetchLeaderboardFromServer().catch(() => []),
    ]);
    state.serverScores = freshScores;
    state.allUserScores = freshScores.map((s) => ({
      userName: s.userName || "طالب",
      userId: s.userId || null,
      quizTitle: s.quizTitle || "امتحان",
      quizSubject: s.quizSubject || "",
      score: Number(s.score) || 0,
      total: Number(s.total) || 0,
      percentage: Number(s.percentage) || 0,
      date: s.date || new Date().toISOString(),
    }));
    state.serverLeaderboard = freshLeaderboard;
    logger.log(
      `[stats] ✓ تم جلب ${freshScores.length} نتيجة و ${freshLeaderboard.length} لوحة شرف`,
    );
  } catch (e) {
    logger.error("[stats] ✗ فشل تحديث البيانات:", e.message);
  }

  renderStatsContent();
}

/**
 * إغلاق مودل الإحصائيات
 */
export function closeStatsModal() {
  logFunctionStatus("closeStatsModal", false);
  document.getElementById("stats-modal").classList.add("hidden");
  const dock = document.getElementById("ios-bottom-nav");
  if (dock) dock.classList.remove("hidden");
}

/**
 * رسم محتوى الإحصائيات — أبطال آخر امتحان، أعلى مجموع، أعلى متوسط، أكثر درجات كاملة
 */
export function renderStatsContent() {
  logFunctionStatus("renderStatsContent", false);
  const container = document.getElementById("stats-list-container");
  container.innerHTML = "";

  const usersData = {};
  const sourceScores =
    state.serverScores && state.serverScores.length > 0
      ? state.serverScores
      : state.allUserScores;
  sourceScores.forEach((entry) => {
    const userName = entry.userName || "طالب";
    if (!usersData[userName]) {
      usersData[userName] = {
        scores: [],
        totalScore: 0,
        totalMax: 0,
        fullMarksCount: 0,
      };
    }
    usersData[userName].scores.push(entry);
    usersData[userName].totalScore += Number(entry.score) || 0;
    usersData[userName].totalMax += Number(entry.total) || 0;
    if (Number(entry.score) === Number(entry.total) && Number(entry.total) > 0)
      usersData[userName].fullMarksCount++;
  });

  // 1. أول 3 في آخر امتحان
  const latestQuizTitle =
    state.allQuizzes.length > 0
      ? state.allQuizzes[state.allQuizzes.length - 1].config.title
      : "";
  const latestScores = sourceScores
    .filter((e) => e.quizTitle === latestQuizTitle)
    .sort((a, b) => b.score - a.score);

  // 2. أكثر 3 جابوا درجات (مجموع النقاط)
  const topScorers = Object.keys(usersData)
    .map((name) => ({
      name,
      val: usersData[name].totalScore,
      unit: "نقطة",
    }))
    .sort((a, b) => b.val - a.val);

  // 3. أعلي 3 متوسط درجات
  const topAvg = Object.keys(usersData)
    .map((name) => {
      const d = usersData[name];
      return {
        name,
        val: Math.round((d.totalScore / d.totalMax) * 100),
        unit: "%",
      };
    })
    .sort((a, b) => b.val - a.val);

  // 4. أكثر 3 جابوا درجة نهائية (كاملة)
  const topFullMarks = Object.keys(usersData)
    .map((name) => ({
      name,
      val: usersData[name].fullMarksCount,
      unit: "مرات",
    }))
    .sort((a, b) => b.val - a.val);

  /**
   * دالة مساعدة لعرض قائمة إحصائية
   * @param {string} title — عنوان القائمة
   * @param {string} icon — أيقونة FontAwesome
   * @param {string} color — لون العنوان
   * @param {Array} list — مصفوفة البيانات
   * @returns {string} HTML القائمة
   */
  function renderList(title, icon, color, list) {
    let html = `<div class="bg-white rounded-2xl border p-4 shadow-sm">
            <h3 class="font-bold text-lg mb-3 flex items-center ${color}"><i class="${icon} ml-2"></i> ${title}</h3>
            <div class="space-y-2">`;

    let rank = 0;
    let prevVal = null;
    list.slice(0, 3).forEach((item, idx) => {
      if (item.val !== prevVal) rank = idx + 1;
      prevVal = item.val;

      const repeatBadge =
        idx > 0 && item.val === list[idx - 1].val
          ? '<span class="text-xs text-gray-500 mr-1">(مكرر)</span>'
          : "";
      const rankColors = [
        "text-yellow-600",
        "text-gray-500",
        "text-orange-500",
      ];

      html += `
                <div class="flex justify-between items-center p-2 bg-gray-50 rounded-lg">
                    <div class="flex items-center gap-2">
                        <span class="font-bold ${rankColors[rank - 1] || "text-gray-500"}">#${rank}</span>
                        <span class="font-medium text-gray-700">${escapeHtml(item.name)}</span>
                        ${repeatBadge}
                    </div>
                    <span class="font-bold text-blue-600">${item.val} ${item.unit}</span>
                </div>
            `;
    });

    html += `</div></div>`;
    return html;
  }

  container.innerHTML = `
        ${renderList(
          "أبطال آخر امتحان",
          "fas fa-fire",
          "text-red-600",
          latestScores.map((s) => ({
            name: s.userName,
            val: s.score,
            unit: `/${s.total}`,
          })),
        )}
        ${renderList("أعلى مجموع نقاط", "fas fa-coins", "text-yellow-600", topScorers)}
        ${renderList("أعلى متوسط درجات", "fas fa-chart-line", "text-green-600", topAvg)}
        ${renderList("الأكثر درجة نهائية", "fas fa-check-circle", "text-purple-600", topFullMarks)}
    `;
}

/**
 * فتح مودل اختيار التعديل (امتحانات/مذكرات)
 */
export function openEditSelectionModal() {
  logFunctionStatus("openEditSelectionModal", false);
  const dock = document.getElementById("ios-bottom-nav");
  if (dock) dock.classList.add("hidden");
  document.getElementById("edit-selection-modal").classList.remove("hidden");
}

/**
 * التبديل بين تبويب الامتحانات والمذكرات في وضع التعديل
 * @param {'exams'|'notes'} tab — التبويب المطلوب
 * @param {Function} renderSubjectFiltersFn — دالة رسم الفلاتر
 * @param {Function} renderEditTreeFn — دالة رسم شجرة التعديل
 */
export function switchEditTab(tab, renderSubjectFiltersFn, renderEditTreeFn) {
  logFunctionStatus("switchEditTab", false);
  state.editTabMode = tab;
  state.editSubjectFilter = "الكل";

  const examsTab = document.getElementById("edit-tab-exams");
  const notesTab = document.getElementById("edit-tab-notes");

  if (tab === "exams") {
    examsTab.className =
      "flex-1 py-4 font-bold text-blue-600 border-b-4 border-blue-600 bg-blue-50/50 transition flex justify-center items-center gap-2";
    notesTab.className =
      "flex-1 py-4 font-bold text-gray-500 border-b-4 border-transparent hover:bg-gray-100 transition flex justify-center items-center gap-2";
  } else {
    notesTab.className =
      "flex-1 py-4 font-bold text-orange-600 border-b-4 border-orange-600 bg-orange-50/50 transition flex justify-center items-center gap-2";
    examsTab.className =
      "flex-1 py-4 font-bold text-gray-500 border-b-4 border-transparent hover:bg-gray-100 transition flex justify-center items-center gap-2";
  }

  if (renderSubjectFiltersFn) renderSubjectFiltersFn();
  if (renderEditTreeFn) renderEditTreeFn();
}
