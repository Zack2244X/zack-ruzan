/**
 * @module dashboard
 * @description وحدة لوحة التحكم الرئيسية — عرض آخر الامتحانات والمذكرات ولوحة الشرف
 */
import state from './state.js';
import { escapeHtml, logFunctionStatus } from './helpers.js';
import { getAttempts } from './api.js';

// ─────────────────────────────────────────────
//  دوال المساعدة للمحاولات
// ─────────────────────────────────────────────

/**
 * جلب عدد المحاولات لمجموعة امتحانات مع تخزين مؤقت في state.attemptsMap.
 *
 * يتحقق من الكاش أولاً ولا يُرسل طلباً للسيرفر إلا للبيانات الغائبة،
 * ويستخدم Promise.allSettled حتى لا يوقف فشل امتحان واحد بقية الطلبات.
 *
 * @param {Array} quizzes - قائمة الامتحانات المراد جلب محاولاتها
 * @returns {Promise<Map<string, number>>} خريطة quizId → عدد المحاولات
 */
async function resolveAttemptsMap(quizzes) {
    if (!state.attemptsMap) state.attemptsMap = new Map();

    // نُرسل طلبات فقط للامتحانات الغائبة من الكاش
    const missing = quizzes.filter(q => !state.attemptsMap.has(String(q.id)));
    if (missing.length === 0) return state.attemptsMap;

    console.log(`[dashboard] جلب محاولات ${missing.length} امتحان من السيرفر...`);

    const results = await Promise.allSettled(
        missing.map(q =>
            getAttempts(String(q.id)).then(count => ({ id: String(q.id), count }))
        )
    );

    results.forEach((result, i) => {
        const id = String(missing[i].id);
        state.attemptsMap.set(
            id,
            result.status === 'fulfilled' ? (result.value.count ?? 0) : 0
        );
        if (result.status === 'rejected') {
            console.warn(`[dashboard] ⚠️ تعذر جلب محاولات الامتحان ${id}:`, result.reason?.message);
        }
    });

    return state.attemptsMap;
}

/**
 * حساب هل المحاولة القادمة رسمية أم تدريبية بناءً على الحد الأقصى للمحاولات الرسمية.
 *
 * @param {number} attempts      - عدد المحاولات السابقة
 * @param {number|null} maxLimit - الحد الأقصى للمحاولات الرسمية (null = بلا حد)
 * @returns {boolean}
 */
function isNextAttemptPractice(attempts, maxLimit) {
    if (maxLimit == null || maxLimit <= 0) return false; // بلا حد = كل المحاولات رسمية
    return attempts >= maxLimit;
}

/**
 * بناء HTML لقسم المحاولات أسفل بطاقة الامتحان.
 * يتضمن عداد المحاولات وشارة التحذير إذا كانت المحاولة القادمة تدريبية.
 *
 * @param {number}  attempts       - عدد المحاولات السابقة
 * @param {boolean} willBePractice - هل المحاولة القادمة تدريبية؟
 * @returns {string} HTML string
 */
function buildAttemptsHtml(attempts, willBePractice) {
    const attemptsLabel = attempts === 0
        ? `<span class="text-gray-400 font-semibold">لم تحاول بعد</span>`
        : `<span class="font-black text-blue-600 text-sm">${attempts}</span>`;

    const practiceWarning = willBePractice
        ? `<div class="mt-2 flex items-center gap-2 text-xs font-bold
                       bg-amber-50 text-amber-700 border border-amber-200
                       rounded-xl px-3 py-2">
               <i class="fas fa-graduation-cap shrink-0"></i>
               <span>المحاولة القادمة ستُسجَّل كتدريبية</span>
           </div>`
        : '';

    return `
        <div class="mt-3 pt-3 border-t border-gray-100 relative z-10">
            <div class="flex items-center gap-2 text-xs text-gray-500">
                <i class="fas fa-redo-alt text-blue-400 shrink-0"></i>
                <span>عدد مرات حلّك لهذا الامتحان: ${attemptsLabel}</span>
            </div>
            ${practiceWarning}
        </div>`;
}

// ─────────────────────────────────────────────
//  الدالة الرئيسية
// ─────────────────────────────────────────────

/**
 * رسم لوحة التحكم الرئيسية: آخر 4 امتحانات، آخر 3 مذكرات، وأعلى 3 في لوحة الشرف.
 * Renders the dashboard view with latest exams, notes, and leaderboard.
 * Uses window.playQuiz and window.forceDownload for event handlers.
 *
 * @returns {Promise<void>}
 */
export async function renderDashboard() {
    logFunctionStatus('renderDashboard', false);

    // ── حالة التحميل ──
    if (!state.dataLoaded) {
        console.log('[dashboard] ⏳ البيانات لم تُحمّل بعد...');
        const spinner = `
            <div class="col-span-full py-12 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                <p class="font-medium">جاري تحميل البيانات...</p>
            </div>`;
        document.getElementById('latest-exams-grid')?.replaceChildren();
        document.getElementById('latest-notes-grid')?.replaceChildren();
        document.getElementById('leaderboard-list')?.replaceChildren();
        document.getElementById('latest-exams-grid').innerHTML = spinner;
        document.getElementById('latest-notes-grid').innerHTML = spinner;
        document.getElementById('leaderboard-list').innerHTML  = spinner;
        return;
    }

    // ── جلب عدد المحاولات لآخر 4 امتحانات قبل الرسم ──
    const latestExams = state.allQuizzes.slice(-4).reverse();

    // الحد الأقصى للمحاولات الرسمية: من إعداد الامتحان، أو من الـ state، أو بلا حد
    const globalMaxOfficial = state.maxOfficialAttempts ?? null;

    let attemptsMap = new Map();
    if (state.currentUser && latestExams.length > 0) {
        try {
            attemptsMap = await resolveAttemptsMap(latestExams);
        } catch (e) {
            console.warn('[dashboard] ⚠️ تعذر جلب المحاولات:', e.message);
        }
    }

    // ─────────────────────────────────────────────
    //  1. آخر 4 امتحانات
    // ─────────────────────────────────────────────
    const latestExamsGrid = document.getElementById('latest-exams-grid');
    latestExamsGrid.innerHTML = '';

    if (latestExams.length === 0) {
        latestExamsGrid.innerHTML = `
            <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                        border-gray-200 text-center text-gray-400 font-medium">
                لا توجد امتحانات مضافة حتى الآن.
            </div>`;
    } else {
        let examsHtml = '';

        latestExams.forEach((q, idx) => {
            const realIndex    = state.allQuizzes.length - 1 - idx;
            const safeTitle    = escapeHtml(q.config.title);
            const safeDesc     = escapeHtml(q.config.description || '');
            const safeSubject  = escapeHtml(q.config.subject || 'عام');

            // حد المحاولات الرسمية: من إعداد الامتحان أولاً، ثم الإعداد العام
            const quizMaxOfficial = q.config.maxOfficialAttempts ?? globalMaxOfficial;
            const attempts        = attemptsMap.get(String(q.id)) ?? 0;
            const willBePractice  = state.currentUser
                ? isNextAttemptPractice(attempts, quizMaxOfficial)
                : false;

            examsHtml += `
                <div onclick="playQuiz(${realIndex})"
                     class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            cursor-pointer border border-gray-100 hover:border-blue-400 group
                            relative overflow-hidden flex flex-col">

                    <div class="absolute -left-6 -top-6 w-24 h-24 exam-card-hover-glow rounded-full
                                opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600
                                    rounded-2xl flex items-center justify-center text-2xl shadow-inner
                                    group-hover:scale-110 transition duration-300">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <span class="time-badge-anim text-xs bg-blue-50 text-blue-600 px-3 py-1.5
                                     rounded-lg font-bold flex items-center gap-1">
                            <i class="far fa-clock"></i> ${q.config.timeLimit / 60} دقيقة
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${safeTitle}
                    </h3>

                    ${q.config.description
                        ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>`
                        : '<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[120px]">${safeSubject}</span>
                        <span class="text-xs text-gray-500 font-bold bg-gray-50 px-2.5 py-1.5
                                     rounded-md">${q.questions.length} أسئلة</span>
                    </div>

                    ${state.currentUser ? buildAttemptsHtml(attempts, willBePractice) : ''}
                </div>`;
        });

        latestExamsGrid.innerHTML = examsHtml;
    }

    // ─────────────────────────────────────────────
    //  2. آخر 3 مذكرات
    // ─────────────────────────────────────────────
    const latestNotesGrid = document.getElementById('latest-notes-grid');
    latestNotesGrid.innerHTML = '';

    const latestNotes = state.allNotes.slice(-3).reverse();
    if (latestNotes.length === 0) {
        latestNotesGrid.innerHTML = `
            <div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed
                        border-gray-200 text-center text-gray-400 font-medium">
                لا توجد مذكرات أو ملفات مضافة حتى الآن.
            </div>`;
    } else {
        let notesHtml = '';
        latestNotes.forEach(n => {
            const { config } = n;
            const iconClass  = config.type === 'ppt' ? 'fa-file-powerpoint text-red-500'    : 'fa-file-pdf text-orange-500';
            const bgClass    = config.type === 'ppt' ? 'from-red-50 to-red-100'             : 'from-orange-50 to-orange-100';
            const safeTitle   = escapeHtml(config.title);
            const safeDesc    = escapeHtml(config.description || '');
            const safeSubject = escapeHtml(config.subject || 'عام');

            notesHtml += `
                <div onclick="forceDownload('${escapeHtml(config.link)}')"
                     class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300
                            cursor-pointer border border-gray-100 hover:border-orange-400 group
                            relative overflow-hidden">

                    <div class="absolute -left-6 -top-6 w-24 h-24 notes-card-hover-glow rounded-full
                                opacity-0 group-hover:opacity-100 transition duration-500"></div>

                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br ${bgClass} rounded-2xl flex items-center
                                    justify-center text-3xl shadow-inner group-hover:scale-110
                                    transition duration-300">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <span class="text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg
                                     font-bold flex items-center gap-1 group-hover:bg-orange-600
                                     group-hover:text-white transition">
                            <i class="fas fa-download"></i> تحميل مباشر
                        </span>
                    </div>

                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">
                        ${safeTitle}
                    </h3>

                    ${config.description
                        ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>`
                        : '<div class="h-1 mb-3"></div>'}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-100
                                relative z-10 mt-auto">
                        <span class="text-xs bg-orange-50 text-orange-800 px-2.5 py-1.5 rounded-md
                                     font-bold truncate max-w-[150px]">${safeSubject}</span>
                        <span class="text-xs text-gray-400 font-medium flex items-center gap-1">
                            <i class="fas fa-link"></i>
                            ${escapeHtml((config.type || 'pdf').toUpperCase())}
                        </span>
                    </div>
                </div>`;
        });
        latestNotesGrid.innerHTML = notesHtml;
    }

    // ─────────────────────────────────────────────
    //  3. لوحة الشرف — أعلى 3
    // ─────────────────────────────────────────────
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';

    const totalExams = state.allQuizzes.length || 1;
    const sourceScores = (state.serverScores?.length > 0) ? state.serverScores : state.allUserScores;

    // نُحتسب فقط المحاولات الرسمية في لوحة الشرف
    const scoresByUser = {};
    sourceScores.forEach(entry => {
        if (entry.isOfficial === false) return;  // تجاهل التدريبية
        const userName = entry.userName || 'طالب';
        const total    = Number(entry.total) || 0;
        const score    = Number(entry.score) || 0;
        if (total <= 0) return;
        if (!scoresByUser[userName]) {
            scoresByUser[userName] = { userName, totalScore: 0, totalMax: 0, examsCount: 0, fullMarksCount: 0 };
        }
        scoresByUser[userName].totalScore    += score;
        scoresByUser[userName].totalMax      += total;
        scoresByUser[userName].examsCount    += 1;
        if (score === total) scoresByUser[userName].fullMarksCount += 1;
    });

    const sourceLeaderboard = Object.values(scoresByUser).map(u => ({
        ...u,
        avgPercentage: u.totalMax > 0 ? Math.round((u.totalScore / u.totalMax) * 100) : 0
    }));

    const ranked = sourceLeaderboard
        .filter(item => item.totalScore > 0)
        .sort((a, b) => {
            if (b.fullMarksCount !== a.fullMarksCount) return b.fullMarksCount - a.fullMarksCount;
            if (b.avgPercentage  !== a.avgPercentage)  return b.avgPercentage  - a.avgPercentage;
            if (b.totalScore     !== a.totalScore)     return b.totalScore     - a.totalScore;
            return String(a.userName).localeCompare(String(b.userName), 'ar');
        });

    if (ranked.length === 0) {
        leaderboardList.innerHTML = `
            <div class="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">
                لا توجد نتائج مسجلة بعد.
            </div>`;
    } else {
        const rankNames = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
        const colors    = [
            'bg-gradient-to-l from-yellow-50 to-white border-yellow-200 text-yellow-700',
            'bg-gradient-to-l from-gray-50 to-white border-gray-200 text-gray-600',
            'bg-gradient-to-l from-orange-50 to-white border-orange-200 text-orange-700'
        ];
        const medals = ['🥇', '🥈', '🥉'];

        let lbHtml = '';
        ranked.slice(0, 3).forEach((entry, i) => {
            const safeName      = escapeHtml(entry.userName);
            const fullMarkLabel = entry.fullMarksCount > 0
                ? `🌟 ${entry.fullMarksCount}/${totalExams} درجة نهائية`
                : `${entry.examsCount}/${totalExams} امتحان`;

            lbHtml += `
                <div class="flex items-center justify-between p-4 rounded-2xl border
                            ${colors[i] || 'bg-gray-50'} shadow-sm">
                    <div class="flex items-center gap-4">
                        <span class="text-3xl drop-shadow-sm">${medals[i]}</span>
                        <div>
                            <p class="font-black text-gray-800 text-lg">${safeName}</p>
                            <p class="text-xs font-bold opacity-80 mt-0.5">${rankNames[i]}</p>
                        </div>
                    </div>
                    <div class="px-4 py-2 rounded-xl bg-white border border-white shadow-sm text-center">
                        <span class="font-black text-base">${fullMarkLabel}</span>
                        <p class="text-[11px] text-gray-500 font-bold mt-0.5">متوسط ${entry.avgPercentage}%</p>
                    </div>
                </div>`;
        });
        leaderboardList.innerHTML = lbHtml;
    }

    console.log(`[dashboard] ✓ تم رسم لوحة التحكم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${sourceLeaderboard.length} في الشرف`);
}