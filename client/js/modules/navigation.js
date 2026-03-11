/**
 * @module navigation
 * @description دوال التنقل، إدارة النوافذ، الثيم، والشريط السفلي
 */
import state, { THEME_KEY } from './state.js';
import { logFunctionStatus } from './helpers.js';
import { getLenisInstance } from './scroll.js';

/**
 * مزامنة حالة التفاعل مع العناصر الرئيسية (منع التفاعل عند فتح نوافذ)
 */
export function _syncMainInteractionState() {
    logFunctionStatus('_syncMainInteractionState', false);
    try { console.debug('[diag] _syncMainInteractionState — checking overlays (login/dashboard/ios-bottom-nav)'); } catch(e){}
    const dashboard = document.getElementById('dashboard-view');
    const quiz = document.getElementById('quiz-container');
    const onHome = !!dashboard && !dashboard.classList.contains('hidden') && (!!quiz && quiz.classList.contains('hidden'));

    // قائمة كاملة بكل العناصر التي تظهر فوق الشاشة الرئيسية:
    // — تشمل results-screen (نتيجة الاختبار) و confirm-modal-overlay (مربع التأكيد)
    const anyOpen = [
        'create-section-modal', 'add-note-modal', 'edit-selection-modal',
        'grades-modal', 'stats-modal', 'admin-auth-modal',
        'delete-subject-modal', 'rename-subject-modal', 'student-menu-modal',
        'results-screen', 'confirm-modal-overlay', 'delete-exam-modal'
    ].some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
    const sheetOpen = document.getElementById('tree-content')?.classList.contains('active')
                   || document.getElementById('admin-content')?.classList.contains('active');
    // guest-modal يستخدم display:none/block بدل hidden class
    const guestModalOpen = (() => {
        const gm = document.getElementById('guest-modal');
        return gm ? gm.style.display !== 'none' && gm.style.display !== '' && gm.offsetParent !== null : false;
    })();
    const blocked = anyOpen || sheetOpen || guestModalOpen;

    if (dashboard) {
        dashboard.classList.toggle('pointer-events-none', blocked);
        dashboard.classList.toggle('select-none', blocked);
    }
    // Avoid layout shift from scrollbar removal: when blocking, lock scroll and
    // compensate for the scrollbar width by adding equivalent padding-right.
    try {
        const body = document.body;
        const bodyOverflowY = getComputedStyle(body).overflowY;
        if (blocked) {
            // Only compensate for scrollbar if overflow-y is not already scroll
            if (!body.hasAttribute('data-orig-pr')) body.setAttribute('data-orig-pr', body.style.paddingRight || '');
            const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
            if (scrollbarWidth > 0 && bodyOverflowY !== 'scroll') {
                const computed = parseFloat(getComputedStyle(body).paddingRight) || 0;
                body.style.paddingRight = (computed + scrollbarWidth) + 'px';
            }
            // Only set overflow if not already scroll
            if (bodyOverflowY !== 'scroll') {
                body.style.overflow = 'hidden';
            }
            // وقف Lenis: overflow:hidden لا يكفي — Lenis يستمر عبر RAF
            // ويتجاهل CSS overflow ويُحرِّك الصفحة خلف المودال
            try { getLenisInstance()?.stop?.(); } catch (e) {}
        } else {
            const orig = body.getAttribute('data-orig-pr');
            if (orig !== null) {
                body.style.paddingRight = orig || '';
                body.removeAttribute('data-orig-pr');
            } else {
                body.style.paddingRight = '';
            }
            // Restore overflow only if it was changed
            if (bodyOverflowY !== 'scroll') {
                body.style.overflow = '';
            }
            // استئناف Lenis بعد إغلاق المودال
            try { getLenisInstance()?.start?.(); } catch (e) {}
        }
    } catch (e) {
        if (getComputedStyle(document.body).overflowY !== 'scroll') {
            document.body.style.overflow = blocked ? 'hidden' : '';
        }
    }

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
    // Ensure we are not left in the login-only desktop viewport
    try { _restoreViewportFromLogin(); } catch (e) { /* ignore */ }
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
    // Exiting login screen: remove desktop viewport if present
    try { _restoreViewportFromLogin(); } catch (e) { /* ignore */ }
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
    // If admin panel / student menu opened from non-login state, ensure no desktop viewport
    try { _restoreViewportFromLogin(); } catch (e) { /* ignore */ }
}

// Install a guard to remove force-desktop if login screen is not visible.
function _installLayoutGuard() {
    try {
        const guard = () => {
            const html = document.documentElement;
            const login = document.getElementById('login-screen');
            const hasForce = html.classList.contains('force-desktop') || html.getAttribute('data-force-desktop') === '1';
            if (hasForce && (!login || login.classList.contains('hidden'))) {
                _restoreViewportFromLogin();
            }
        };
        const mo = new MutationObserver(() => { guard(); });
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class','data-force-desktop'] });
        const loginEl = document.getElementById('login-screen');
        if (loginEl) mo.observe(loginEl, { attributes: true, attributeFilter: ['class'] });
        // initial check after a tick (DOM may still be initializing)
        setTimeout(guard, 50);
        // expose for debugging
        try { window.__layoutGuard = mo; } catch(e){}
    } catch (e) { /* ignore */ }
}

// Lightweight diagnostic helper: prints viewport + force-desktop state and shows a temporary badge
function _showLayoutDiagnosticBadge() {
    try {
        const meta = document.querySelector('meta[name="viewport"]');
        const viewport = meta ? meta.content : '(no meta viewport)';
        const html = document.documentElement;
        const hasForce = html.classList.contains('force-desktop') || html.getAttribute('data-force-desktop') === '1';
        console.info('[layout.diag] viewport=', viewport, 'force-desktop=', hasForce);
        const badge = document.createElement('div');
        badge.style.position = 'fixed';
        badge.style.right = '12px';
        badge.style.top = '12px';
        badge.style.zIndex = '99999';
        badge.style.background = 'rgba(0,0,0,0.6)';
        badge.style.color = 'white';
        badge.style.padding = '8px 10px';
        badge.style.borderRadius = '8px';
        badge.style.fontSize = '12px';
        badge.innerText = `viewport: ${viewport.replace(/\s+/g,' ')}\nforce-desktop: ${hasForce}`;
        document.body.appendChild(badge);
        setTimeout(() => badge.remove(), 6000);
    } catch (e) { console.warn('layout diag failed', e); }
}

// expose a console helper for quick inspection from device
try { window.showLayoutDiagnostic = _showLayoutDiagnosticBadge; } catch(e){}

// install the guard once DOM is ready
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _installLayoutGuard);
else setTimeout(_installLayoutGuard, 30);

// Ensure login page uses desktop layout on mobile devices.
function _applyLoginDesktopViewport() {
    try {
        const isMobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (screen.width && screen.width < 900);
        if (!isMobileUA) return;
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        // Save original viewport if not saved
        if (!document.documentElement.hasAttribute('data-orig-viewport')) {
            try { document.documentElement.setAttribute('data-orig-viewport', meta.content || ''); } catch(e){}
        }
        const targetWidth = 1200;
        const vw = Math.max(window.innerWidth || screen.width || document.documentElement.clientWidth || 360, 320);
        const rawScale = vw / targetWidth;
        const clampedScale = Math.max(0.12, Math.min(1, rawScale));
        meta.content = `width=${targetWidth}, initial-scale=${clampedScale}, maximum-scale=${clampedScale}, user-scalable=no, viewport-fit=cover`;
        document.documentElement.classList.add('force-desktop');
        document.documentElement.setAttribute('data-force-desktop','1');
    } catch (e) { console.warn('applyLoginDesktopViewport failed', e); }
}

function _restoreViewportFromLogin() {
    try {
        const meta = document.querySelector('meta[name="viewport"]');
        if (!meta) return;
        const orig = document.documentElement.getAttribute('data-orig-viewport');
        if (orig !== null && orig !== undefined) {
            meta.content = orig || 'width=device-width, initial-scale=1.0, viewport-fit=cover';
            document.documentElement.removeAttribute('data-orig-viewport');
        }
        document.documentElement.classList.remove('force-desktop');
        document.documentElement.removeAttribute('data-force-desktop');
    } catch (e) { console.warn('restoreViewportFromLogin failed', e); }
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
    console.log('[diag] showLoginScreen — removing hidden from login-screen');
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('ios-bottom-nav').classList.add('hidden');
    state.googleLoginMode = 'student';
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** Ensure login page enforces desktop layout on mobile */
export function showLoginScreenWithDesktop() {
    console.log('[diag] showLoginScreenWithDesktop invoked; login-screen before=', document.getElementById('login-screen')?.className);
    showLoginScreen();
    try { _applyLoginDesktopViewport(); } catch (e) { console.warn('showLoginScreenWithDesktop failed', e); }
    try { console.log('[diag] showLoginScreenWithDesktop after -> login-screen now=', document.getElementById('login-screen')?.className); } catch(e){}
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
