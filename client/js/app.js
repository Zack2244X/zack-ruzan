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
import { escapeHtml, showAlert, showConfirm, showLoading, formatTime, showToastMessage, pickRandom, shuffleArray, logFunctionStatus } from './modules/helpers.js';
import { apiCall, loadDataFromServer, fetchLeaderboardFromServer, fetchScoresFromServer } from './modules/api.js';
import {
    _syncMainInteractionState, _showThemeToggle, updateDockUI,
    openBottomSheet, closeBottomSheet, closeAdminSheet, closeAllOverlays,
    applyTheme, toggleTheme, initTheme, navToHome,
    navToSection as _navToSection, openAdminAuthOrPanel,
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
        showLoginScreen();
    }
});

// ─── مسح الجلسة قبل أي reload/إغلاق للتبويب ───
// pagehide يُطلَق قبل أن تبدأ الصفحة الجديدة بالتحميل
// يضمن أن loadApp() سيجد sessionStorage فارغاً دائماً عند كل تحميل
window.addEventListener('pagehide', () => {
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('isAdmin');
});

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
            // Token is managed via httpOnly cookie; adminToken set on fresh login only

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('ios-bottom-nav').classList.remove('hidden');

            const safeName = escapeHtml(state.currentUser.fname || state.currentUser.fullName || 'صديقنا');
            document.getElementById('welcome-msg').innerText = `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}`;

            navToHome();
            renderDashboard();
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
        showLoginScreen();
    } catch (e) {
        console.warn("تعذر الوصول للذاكرة المحلية:", e);
        showLoginScreen();
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
    startGoogleRedirectLogin, closeAdminAuth, logoutUser, handleStudentGoogleLogin,

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
    escapeHtml, showAlert, showConfirm, showLoading
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
window.onload = async function () {
    logFunctionStatus('window.onload', false);
    // تهيئة الثيم
    initTheme();

    // جلب إعدادات السيرفر (GOOGLE_CLIENT_ID) لإزالة التكرار
    try {
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
            const configData = await configRes.json();
            if (configData.googleClientId) state.GOOGLE_CLIENT_ID = configData.googleClientId;
        }
    } catch (e) {
        console.warn('⚠️ تعذر جلب إعدادات السيرفر، استخدام القيم الافتراضية.');
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

    // معالجة Google redirect أو تحميل التطبيق
    const handledRedirect = handleGoogleRedirectToken();
    initGoogleSignIn();
    if (!handledRedirect) {
        loadApp();
    }
};
