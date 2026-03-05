/**
 * @module navigation
 * @description دوال التنقل، إدارة النوافذ، الثيم، والشريط السفلي
 */
import state, { THEME_KEY } from './state.js';
import { logFunctionStatus } from './helpers.js';

/**
 * مزامنة حالة التفاعل مع العناصر الرئيسية (منع التفاعل عند فتح نوافذ)
 */
export function _syncMainInteractionState() {
    logFunctionStatus('_syncMainInteractionState', false);
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
    // تحكم مركزي في ظهور الشريط السفلي: اخفاؤه إذا كانت هناك نوافذ منبثقة
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.toggle('hidden', blocked);
}

/**
 * إظهار/إخفاء زر تبديل الثيم
 * @param {boolean} show — إظهار أم إخفاء
 */
export function _showThemeToggle(show) {
    logFunctionStatus('_showThemeToggle', false);
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
    logFunctionStatus('updateDockUI', false);
    const allBtns = document.querySelectorAll('.dock-btn');
        // إذا كان الاختبار نشطًا، عطل جميع أزرار الشريط السفلي
        if (state.quizStarted) {
            allBtns.forEach(btn => {
                btn.setAttribute('disabled', 'disabled');
                btn.classList.add('pointer-events-none', 'opacity-50');
            });
            return;
        }
        // تفعيل الأزرار إذا لم يكن هناك اختبار نشط
        allBtns.forEach(btn => {
            btn.removeAttribute('disabled');
            btn.classList.remove('pointer-events-none', 'opacity-50');
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

/**
 * إضافة swipe-to-close لعنصر bottom sheet
 * @param {HTMLElement} el — عنصر المحتوى
 * @param {Function} closeFn — دالة الإغلاق
 */
function _attachSwipeToClose(el, closeFn) {
    logFunctionStatus('_attachSwipeToClose', false);
    if (!el || el._swipeAttached) return;
    el._swipeAttached = true;
    let startY = 0;
    let isDragging = false;

    el.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        el.style.transition = 'none';
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const dy = e.changedTouches[0].clientY - startY;
        el.style.transition = '';
        el.style.transform = '';
        if (dy > 80) closeFn();
    }, { passive: true });
}

/** فتح القائمة السفلية (Bottom Sheet) */
export function openBottomSheet() {
    logFunctionStatus('openBottomSheet', false);
    const content = document.getElementById('tree-content');
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.add('hidden');
    document.getElementById('tree-overlay').classList.add('active');
    content.classList.add('active');
    _attachSwipeToClose(content, closeBottomSheet);
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق القائمة السفلية */
export function closeBottomSheet() {
    logFunctionStatus('closeBottomSheet', false);
    document.getElementById('tree-overlay').classList.remove('active');
    document.getElementById('tree-content').classList.remove('active');
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.remove('hidden');
    if (state.currentViewMode) updateDockUI('home');
    _showThemeToggle(true);
}

/** إغلاق قائمة الأدمن السفلية */
export function closeAdminSheet() {
    logFunctionStatus('closeAdminSheet', false);
    document.getElementById('admin-overlay').classList.remove('active');
    document.getElementById('admin-content').classList.remove('active');
    updateDockUI('home');
    _showThemeToggle(true);
}

/** إغلاق جميع النوافذ المنبثقة */
export function closeAllOverlays() {
    logFunctionStatus('closeAllOverlays', false);
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
    logFunctionStatus('applyTheme', false);
    const root = document.documentElement;
    const icon = document.querySelector('#theme-toggle i');
    const finalTheme = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', finalTheme);
    localStorage.setItem(THEME_KEY, finalTheme);
    if (icon) icon.className = finalTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

/** تبديل الثيم بين فاتح وداكن */
export function toggleTheme() {
    logFunctionStatus('toggleTheme', false);
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
}

/** تهيئة الثيم عند بدء التطبيق */
export function initTheme() {
    logFunctionStatus('initTheme', false);
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
    logFunctionStatus('navToHome', false);
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
    logFunctionStatus('navToSection', false);
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
    logFunctionStatus('openAdminAuthOrPanel', false);
    closeAllOverlays();
    updateDockUI('settings');
    if (state.isAdmin) {
        const adminContent = document.getElementById('admin-content');
        document.getElementById('admin-overlay').classList.add('active');
        adminContent.classList.add('active');
        // إخفاء الشريط السفلي عند فتح لوحة الأدمن
        const dock = document.getElementById('ios-bottom-nav');
        if (dock) dock.classList.add('hidden');
        _attachSwipeToClose(adminContent, closeAdminSheet);
    } else {
        document.getElementById('student-menu-modal').classList.remove('hidden');
    }
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق قائمة الطالب */
export function closeStudentMenu() {
    logFunctionStatus('closeStudentMenu', false);
    document.getElementById('student-menu-modal').classList.add('hidden');
    _showThemeToggle(true);
    updateDockUI('home');
}

/** عرض شاشة تسجيل الدخول */
export function showLoginScreen() {
    logFunctionStatus('showLoginScreen', false);
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('ios-bottom-nav').classList.add('hidden');
    state.googleLoginMode = 'student';
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** طي/فتح فروع الشجرة */
export function toggleTreeNode(contentId, btn) {
    logFunctionStatus('toggleTreeNode', false);
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
