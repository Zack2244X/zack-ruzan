/**
 * @module tree
 * @description وحدة رسم الشجرة — عرض الامتحانات والمذكرات بتنسيق شجري حسب التاريخ
 */
import state from "./state.js";
import { escapeHtml, showAlert, logFunctionStatus } from "./helpers.js";
import { apiCall } from "./api.js";

/** @constant {Array<string>} المواد الافتراضية */
const DEFAULT_SUBJECTS = [
  "الصرف",
  "الفلسفة وعلم الأخلاق",
  "القضايا المجتمعية",
  "النحو التطبيقي",
  "علم البيان",
  "علم اللغة وفقهها",
  "نصوص الأدب الجاهلي",
];

// ✅ FIX: Debouncing helper to prevent excessive re-renders
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

function getMainSheetContainerIds() {
  if (state.currentViewMode === "notes") {
    return {
      filtersId: "notes-subject-filters-container",
      historyId: "notes-history-tree",
    };
  }

  return {
    filtersId: "subject-filters-container",
    historyId: "history-tree",
  };
}

function expandFirstTreeBranch(treeRoot) {
  if (!treeRoot) return;

  // ✅ FIX: Use requestAnimationFrame to batch DOM operations and prevent layout thrashing
  requestAnimationFrame(() => {
    const firstYearButton = treeRoot.querySelector(
      "button[onclick*='content-year-'], button[onclick*='edit-content-year-']",
    );
    if (!firstYearButton) return;

    const firstYearContent = firstYearButton.nextElementSibling;
    if (firstYearContent && firstYearContent.classList.contains("hidden")) {
      firstYearContent.classList.remove("hidden");
      firstYearContent.classList.add("block");
    }

    const firstYearIcon = firstYearButton.querySelector(
      ".fa-chevron-down, .bi-chevron-down",
    );
    if (firstYearIcon) {
      firstYearIcon.classList.add("rotate-180");
    }

    const firstMonthButton = firstYearContent?.querySelector(
      "button[onclick*='content-month-'], button[onclick*='edit-content-month-']",
    );
    if (!firstMonthButton) return;

    const firstMonthContent = firstMonthButton.nextElementSibling;
    if (firstMonthContent && firstMonthContent.classList.contains("hidden")) {
      firstMonthContent.classList.remove("hidden");
      firstMonthContent.classList.add("block");
    }

    const firstMonthIcon = firstMonthButton.querySelector(
      ".fa-chevron-down, .bi-chevron-down",
    );
    if (firstMonthIcon) {
      firstMonthIcon.classList.add("rotate-180");
    }
  });
}

function bindDelegatedTreeActions(rootEl) {
  if (!rootEl || rootEl.dataset.treeActionsBound === "1") return;

  rootEl.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-tree-action]");
    if (!actionEl || !rootEl.contains(actionEl)) return;

    const action = actionEl.getAttribute("data-tree-action");
    const value = actionEl.getAttribute("data-tree-value") || "";

    switch (action) {
      case "toggle-node":
        if (typeof window.toggleTreeNode === "function") {
          window.toggleTreeNode(value, actionEl);
        }
        break;
      case "set-subject-filter":
        if (typeof window.setSubjectFilter === "function") {
          window.setSubjectFilter(value);
        }
        break;
      case "set-edit-subject-filter":
        if (typeof window.setEditSubjectFilter === "function") {
          window.setEditSubjectFilter(value);
        }
        break;
      case "rename-subject":
        if (typeof window.renameSubject === "function") {
          window.renameSubject(value, event);
        }
        break;
      case "delete-subject":
        if (typeof window.confirmDeleteSubject === "function") {
          window.confirmDeleteSubject(value, event);
        }
        break;
      case "play-quiz":
        if (typeof window.playQuiz === "function") {
          window.playQuiz(Number(value));
        }
        break;
      case "download-note":
        if (typeof window.forceDownload === "function") {
          window.forceDownload(value);
        }
        break;
      case "copy-quiz-link":
        if (typeof window.copyQuizLink === "function") {
          window.copyQuizLink(value, event);
        }
        break;
      case "load-quiz-builder":
        if (typeof window.loadQuizIntoBuilder === "function") {
          window.loadQuizIntoBuilder(Number(value));
        }
        break;
      case "load-note-builder":
        if (typeof window.loadNoteIntoBuilder === "function") {
          window.loadNoteIntoBuilder(Number(value));
        }
        break;
      case "delete-exam-edit":
        if (typeof window.deleteExamFromEditTree === "function") {
          window.deleteExamFromEditTree(value, event);
        }
        break;
      case "delete-note-edit":
        if (typeof window.deleteNoteFromEditTree === "function") {
          window.deleteNoteFromEditTree(value, event);
        }
        break;
      case "stop-propagation":
        event.stopPropagation();
        break;
      default:
        break;
    }
  });

  rootEl.dataset.treeActionsBound = "1";
}

/**
 * استخراج قائمة المواد الديناميكية من الاختبارات والمذكرات مع الافتراضية
 * @returns {Array<string>} مصفوفة المواد مع "الكل" في البداية
 */
export function getDynamicSubjects() {
  logFunctionStatus("getDynamicSubjects", false);
  const subjectsSet = new Set(DEFAULT_SUBJECTS);

  const targetArray =
    state.currentViewMode === "notes" ? state.allNotes : state.allQuizzes;
  targetArray.forEach((item) => {
    if (item.config && item.config.subject)
      subjectsSet.add(item.config.subject);
  });
  return ["الكل", ...Array.from(subjectsSet)];
}

/**
 * رسم أزرار فلتر المواد في القائمة الرئيسية ونافذة التعديل مع أدوات الأدمن
 * @param {Function} renameSubjectFn — دالة تعديل اسم المادة
 * @param {Function} confirmDeleteSubjectFn — دالة تأكيد حذف المادة
 */
export function renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn) {
  logFunctionStatus("renderSubjectFilters", false);
  const subjects = getDynamicSubjects();

  // 1. تحديث قائمة Datalist
  const dataList = document.getElementById("subjects-list");
  if (dataList) {
    let dlHtml = "";
    subjects.forEach((sub) => {
      if (sub !== "الكل") dlHtml += `<option value="${escapeHtml(sub)}">`;
    });
    dataList.innerHTML = dlHtml;
  }

  // 2. تحديث شريط الفلاتر في القائمة الرئيسية
  const { filtersId } = getMainSheetContainerIds();
  const mainContainer = document.getElementById(filtersId);
  if (mainContainer) {
    let filtersHtml = "";
    subjects.forEach((sub) => {
      const isActive = sub === state.currentSubjectFilter;
      const activeClasses = isActive
        ? "bg-blue-600 text-white shadow-md border-blue-500"
        : "bg-slate-700/40 text-gray-300 border-slate-600/30 backdrop-blur-md hover:border-slate-500/50 hover:text-gray-200";

      let adminTools = "";
      if (state.isAdmin && sub !== "الكل") {
        adminTools = `
                    <span class="inline-flex items-center gap-2 mr-3 pr-3 border-r ${isActive ? "border-blue-400" : "border-slate-500/40"}">
                        <i data-tree-action="rename-subject" data-tree-value="${escapeHtml(sub)}" class="fas fa-pen text-xs hover:text-blue-300 transition cursor-pointer" title="تعديل الاسم"></i>
                        <i data-tree-action="delete-subject" data-tree-value="${escapeHtml(sub)}" class="fas fa-times text-xs hover:text-red-400 transition cursor-pointer" title="حذف المجلد"></i>
                    </span>
                `;
      }

      filtersHtml += `
                <button data-tree-action="set-subject-filter" data-tree-value="${escapeHtml(sub)}" class="flex items-center whitespace-nowrap px-4 py-2 rounded-full border text-sm font-bold transition duration-300 ${activeClasses}">
                    ${escapeHtml(sub)} ${adminTools}
                </button>
            `;
    });
    mainContainer.innerHTML = filtersHtml;
    bindDelegatedTreeActions(mainContainer);
  }

  // 3. تحديث شريط الفلاتر في نافذة التعديل
  const editContainer = document.getElementById(
    "edit-subject-filters-container",
  );
  if (editContainer) {
    let editHtml = "";
    subjects.forEach((sub) => {
      const isActive = sub === state.editSubjectFilter;
      const activeClasses = isActive
        ? "bg-purple-600 text-white shadow-md border-purple-600"
        : "bg-white text-gray-600 border-gray-200 hover:bg-purple-50 hover:text-purple-600";
      editHtml += `<button data-tree-action="set-edit-subject-filter" data-tree-value="${escapeHtml(sub)}" class="whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-bold transition duration-300 ${activeClasses}">${escapeHtml(sub)}</button>`;
    });
    editContainer.innerHTML = editHtml;
    bindDelegatedTreeActions(editContainer);
  }
}

/**
 * تعيين فلتر المادة في القائمة الرئيسية وإعادة الرسم
 * @param {string} subject — اسم المادة المختارة
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} [renameSubjectFn] — دالة تعديل اسم المادة
 * @param {Function} [confirmDeleteSubjectFn] — دالة تأكيد حذف المادة
 */
let _renderHistoryTreeDebounced = null;
export function setSubjectFilter(
  subject,
  renderHistoryTree,
  renameSubjectFn,
  confirmDeleteSubjectFn,
) {
  logFunctionStatus("setSubjectFilter", false);
  state.currentSubjectFilter = subject;
  renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn);

  // ✅ FIX: Use debounced render to prevent excessive DOM updates on rapid filter changes
  if (!_renderHistoryTreeDebounced) {
    _renderHistoryTreeDebounced = debounce(renderHistoryTree, 300);
  }
  _renderHistoryTreeDebounced();
}

/**
 * تعيين فلتر المادة في نافذة التعديل وإعادة الرسم
 * @param {string} subject — اسم المادة المختارة
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} [renameSubjectFn] — دالة تعديل اسم المادة
 * @param {Function} [confirmDeleteSubjectFn] — دالة تأكيد حذف المادة
 */
let _renderEditTreeDebounced = null;
export function setEditSubjectFilter(
  subject,
  renderEditTree,
  renameSubjectFn,
  confirmDeleteSubjectFn,
) {
  logFunctionStatus("setEditSubjectFilter", false);
  state.editSubjectFilter = subject;
  renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn);

  // ✅ FIX: Use debounced render to prevent excessive DOM updates on rapid filter changes
  if (!_renderEditTreeDebounced) {
    _renderEditTreeDebounced = debounce(renderEditTree, 300);
  }
  _renderEditTreeDebounced();
}

/**
 * رسم الشجرة الرئيسية (امتحانات أو مذكرات) مرتبة حسب السنة/الشهر/اليوم
 * @param {Function} playQuizFn — دالة بدء الاختبار
 * @param {Function} forceDownloadFn — دالة تحميل المذكرة
 */
export function renderHistoryTree(playQuizFn, forceDownloadFn) {
  logFunctionStatus("renderHistoryTree", false);
  const { historyId } = getMainSheetContainerIds();
  const historyTree = document.getElementById(historyId);
  if (!historyTree) return;
  historyTree.innerHTML = "";

  const targetArray =
    state.currentViewMode === "notes" ? state.allNotes : state.allQuizzes;
  let itemsToShow = targetArray.map((item, index) => ({
    data: item,
    originalIndex: index,
  }));

  // تطبيق الفلتر
  if (state.currentSubjectFilter !== "الكل") {
    itemsToShow = itemsToShow.filter(
      (item) => item.data.config.subject === state.currentSubjectFilter,
    );
  }

  if (itemsToShow.length === 0) {
    historyTree.innerHTML = `<div class="p-5 rounded-3xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-gray-500 text-sm font-medium">لا توجد بيانات مسجلة هنا حالياً.</div>`;
    return;
  }

  // بناء هيكل الشجرة
  const treeData = {};
  itemsToShow.forEach((item) => {
    const config = item.data.config;
    let timestamp = Date.now();

    const createdAt =
      item.data.createdAt || config.createdAt || item.data.updatedAt;
    if (createdAt) {
      const t = new Date(createdAt).getTime();
      if (!isNaN(t)) timestamp = t;
    } else {
      const rawId = config.id;
      if (typeof rawId === "string" && rawId.includes("-")) {
        const maybeTs = parseInt(rawId.split("-")[1]);
        if (!isNaN(maybeTs)) timestamp = maybeTs;
      }
    }
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString("ar-EG", { month: "long" });
    const monthNum = date.getMonth() + 1;
    const day = date.getDate();

    if (!treeData[year]) treeData[year] = {};
    if (!treeData[year][monthNum])
      treeData[year][monthNum] = { name: monthName, days: {} };
    if (!treeData[year][monthNum].days[day])
      treeData[year][monthNum].days[day] = [];
    treeData[year][monthNum].days[day].push(item);
  });

  // رسم الشجرة
  let html = "";
  const themeColor = state.currentViewMode === "notes" ? "rose" : "emerald";

  const years = Object.keys(treeData).sort((a, b) => b - a);
  years.forEach((year) => {
    html += `
            <div id="year-${year}" class="mb-2">
                <button data-tree-action="toggle-node" data-tree-value="content-year-${year}" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-gray-100 p-3 rounded-2xl hover:bg-gray-200 transition">
                    <span><i class="bi bi-calendar3 text-${themeColor}-500 ml-2"></i> ${year}</span>
                    <i class="bi bi-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="content-year-${year}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `;

    const months = Object.keys(treeData[year]).sort((a, b) => b - a);
    months.forEach((monthNum) => {
      const monthName = treeData[year][monthNum].name;
      const monthId = `${year}-${monthNum}`;

      html += `
                <div id="month-${monthId}" class="mb-2">
                    <button data-tree-action="toggle-node" data-tree-value="content-month-${monthId}" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-3 hover:bg-${themeColor}-50 rounded-2xl transition">
                        <span><i class="bi bi-folder2-open text-yellow-500 ml-2"></i> ${monthName}</span>
                        <i class="bi bi-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="content-month-${monthId}" class="pr-5 mt-1 space-y-3 border-r-2 border-${themeColor}-100 hidden">
            `;

      const days = Object.keys(treeData[year][monthNum].days).sort(
        (a, b) => b - a,
      );
      days.forEach((day) => {
        const dayId = `${year}-${monthNum}-${day}`;
        html += `
                    <div id="day-${dayId}" class="mb-2 relative">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-3 h-3 rounded-full bg-green-500 shadow-sm border-2 border-white absolute -right-[23px]"></span>
                            <span class="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md">يوم ${day}</span>
                        </div>
                        <div id="content-day-${dayId}" class="pr-2 space-y-2">
                `;

        treeData[year][monthNum].days[day].forEach((item) => {
          const config = item.data.config;
          const shareUrl = `${window.location.origin}/?quiz=${encodeURIComponent(String(config.id))}`;

          if (state.currentViewMode === "exams") {
            html += `
                            <div class="group mb-2">
                                <div data-tree-action="play-quiz" data-tree-value="${item.originalIndex}" class="p-3 bg-white rounded-3xl border border-gray-200 shadow-md hover:shadow-lg hover:border-emerald-300 transition cursor-pointer">
                                    <p class="font-bold text-gray-900 text-sm group-hover:text-emerald-600 transition truncate">${escapeHtml(config.title)}</p>
                                    ${config.description ? `<p class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(config.description)}</p>` : ""}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-600">
                                        <span class="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || "بدون مادة")}</span>
                                        <span class="bg-gray-100 px-2 py-1 rounded text-gray-700 font-medium"><i class="far fa-clock"></i> ${config.timeLimit / 60} د</span>
                                    </div>
                                    <div class="mt-2 flex items-center gap-2 text-xs" data-tree-action="stop-propagation">
                                        <span class="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-bold">رابط</span>
                                        <div class="flex-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 truncate" dir="ltr">
                                            ${escapeHtml(shareUrl)}
                                        </div>
                                        <button class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition" data-tree-action="copy-quiz-link" data-tree-value="${escapeHtml(String(config.id))}">
                                            نسخ
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
          } else {
            const iconClass =
              config.type === "ppt"
                ? "bi-file-earmark-slides-fill text-emerald-500"
                : "bi-file-earmark-pdf-fill text-rose-500";
            const safeLink = encodeURIComponent(config.link || "");
            html += `
                            <div class="group mb-2">
                                <div data-tree-action="download-note" data-tree-value="${safeLink}" class="p-3 bg-white rounded-3xl border border-gray-200 shadow-md hover:shadow-lg hover:border-rose-300 transition cursor-pointer">
                                    <div class="flex justify-between items-start">
                                        <p class="font-bold text-gray-900 text-sm group-hover:text-rose-600 transition truncate pr-2">${escapeHtml(config.title)}</p>
                                        <i class="bi ${iconClass} text-lg"></i>
                                    </div>
                                    ${config.description ? `<p class="text-xs text-gray-500 mt-1 truncate">${escapeHtml(config.description)}</p>` : ""}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-600">
                                        <span class="bg-rose-100 text-rose-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || "بدون مادة")}</span>
                                        <span class="bg-rose-100 px-2 py-1 rounded text-rose-700 font-bold hover:bg-rose-200 transition">تحميل مباشر <i class="fas fa-download ml-1"></i></span>
                                    </div>
                                </div>
                            </div>
                        `;
          }
        });
        html += `</div></div>`;
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  });
  historyTree.innerHTML = html;
  bindDelegatedTreeActions(historyTree);
  expandFirstTreeBranch(historyTree);
}

/**
 * رسم شجرة التعديل للأدمن (امتحانات أو مذكرات)
 * @param {Function} loadQuizIntoBuilderFn — دالة تحميل اختبار للتعديل
 * @param {Function} loadNoteIntoBuilderFn — دالة تحميل مذكرة للتعديل
 */
export function renderEditTree(loadQuizIntoBuilderFn, loadNoteIntoBuilderFn) {
  logFunctionStatus("renderEditTree", false);
  const editTree = document.getElementById("edit-history-tree");
  if (!editTree) return;
  editTree.innerHTML = "";

  const targetArray =
    state.editTabMode === "exams" ? state.allQuizzes : state.allNotes;
  let itemsToShow = targetArray.map((item, index) => ({
    data: item,
    originalIndex: index,
  }));

  if (state.editSubjectFilter !== "الكل") {
    itemsToShow = itemsToShow.filter(
      (item) => item.data.config.subject === state.editSubjectFilter,
    );
  }

  if (itemsToShow.length === 0) {
    editTree.innerHTML = `<div class="p-5 rounded-3xl bg-white border border-gray-100 shadow-sm text-center text-gray-500 text-sm font-medium">لا يوجد محتوى مسجل هنا لتعديله.</div>`;
    return;
  }

  const treeData = {};
  itemsToShow.forEach((item) => {
    const config = item.data.config;
    const rawId = String(config.id || "");
    const timestamp = rawId.includes("-")
      ? parseInt(rawId.split("-")[1]) || Date.now()
      : item.data.createdAt
        ? new Date(item.data.createdAt).getTime()
        : Date.now();
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const monthName = date.toLocaleDateString("ar-EG", { month: "long" });
    const monthNum = date.getMonth() + 1;

    if (!treeData[year]) treeData[year] = {};
    if (!treeData[year][monthNum])
      treeData[year][monthNum] = { name: monthName, items: [] };
    treeData[year][monthNum].items.push(item);
  });

  let html = "";
  const themeColor = state.editTabMode === "exams" ? "emerald" : "rose";
  const years = Object.keys(treeData).sort((a, b) => b - a);

  years.forEach((year) => {
    html += `
            <div id="edit-year-${year}" class="mb-2">
                <button data-tree-action="toggle-node" data-tree-value="edit-content-year-${year}" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-white shadow-sm border border-gray-100 p-3 rounded-2xl hover:bg-gray-50 transition">
                    <span><i class="bi bi-calendar3 text-${themeColor}-500 ml-2"></i> ${year}</span>
                    <i class="bi bi-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="edit-content-year-${year}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `;

    const months = Object.keys(treeData[year]).sort((a, b) => b - a);
    months.forEach((monthNum) => {
      const monthName = treeData[year][monthNum].name;
      const monthId = `${year}-${monthNum}`;

      html += `
                <div id="edit-month-${monthId}" class="mb-2">
                    <button data-tree-action="toggle-node" data-tree-value="edit-content-month-${monthId}" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-3 hover:bg-${themeColor}-50 rounded-2xl transition">
                        <span><i class="bi bi-folder2-open text-yellow-500 ml-2"></i> ${monthName}</span>
                        <i class="bi bi-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="edit-content-month-${monthId}" class="pr-5 mt-1 space-y-2 border-r-2 border-${themeColor}-100 hidden">
            `;

      treeData[year][monthNum].items.forEach((item) => {
        const config = item.data.config;
        const shareUrl = `${window.location.origin}/?quiz=${encodeURIComponent(String(config.id))}`;

        if (state.editTabMode === "exams") {
          html += `
                        <div class="mb-2 flex items-center gap-2">

                            <!-- ✅ زر التعديل -->
                               <div data-tree-action="load-quiz-builder" data-tree-value="${item.originalIndex}"
                                   class="group flex-1 p-3 bg-white rounded-3xl border border-gray-100 shadow-sm
                                        hover:shadow-md hover:border-emerald-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-emerald-600 transition truncate">
                                        ${escapeHtml(config.title)}
                                    </p>
                                    <i class="fas fa-pen text-emerald-200 group-hover:text-emerald-500 transition ml-2 flex-shrink-0"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">
                                        ${escapeHtml(config.subject || "بدون مادة")}
                                    </span>
                                </div>
                                <div class="mt-2 flex items-center gap-2 text-xs" data-tree-action="stop-propagation">
                                    <span class="px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-bold">رابط</span>
                                    <div class="flex-1 px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600 truncate" dir="ltr">
                                        ${escapeHtml(shareUrl)}
                                    </div>
                                    <button class="px-2.5 py-1 rounded-md bg-emerald-600 text-white font-bold hover:bg-emerald-700 transition" data-tree-action="copy-quiz-link" data-tree-value="${escapeHtml(String(config.id))}">
                                        نسخ
                                    </button>
                                </div>
                            </div>

                            <!-- ✅ زر الحذف منفصل خارج كارد التعديل -->
                            ${
                              state.isAdmin
                                ? `
                                <button data-tree-action="delete-exam-edit" data-tree-value="${escapeHtml(config.id)}"
                                    class="flex-shrink-0 w-9 h-9 flex items-center justify-center
                                           bg-red-50 hover:bg-red-500 text-red-500 hover:text-white
                                     rounded-2xl border border-red-100 hover:border-red-500
                                           shadow-sm transition duration-200"
                                    title="حذف الامتحان">
                                <i class="fas fa-trash text-sm"></i>
                            </button>`
                                : ""
                            }

                        </div>
                    `;
        } else {
          html += `
                        <div class="mb-2 flex items-center gap-2">

                            <!-- ✅ زر التعديل -->
                               <div data-tree-action="load-note-builder" data-tree-value="${item.originalIndex}"
                                   class="group flex-1 p-3 bg-white rounded-3xl border border-gray-100 shadow-sm
                                        hover:shadow-md hover:border-rose-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-rose-600 transition truncate">
                                        ${escapeHtml(config.title)}
                                    </p>
                                    <i class="fas fa-pen text-rose-200 group-hover:text-rose-500 transition ml-2 flex-shrink-0"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-rose-50 text-rose-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">
                                        ${escapeHtml(config.subject || "بدون مادة")}
                                    </span>
                                </div>
                            </div>

                            <!-- ✅ زر الحذف منفصل خارج كارد التعديل -->
                            ${
                              state.isAdmin
                                ? `
                                <button data-tree-action="delete-note-edit" data-tree-value="${escapeHtml(config.id)}"
                                    class="flex-shrink-0 w-9 h-9 flex items-center justify-center
                                           bg-red-50 hover:bg-red-500 text-red-500 hover:text-white
                                     rounded-2xl border border-red-100 hover:border-red-500
                                           shadow-sm transition duration-200"
                                    title="حذف المذكرة">
                                <i class="fas fa-trash text-sm"></i>
                            </button>`
                                : ""
                            }

                        </div>
                    `;
        }
      });
      html += `</div></div>`;
    });
    html += `</div></div>`;
  });
  editTree.innerHTML = html;
  bindDelegatedTreeActions(editTree);
  expandFirstTreeBranch(editTree);
}

// ==========================================
//         دوال إدارة المجلدات (المواد)
// ==========================================

/**
 * فتح مودل تعديل اسم المادة
 * @param {string} oldName — اسم المادة الحالي
 * @param {Event} event — حدث النقر
 */
export function renameSubject(oldName, event) {
  logFunctionStatus("renameSubject", false);
  event.stopPropagation();
  state.subjectToRename = oldName;

  const inputEl = document.getElementById("rename-subject-input");
  inputEl.value = oldName;

  document.getElementById("rename-subject-modal").classList.remove("hidden");
  setTimeout(() => inputEl.select(), 100);
}

/**
 * إغلاق مودل تعديل اسم المادة
 */
export function closeRenameModal() {
  logFunctionStatus("closeRenameModal", false);
  state.subjectToRename = null;
  document.getElementById("rename-subject-modal").classList.add("hidden");
}

/**
 * تنفيذ تعديل اسم المادة على السيرفر وتحديث البيانات المحلية
 * @param {Function} renderSubjectFiltersFn — دالة رسم الفلاتر
 * @param {Function} renderHistoryTreeFn — دالة رسم الشجرة
 * @param {Function} renderDashboardFn — دالة رسم لوحة التحكم
 */
export async function executeRenameSubject(
  renderSubjectFiltersFn,
  renderHistoryTreeFn,
  renderDashboardFn,
) {
  logFunctionStatus("executeRenameSubject", true);
  const newName = document.getElementById("rename-subject-input").value.trim();

  if (newName === "") {
    showAlert("⚠️ يرجى إدخال اسم صحيح للمادة!", "warning");
    return;
  }

  if (state.subjectToRename && newName !== state.subjectToRename) {
    console.log(
      `[renameSubject] بدء تعديل اسم المادة — "${state.subjectToRename}" → "${newName}"`,
    );
    try {
      const result = await apiCall("PUT", "/api/quizzes/subject/rename", {
        oldName: state.subjectToRename,
        newName,
      });
      console.log(
        `[renameSubject] ✓ تم على السيرفر — ${result.modifiedCount || 0} امتحان تأثر`,
      );
    } catch (e) {
      console.error(`[renameSubject] ✗ فشل:`, e.message);
      showAlert(
        "⚠️ تعذر تعديل اسم المادة على السيرفر: " + e.message,
        "warning",
      );
    }
    // إعادة تحميل الامتحانات من السيرفر وضبط الصيغة الداخلية
    try {
      const res = await apiCall("GET", "/api/quizzes");
      const raw = Array.isArray(res) ? res : res?.data || [];
      state.allQuizzes = raw.map((q) => ({
        id: q.id,
        config: {
          id: q.id,
          title: q.title,
          subject: q.subject,
          description: q.description || "",
          timeLimit: q.timeLimit || 1500,
          closingMessage: q.closingMessage || "شكراً لمشاركتك!",
        },
        questions: q.questions || [],
      }));
    } catch (e) {
      showAlert(
        "⚠️ تعذر تحديث قائمة الامتحانات بعد تعديل اسم المادة: " + e.message,
        "warning",
      );
    }
    // إذا كان اسم المادة جزءاً من المواد الافتراضية، نحدّثه هناك أيضاً
    const defIndex = DEFAULT_SUBJECTS.indexOf(state.subjectToRename);
    if (defIndex !== -1) {
      DEFAULT_SUBJECTS[defIndex] = newName;
    }

    if (state.currentSubjectFilter === state.subjectToRename)
      state.currentSubjectFilter = newName;
    if (state.editSubjectFilter === state.subjectToRename)
      state.editSubjectFilter = newName;
    closeRenameModal();
    if (renderSubjectFiltersFn) renderSubjectFiltersFn();
    if (renderHistoryTreeFn) renderHistoryTreeFn();
    if (renderDashboardFn) renderDashboardFn();
  } else {
    closeRenameModal();
  }
}

/**
 * فتح مودل تأكيد حذف المادة
 * @param {string} subjectName — اسم المادة المراد حذفها
 * @param {Event} event — حدث النقر
 */
export function confirmDeleteSubject(subjectName, event) {
  logFunctionStatus("confirmDeleteSubject", false);
  event.stopPropagation();
  state.subjectToDelete = subjectName;
  document.getElementById("delete-subject-msg").innerText =
    `هل أنت متأكد من حذف مجلد "${subjectName}"؟ سيتم مسح جميع الامتحانات بداخله نهائياً!`;
  document.getElementById("delete-subject-modal").classList.remove("hidden");
}

/**
 * إغلاق مودل تأكيد حذف المادة
 */
export function closeDeleteModal() {
  logFunctionStatus("closeDeleteModal", false);
  state.subjectToDelete = null;
  document.getElementById("delete-subject-modal").classList.add("hidden");
}

/**
 * تنفيذ حذف المادة على السيرفر وإزالة الامتحانات المرتبطة محلياً
 * @param {Function} renderSubjectFiltersFn — دالة رسم الفلاتر
 * @param {Function} renderHistoryTreeFn — دالة رسم الشجرة
 * @param {Function} renderDashboardFn — دالة رسم لوحة التحكم
 */
export async function executeDeleteSubject(
  renderSubjectFiltersFn,
  renderHistoryTreeFn,
  renderDashboardFn,
) {
  logFunctionStatus("executeDeleteSubject", true);
  if (state.subjectToDelete) {
    console.log(`[deleteSubject] بدء حذف المادة — "${state.subjectToDelete}"`);
    try {
      const result = await apiCall(
        "DELETE",
        "/api/quizzes/subject/" + encodeURIComponent(state.subjectToDelete),
      );
      console.log(
        `[deleteSubject] ✓ تم على السيرفر — ${result.deletedCount || 0} امتحان محذوف`,
      );
    } catch (e) {
      console.error(`[deleteSubject] ✗ فشل:`, e.message);
      showAlert("⚠️ تعذر حذف المادة على السيرفر: " + e.message, "warning");
    }
    state.allQuizzes = state.allQuizzes.filter(
      (q) => q.config.subject !== state.subjectToDelete,
    );
    if (state.currentSubjectFilter === state.subjectToDelete)
      state.currentSubjectFilter = "الكل";
    if (state.editSubjectFilter === state.subjectToDelete)
      state.editSubjectFilter = "الكل";
    closeDeleteModal();
    if (renderSubjectFiltersFn) renderSubjectFiltersFn();
    if (renderHistoryTreeFn) renderHistoryTreeFn();
    if (renderDashboardFn) renderDashboardFn();
  }
}

/**
 * حذف امتحان من شجرة التاريخ مع تأكيد
 * @param {string} examId
 * @param {Event} event
 */
window.deleteExamFromHistoryTree = function (examId, event) {
  event.stopPropagation();
  state.examToDelete = examId;
  document.getElementById("delete-exam-msg").innerText =
    "هل أنت متأكد من حذف هذا الامتحان؟ سيتم مسحه نهائياً!";
  document.getElementById("delete-exam-modal").classList.remove("hidden");
};

/**
 * حذف مذكرة من شجرة التاريخ مع تأكيد
 * @param {string} noteId
 * @param {Event} event
 */
window.deleteNoteFromHistoryTree = function (noteId, event) {
  event.stopPropagation();
  state.noteToDelete = noteId;
  document.getElementById("delete-exam-msg").innerText =
    "هل أنت متأكد من حذف هذه المذكرة؟ سيتم مسحها نهائياً!";
  document.getElementById("delete-exam-modal").classList.remove("hidden");
};

/**
 * حذف امتحان من شجرة التعديل (قسم الإدارة) — يظهر فقط للأدمن
 * @param {string} examId
 * @param {Event} event
 */
window.deleteExamFromEditTree = function (examId, event) {
  event.stopPropagation();
  state.examToDelete = examId;
  // وضع علامة سياق الحذف كي نعيد رسم شجرة التعديل بعد الحذف
  state._lastDeleteContext = "edit";
  document.getElementById("delete-exam-msg").innerText =
    "هل أنت متأكد من حذف هذا الامتحان؟ سيتم مسحه نهائياً!";
  document.getElementById("delete-exam-modal").classList.remove("hidden");
};

/**
 * حذف مذكرة من شجرة التعديل (قسم الإدارة) — يظهر فقط للأدمن
 * @param {string} noteId
 * @param {Event} event
 */
window.deleteNoteFromEditTree = function (noteId, event) {
  event.stopPropagation();
  state.noteToDelete = noteId;
  state._lastDeleteContext = "edit";
  document.getElementById("delete-exam-msg").innerText =
    "هل أنت متأكد من حذف هذه المذكرة؟ سيتم مسحها نهائياً!";
  document.getElementById("delete-exam-modal").classList.remove("hidden");
};

/**
 * إغلاق مودل تأكيد الحذف
 */
window.closeDeleteExamModal = function () {
  state.examToDelete = null;
  state.noteToDelete = null;
  document.getElementById("delete-exam-modal").classList.add("hidden");
};

/**
 * تنفيذ الحذف بعد التأكيد
 */
window.confirmDeleteExamOrNote = async function () {
  if (state.examToDelete) {
    try {
      await apiCall(
        "DELETE",
        "/api/quizzes/" + encodeURIComponent(state.examToDelete),
      );
      state.allQuizzes = state.allQuizzes.filter(
        (q) => q.config.id !== state.examToDelete,
      );
      showAlert("✓ تم حذف الامتحان بنجاح", "success");
    } catch (e) {
      showAlert("⚠️ فشل حذف الامتحان: " + e.message, "warning");
    }
    state.examToDelete = null;
  }
  if (state.noteToDelete) {
    try {
      await apiCall(
        "DELETE",
        "/api/notes/" + encodeURIComponent(state.noteToDelete),
      );
      state.allNotes = state.allNotes.filter(
        (n) => n.config.id !== state.noteToDelete,
      );
      showAlert("✓ تم حذف المذكرة بنجاح", "success");
    } catch (e) {
      showAlert("⚠️ فشل حذف المذكرة: " + e.message, "warning");
    }
    state.noteToDelete = null;
  }
  document.getElementById("delete-exam-modal").classList.add("hidden");
  // إعادة رسم الشجرة بعد الحذف
  if (typeof renderHistoryTree === "function")
    renderHistoryTree(playQuiz, forceDownload);
  // إذا كانت عملية الحذف من واجهة التعديل، أعد رسم شجرة التعديل أيضاً
  try {
    if (
      state._lastDeleteContext === "edit" &&
      typeof renderEditTree === "function"
    )
      renderEditTree();
  } catch (e) {
    // لا تفعل شيئاً إن لم تكن الدوال متاحة في هذا السياق
  }
};
