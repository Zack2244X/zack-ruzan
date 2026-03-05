/**
 * @module tree
 * @description وحدة رسم الشجرة — عرض الامتحانات والمذكرات بتنسيق شجري حسب التاريخ
 */
import state from './state.js';
import { escapeHtml, showAlert, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js';

/** @constant {Array<string>} المواد الافتراضية */
const DEFAULT_SUBJECTS = [
    'الصرف',
    'الفلسفة وعلم الأخلاق',
    'القضايا المجتمعية',
    'النحو التطبيقي',
    'علم البيان',
    'علم اللغة وفقهها',
    'نصوص الأدب الجاهلي'
];

/**
 * استخراج قائمة المواد الديناميكية من الاختبارات والمذكرات مع الافتراضية
 * @returns {Array<string>} مصفوفة المواد مع "الكل" في البداية
 */
export function getDynamicSubjects() {
    logFunctionStatus('getDynamicSubjects', false);
    const subjectsSet = new Set(DEFAULT_SUBJECTS);

    const targetArray = state.currentViewMode === 'notes' ? state.allNotes : state.allQuizzes;
    targetArray.forEach(item => {
        if (item.config && item.config.subject) subjectsSet.add(item.config.subject);
    });
    return ['الكل', ...Array.from(subjectsSet)];
}

/**
 * رسم أزرار فلتر المواد في القائمة الرئيسية ونافذة التعديل مع أدوات الأدمن
 * @param {Function} renameSubjectFn — دالة تعديل اسم المادة
 * @param {Function} confirmDeleteSubjectFn — دالة تأكيد حذف المادة
 */
export function renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn) {
    logFunctionStatus('renderSubjectFilters', false);
    const subjects = getDynamicSubjects();

    // 1. تحديث قائمة Datalist
    const dataList = document.getElementById('subjects-list');
    if (dataList) {
        let dlHtml = '';
        subjects.forEach(sub => {
            if (sub !== 'الكل') dlHtml += `<option value="${escapeHtml(sub)}">`;
        });
        dataList.innerHTML = dlHtml;
    }

    // 2. تحديث شريط الفلاتر في القائمة الرئيسية
    const mainContainer = document.getElementById('subject-filters-container');
    if (mainContainer) {
        let filtersHtml = '';
        subjects.forEach(sub => {
            const isActive = sub === state.currentSubjectFilter;
            const activeClasses = isActive
                ? 'bg-blue-600 text-white shadow-md border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-blue-50 hover:text-blue-600';

            let adminTools = '';
            if (state.isAdmin && sub !== 'الكل') {
                adminTools = `
                    <span class="inline-flex items-center gap-2 mr-3 pr-3 border-r ${isActive ? 'border-blue-400' : 'border-gray-200'}">
                        <i onclick="renameSubject('${escapeHtml(sub)}', event)" class="fas fa-pen text-xs hover:text-green-400 transition cursor-pointer" title="تعديل الاسم"></i>
                        <i onclick="confirmDeleteSubject('${escapeHtml(sub)}', event)" class="fas fa-times text-xs hover:text-red-500 transition cursor-pointer" title="حذف المجلد"></i>
                    </span>
                `;
            }

            filtersHtml += `
                <button onclick="setSubjectFilter('${escapeHtml(sub)}')" class="flex items-center whitespace-nowrap px-4 py-2 rounded-full border text-sm font-bold transition duration-300 ${activeClasses}">
                    ${escapeHtml(sub)} ${adminTools}
                </button>
            `;
        });
        mainContainer.innerHTML = filtersHtml;
    }

    // 3. تحديث شريط الفلاتر في نافذة التعديل
    const editContainer = document.getElementById('edit-subject-filters-container');
    if (editContainer) {
        let editHtml = '';
        subjects.forEach(sub => {
            const isActive = sub === state.editSubjectFilter;
            const activeClasses = isActive
                ? 'bg-purple-600 text-white shadow-md border-purple-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-purple-50 hover:text-purple-600';
            editHtml += `<button onclick="setEditSubjectFilter('${escapeHtml(sub)}')" class="whitespace-nowrap px-3 py-1.5 rounded-full border text-xs font-bold transition duration-300 ${activeClasses}">${escapeHtml(sub)}</button>`;
        });
        editContainer.innerHTML = editHtml;
    }
}

/**
 * تعيين فلتر المادة في القائمة الرئيسية وإعادة الرسم
 * @param {string} subject — اسم المادة المختارة
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} [renameSubjectFn] — دالة تعديل اسم المادة
 * @param {Function} [confirmDeleteSubjectFn] — دالة تأكيد حذف المادة
 */
export function setSubjectFilter(subject, renderHistoryTree, renameSubjectFn, confirmDeleteSubjectFn) {
    logFunctionStatus('setSubjectFilter', false);
    state.currentSubjectFilter = subject;
    renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn);
    renderHistoryTree();
}

/**
 * تعيين فلتر المادة في نافذة التعديل وإعادة الرسم
 * @param {string} subject — اسم المادة المختارة
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} [renameSubjectFn] — دالة تعديل اسم المادة
 * @param {Function} [confirmDeleteSubjectFn] — دالة تأكيد حذف المادة
 */
export function setEditSubjectFilter(subject, renderEditTree, renameSubjectFn, confirmDeleteSubjectFn) {
    logFunctionStatus('setEditSubjectFilter', false);
    state.editSubjectFilter = subject;
    renderSubjectFilters(renameSubjectFn, confirmDeleteSubjectFn);
    renderEditTree();
}

/**
 * رسم الشجرة الرئيسية (امتحانات أو مذكرات) مرتبة حسب السنة/الشهر/اليوم
 * @param {Function} playQuizFn — دالة بدء الاختبار
 * @param {Function} forceDownloadFn — دالة تحميل المذكرة
 */
export function renderHistoryTree(playQuizFn, forceDownloadFn) {
    logFunctionStatus('renderHistoryTree', false);
    const historyTree = document.getElementById('history-tree');
    if (!historyTree) return;
    historyTree.innerHTML = '';

    const targetArray = state.currentViewMode === 'notes' ? state.allNotes : state.allQuizzes;
    let itemsToShow = targetArray.map((item, index) => ({ data: item, originalIndex: index }));

    // تطبيق الفلتر
    if (state.currentSubjectFilter !== 'الكل') {
        itemsToShow = itemsToShow.filter(item => item.data.config.subject === state.currentSubjectFilter);
    }

    if (itemsToShow.length === 0) {
        historyTree.innerHTML = `<div class="p-5 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 text-center text-gray-500 text-sm font-medium">لا توجد بيانات مسجلة هنا حالياً.</div>`;
        return;
    }

    // بناء هيكل الشجرة
    const treeData = {};
    itemsToShow.forEach(item => {
        const config = item.data.config;
        let timestamp = Date.now();

        const createdAt = item.data.createdAt || config.createdAt || item.data.updatedAt;
        if (createdAt) {
            const t = new Date(createdAt).getTime();
            if (!isNaN(t)) timestamp = t;
        } else {
            const rawId = config.id;
            if (typeof rawId === 'string' && rawId.includes('-')) {
                const maybeTs = parseInt(rawId.split('-')[1]);
                if (!isNaN(maybeTs)) timestamp = maybeTs;
            }
        }
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const monthName = date.toLocaleDateString('ar-EG', { month: 'long' });
        const monthNum = date.getMonth() + 1;
        const day = date.getDate();

        if (!treeData[year]) treeData[year] = {};
        if (!treeData[year][monthNum]) treeData[year][monthNum] = { name: monthName, days: {} };
        if (!treeData[year][monthNum].days[day]) treeData[year][monthNum].days[day] = [];
        treeData[year][monthNum].days[day].push(item);
    });

    // رسم الشجرة
    let html = '';
    const themeColor = state.currentViewMode === 'notes' ? 'orange' : 'blue';

    const years = Object.keys(treeData).sort((a, b) => b - a);
    years.forEach(year => {
        html += `
            <div id="year-${year}" class="mb-2">
                <button onclick="toggleTreeNode('content-year-${year}', this)" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-gray-100 p-3 rounded-xl hover:bg-gray-200 transition">
                    <span><i class="far fa-calendar text-${themeColor}-500 ml-2"></i> ${year}</span>
                    <i class="fas fa-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="content-year-${year}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `;

        const months = Object.keys(treeData[year]).sort((a, b) => b - a);
        months.forEach(monthNum => {
            const monthName = treeData[year][monthNum].name;
            const monthId = `${year}-${monthNum}`;

            html += `
                <div id="month-${monthId}" class="mb-2">
                    <button onclick="toggleTreeNode('content-month-${monthId}', this)" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-2 hover:bg-${themeColor}-50 rounded-lg transition">
                        <span><i class="fas fa-folder-open text-yellow-400 ml-2"></i> ${monthName}</span>
                        <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="content-month-${monthId}" class="pr-5 mt-1 space-y-3 border-r-2 border-${themeColor}-100 hidden">
            `;

            const days = Object.keys(treeData[year][monthNum].days).sort((a, b) => b - a);
            days.forEach(day => {
                const dayId = `${year}-${monthNum}-${day}`;
                html += `
                    <div id="day-${dayId}" class="mb-2 relative">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-3 h-3 rounded-full bg-green-500 shadow-sm border-2 border-white absolute -right-[23px]"></span>
                            <span class="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-md">يوم ${day}</span>
                        </div>
                        <div id="content-day-${dayId}" class="pr-2 space-y-2">
                `;

                treeData[year][monthNum].days[day].forEach(item => {
                    const config = item.data.config;

                    if (state.currentViewMode === 'exams') {
                        html += `
                            <div class="group mb-2">
                                <div onclick="playQuiz(${item.originalIndex})" class="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-300 transition cursor-pointer">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition truncate">${escapeHtml(config.title)}</p>
                                    ${config.description ? `<p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(config.description)}</p>` : ''}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                        <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || 'بدون مادة')}</span>
                                        <span class="bg-gray-50 px-2 py-1 rounded text-gray-600 font-medium"><i class="far fa-clock"></i> ${config.timeLimit / 60} د</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        const iconClass = config.type === 'ppt' ? 'fa-file-powerpoint text-red-500' : 'fa-file-pdf text-orange-500';
                        const safeLink = encodeURI(config.link || '');
                        html += `
                            <div class="group mb-2">
                                <div onclick="forceDownload('${safeLink}')" class="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-300 transition cursor-pointer">
                                    <div class="flex justify-between items-start">
                                        <p class="font-bold text-gray-800 text-sm group-hover:text-orange-600 transition truncate pr-2">${escapeHtml(config.title)}</p>
                                        <i class="fas ${iconClass} text-lg"></i>
                                    </div>
                                    ${config.description ? `<p class="text-xs text-gray-400 mt-1 truncate">${escapeHtml(config.description)}</p>` : ''}
                                    <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                        <span class="bg-orange-50 text-orange-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || 'بدون مادة')}</span>
                                        <span class="bg-orange-50 px-2 py-1 rounded text-orange-700 font-bold hover:bg-orange-100 transition">تحميل مباشر <i class="fas fa-download ml-1"></i></span>
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
}

/**
 * رسم شجرة التعديل للأدمن (امتحانات أو مذكرات)
 * @param {Function} loadQuizIntoBuilderFn — دالة تحميل اختبار للتعديل
 * @param {Function} loadNoteIntoBuilderFn — دالة تحميل مذكرة للتعديل
 */
export function renderEditTree(loadQuizIntoBuilderFn, loadNoteIntoBuilderFn) {
    logFunctionStatus('renderEditTree', false);
    const editTree = document.getElementById('edit-history-tree');
    if (!editTree) return;
    editTree.innerHTML = '';

    const targetArray = state.editTabMode === 'exams' ? state.allQuizzes : state.allNotes;
    let itemsToShow = targetArray.map((item, index) => ({ data: item, originalIndex: index }));

    if (state.editSubjectFilter !== 'الكل') {
        itemsToShow = itemsToShow.filter(item => item.data.config.subject === state.editSubjectFilter);
    }

    if (itemsToShow.length === 0) {
        editTree.innerHTML = `<div class="p-5 rounded-2xl bg-white border border-gray-100 shadow-sm text-center text-gray-500 text-sm font-medium">لا يوجد محتوى مسجل هنا لتعديله.</div>`;
        return;
    }

    const treeData = {};
    itemsToShow.forEach(item => {
        const config = item.data.config;
        const rawId = String(config.id || '');
        const timestamp = rawId.includes('-') ? (parseInt(rawId.split('-')[1]) || Date.now()) : (item.data.createdAt ? new Date(item.data.createdAt).getTime() : Date.now());
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const monthName = date.toLocaleDateString('ar-EG', { month: 'long' });
        const monthNum = date.getMonth() + 1;

        if (!treeData[year]) treeData[year] = {};
        if (!treeData[year][monthNum]) treeData[year][monthNum] = { name: monthName, items: [] };
        treeData[year][monthNum].items.push(item);
    });

    let html = '';
    const themeColor = state.editTabMode === 'exams' ? 'blue' : 'orange';
    const years = Object.keys(treeData).sort((a, b) => b - a);

    years.forEach(year => {
        html += `
            <div id="edit-year-${year}" class="mb-2">
                <button onclick="toggleTreeNode('edit-content-year-${year}', this)" class="flex items-center justify-between w-full text-right font-extrabold text-gray-800 bg-white shadow-sm border border-gray-100 p-3 rounded-xl hover:bg-gray-50 transition">
                    <span><i class="far fa-calendar text-${themeColor}-500 ml-2"></i> ${year}</span>
                    <i class="fas fa-chevron-down text-gray-500 text-sm transition-transform duration-300 transform"></i>
                </button>
                <div id="edit-content-year-${year}" class="pr-4 mt-2 space-y-2 border-r-2 border-gray-200 hidden">
        `;

        const months = Object.keys(treeData[year]).sort((a, b) => b - a);
        months.forEach(monthNum => {
            const monthName = treeData[year][monthNum].name;
            const monthId = `${year}-${monthNum}`;

            html += `
                <div id="edit-month-${monthId}" class="mb-2">
                    <button onclick="toggleTreeNode('edit-content-month-${monthId}', this)" class="flex items-center justify-between w-full text-right font-bold text-gray-700 p-2 hover:bg-${themeColor}-50 rounded-lg transition">
                        <span><i class="fas fa-folder-open text-yellow-400 ml-2"></i> ${monthName}</span>
                        <i class="fas fa-chevron-down text-gray-400 text-xs transition-transform duration-300 transform"></i>
                    </button>
                    <div id="edit-content-month-${monthId}" class="pr-5 mt-1 space-y-2 border-r-2 border-${themeColor}-100 hidden">
            `;

            treeData[year][monthNum].items.forEach(item => {
                const config = item.data.config;

                if (state.editTabMode === 'exams') {
                    html += `
                        <div class="relative group mb-2">
                            <div onclick="loadQuizIntoBuilder(${item.originalIndex})" class="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-blue-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-blue-600 transition truncate">${escapeHtml(config.title)}</p>
                                    <i class="fas fa-pen text-blue-200 group-hover:text-blue-500 transition"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || 'بدون مادة')}</span>
                                </div>
                            </div>
                            ${state.isAdmin ? `<button onclick="deleteExamFromEditTree('${escapeHtml(config.id)}', event)\" class="absolute top-2 left-2 bg-red-50 hover:bg-red-200 text-red-600 rounded-full p-2 shadow transition\" title="حذف الامتحان"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    `;
                } else {
                    html += `
                        <div class="relative group mb-2">
                            <div onclick="loadNoteIntoBuilder(${item.originalIndex})" class="p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-orange-400 transition cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <p class="font-bold text-gray-800 text-sm group-hover:text-orange-600 transition truncate">${escapeHtml(config.title)}</p>
                                    <i class="fas fa-pen text-orange-200 group-hover:text-orange-500 transition"></i>
                                </div>
                                <div class="flex gap-2 items-center mt-2 text-xs text-gray-500">
                                    <span class="bg-orange-50 text-orange-700 px-2 py-1 rounded-md font-bold truncate max-w-[100px]">${escapeHtml(config.subject || 'بدون مادة')}</span>
                                </div>
                            </div>
                            ${state.isAdmin ? `<button onclick="deleteNoteFromEditTree('${escapeHtml(config.id)}', event)\" class="absolute top-2 left-2 bg-red-50 hover:bg-red-200 text-red-600 rounded-full p-2 shadow transition\" title="حذف المذكرة"><i class="fas fa-trash"></i></button>` : ''}
                        </div>
                    `;
                }
            });
            html += `</div></div>`;
        });
        html += `</div></div>`;
    });
    editTree.innerHTML = html;
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
    logFunctionStatus('renameSubject', false);
    event.stopPropagation();
    state.subjectToRename = oldName;

    const inputEl = document.getElementById('rename-subject-input');
    inputEl.value = oldName;

    document.getElementById('rename-subject-modal').classList.remove('hidden');
    setTimeout(() => inputEl.select(), 100);
}

/**
 * إغلاق مودل تعديل اسم المادة
 */
export function closeRenameModal() {
    logFunctionStatus('closeRenameModal', false);
    state.subjectToRename = null;
    document.getElementById('rename-subject-modal').classList.add('hidden');
}

/**
 * تنفيذ تعديل اسم المادة على السيرفر وتحديث البيانات المحلية
 * @param {Function} renderSubjectFiltersFn — دالة رسم الفلاتر
 * @param {Function} renderHistoryTreeFn — دالة رسم الشجرة
 * @param {Function} renderDashboardFn — دالة رسم لوحة التحكم
 */
export async function executeRenameSubject(renderSubjectFiltersFn, renderHistoryTreeFn, renderDashboardFn) {
    logFunctionStatus('executeRenameSubject', true);
    const newName = document.getElementById('rename-subject-input').value.trim();

    if (newName === '') {
        showAlert('⚠️ يرجى إدخال اسم صحيح للمادة!', 'warning');
        return;
    }

    if (state.subjectToRename && newName !== state.subjectToRename) {
        console.log(`[renameSubject] بدء تعديل اسم المادة — "${state.subjectToRename}" → "${newName}"`);
        try {
            const result = await apiCall('PUT', '/api/quizzes/subject/rename', { oldName: state.subjectToRename, newName });
            console.log(`[renameSubject] ✓ تم على السيرفر — ${result.modifiedCount || 0} امتحان تأثر`);
        } catch (e) {
            console.error(`[renameSubject] ✗ فشل:`, e.message);
            showAlert('⚠️ تعذر تعديل اسم المادة على السيرفر: ' + e.message, 'warning');
        }
        // إعادة تحميل الامتحانات من السيرفر وضبط الصيغة الداخلية
        try {
            const res = await apiCall('GET', '/api/quizzes');
            const raw = Array.isArray(res) ? res : (res?.data || []);
            state.allQuizzes = raw.map(q => ({
                id: q.id,
                config: {
                    id: q.id,
                    title: q.title,
                    subject: q.subject,
                    description: q.description || '',
                    timeLimit: q.timeLimit || 1500,
                    closingMessage: q.closingMessage || 'شكراً لمشاركتك!'
                },
                questions: q.questions || []
            }));
        } catch (e) {
            showAlert('⚠️ تعذر تحديث قائمة الامتحانات بعد تعديل اسم المادة: ' + e.message, 'warning');
        }
        // إذا كان اسم المادة جزءاً من المواد الافتراضية، نحدّثه هناك أيضاً
        const defIndex = DEFAULT_SUBJECTS.indexOf(state.subjectToRename);
        if (defIndex !== -1) {
            DEFAULT_SUBJECTS[defIndex] = newName;
        }

        if (state.currentSubjectFilter === state.subjectToRename) state.currentSubjectFilter = newName;
        if (state.editSubjectFilter === state.subjectToRename) state.editSubjectFilter = newName;
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
    logFunctionStatus('confirmDeleteSubject', false);
    event.stopPropagation();
    state.subjectToDelete = subjectName;
    document.getElementById('delete-subject-msg').innerText = `هل أنت متأكد من حذف مجلد "${subjectName}"؟ سيتم مسح جميع الامتحانات بداخله نهائياً!`;
    document.getElementById('delete-subject-modal').classList.remove('hidden');
}

/**
 * إغلاق مودل تأكيد حذف المادة
 */
export function closeDeleteModal() {
    logFunctionStatus('closeDeleteModal', false);
    state.subjectToDelete = null;
    document.getElementById('delete-subject-modal').classList.add('hidden');
}

/**
 * تنفيذ حذف المادة على السيرفر وإزالة الامتحانات المرتبطة محلياً
 * @param {Function} renderSubjectFiltersFn — دالة رسم الفلاتر
 * @param {Function} renderHistoryTreeFn — دالة رسم الشجرة
 * @param {Function} renderDashboardFn — دالة رسم لوحة التحكم
 */
export async function executeDeleteSubject(renderSubjectFiltersFn, renderHistoryTreeFn, renderDashboardFn) {
    logFunctionStatus('executeDeleteSubject', true);
    if (state.subjectToDelete) {
        console.log(`[deleteSubject] بدء حذف المادة — "${state.subjectToDelete}"`);
        try {
            const result = await apiCall('DELETE', '/api/quizzes/subject/' + encodeURIComponent(state.subjectToDelete));
            console.log(`[deleteSubject] ✓ تم على السيرفر — ${result.deletedCount || 0} امتحان محذوف`);
        } catch (e) {
            console.error(`[deleteSubject] ✗ فشل:`, e.message);
            showAlert('⚠️ تعذر حذف المادة على السيرفر: ' + e.message, 'warning');
        }
        state.allQuizzes = state.allQuizzes.filter(q => q.config.subject !== state.subjectToDelete);
        if (state.currentSubjectFilter === state.subjectToDelete) state.currentSubjectFilter = 'الكل';
        if (state.editSubjectFilter === state.subjectToDelete) state.editSubjectFilter = 'الكل';
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
window.deleteExamFromHistoryTree = function(examId, event) {
    event.stopPropagation();
    state.examToDelete = examId;
    document.getElementById('delete-exam-msg').innerText = 'هل أنت متأكد من حذف هذا الامتحان؟ سيتم مسحه نهائياً!';
    document.getElementById('delete-exam-modal').classList.remove('hidden');
}

/**
 * حذف مذكرة من شجرة التاريخ مع تأكيد
 * @param {string} noteId
 * @param {Event} event
 */
window.deleteNoteFromHistoryTree = function(noteId, event) {
    event.stopPropagation();
    state.noteToDelete = noteId;
    document.getElementById('delete-exam-msg').innerText = 'هل أنت متأكد من حذف هذه المذكرة؟ سيتم مسحها نهائياً!';
    document.getElementById('delete-exam-modal').classList.remove('hidden');
}

/**
 * إغلاق مودل تأكيد الحذف
 */
window.closeDeleteExamModal = function() {
    state.examToDelete = null;
    state.noteToDelete = null;
    document.getElementById('delete-exam-modal').classList.add('hidden');
}

/**
 * تنفيذ الحذف بعد التأكيد
 */
window.confirmDeleteExamOrNote = async function() {
    if (state.examToDelete) {
        try {
            await apiCall('DELETE', '/api/quizzes/' + encodeURIComponent(state.examToDelete));
            state.allQuizzes = state.allQuizzes.filter(q => q.config.id !== state.examToDelete);
            showAlert('✓ تم حذف الامتحان بنجاح', 'success');
        } catch (e) {
            showAlert('⚠️ فشل حذف الامتحان: ' + e.message, 'warning');
        }
        state.examToDelete = null;
    }
    if (state.noteToDelete) {
        try {
            await apiCall('DELETE', '/api/notes/' + encodeURIComponent(state.noteToDelete));
            state.allNotes = state.allNotes.filter(n => n.config.id !== state.noteToDelete);
            showAlert('✓ تم حذف المذكرة بنجاح', 'success');
        } catch (e) {
            showAlert('⚠️ فشل حذف المذكرة: ' + e.message, 'warning');
        }
        state.noteToDelete = null;
    }
    document.getElementById('delete-exam-modal').classList.add('hidden');
    // إعادة رسم الشجرة بعد الحذف
    if (typeof renderHistoryTree === 'function') renderHistoryTree(playQuiz, forceDownload);
}

/* مودل تأكيد حذف الامتحان أو المذكرة */
// أضف هذا الكود في ملف index.html أو في المكان المناسب داخل الصفحة:
/*
<div id="delete-exam-modal" class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30 hidden">
  <div class="bg-white rounded-xl shadow-lg p-6 w-full max-w-xs text-center">
    <p id="delete-exam-msg" class="mb-4 text-gray-700 font-bold"></p>
    <div class="flex gap-3 justify-center">
      <button onclick="confirmDeleteExamOrNote()" class="bg-red-600 text-white px-4 py-2 rounded font-bold hover:bg-red-700 transition">تأكيد الحذف</button>
      <button onclick="closeDeleteExamModal()" class="bg-gray-200 text-gray-700 px-4 py-2 rounded font-bold hover:bg-gray-300 transition">إلغاء</button>
    </div>
  </div>
</div>
*/
