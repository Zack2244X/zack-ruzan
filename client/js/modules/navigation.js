/**
 * @module navigation
 * @description دوال التنقل، إدارة النوافذ، الثيم، والشريط السفلي
 */
import state, { THEME_KEY } from './state.js';
import { logFunctionStatus } from './helpers.js';
import { getLenisInstance } from './scroll.js';

const SHEET_CLOSE_MS = 340;

/**
 * مزامنة حالة التفاعل مع العناصر الرئيسية (منع التفاعل عند فتح نوافذ)
 */
export function _syncMainInteractionState() {
    logFunctionStatus('_syncMainInteractionState', false);

    const dashboard = document.getElementById('dashboard-view');
    const quiz = document.getElementById('quiz-container');
    const onHome = !!dashboard && !dashboard.classList.contains('hidden') && (!!quiz && quiz.classList.contains('hidden'));

    // قائمة كاملة بكل العناصر التي تظهر فوق الشاشة الرئيسية:
    // — تشمل results-screen (نتيجة الاختبار) و confirm-modal-overlay (مربع التأكيد)
    const anyOpen = [
        'create-section-modal', 'add-note-modal', 'edit-selection-modal',
        'grades-modal', 'stats-modal', 'admin-auth-modal',
        'delete-subject-modal', 'rename-subject-modal', 'student-menu-modal',
        'results-screen', 'confirm-modal-overlay', 'delete-exam-modal',
        'accounts-management-modal'
    ].some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
    const sheetOpen = document.getElementById('tree-content')?.classList.contains('active')
                   || document.getElementById('admin-content')?.classList.contains('active');
    // guest-modal uses display:none/block instead of hidden class
    // Check style.display only — offsetParent forces reflow
    const guestModalOpen = (() => {
        const gm = document.getElementById('guest-modal');
        return gm ? gm.style.display !== 'none' && gm.style.display !== '' : false;
    })();
    const blocked = anyOpen || sheetOpen || guestModalOpen;

    const body = document.body;
    const root = document.documentElement;
    const allowHomeScroll = onHome && !blocked;

    // Show page scrollbar only on home view when no overlay is open.
    body.classList.toggle('home-scroll', allowHomeScroll);
    root.classList.toggle('home-scroll', allowHomeScroll);

    // ── DOM writes ────────────────────────────────────────────────────────────
    if (dashboard) {
        dashboard.classList.toggle('pointer-events-none', blocked);
        dashboard.classList.toggle('select-none', blocked);
    }
    // Keep scroll-lock writes minimal and avoid any computed-style/layout reads here.
    // `scrollbar-gutter: stable` is already enabled in CSS, so compensation reads are unnecessary.
    try {
        if (blocked) {
            if (!body.hasAttribute('data-scroll-lock')) {
                body.setAttribute('data-scroll-lock', '1');
                body.setAttribute('data-orig-overflow', body.style.overflow || '');
                body.style.overflow = 'hidden';

                root.setAttribute('data-scroll-lock', '1');
                root.setAttribute('data-orig-overflow', root.style.overflow || '');
                root.style.overflow = 'hidden';
            }
            // وقف Lenis: overflow:hidden لا يكفي — Lenis يستمر عبر RAF
            // ويتجاهل CSS overflow ويُحرِّك الصفحة خلف المودال
            try { getLenisInstance()?.stop?.(); } catch (e) {}
        } else {
            if (body.hasAttribute('data-scroll-lock')) {
                const origOverflow = body.getAttribute('data-orig-overflow');
                body.style.overflow = origOverflow || '';
                body.removeAttribute('data-orig-overflow');
                body.removeAttribute('data-scroll-lock');

                const rootOrigOverflow = root.getAttribute('data-orig-overflow');
                root.style.overflow = rootOrigOverflow || '';
                root.removeAttribute('data-orig-overflow');
                root.removeAttribute('data-scroll-lock');
            }
            // استئناف Lenis بعد إغلاق المودال
            try { getLenisInstance()?.start?.(); } catch (e) {}
        }
    } catch (e) {
        document.body.style.overflow = blocked ? 'hidden' : '';
    }

    const t = document.getElementById('theme-toggle');
    if (t) t.style.display = (onHome && !blocked) ? '' : 'none';
    // تحكم مركزي في ظهور الشريط السفلي: يظهر فقط في الرئيسية وبدون أي طبقات مفتوحة
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.toggle('hidden', !onHome || blocked);
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
 * مراقبة مركزية بـ MutationObserver لكل الطبقات التي تظهر فوق الصفحة الرئيسية.
 *
 * المشكلة: بعض المودالز (درجات، إحصائيات، نتيجة الاختبار، مربع التأكيد) تفتح مباشرةً
 * بدون تمرير دالة الفتح بـ _syncMainInteractionState → Lenis/overflow لم يُقف.
 *
 * الحل: Observer يراقب class+style لكل مودال → عند أي تغيير ينادي
 * _syncMainInteractionState() التي تحدد بنفسها إن كان هناك شيء مفتوح.
 *
 * يُستدعى مرة واحدة بعد DOMContentLoaded من startApp في app.js.
 */
export function initOverlayScrollLock() {
    // كل العناصر التي يمكن أن تظهر فوق الصفحة الرئيسية
    const OVERLAY_IDS = [
        'grades-modal', 'stats-modal', 'edit-selection-modal',
        'add-note-modal', 'create-section-modal',
        'admin-auth-modal', 'student-menu-modal',
        'delete-subject-modal', 'rename-subject-modal',
        'results-screen', 'confirm-modal-overlay',
        'accounts-management-modal',
        'guest-modal', 'delete-exam-modal'
    ];
    const SHEET_IDS = ['tree-content', 'admin-content'];

    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver(() => {
        // تأجيل frame واحد حتى تكتمل تغييرات الـ class، ثم نزامن مع DOM
        requestAnimationFrame(() => _syncMainInteractionState());
    });

    const observeEl = (id) => {
        const el = document.getElementById(id);
        if (el) observer.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
    };

    [...OVERLAY_IDS, ...SHEET_IDS].forEach(observeEl);

    console.log('[navigation] ✓ initOverlayScrollLock — MutationObserver نشط على '
        + (OVERLAY_IDS.length + SHEET_IDS.length) + ' عنصر');
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
            btn.classList.add('text-gray-600');
        });
        const activeBtn = document.getElementById('dock-' + activeId);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-600');
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
    const sheet = document.getElementById('tree-bottom-sheet');
    const overlay = document.getElementById('tree-overlay');
    const content = document.getElementById('tree-content');
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.add('hidden');
    if (sheet) sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay?.classList.add('active');
        content?.classList.add('active');
    });
    _attachSwipeToClose(content, closeBottomSheet);
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق القائمة السفلية */
export function closeBottomSheet() {
    logFunctionStatus('closeBottomSheet', false);
    const sheet = document.getElementById('tree-bottom-sheet');
    const overlay = document.getElementById('tree-overlay');
    const content = document.getElementById('tree-content');
    overlay?.classList.remove('active');
    content?.classList.remove('active');
    if (sheet) {
        clearTimeout(sheet._hideTimer);
        sheet._hideTimer = setTimeout(() => {
            if (!content?.classList.contains('active')) sheet.classList.add('hidden');
        }, SHEET_CLOSE_MS);
    }
    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.remove('hidden');
    if (state.currentViewMode) updateDockUI('home');
    _showThemeToggle(true);
}

/** إغلاق قائمة الأدمن السفلية */
export function closeAdminSheet() {
    logFunctionStatus('closeAdminSheet', false);
    const sheet = document.getElementById('admin-bottom-sheet');
    const overlay = document.getElementById('admin-overlay');
    const content = document.getElementById('admin-content');
    overlay?.classList.remove('active');
    content?.classList.remove('active');
    if (sheet) {
        clearTimeout(sheet._hideTimer);
        sheet._hideTimer = setTimeout(() => {
            if (!content?.classList.contains('active')) sheet.classList.add('hidden');
        }, SHEET_CLOSE_MS);
    }
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
    // Ensure compatibility with Tailwind's `dark` class mode and other CSS relying on `.dark`
    try {
        if (finalTheme === 'dark') {
            root.classList.add('dark');
            document.body.classList.add('dark');
        } else {
            root.classList.remove('dark');
            document.body.classList.remove('dark');
        }
    } catch (err) {
        console.warn('applyTheme: failed to toggle .dark class', err);
    }
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
        const sheet = document.getElementById('admin-bottom-sheet');
        if (sheet) sheet.classList.remove('hidden');
        const adminOverlay = document.getElementById('admin-overlay');
        const adminContent = document.getElementById('admin-content');
        requestAnimationFrame(() => {
            adminOverlay?.classList.add('active');
            adminContent?.classList.add('active');
        });
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

// Viewport manipulation removed — login page uses responsive CSS (flex-column on mobile).

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

/** Ensure login page enforces desktop layout on mobile — now alias of showLoginScreen */
export function showLoginScreenWithDesktop() {
    showLoginScreen();
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
