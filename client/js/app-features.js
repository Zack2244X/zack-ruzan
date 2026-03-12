/**
 * app-features.js — Lazy Features Bundle Entry Point
 * بسم الله الرحمن الرحيم
 *
 * Contains: quiz.js + tree.js + notes.js
 * Loaded lazily on first user interaction with these features.
 * Exposes all functions on window, overriding stubs set in app.js.
 *
 * Cross-bundle dependencies use window.X (core: renderDashboard, navToSection;
 * admin: loadQuizIntoBuilder).
 *
 * STATE SHARING: quiz/tree/notes import state from state.js — when bundled as
 * IIFE this creates a local copy. We patch the local state object to delegate
 * all property reads/writes to window.__appState (the core bundle's shared state)
 * so both bundles always see the same data.
 */
'use strict';

// حزمة الميزات تستورد state من state.js داخلياً — نحتاج للوصول إليه لتصحيحه
import state from './modules/state.js';

// ── تصحيح الحالة: ربط الكائن المحلي بالحالة المشتركة للحزمة الأساسية ────────────────
// يجب أن يُنفَّذ هذا قبل أي استدعاء لدوال quiz/tree/notes
(function patchBundledState() {
    const realState = window.__appState;
    if (!realState) return;
    // نجعل كل خاصية في state المحلي تُقرأ وتُكتب من realState
    // هذا يضمن أن quiz.js/tree.js/notes.js دائماً ترى البيانات الصحيحة
    Object.keys(realState).forEach(key => {
        Object.defineProperty(state, key, {
            get() { return realState[key]; },
            set(v) { realState[key] = v; },
            enumerable: true,
            configurable: true
        });
    });
})();

// ── كود الاختبار ────────────────────────────────────────────────────────────
import {
    initQuizDOM, playQuiz as _playQuiz,
    selectAnswer, showFeedback, hideFeedback,
    goToNextQuestion, goToPreviousQuestion,
    submitQuiz, exitToMain as _exitToMain
} from './modules/quiz.js';

// ── كود الشجرة والمواد ───────────────────────────────────────────────────────
import {
    getDynamicSubjects,
    renderSubjectFilters as _renderSubjectFilters,
    setSubjectFilter as _setSubjectFilter,
    setEditSubjectFilter as _setEditSubjectFilter,
    renderHistoryTree as _renderHistoryTree,
    renderEditTree as _renderEditTree,
    renameSubject as _renameSubject,
    closeRenameModal,
    executeRenameSubject as _executeRenameSubject,
    confirmDeleteSubject as _confirmDeleteSubject,
    closeDeleteModal,
    executeDeleteSubject as _executeDeleteSubject
} from './modules/tree.js';

// ── كود المذكرات ─────────────────────────────────────────────────────────────
import {
    openAddNoteModal, closeAddNoteModal,
    saveNote as _saveNote,
    loadNoteIntoBuilder as _loadNoteIntoBuilder,
    updateExistingNote as _updateExistingNote,
    forceDownload
} from './modules/notes.js';

// ============================================
//  دوال الربط (Wrapper Functions)
//  — تستخدم window.X للدوال الموجودة في الحزمة الأساسية أو حزمة الإدارة
// ============================================

/** رسم الفلاتر */
function renderSubjectFilters() {
    _renderSubjectFilters(renameSubject, confirmDeleteSubject);
}

/** رسم شجرة التاريخ */
function renderHistoryTree() {
    _renderHistoryTree(playQuiz, forceDownload);
}

/** رسم شجرة التعديل */
function renderEditTree() {
    _renderEditTree(window.loadQuizIntoBuilder, loadNoteIntoBuilder);
}

/** تبديل فلتر المادة */
function setSubjectFilter(subject) {
    _setSubjectFilter(subject, renderHistoryTree, renameSubject, confirmDeleteSubject);
}

/** تبديل فلتر مادة التعديل */
function setEditSubjectFilter(subject) {
    _setEditSubjectFilter(subject, renderEditTree, renameSubject, confirmDeleteSubject);
}

/** بدء اختبار */
function playQuiz(index) {
    _playQuiz(index);
}

/** الخروج للرئيسية */
function exitToMain() {
    _exitToMain(window.renderDashboard);
}

/** إعادة تسمية مادة */
function renameSubject(oldName, event) {
    _renameSubject(oldName, event);
}

/** تأكيد حذف مادة */
function confirmDeleteSubject(subjectName, event) {
    _confirmDeleteSubject(subjectName, event);
}

/** تنفيذ إعادة التسمية */
function executeRenameSubject() {
    _executeRenameSubject(renderSubjectFilters, renderHistoryTree, window.renderDashboard);
}

/** تنفيذ الحذف */
function executeDeleteSubject() {
    _executeDeleteSubject(renderSubjectFilters, renderHistoryTree, window.renderDashboard);
}

/** تحميل مذكرة للتعديل */
function loadNoteIntoBuilder(index) {
    _loadNoteIntoBuilder(index);
}

/** حفظ مذكرة */
function saveNote() {
    _saveNote(renderEditTree, renderSubjectFilters, renderHistoryTree, window.navToSection);
}

/** تحديث مذكرة */
function updateExistingNote() {
    _updateExistingNote(renderHistoryTree, renderEditTree, window.renderDashboard);
}

// ============================================
//  تسجيل الدوال على window (يُلغي stubs الحزمة الأساسية)
// ============================================
Object.assign(window, {
    // Quiz
    playQuiz, selectAnswer, goToNextQuestion, goToPreviousQuestion,
    submitQuiz, exitToMain, showFeedback, hideFeedback,

    // Tree & Subjects
    getDynamicSubjects,
    setSubjectFilter, setEditSubjectFilter, renderSubjectFilters,
    renderHistoryTree, renderEditTree,
    renameSubject, closeRenameModal, executeRenameSubject,
    confirmDeleteSubject, closeDeleteModal, executeDeleteSubject,

    // Notes
    openAddNoteModal, closeAddNoteModal, saveNote,
    loadNoteIntoBuilder, updateExistingNote, forceDownload,
});

// ============================================
//  تهيئة DOM الاختبار تلقائياً عند تحميل الحزمة
// ============================================
try { initQuizDOM(); } catch (e) { console.warn('[features] initQuizDOM failed:', e); }

// ربط Enter في حقل إعادة التسمية
try {
    const renameInput = document.getElementById('rename-subject-input');
    if (renameInput && !renameInput._featuresInit) {
        renameInput._featuresInit = true;
        renameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.executeRenameSubject?.();
        });
    }
} catch (e) { /* ignore */ }
