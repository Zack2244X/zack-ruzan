/**
 * @module navigation
 * @description دوال التنقل، إدارة النوافذ، الثيم، والشريط السفلي
 */
import state, { THEME_KEY } from './state.js';

/**
 * مزامنة حالة التفاعل مع العناصر الرئيسية (منع التفاعل عند فتح نوافذ)
 */
export function _syncMainInteractionState() {
    const dashboard = document.getElementById('dashboard-view');
    const quiz = document.getElementById('quiz-container');
    const onHome = !!dashboard && !dashboard.classList.contains('hidden') && (!!quiz && quiz.classList.contains('hidden'));

    const anyOpen = ['create-section-modal','add-note-modal','edit-selection-modal','grades-modal','stats-modal','admin-auth-modal','delete-subject-modal','rename-subject-modal','student-menu-modal']
        .some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
    const sheetOpen = document.getElementById('tree-content')?.classList.contains('active') || document.getElementById('admin-content')?.classList.contains('active');
    const blocked = anyOpen || sheetOpen;

    if (dashboard) {
        dashboard.classList.toggle('pointer-events-none', blocked);
        dashboard.classList.toggle('select-none', blocked);
    }
    document.body.style.overflow = blocked ? 'hidden' : '';

    const t = document.getElementById('theme-toggle');
    if (t) t.style.display = (onHome && !blocked) ? '' : 'none';
}

/**
 * إظهار/إخفاء زر تبديل الثيم
 * @param {boolean} show — إظهار أم إخفاء
 */
export function _showThemeToggle(show) {
    const t = document.getElementById('theme-toggle');
    if (!t) return;
    if (!show) { t.style.display = 'none'; return; }
    _syncMainInteractionState();
}

/**
 * تحديث ألوان الأيقونات في الشريط السفلي
 * @param {string} activeId — المعرف النشط (home, exams, notes, settings)
 */
export function updateDockUI(activeId) {
    const allBtns = document.querySelectorAll('.dock-btn');
    allBtns.forEach(btn => {
        btn.classList.remove('active', 'text-blue-600', 'text-orange-600', 'text-purple-600');
        btn.classList.add('text-gray-400');
    });
    const activeBtn = document.getElementById('dock-' + activeId);
    if (activeBtn) {
        activeBtn.classList.remove('text-gray-400');
        activeBtn.classList.add('active');
        if (activeId === 'exams') activeBtn.classList.add('text-blue-600');
        else if (activeId === 'notes') activeBtn.classList.add('text-orange-600');
        else if (activeId === 'settings') activeBtn.classList.add('text-purple-600');
        else activeBtn.classList.add('text-blue-600');
    }
}

/** فتح القائمة السفلية (Bottom Sheet) */
export function openBottomSheet() {
    document.getElementById('tree-overlay').classList.add('active');
    document.getElementById('tree-content').classList.add('active');
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق القائمة السفلية */
export function closeBottomSheet() {
    document.getElementById('tree-overlay').classList.remove('active');
    document.getElementById('tree-content').classList.remove('active');
    if (state.currentViewMode) updateDockUI('home');
    _showThemeToggle(true);
}

/** إغلاق قائمة الأدمن السفلية */
export function closeAdminSheet() {
    document.getElementById('admin-overlay').classList.remove('active');
    document.getElementById('admin-content').classList.remove('active');
    updateDockUI('home');
    _showThemeToggle(true);
}

/** إغلاق جميع النوافذ المنبثقة */
export function closeAllOverlays() {
    closeBottomSheet();
    closeAdminSheet();
    const modalsToClose = [
        'admin-auth-modal', 'create-section-modal', 'add-note-modal',
        'edit-selection-modal', 'grades-modal', 'stats-modal',
        'delete-subject-modal', 'rename-subject-modal', 'student-menu-modal'
    ];
    modalsToClose.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    _syncMainInteractionState();
}

/**
 * تطبيق الثيم (فاتح/داكن)
 * @param {'light'|'dark'} theme — الثيم المطلوب
 */
export function applyTheme(theme) {
    const root = document.documentElement;
    const icon = document.querySelector('#theme-toggle i');
    const finalTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', finalTheme);
    localStorage.setItem(THEME_KEY, finalTheme);
    if (icon) icon.className = finalTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/** تبديل الثيم بين فاتح وداكن */
export function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
}

/** تهيئة الثيم عند بدء التطبيق */
export function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
        applyTheme(stored);
    } else {
        const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
        applyTheme(prefersDark ? 'dark' : 'light');
    }
}

/** الانتقال للصفحة الرئيسية */
export function navToHome() {
    closeAllOverlays();
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('quiz-container').classList.add('hidden');
    updateDockUI('home');
    _showThemeToggle(true);
}

/**
 * الانتقال لقسم (امتحانات أو مذكرات)
 * @param {'exams'|'notes'} section — القسم المطلوب
 * @param {Function} renderSubjectFilters — دالة رسم الفلاتر
 * @param {Function} renderHistoryTree — دالة رسم الشجرة
 */
export function navToSection(section, renderSubjectFilters, renderHistoryTree) {
    closeAllOverlays();
    state.currentViewMode = section;
    state.currentSubjectFilter = 'الكل';
    const titleEl = document.getElementById('sheet-title');
    const iconEl = document.getElementById('sheet-icon');
    if (section === 'exams') {
        titleEl.innerText = "سجل الامتحانات";
        iconEl.className = "fas fa-bolt text-blue-600 bg-blue-100 p-2 rounded-xl ml-3 text-lg";
    } else {
        titleEl.innerText = "المذكرات والملفات";
        iconEl.className = "fas fa-file-pdf text-orange-600 bg-orange-100 p-2 rounded-xl ml-3 text-lg";
    }
    renderSubjectFilters();
    renderHistoryTree();
    openBottomSheet();
    updateDockUI(section);
}

/**
 * فتح لوحة الأدمن أو قائمة الطالب
 */
export function openAdminAuthOrPanel() {
    closeAllOverlays();
    updateDockUI('settings');
    if (state.isAdmin) {
        document.getElementById('admin-overlay').classList.add('active');
        document.getElementById('admin-content').classList.add('active');
    } else {
        document.getElementById('student-menu-modal').classList.remove('hidden');
    }
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق قائمة الطالب */
export function closeStudentMenu() {
    document.getElementById('student-menu-modal').classList.add('hidden');
    _showThemeToggle(true);
    updateDockUI('home');
}

/** عرض شاشة تسجيل الدخول */
export function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('ios-bottom-nav').classList.add('hidden');
    state.googleLoginMode = 'student';
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** طي/فتح فروع الشجرة */
export function toggleTreeNode(contentId, btn) {
    const content = document.getElementById(contentId);
    const icon = btn.querySelector('.fa-chevron-down');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        content.classList.add('block');
        icon.classList.add('rotate-180');
    } else {
        content.classList.remove('block');
        content.classList.add('hidden');
        icon.classList.remove('rotate-180');
    }
}
