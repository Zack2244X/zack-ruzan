/**
 * منصة الاختبارات التفاعلية — app.js (Entry Point)
 * بسم الله الرحمن الرحيم
 * لا تنسَ أن تذكر الله دائمًا، فـ 'ألا بذكر الله تطمئن القلوب'.
 *
 * @description نقطة الدخول الرئيسية — يجمع كل الوحدات ويربطها بالـ DOM والـ window
 */
'use strict';

// === الوحدات (Modules) ===
import state from './modules/state.js';
import { escapeHtml, showAlert, showConfirm, showLoading, formatTime, showToastMessage, pickRandom, shuffleArray, logFunctionStatus, getQuickDeviceTier } from './modules/helpers.js';
import { apiCall, loadDataFromServer, fetchLeaderboardFromServer, fetchScoresFromServer } from './modules/api.js';
import {
    _syncMainInteractionState, _showThemeToggle, updateDockUI,
    openBottomSheet, closeBottomSheet, closeAdminSheet, closeAllOverlays,
    applyTheme, toggleTheme, initTheme, navToHome,
    navToSection as _navToSection, openAdminAuthOrPanel,
    showLoginScreenWithDesktop,
    closeStudentMenu, showLoginScreen, toggleTreeNode
} from './modules/navigation.js';
import {
    startGoogleRedirectLogin, handleGoogleRedirectToken, initGoogleSignIn,
    handleGoogleAdminResponse, handleStudentGoogleLogin as _handleStudentGoogleLogin,
    closeAdminAuth, showAdminToast, logoutUser, startTokenRefresh
} from './modules/auth.js';
import {
    initQuizDOM, playQuiz as _playQuiz, initializeQuiz, renderQuestion,
    selectAnswer, showFeedback, hideFeedback, disableOptions,
    goToNextQuestion, goToPreviousQuestion, updateProgressBar,
    startTimer, submitQuiz, exitToMain as _exitToMain
} from './modules/quiz.js';
import {
    openCreateSection, closeCreateSection, goToBuilderStep2,
    renderBuilderQuestion, updateBuilderData, updateBuilderOptionText,
    setBuilderCorrectOption, addBuilderOption, removeBuilderOption,
    addBuilderQuestion, navBuilderQuestion,
    saveBuiltQuiz as _saveBuiltQuiz, loadQuizIntoBuilder as _loadQuizIntoBuilder,
    updateExistingQuiz as _updateExistingQuiz,
    triggerImportExamFile, reshuffleImportedAnswers,
    handleImportFileChange
} from './modules/builder.js';
import {
    getDynamicSubjects,
    renderSubjectFilters as _renderSubjectFilters,
    setSubjectFilter as _setSubjectFilter,
    setEditSubjectFilter as _setEditSubjectFilter,
    renderHistoryTree as _renderHistoryTree,
    renderEditTree as _renderEditTree,
    renameSubject as _renameSubject,
    closeRenameModal, executeRenameSubject as _executeRenameSubject,
    confirmDeleteSubject as _confirmDeleteSubject,
    closeDeleteModal, executeDeleteSubject as _executeDeleteSubject
} from './modules/tree.js';
import {
    openAddNoteModal, closeAddNoteModal,
    saveNote as _saveNote, loadNoteIntoBuilder as _loadNoteIntoBuilder,
    updateExistingNote as _updateExistingNote, forceDownload
} from './modules/notes.js';
import {
    openGradesModal, closeGradesModal, renderGradesList,
    openStatsModal, closeStatsModal, renderStatsContent,
    openEditSelectionModal, switchEditTab as _switchEditTab
} from './modules/grades.js';
import { renderDashboard as _renderDashboard, deleteQuiz as _deleteQuiz } from './modules/dashboard.js';

// === وحدات الحركة والتمرير ===
import {
    initAnimations, playEntranceAnimation, playExitAnimation,
    animateElement, pauseAllAnimations, resumeAllAnimations,
    setAnimationSpeed, setReducedMotion
} from './modules/animation.js';
import {
    initScroll, scrollToTop, scrollToElement,
    enableSmoothScroll, disableSmoothScroll,
    onScrollEnter, offScrollEnter
} from './modules/scroll.js';

// === أداة أداء الجهاز ===
import { getDevicePerformanceTier } from './modules/helpers.js';

// === Global Error Boundary ===
window.addEventListener('error', (e) => {
    console.error('❌ خطأ غير متوقع:', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Promise مرفوض:', e.reason);
    e.preventDefault();
});

// quick startup instrumentation check
try { logFunctionStatus('app_init', typeof navigator !== 'undefined' ? navigator.onLine : true); } catch (e) { /* ignore */ }

// === Service Worker Registration (PWA) ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                // لما يكون في تحديث جديد للـ SW، اعمل reload تلقائي
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                                console.log('[SW] ✓ تحديث جديد — إعادة تحميل...');
                                window.location.reload();
                            }
                        });
                    }
                });
            })
            .catch(err => console.warn('⚠️ SW registration failed:', err));
    });
    // لو الـ controller اتغير (SW جديد استلم)، اعمل reload
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    });
}

// === Multi-tab Sync: Logout ===
window.addEventListener('storage', (e) => {
    if (e.key === 'logout_event') {
        state.currentUser = null;
        state.isAdmin = false;
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('isAdmin');
        showLoginScreenWithDesktop();
    }
});

// ─── مسح الجلسة قبل أي reload/إغلاق للتبويب ───
// pagehide يُطلَق قبل أن تبدأ الصفحة الجديدة بالتحميل
// يضمن أن loadApp() سيجد sessionStorage فارغاً دائماً عند كل تحميل
// استثناء: جلسة الضيف تُحفظ في localStorage فقط، لا داعي لمسح sessionStorage لها
window.addEventListener('pagehide', () => {
    const isGuestSession = localStorage.getItem('guest-mode') === 'true';
    if (!isGuestSession) {
        sessionStorage.removeItem('currentUser');
        sessionStorage.removeItem('isAdmin');
    }
});

// ============================================
//  ضبط إعدادات الحركة بناءً على أداء الجهاز
//  — يُستدعى مرة واحدة عند بدء التشغيل
// ============================================

/**
 * @description يقرأ مستوى أداء الجهاز ويضبط وحدتَي الحركة والتمرير وفقاً له.
 *
 * المستويات المتوقعة من getDevicePerformanceTier():
 *  - 'high'   → تجربة كاملة: حركات سلسة + تمرير ناعم + scroll-enter callbacks
 *  - 'medium' → حركات مخففة (سرعة مخفضة) + تمرير ناعم بدون scroll-enter
 *  - 'low'    → reduced-motion كامل + تعطيل التمرير الناعم توفيراً للموارد
 */
async function applyPerformanceBasedAnimationSettings(perf) {
    logFunctionStatus('applyPerformanceBasedAnimationSettings', true);
    if (!perf) perf = await getDevicePerformanceTier();
    const tier   = (perf && perf.tier) ? perf.tier : (typeof perf === 'string' ? perf : 'low');
    const gpu    = perf?.gpu;
    const dpr    = perf?.dpr  || window.devicePixelRatio || 1;
    const bat    = perf?.batteryLevel ?? -1;
    const webgl2 = gpu?.webgl2 ?? false;

    console.log(
        `[app] 🖥️ أداء الجهاز — tier:${tier} / GPU:${gpu?.tier}(${gpu?.renderer || '?'}) `
      + `/ DPR:${dpr.toFixed(1)} / WebGL2:${webgl2} / 🔋${bat === -1 ? 'N/A' : Math.round(bat*100)+'%'}`,
        perf
    );

    // ── تطبيق CSS classes على body لتفعيل قواعد styles.css المشروطة ──────────
    document.body.classList.remove('gpu-high', 'gpu-medium', 'gpu-low');
    document.body.classList.add(`gpu-${gpu?.tier || tier}`);
    if (tier === 'low') document.body.classList.add('reduced-graphics');

    switch (tier) {
        case 'high':
            setReducedMotion(false);
            setAnimationSpeed(1.0);
            enableSmoothScroll();
            onScrollEnter();
            console.log('[app] ✓ إعدادات الحركة: وضع الأداء العالي');
            break;

        case 'medium':
            setReducedMotion(false);
            // DPR عالٍ على GPU متوسط = pixel fill pressure → سرعة أقل
            setAnimationSpeed(dpr > 2.5 ? 0.5 : 0.75);

            enableSmoothScroll();
            offScrollEnter();
            console.log('[app] ✓ إعدادات الحركة: وضع الأداء المتوسط');
            break;

        case 'low':
        default:
            setReducedMotion(true);
            setAnimationSpeed(0);
            disableSmoothScroll();
            offScrollEnter();
            console.log('[app] ✓ إعدادات الحركة: وضع الأداء المنخفض (reduced-motion)');
            break;
    }
}

// ============================================
//  دوال الربط (Bound Functions)
//  — تربط الوحدات التي تحتاج بعضها بلا circular import
// ============================================

/** @private رسم الفلاتر مع ربط دوال التعديل والحذف */
function renderSubjectFilters() {
    _renderSubjectFilters(renameSubject, confirmDeleteSubject);
}

/** @private رسم الشجرة الرئيسية مع ربط playQuiz و forceDownload */
function renderHistoryTree() {
    _renderHistoryTree(playQuiz, forceDownload);
}

/** @private رسم شجرة التعديل مع ربط دوال التحميل */
function renderEditTree() {
    _renderEditTree(loadQuizIntoBuilder, loadNoteIntoBuilder);
}

/** @private رسم لوحة القيادة مع ربط الدوال */
function renderDashboard() {
    _renderDashboard(playQuiz, forceDownload);
}

/** @private حذف امتحان */
function deleteQuiz(index) {
    _deleteQuiz(index, renderDashboard);
}

/** @private تبديل فلتر المادة الرئيسية */
function setSubjectFilter(subject) {
    _setSubjectFilter(subject, renderHistoryTree, renameSubject, confirmDeleteSubject);
}

/** @private تبديل فلتر المادة في نافذة التعديل */
function setEditSubjectFilter(subject) {
    _setEditSubjectFilter(subject, renderEditTree, renameSubject, confirmDeleteSubject);
}

/** @private الانتقال لقسم */
function navToSection(section) {
    _navToSection(section, renderSubjectFilters, renderHistoryTree);
}

/** @private بدء اختبار */
function playQuiz(index) {
    _playQuiz(index);
}

/** @private الخروج للرئيسية */
function exitToMain() {
    _exitToMain(renderDashboard);
}

/** @private حفظ الامتحان */
function saveBuiltQuiz() {
    _saveBuiltQuiz(renderHistoryTree, renderEditTree, renderDashboard);
}

/** @private تحميل اختبار للتعديل */
function loadQuizIntoBuilder(index) {
    _loadQuizIntoBuilder(index);
}

/** @private إعادة تسمية مادة */
function renameSubject(oldName, event) {
    _renameSubject(oldName, event);
}

/** @private تأكيد حذف مادة */
function confirmDeleteSubject(subjectName, event) {
    _confirmDeleteSubject(subjectName, event);
}

/** @private تنفيذ إعادة التسمية */
function executeRenameSubject() {
    _executeRenameSubject(renderSubjectFilters, renderHistoryTree, renderDashboard);
}

/** @private تنفيذ الحذف */
function executeDeleteSubject() {
    _executeDeleteSubject(renderSubjectFilters, renderHistoryTree, renderDashboard);
}

/** @private حفظ مذكرة */
function saveNote() {
    _saveNote(renderEditTree, renderSubjectFilters, renderHistoryTree, navToSection);
}

/** @private تحميل مذكرة للتعديل */
function loadNoteIntoBuilder(index) {
    _loadNoteIntoBuilder(index);
}

/** @private تحديث اختبار */
function updateExistingQuiz(index) {
    _updateExistingQuiz(index, renderHistoryTree, renderEditTree, renderDashboard);
}

/** @private تحديث مذكرة */
function updateExistingNote() {
    _updateExistingNote(renderHistoryTree, renderEditTree, renderDashboard);
}

/** @private تبديل تبويب التعديل */
function switchEditTab(tab) {
    _switchEditTab(tab, renderSubjectFilters, renderEditTree);
}

/** @private معالجة تسجيل دخول الطالب */
function handleStudentGoogleLogin(response) {
    _handleStudentGoogleLogin(response, renderSubjectFilters, renderHistoryTree, renderDashboard, startTokenRefresh);
}

// ============================================
//  تحميل التطبيق
// ============================================

/** @description تحميل التطبيق عند بدء التشغيل */
function loadApp() {
    logFunctionStatus('loadApp', true);
    console.log('[app] بدء تحميل التطبيق...');
    try {
        // Scores are loaded from server via loadAllDataFromServer() — no localStorage fallback

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            state.isAdmin = sessionStorage.getItem('isAdmin') === 'true';

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('ios-bottom-nav').classList.remove('hidden');

            const isGuest = state.currentUser.role === 'guest';
            const safeName = escapeHtml(state.currentUser.fname || state.currentUser.fullName || 'صديقنا');
            document.getElementById('welcome-msg').innerText = isGuest
                ? 'مَرْحَبًا بِكَ يَا ضَيْفَنَا الكَرِيم — الدخول تجريبي ولن تُحفظ الدرجات'
                : `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}`;

            navToHome();
            renderDashboard(); // يعرض spinner أولاً ريثما تُحمَّل البيانات

            if (isGuest) {
                // وضع الضيف: لا توكن، لا تجديد، لكن نجلب البيانات العامة (امتحانات + مذكرات + لوحة الشرف)
                console.log('[app] ✓ وضع الضيف — تحميل البيانات العامة...');
                loadDataFromServer().then(() => {
                    renderSubjectFilters();
                    renderHistoryTree();
                    renderDashboard();
                    console.log('[app] ✓ الضيف — البيانات العامة جاهزة');
                }).catch(e => {
                    console.warn('[app] ⚠️ فشل جلب البيانات للضيف:', e);
                    state.dataLoaded = true;
                    renderDashboard();
                });
                return;
            }

            startTokenRefresh();
            loadDataFromServer().then(() => {
                state.dataLoaded = true;
                renderSubjectFilters();
                renderHistoryTree();
                renderDashboard();
                console.log('[app] ✓ التطبيق جاهز — البيانات محمّلة من السيرفر');
            });
            return;
        }
        console.log('[app] لا يوجد مستخدم مسجّل — عرض شاشة الدخول');
        try {
            console.log('[diag] loadApp -> calling showLoginScreenWithDesktop; login-screen classes=', document.getElementById('login-screen')?.className);
        } catch (e) { console.warn('[diag] loadApp log failed', e); }
        showLoginScreenWithDesktop();
    } catch (e) {
        console.warn("تعذر الوصول للذاكرة المحلية:", e);
        showLoginScreenWithDesktop();
    }
}

// ============================================
//  ربط الدوال بـ window (للاستدعاء من HTML onclick)
// ============================================
Object.assign(window, {
    // Navigation
    navToHome, navToSection, openAdminAuthOrPanel, closeStudentMenu,
    openBottomSheet, closeBottomSheet, closeAdminSheet, closeAllOverlays,
    toggleTheme, updateDockUI, toggleTreeNode, _showThemeToggle,

    // Auth
    startGoogleRedirectLogin, closeAdminAuth, logoutUser, handleStudentGoogleLogin, loadApp,

    // Quiz
    playQuiz, selectAnswer, goToNextQuestion, goToPreviousQuestion,
    submitQuiz, exitToMain,

    // Builder
    openCreateSection, closeCreateSection, goToBuilderStep2,
    renderBuilderQuestion, updateBuilderData, updateBuilderOptionText, setBuilderCorrectOption,
    addBuilderOption, removeBuilderOption, addBuilderQuestion,
    navBuilderQuestion, saveBuiltQuiz, loadQuizIntoBuilder, updateExistingQuiz,
    triggerImportExamFile, reshuffleImportedAnswers, handleImportFileChange,

    // Tree & Subjects
    setSubjectFilter, setEditSubjectFilter, renderSubjectFilters,
    renameSubject, closeRenameModal, executeRenameSubject,
    confirmDeleteSubject, closeDeleteModal, executeDeleteSubject,

    // Notes
    openAddNoteModal, closeAddNoteModal, saveNote,
    loadNoteIntoBuilder, updateExistingNote, forceDownload,

    // Grades & Stats
    openGradesModal, closeGradesModal, openStatsModal, closeStatsModal,
    openEditSelectionModal, switchEditTab,

    // Dashboard
    renderDashboard,
    deleteQuiz,

    // Helpers
    escapeHtml, showAlert, showConfirm, showLoading,
    // Quick perf helper for inline scripts
    getQuickDeviceTier,

    // Animations & Scroll (exposed for use from HTML/other scripts if needed)
    scrollToTop, scrollToElement,
    playEntranceAnimation, playExitAnimation, animateElement,
    pauseAllAnimations, resumeAllAnimations
});

// Fallback: addEventListener for login button (in case onclick doesn't fire)
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            try {
                startGoogleRedirectLogin('student');
            } catch (err) {
                console.error('❌ Login error:', err);
                alert('خطأ في تسجيل الدخول: ' + err.message);
            }
        });
    }
});

// ============================================
//  نقطة البداية
// ============================================
export async function startApp() {
    logFunctionStatus('window.onload', false);

    // تهيئة الثيم
    initTheme();

    // Layout switching: ONLY login page uses desktop layout on mobile
    const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (screen.width && screen.width < 900);
    function setDesktopLayout(force) {
        if (!isMobileUA) return;
        const root = document.documentElement;
        if (force) {
            root.classList.add('force-desktop');
            root.setAttribute('data-force-desktop','1');
        } else {
            root.classList.remove('force-desktop');
            root.removeAttribute('data-force-desktop');
        }
    }

    // Observe login visibility to toggle layout (force-desktop ONLY for login page)
    function observeLoginLayout() {
        const login = document.getElementById('login-screen');
        if (!login) return;
        const root = document.documentElement;
        const meta = document.querySelector('meta[name="viewport"]');
        let originalViewport = meta ? meta.content : '';
        function applyDesktopViewport() {
            const targetWidth = 1200;
            const vw = Math.max(window.innerWidth || screen.width || document.documentElement.clientWidth || 360, 320);
            const rawScale = vw / targetWidth;
            const clampedScale = Math.max(0.12, Math.min(1, rawScale));
            const content = `width=${targetWidth}, initial-scale=${clampedScale}, maximum-scale=${clampedScale}, user-scalable=no, viewport-fit=cover`;
            if (meta) meta.content = content;
            root.classList.add('force-desktop');
            root.setAttribute('data-force-desktop','1');
        }
        function restoreViewport() {
            if (meta && originalViewport) meta.content = originalViewport;
            root.classList.remove('force-desktop');
            root.removeAttribute('data-force-desktop');
        }
        const observer = new MutationObserver(() => {
            if (!isMobileUA) return;
            if (!login.classList.contains('hidden')) {
                applyDesktopViewport();
            } else {
                restoreViewport();
            }
        });
        observer.observe(login, { attributes: true, attributeFilter: ['class'] });
        // Initial state
        if (!login.classList.contains('hidden')) {
            applyDesktopViewport();
        } else {
            restoreViewport();
        }
    }
    document.addEventListener('DOMContentLoaded', observeLoginLayout);

    // ── تهيئة وحدات الحركة والتمرير ──────────────────────────────────────────
    // يجب أن تسبق applyPerformanceBasedAnimationSettings() حتى تكون
    // الوحدتان جاهزتين قبل استقبال أوامر الضبط
    // ── قياس مستوى الجهاز المبسّط مبكّراً ونشره لوحدات الواجهة ─────────────
    const perf = await getDevicePerformanceTier({ skipFPSTest: true });
    try { window.__devicePerf = perf; } catch (e) { /* ignore */ }
    if (perf && perf.tier === 'low') {
        document.body.classList.add('reduced-graphics');
    }

    // تهيئة الحركات — مرّر نتيجة الأداء لتجنّب إعادة القياس
    await initAnimations(perf);

    // تهيئة التمرير: نؤجل تهيئة Lenis حتى تكون الخطوط محمّلة أو يكون المتصفح في حالة خمول
    // هذا يمنع أي تبديل للـ classes على `<html>` أثناء الطلاء الأولي مما يسبب CLS
    (function deferInitScroll() {
        const run = async () => {
            try {
                if (document && document.fonts) {
                    // انتظر حتى تكون الخطوط جاهزة أو أقصر من 1s حتى لا نؤخر التجربة كثيراً
                    const fontsReady = document.fonts.ready;
                    const timeout = new Promise((res) => setTimeout(res, 1000));
                    await Promise.race([fontsReady, timeout]);
                }
            } catch (e) { /* ignore */ }

            const start = () => {
                try {
                    initScroll();
                } catch (err) {
                    console.warn('[scroll] deferred init failed:', err);
                }
            };

            if ('requestIdleCallback' in window) {
                requestIdleCallback(start, { timeout: 2000 });
            } else {
                // fallback صغير إذا لم تتوفر requestIdleCallback
                setTimeout(start, 700);
            }
        };
        run();
    })();

    // ── ضبط إعدادات الحركة بناءً على أداء الجهاز ────────────────────────────
    await applyPerformanceBasedAnimationSettings(perf);

    // اقرَأ الإعدادات العامة المضمّنة بواسطة /config.js (يُحمّل غير حابس في index.html)
    try {
        const cfg = (typeof window !== 'undefined' && window.__PUBLIC_CONFIG) ? window.__PUBLIC_CONFIG : null;
        if (cfg && cfg.googleClientId) {
            state.GOOGLE_CLIENT_ID = cfg.googleClientId;
        }
    } catch (e) {
        // لا نفشل التحميل إذا لم تتوفر الإعدادات — نترك القيم الافتراضية
        console.warn('⚠️ لم تتوفر الإعدادات العامة في window.__PUBLIC_CONFIG:', e);
    }

    // تهيئة عناصر DOM للاختبار
    initQuizDOM();

    // ربط Enter في حقل إعادة التسمية
    const renameInput = document.getElementById('rename-subject-input');
    if (renameInput) {
        renameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeRenameSubject();
        });
    }

    // Patch: Inject guest-mode header for score submission
    const originalSubmitScore = window.submitScore;
    window.submitScore = function(data) {
        const isGuest = localStorage.getItem('guest-mode') === 'true' || sessionStorage.getItem('guest-mode') === 'true';
        if (isGuest) {
            if (!data.headers) data.headers = {};
            data.headers['x-guest-mode'] = 'true';
        }
        return originalSubmitScore ? originalSubmitScore(data) : null;
    };

    // معالجة Google redirect أو تحميل التطبيق
    const handledRedirect = handleGoogleRedirectToken();
    initGoogleSignIn();
    if (!handledRedirect) {
        loadApp();
    }
}