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
import { escapeHtml, showAlert, showConfirm, showLoading, formatTime, showToastMessage, pickRandom, shuffleArray } from './modules/helpers.js';
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
    handleImportFileChange, applyImportedQuestions
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
import { renderDashboard as _renderDashboard } from './modules/dashboard.js';

// === Global Error Boundary ===
window.addEventListener('error', (e) => {
    console.error('❌ خطأ غير متوقع:', e.message, e.filename, e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('❌ Promise مرفوض:', e.reason);
    e.preventDefault();
});

// === Service Worker Registration (PWA) ===
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered:', reg.scope))
            .catch(err => console.warn('⚠️ SW registration failed:', err));
    });
}

// === Multi-tab Sync: Logout ===
window.addEventListener('storage', (e) => {
    if (e.key === 'session_token' && !e.newValue) {
        state.currentUser = null;
        state.isAdmin = false;
        state.adminToken = null;
        showLoginScreen();
    }
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

/** @private تبديل فلتر المادة الرئيسية */
function setSubjectFilter(subject) {
    _setSubjectFilter(subject, renderHistoryTree);
}

/** @private تبديل فلتر المادة في نافذة التعديل */
function setEditSubjectFilter(subject) {
    _setEditSubjectFilter(subject, renderEditTree);
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
    try {
        const savedScores = localStorage.getItem('allUserScores');
        if (savedScores) state.allUserScores = JSON.parse(savedScores);

        const savedUser = sessionStorage.getItem('currentUser');
        if (savedUser) {
            state.currentUser = JSON.parse(savedUser);
            state.isAdmin = sessionStorage.getItem('isAdmin') === 'true';
            if (state.isAdmin) state.adminToken = state.currentUser.token;

            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('ios-bottom-nav').classList.remove('hidden');

            const safeName = escapeHtml(state.currentUser.fname || state.currentUser.fullName || 'صديقنا');
            document.getElementById('welcome-msg').innerText = `مرحباً بك يا ${safeName}`;

            navToHome();
            renderDashboard();
            startTokenRefresh();
            loadDataFromServer().then(() => {
                state.dataLoaded = true;
                renderSubjectFilters();
                renderHistoryTree();
                renderDashboard();
            });
            return;
        }
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
    toggleTheme, updateDockUI, toggleTreeNode,

    // Auth
    startGoogleRedirectLogin, closeAdminAuth, logoutUser, handleStudentGoogleLogin,

    // Quiz
    playQuiz, selectAnswer, goToNextQuestion, goToPreviousQuestion,
    submitQuiz, exitToMain,

    // Builder
    openCreateSection, closeCreateSection, goToBuilderStep2,
    renderBuilderQuestion, updateBuilderOptionText, setBuilderCorrectOption,
    addBuilderOption, removeBuilderOption, addBuilderQuestion,
    navBuilderQuestion, saveBuiltQuiz, updateExistingQuiz,
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

    // Helpers
    escapeHtml, showAlert, showConfirm, showLoading
});

// ============================================
//  نقطة البداية
// ============================================
window.onload = function () {
    // تهيئة الثيم
    initTheme();

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
