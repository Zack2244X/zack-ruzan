/**
 * @module dashboard
 * @description وحدة لوحة التحكم الرئيسية — عرض آخر الامتحانات والمذكرات ولوحة الشرف
 */
import state from './state.js';
import { escapeHtml } from './helpers.js';

/**
 * رسم لوحة التحكم الرئيسية: آخر 4 امتحانات، آخر 3 مذكرات، وأعلى 3 في لوحة الشرف
 * Renders the dashboard view with latest exams, notes, and leaderboard.
 * Uses window.playQuiz and window.forceDownload for event handlers.
 */
export function renderDashboard() {
    // حالة التحميل
    if (!state.dataLoaded) {
        console.log('[dashboard] ⏳ البيانات لم تُحمّل بعد...');
        const spinner = `<div class="col-span-full py-12 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-3"></i><p class="font-medium">جاري تحميل البيانات...</p></div>`;
        const eg = document.getElementById('latest-exams-grid');
        const ng = document.getElementById('latest-notes-grid');
        const lb = document.getElementById('leaderboard-list');
        if (eg) eg.innerHTML = spinner;
        if (ng) ng.innerHTML = spinner;
        if (lb) lb.innerHTML = spinner;
        return;
    }

    // --- 1. عرض آخر 4 امتحانات بتصميم احترافي (أزرق) ---
    const latestExamsGrid = document.getElementById('latest-exams-grid');
    latestExamsGrid.innerHTML = '';

    const latestExams = state.allQuizzes.slice(-4).reverse();
    if (latestExams.length === 0) {
        latestExamsGrid.innerHTML = `<div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200 text-center text-gray-400 font-medium">لا توجد امتحانات مضافة حتى الآن.</div>`;
    } else {
        let examsHtml = '';
        latestExams.forEach((q, idx) => {
            const realIndex = state.allQuizzes.length - 1 - idx;
            const safeTitle = escapeHtml(q.config.title);
            const safeDesc = escapeHtml(q.config.description || '');
            const safeSubject = escapeHtml(q.config.subject || 'عام');
            examsHtml += `
                <div onclick="playQuiz(${realIndex})" class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300 cursor-pointer border border-gray-100 hover:border-blue-400 group relative overflow-hidden">
                    <div class="absolute -left-6 -top-6 w-24 h-24 exam-card-hover-glow rounded-full opacity-0 group-hover:opacity-100 transition duration-500"></div>
                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition duration-300"><i class="fas fa-file-alt"></i></div>
                        <span class="time-badge-anim text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1"><i class="far fa-clock"></i> ${q.config.timeLimit / 60} دقيقة</span>
                    </div>
                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">${safeTitle}</h3>
                    ${q.config.description ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>` : '<div class="h-1 mb-3"></div>'}
                    <div class="flex items-center justify-between pt-4 border-t border-gray-100 relative z-10 mt-auto">
                        <span class="text-xs bg-blue-50 text-blue-700 px-2.5 py-1.5 rounded-md font-bold truncate max-w-[120px]">${safeSubject}</span>
                        <span class="text-xs text-gray-500 font-bold bg-gray-50 px-2.5 py-1.5 rounded-md">${q.questions.length} أسئلة</span>
                    </div>
                </div>
            `;
        });
        latestExamsGrid.innerHTML = examsHtml;
    }

    // --- 2. عرض آخر 3 مذكرات بتصميم احترافي (برتقالي) ---
    const latestNotesGrid = document.getElementById('latest-notes-grid');
    latestNotesGrid.innerHTML = '';

    const latestNotes = state.allNotes.slice(-3).reverse();
    if (latestNotes.length === 0) {
        latestNotesGrid.innerHTML = `<div class="col-span-full py-12 bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-200 text-center text-gray-400 font-medium">لا توجد مذكرات أو ملفات مضافة حتى الآن.</div>`;
    } else {
        let notesHtml = '';
        latestNotes.forEach((n) => {
            const config = n.config;
            const iconClass = config.type === 'ppt' ? 'fa-file-powerpoint text-red-500' : 'fa-file-pdf text-orange-500';
            const bgClass = config.type === 'ppt' ? 'from-red-50 to-red-100' : 'from-orange-50 to-orange-100';
            const safeTitle = escapeHtml(config.title);
            const safeDesc = escapeHtml(config.description || '');
            const safeSubject = escapeHtml(config.subject || 'عام');

            notesHtml += `
                <div onclick="forceDownload('${escapeHtml(config.link)}')" class="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition duration-300 cursor-pointer border border-gray-100 hover:border-orange-400 group relative overflow-hidden">
                    <div class="absolute -left-6 -top-6 w-24 h-24 notes-card-hover-glow rounded-full opacity-0 group-hover:opacity-100 transition duration-500"></div>
                    <div class="flex justify-between items-start mb-5 relative z-10">
                        <div class="w-14 h-14 bg-gradient-to-br ${bgClass} rounded-2xl flex items-center justify-center text-3xl shadow-inner group-hover:scale-110 transition duration-300"><i class="fas ${iconClass}"></i></div>
                        <span class="text-xs bg-orange-50 text-orange-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 group-hover:bg-orange-600 group-hover:text-white transition"><i class="fas fa-download"></i> تحميل مباشر</span>
                    </div>
                    <h3 class="font-extrabold text-gray-800 text-lg mb-2 break-words relative z-10">${safeTitle}</h3>
                    ${config.description ? `<p class="text-sm text-gray-500 mb-3 line-clamp-2 break-words relative z-10">${safeDesc}</p>` : '<div class="h-1 mb-3"></div>'}
                    <div class="flex items-center justify-between pt-4 border-t border-gray-100 relative z-10 mt-auto">
                        <span class="text-xs bg-orange-50 text-orange-800 px-2.5 py-1.5 rounded-md font-bold truncate max-w-[150px]">${safeSubject}</span>
                        <span class="text-xs text-gray-400 font-medium flex items-center gap-1"><i class="fas fa-link"></i> ${escapeHtml((config.type || 'pdf').toUpperCase())}</span>
                    </div>
                </div>
            `;
        });
        latestNotesGrid.innerHTML = notesHtml;
    }

    // --- 3. لوحة الشرف: أعلى 3 حسب عدد الامتحانات المقفولة ---
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';

    let sourceLeaderboard = [];
    if (state.serverLeaderboard && state.serverLeaderboard.length > 0) {
        sourceLeaderboard = state.serverLeaderboard.map(item => ({
            userName: item.userName || 'طالب',
            fullMarksCount: Number(item.fullMarksCount) || 0,
            bestPercent: Number(item.avgPercentage) || 0
        }));
    } else {
        const fullMarksByUser = {};
        state.allUserScores.forEach(entry => {
            const userName = entry.userName || 'طالب';
            const total = Number(entry.total) || 0;
            const score = Number(entry.score) || 0;
            if (total <= 0) return;

            if (!fullMarksByUser[userName]) {
                fullMarksByUser[userName] = { userName, fullMarksCount: 0, bestPercent: 0 };
            }

            const percent = Math.round((score / total) * 100);
            if (percent > fullMarksByUser[userName].bestPercent) {
                fullMarksByUser[userName].bestPercent = percent;
            }
            if (score === total) {
                fullMarksByUser[userName].fullMarksCount += 1;
            }
        });
        sourceLeaderboard = Object.values(fullMarksByUser);
    }

    const rankedFullMarks = sourceLeaderboard
        .filter(item => item.fullMarksCount > 0)
        .sort((a, b) => {
            if (b.fullMarksCount !== a.fullMarksCount) return b.fullMarksCount - a.fullMarksCount;
            if (b.bestPercent !== a.bestPercent) return b.bestPercent - a.bestPercent;
            return String(a.userName).localeCompare(String(b.userName), 'ar');
        });

    if (rankedFullMarks.length === 0) {
        // بديل: اعرض أعلى 3 نسب مئوية من بيانات السيرفر الكاملة
        const sourceForPercent = state.serverLeaderboard.length > 0
            ? state.serverLeaderboard.map(e => ({
                userName: e.userName || 'طالب',
                percent: Number(e.avgPercentage) || 0
            }))
            : state.allUserScores
                .filter(e => Number(e.total) > 0)
                .map(e => ({
                    userName: e.userName || 'طالب',
                    percent: Math.round((Number(e.score) / Number(e.total)) * 100)
                }));

        const scoresWithPercent = sourceForPercent
            .filter(e => e.percent > 0)
            .sort((a, b) => b.percent - a.percent);

        if (scoresWithPercent.length === 0) {
            leaderboardList.innerHTML = `<div class="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">لا توجد نتائج مسجلة بعد.</div>`;
        } else {
            let rank = 0;
            let prevPercent = null;
            let repeatIndex = 0;
            let lbHtml = '';

            scoresWithPercent.slice(0, 3).forEach((entry) => {
                if (prevPercent === null || entry.percent !== prevPercent) {
                    rank += 1;
                    repeatIndex = 0;
                    prevPercent = entry.percent;
                } else {
                    repeatIndex += 1;
                }

                const colors = [
                    'bg-gradient-to-l from-yellow-50 to-white border-yellow-200 text-yellow-700',
                    'bg-gradient-to-l from-gray-50 to-white border-gray-200 text-gray-600',
                    'bg-gradient-to-l from-orange-50 to-white border-orange-200 text-orange-700'
                ];
                const medals = ['🥇', '🥈', '🥉'];
                const colorIdx = Math.min(rank - 1, colors.length - 1);
                const medal = medals[Math.min(rank - 1, medals.length - 1)] || '⭐';
                const baseRankText = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'][rank - 1] || 'متقدم';
                const rankText = repeatIndex > 0 ? `${baseRankText} (${repeatIndex === 1 ? 'أول' : repeatIndex === 2 ? 'ثاني' : 'مكرر'} مكرر)` : baseRankText;
                const safeName = escapeHtml(entry.userName);

                lbHtml += `
                    <div class="flex items-center justify-between p-4 rounded-2xl border ${colors[colorIdx] || 'bg-gray-50'} shadow-sm">
                        <div class="flex items-center gap-4">
                            <span class="text-3xl drop-shadow-sm">${medal}</span>
                            <div>
                                <p class="font-black text-gray-800 text-lg">${safeName}</p>
                                <p class="text-xs font-bold opacity-80 mt-0.5">${rankText}</p>
                            </div>
                        </div>
                        <div class="px-4 py-2 rounded-xl bg-white border border-white shadow-sm text-center">
                            <span class="font-black text-base">${entry.percent}%</span>
                            <p class="text-[11px] text-gray-500 font-bold mt-0.5">أعلى نسبة</p>
                        </div>
                    </div>
                `;
            });
            leaderboardList.innerHTML = lbHtml;
        }
    } else {
        const rankNames = ['المركز الأول', 'المركز الثاني', 'المركز الثالث'];
        const repeatNames = ['أول', 'ثاني', 'ثالث', 'رابع', 'خامس'];
        const colors = [
            'bg-gradient-to-l from-yellow-50 to-white border-yellow-200 text-yellow-700',
            'bg-gradient-to-l from-gray-50 to-white border-gray-200 text-gray-600',
            'bg-gradient-to-l from-orange-50 to-white border-orange-200 text-orange-700'
        ];
        const medals = ['🥇', '🥈', '🥉'];

        let rank = 0;
        let prevCount = null;
        let prevBest = null;
        let repeatIndex = 0;
        let lbHtml2 = '';

        rankedFullMarks.forEach((entry) => {
            if (entry.fullMarksCount !== prevCount || entry.bestPercent !== prevBest) {
                rank += 1;
                prevCount = entry.fullMarksCount;
                prevBest = entry.bestPercent;
                repeatIndex = 0;
            } else {
                repeatIndex += 1;
            }

            if (rank > 3) return;

            const repeatText = repeatIndex > 0
                ? ` (${(repeatNames[repeatIndex - 1] || repeatIndex)} مكرر)`
                : '';
            const rankText = `${rankNames[rank - 1]}${repeatText}`;
            const safeName = escapeHtml(entry.userName);

            lbHtml2 += `
                <div class="flex items-center justify-between p-4 rounded-2xl border ${colors[rank - 1] || 'bg-gray-50'} shadow-sm">
                    <div class="flex items-center gap-4">
                        <span class="text-3xl drop-shadow-sm">${medals[rank - 1]}</span>
                        <div>
                            <p class="font-black text-gray-800 text-lg">${safeName}</p>
                            <p class="text-xs font-bold opacity-80 mt-0.5">${rankText}</p>
                        </div>
                    </div>
                    <div class="px-4 py-2 rounded-xl bg-white border border-white shadow-sm text-center">
                        <span class="font-black text-base">${entry.fullMarksCount} امتحان</span>
                        <p class="text-[11px] text-gray-500 font-bold mt-0.5">درجة كاملة</p>
                    </div>
                </div>
            `;
        });
        leaderboardList.innerHTML = lbHtml2;

        if (!leaderboardList.innerHTML.trim()) {
            leaderboardList.innerHTML = `<div class="text-center text-gray-400 py-10 bg-gray-50 rounded-2xl">لا توجد نتائج ضمن أول 3 مراكز بعد.</div>`;
        }
    }
    console.log(`[dashboard] ✓ تم رسم لوحة التحكم — ${state.allQuizzes.length} امتحان، ${state.allNotes.length} مذكرة، ${sourceLeaderboard.length} في الشرف`);
}
