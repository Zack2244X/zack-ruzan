/**
 * @module app-admin
 * @description Admin bundle entry point — only loaded when an admin action is first triggered.
 * Dependencies: builder.js + grades.js.
 * State is shared via window.__appState (set by core bundle before any admin fn can be called).
 * Callbacks (renderHistoryTree, renderEditTree, etc.) are accessed from window (set by core bundle).
 */

import {
    openCreateSection, closeCreateSection, goToBuilderStep2,
    renderBuilderQuestion, updateBuilderData, updateBuilderOptionText,
    setBuilderCorrectOption, addBuilderOption, removeBuilderOption,
    addBuilderQuestion, navBuilderQuestion,
    saveBuiltQuiz as _saveBuiltQuiz,
    loadQuizIntoBuilder as _loadQuizIntoBuilder,
    updateExistingQuiz as _updateExistingQuiz,
    triggerImportExamFile, reshuffleImportedAnswers,
    handleImportFileChange
} from './modules/builder.js';

import {
    openGradesModal, closeGradesModal,
    openStatsModal, closeStatsModal,
    openEditSelectionModal,
    switchEditTab as _switchEditTab
} from './modules/grades.js';

// ── Wrappers injecting core callbacks from window ──────────

function saveBuiltQuiz() {
    return _saveBuiltQuiz(
        window.renderHistoryTree,
        window.renderEditTree,
        window.renderDashboard
    );
}

function loadQuizIntoBuilder(index) {
    return _loadQuizIntoBuilder(index);
}

function updateExistingQuiz(index) {
    return _updateExistingQuiz(
        index,
        window.renderHistoryTree,
        window.renderEditTree,
        window.renderDashboard
    );
}

function switchEditTab(tab) {
    return _switchEditTab(tab, window.renderSubjectFilters, window.renderEditTree);
}

// ── Override window stubs with real implementations ────────
Object.assign(window, {
    openCreateSection, closeCreateSection, goToBuilderStep2,
    renderBuilderQuestion, updateBuilderData, updateBuilderOptionText,
    setBuilderCorrectOption, addBuilderOption, removeBuilderOption,
    addBuilderQuestion, navBuilderQuestion,
    saveBuiltQuiz, loadQuizIntoBuilder, updateExistingQuiz,
    triggerImportExamFile, reshuffleImportedAnswers, handleImportFileChange,
    openGradesModal, closeGradesModal,
    openStatsModal, closeStatsModal,
    openEditSelectionModal, switchEditTab
});
