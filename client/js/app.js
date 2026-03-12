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
    closeStudentMenu, showLoginScreen, toggleTreeNode,
    initOverlayScrollLock
} from './modules/navigation.js';
import {
    startGoogleRedirectLogin, handleGoogleRedirectToken, initGoogleSignIn,
    handleGoogleAdminResponse, handleStudentGoogleLogin as _handleStudentGoogleLogin,
    closeAdminAuth, showAdminToast, logoutUser, startTokenRefresh
} from './modules/auth.js';
// quiz.js, tree.js, notes.js — loaded lazily via app.features.bundle.min.js on first feature interaction
// grades.js — loaded lazily via app.admin.bundle.min.js on first admin interaction
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
    onScrollEnter, offScrollEnter,
    setScrollTierOptions
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
// pagehide يُطلَق قبل أن تبدأ الصفحة الجديدة بالتحميل.
// نمسح sessionStorage دائماً — لجلسة الضيف والمستخدم العادي على حدٍّ سواء.
// sessionStorage تبقى عند F5/Ctrl+R (reload)، فلو لم نمسحها سيدخل المستخدم
// مباشرةً للداشبورد دون المرور بشاشة تسجيل الدخول.
// كذلك نمسح guest-mode من localStorage لأنها لا تُعيَّن من جديد إلا بعد
// الموافقة الصريحة من المستخدم في نافذة "الدخول كضيف".
window.addEventListener('pagehide', () => {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('guest-mode');
    // مسح guest-mode من localStorage أيضاً حتى لا يبقى الوضع
    // معلقاً بعد الريفريش أو إغلاق التاب
    localStorage.removeItem('guest-mode');
    document.body.classList.remove('guest-mode');
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

    // ── ضبط Lenis بناءً على tier والجهاز ──────────────────────────────────────
    const _isMobile = navigator.maxTouchPoints > 1 &&
                      !!window.matchMedia?.('(hover: none)').matches;
    setScrollTierOptions(tier, _isMobile);

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

/** @private رسم لوحة القيادة مع ربط الدوال — يستخدم window.X للحزمة الكسولة */
function renderDashboard() {
    _renderDashboard(window.playQuiz, window.forceDownload);
}

/** @private حذف امتحان */
function deleteQuiz(index) {
    _deleteQuiz(index, renderDashboard);
}

/** @private الانتقال لقسم — يستخدم window.X للحزمة الكسولة */
function navToSection(section) {
    _navToSection(section, window.renderSubjectFilters, window.renderHistoryTree);
}

/** @private معالجة تسجيل دخول الطالب */
function handleStudentGoogleLogin(response) {
    _handleStudentGoogleLogin(response, window.renderSubjectFilters, window.renderHistoryTree, renderDashboard, startTokenRefresh);
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

            // ── تحميل الحزمة الكسولة للميزات مبكّراً (قبل الاشتباك مع السيرفر) ──
            // بحلول وقت وصول البيانات تكون الحزمة جاهزة بالفعل
            window.__loadFeatures?.();

            if (isGuest) {
                // وضع الضيف: لا توكن، لا تجديد، لكن نجلب البيانات العامة (امتحانات + مذكرات + لوحة الشرف)
                console.log('[app] ✓ وضع الضيف — تحميل البيانات العامة...');
                loadDataFromServer().then(() => {
                    window.renderSubjectFilters?.();
                    window.renderHistoryTree?.();
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
                window.renderSubjectFilters?.();
                window.renderHistoryTree?.();
                renderDashboard();
                console.log('[app] ✓ التطبيق جاهز — البيانات محمّلة من السيرفر');
            });
            return;
        }
        showLoginScreenWithDesktop();
    } catch (e) {
        console.warn("تعذر الوصول للذاكرة المحلية:", e);
        showLoginScreenWithDesktop();
    }
}

/** إغلاق نافذة تعديل المحتوى وإعادة تشغيل Lenis عبر _syncMainInteractionState */
function closeEditSelectionModal() {
    const el = document.getElementById('edit-selection-modal');
    if (el) el.classList.add('hidden');
    _syncMainInteractionState();
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

    // Quiz / Tree / Notes — stubs installed by registerFeatureStubs() below;
    // real implementations loaded lazily via app.features.bundle.min.js

    // Admin UI (closeEditSelectionModal is a core fn; rest loaded lazily)
    closeEditSelectionModal,

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
    pauseAllAnimations, resumeAllAnimations,
    // Expose startApp so bootstrap.js can invoke it after bundle injection
    startApp
});

// ============================================
//  Lazy Admin Bundle
//  builder.js (~19 KB) + grades.js (~11 KB)
//  Loads app.admin.bundle.min.js on first admin interaction.
//  Admin bundle overrides these stubs with real implementations.
// ============================================
(function registerAdminStubs() {
    const ADMIN_FNS = [
        'openCreateSection', 'closeCreateSection', 'goToBuilderStep2',
        'renderBuilderQuestion', 'updateBuilderData', 'updateBuilderOptionText',
        'setBuilderCorrectOption', 'addBuilderOption', 'removeBuilderOption',
        'addBuilderQuestion', 'navBuilderQuestion', 'saveBuiltQuiz',
        'loadQuizIntoBuilder', 'updateExistingQuiz', 'triggerImportExamFile',
        'reshuffleImportedAnswers', 'handleImportFileChange',
        'openGradesModal', 'closeGradesModal', 'openStatsModal', 'closeStatsModal',
        'openEditSelectionModal', 'switchEditTab'
    ];

    let _adminLoaded = false;
    let _adminLoadPromise = null;

    function _loadAdmin() {
        if (_adminLoaded) return Promise.resolve();
        if (!_adminLoadPromise) {
            _adminLoadPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = '/js/app.admin.bundle.min.js?v=40';
                s.onload = () => { _adminLoaded = true; resolve(); };
                s.onerror = () => reject(new Error('Admin bundle failed to load'));
                document.head.appendChild(s);
            });
        }
        return _adminLoadPromise;
    }

    ADMIN_FNS.forEach(name => {
        window[name] = function (...args) {
            _loadAdmin()
                .then(() => { if (typeof window[name] === 'function') window[name](...args); })
                .catch(err => console.error('[admin]', err));
        };
    });
})();

// ============================================
//  Lazy Features Bundle
//  quiz.js (34 KB) + tree.js (26 KB) + notes.js (7 KB)
//  Loads app.features.bundle.min.js on first feature interaction.
//  Features bundle overrides these stubs with real implementations.
// ============================================
(function registerFeatureStubs() {
    const FEATURE_FNS = [
        // Quiz
        'playQuiz', 'selectAnswer', 'goToNextQuestion', 'goToPreviousQuestion',
        'submitQuiz', 'exitToMain', 'showFeedback', 'hideFeedback',
        // Tree & Subjects
        'getDynamicSubjects',
        'setSubjectFilter', 'setEditSubjectFilter', 'renderSubjectFilters',
        'renderHistoryTree', 'renderEditTree',
        'renameSubject', 'closeRenameModal', 'executeRenameSubject',
        'confirmDeleteSubject', 'closeDeleteModal', 'executeDeleteSubject',
        // Notes
        'openAddNoteModal', 'closeAddNoteModal', 'saveNote',
        'loadNoteIntoBuilder', 'updateExistingNote', 'forceDownload'
    ];

    let _featuresLoaded = false;
    let _featuresPromise = null;

    function _loadFeatures() {
        if (_featuresLoaded) return Promise.resolve();
        if (!_featuresPromise) {
            _featuresPromise = new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = '/js/app.features.bundle.min.js?v=40';
                s.onload = () => { _featuresLoaded = true; resolve(); };
                s.onerror = () => reject(new Error('Features bundle failed to load'));
                document.head.appendChild(s);
            });
        }
        return _featuresPromise;
    }

    // Expose loader so loadApp() can trigger proactive prefetch
    window.__loadFeatures = _loadFeatures;

    FEATURE_FNS.forEach(name => {
        window[name] = function (...args) {
            _loadFeatures()
                .then(() => { if (typeof window[name] === 'function') window[name](...args); })
                .catch(err => console.error('[features]', err));
        };
    });
})();

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

    // Expose shared state for lazy-loaded admin bundle (builder.js / grades.js)
    window.__appState = state;
    // Expose api singletons for admin bundle (avoids duplicating state-aware modules)
    window.__api = { apiCall, fetchScoresFromServer, fetchLeaderboardFromServer };

    // ── تفعيل قفل scroll الخلفية عند فتح أي مودال ──────────────────────────
    // DOMContentLoaded قد يكون فات بالفعل، استخدم شرط الجاهزية
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => initOverlayScrollLock());
    } else {
        initOverlayScrollLock();
    }

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
                    const _p = window.__devicePerf;
                    const _t = _p?.tier || 'high';
                    const _m = navigator.maxTouchPoints > 1 &&
                               !!window.matchMedia?.('(hover: none)').matches;
                    // تمرير مدة مناسبة للجهاز عند إنشاء Lenis
                    const scrollOpts = {};
                    if (_t === 'low') {
                        scrollOpts.smoothWheel = false;
                        scrollOpts.duration    = 0;
                    } else if (_t === 'medium' || _m) {
                        scrollOpts.duration        = _m ? 0.8 : 1.0;
                        scrollOpts.touchMultiplier = _m ? 1.0 : 1.5;
                    }
                    initScroll(scrollOpts);
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

    // تهيئة DOM الاختبار + ربط Enter في حقل التسمية تتم داخل app.features.bundle.min.js
    // (quiz.js + tree.js + notes.js محمَّلة كسولاً — لا initQuizDOM هنا)

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