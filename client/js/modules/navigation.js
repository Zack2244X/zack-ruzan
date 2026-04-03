/**
 * @module navigation
 * @description دوال التنقل، إدارة النوافذ، الثيم، والشريط السفلي
 */
import state, { THEME_KEY } from './state.js';
import { logFunctionStatus } from './helpers.js';
import { getLenisInstance } from './scroll.js';

const SHEET_CLOSE_MS = 340;
let treeScrollIndicatorBound = false;
let treeScrollIndicatorRaf = null;
let treeScrollIndicatorObserver = null;
let treeScrollIndicatorScroller = null;
let modalTouchLockEnabled = false;
let modalTouchStartY = 0;
let bodyLockScrollY = 0;
let activeMainSheetMode = null;

function getMainSheetNodes(mode) {
    const isNotes = mode === 'notes';
    return {
        mode: isNotes ? 'notes' : 'exams',
        sheetId: isNotes ? 'notes-bottom-sheet' : 'tree-bottom-sheet',
        overlayId: isNotes ? 'notes-overlay' : 'tree-overlay',
        contentId: isNotes ? 'notes-content' : 'tree-content',
        scrollerId: isNotes ? 'notes-scroll-area' : 'tree-scroll-area',
        railId: isNotes ? 'notes-scroll-rail' : 'tree-scroll-rail',
        thumbId: isNotes ? 'notes-scroll-thumb' : 'tree-scroll-thumb',
        historyTreeId: isNotes ? 'notes-history-tree' : 'history-tree',
        subjectFiltersId: isNotes ? 'notes-subject-filters-container' : 'subject-filters-container',
        titleId: isNotes ? 'notes-sheet-title' : 'sheet-title',
        iconId: isNotes ? 'notes-sheet-icon' : 'sheet-icon'
    };
}

function getCurrentMainSheetNodes() {
    if (activeMainSheetMode === 'notes') return getMainSheetNodes('notes');
    if (activeMainSheetMode === 'exams') return getMainSheetNodes('exams');

    const notesContent = document.getElementById('notes-content');
    if (notesContent?.classList.contains('active')) return getMainSheetNodes('notes');

    const examsContent = document.getElementById('tree-content');
    if (examsContent?.classList.contains('active')) return getMainSheetNodes('exams');

    return getMainSheetNodes(state.currentViewMode === 'notes' ? 'notes' : 'exams');
}

const onModalTouchStart = (e) => {
    const activeSheet = getActiveSheetContent();
    if (!activeSheet) return;
    if (!activeSheet.contains(e.target)) return;
    if (e.touches && e.touches.length > 0) {
        modalTouchStartY = e.touches[0].clientY;
    }
};

const onModalTouchMove = (e) => {
    const activeSheet = getActiveSheetContent();
    if (!activeSheet) return;

    const target = e.target;
    if (!activeSheet.contains(target)) {
        if (e.cancelable) e.preventDefault();
        return;
    }

    const currentY = e.touches && e.touches.length > 0 ? e.touches[0].clientY : modalTouchStartY;
    const deltaY = currentY - modalTouchStartY;
    const canScrollInside = canScrollWithinActiveSheet(target, activeSheet, deltaY);

    if (!canScrollInside && e.cancelable) e.preventDefault();
    modalTouchStartY = currentY;
};

function getActiveSheetContent() {
    const notesContent = document.getElementById('notes-content');
    if (notesContent?.classList.contains('active')) return notesContent;

    const treeContent = document.getElementById('tree-content');
    if (treeContent?.classList.contains('active')) return treeContent;

    const adminContent = document.getElementById('admin-content');
    if (adminContent?.classList.contains('active')) return adminContent;

    return null;
}

function canScrollWithinActiveSheet(target, activeSheet, deltaY) {
    void deltaY;
    const primaryScroller = activeSheet.querySelector('#tree-scroll-area, .modal-scrollbar[data-lenis-prevent], [data-lenis-prevent].modal-scrollbar')
        || activeSheet.querySelector('#tree-scroll-area, .modal-scrollbar, [data-lenis-prevent], [data-lenis-prevent-touch]');
    if (!primaryScroller) return false;

    // Touch inside visible sheet but outside actual scroll area should never move the page.
    if (!primaryScroller.contains(target)) return false;

    // Keep native touch behavior inside the modal scroll area.
    return true;
}

function setModalTouchScrollLock(enabled) {
    if (modalTouchLockEnabled === enabled) return;
    modalTouchLockEnabled = enabled;

    if (enabled) {
        document.addEventListener('touchstart', onModalTouchStart, { capture: true, passive: true });
        document.addEventListener('touchmove', onModalTouchMove, { capture: true, passive: false });
    } else {
        document.removeEventListener('touchstart', onModalTouchStart, { capture: true });
        document.removeEventListener('touchmove', onModalTouchMove, { capture: true });
    }
}

function bindForcedTouchScroll() {
    const { scrollerId } = getCurrentMainSheetNodes();
    const scroller = document.getElementById(scrollerId);
    if (!scroller || scroller._forceTouchScrollBound) return;

    scroller._forceTouchScrollBound = true;
    let startY = 0;
    let startX = 0;
    let startTop = 0;
    let active = false;
    let activePointerId = null;

    scroller.addEventListener('pointerdown', (e) => {
        if (!e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;

        startY = e.clientY;
        startX = e.clientX;
        startTop = scroller.scrollTop;
        active = true;
        activePointerId = e.pointerId;
        try { scroller.setPointerCapture(e.pointerId); } catch (_) {}
    }, { passive: true });

    scroller.addEventListener('pointermove', (e) => {
        if (!active || !e.isPrimary || e.pointerId !== activePointerId) return;

        const dy = e.clientY - startY;
        const dx = e.clientX - startX;

        // Force vertical scrolling inside modal when browser gesture handling is inconsistent.
        if (Math.abs(dy) > Math.abs(dx)) {
            scroller.scrollTop = startTop - dy;
            if (e.cancelable) e.preventDefault();
            scheduleTreeScrollIndicatorUpdate();
        }
    }, { passive: false });

    const endPointer = (e) => {
        if (!e.isPrimary || e.pointerId !== activePointerId) return;
        active = false;
        try { scroller.releasePointerCapture(e.pointerId); } catch (_) {}
        activePointerId = null;
    };

    scroller.addEventListener('pointerup', endPointer, { passive: true });
    scroller.addEventListener('pointercancel', endPointer, { passive: true });
}

function getTreeScrollTarget() {
    const { scrollerId, contentId } = getCurrentMainSheetNodes();
    const inner = document.getElementById(scrollerId);
    const outer = document.getElementById(contentId);
    if (!inner && !outer) return null;

    const innerMax = inner ? inner.scrollHeight - inner.clientHeight : -1;
    const outerMax = outer ? outer.scrollHeight - outer.clientHeight : -1;

    // Use the element that actually has meaningful overflow.
    if (innerMax >= outerMax) return inner || outer;
    return outer || inner;
}

function updateTreeScrollIndicator() {
    const scroller = treeScrollIndicatorScroller || getTreeScrollTarget();
    const { railId, thumbId } = getCurrentMainSheetNodes();
    const rail = document.getElementById(railId);
    const thumb = document.getElementById(thumbId);
    if (!scroller || !rail || !thumb) return;

    rail.style.display = 'block';
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    if (maxScroll <= 2) {
        thumb.style.height = `${Math.max(44, scroller.clientHeight - 8)}px`;
        thumb.style.transform = 'translateY(0px)';
        thumb.style.opacity = '0.7';
        return;
    }

    thumb.style.opacity = '1';
    const ratio = scroller.clientHeight / scroller.scrollHeight;
    const thumbHeight = Math.max(42, Math.floor(scroller.clientHeight * ratio));
    const maxThumbTop = Math.max(0, scroller.clientHeight - thumbHeight);
    const thumbTop = maxScroll > 0 ? Math.floor((scroller.scrollTop / maxScroll) * maxThumbTop) : 0;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
}

function scheduleTreeScrollIndicatorUpdate() {
    if (treeScrollIndicatorRaf) cancelAnimationFrame(treeScrollIndicatorRaf);
    treeScrollIndicatorRaf = requestAnimationFrame(() => {
        treeScrollIndicatorRaf = null;
        updateTreeScrollIndicator();
    });
}

function bindTreeScrollThumbDrag() {
    const { thumbId } = getCurrentMainSheetNodes();
    const thumb = document.getElementById(thumbId);
    if (!thumb) return;

    if (thumb._treeThumbDragBound) return;

    thumb._treeThumbDragBound = true;
    let active = false;
    let pointerId = null;
    let startY = 0;
    let startScrollTop = 0;

    const onPointerMove = (e) => {
        if (!active || e.pointerId !== pointerId) return;
        const scroller = treeScrollIndicatorScroller || getTreeScrollTarget();
        if (!scroller) return;

        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        if (maxScroll <= 0) return;

        const ratio = scroller.clientHeight / scroller.scrollHeight;
        const thumbHeight = Math.max(42, Math.floor(scroller.clientHeight * ratio));
        const maxThumbTop = Math.max(1, scroller.clientHeight - thumbHeight);
        const dy = e.clientY - startY;
        const deltaScroll = (dy / maxThumbTop) * maxScroll;
        scroller.scrollTop = Math.max(0, Math.min(maxScroll, startScrollTop + deltaScroll));
        scheduleTreeScrollIndicatorUpdate();
        if (e.cancelable) e.preventDefault();
    };

    const onPointerUp = (e) => {
        if (!active || e.pointerId !== pointerId) return;
        active = false;
        try { thumb.releasePointerCapture(pointerId); } catch (_) {}
        pointerId = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerUp);
    };

    thumb.addEventListener('pointerdown', (e) => {
        const scroller = treeScrollIndicatorScroller || getTreeScrollTarget();
        if (!scroller) return;
        active = true;
        pointerId = e.pointerId;
        startY = e.clientY;
        startScrollTop = scroller.scrollTop;
        try { thumb.setPointerCapture(pointerId); } catch (_) {}
        window.addEventListener('pointermove', onPointerMove, { passive: false });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointercancel', onPointerUp, { passive: true });
        if (e.cancelable) e.preventDefault();
    }, { passive: false });
}

function bindTreeScrollIndicator() {
    if (treeScrollIndicatorObserver) {
        treeScrollIndicatorObserver.disconnect();
        treeScrollIndicatorObserver = null;
    }

    const scroller = getTreeScrollTarget();
    if (!scroller) return;

    if (treeScrollIndicatorBound && treeScrollIndicatorScroller !== scroller) {
        treeScrollIndicatorScroller.removeEventListener('scroll', scheduleTreeScrollIndicatorUpdate);
        treeScrollIndicatorBound = false;
    }

    treeScrollIndicatorScroller = scroller;

    if (!treeScrollIndicatorBound) {
        treeScrollIndicatorBound = true;
        scroller.addEventListener('scroll', scheduleTreeScrollIndicatorUpdate, { passive: true });
        window.addEventListener('resize', () => {
            treeScrollIndicatorScroller = getTreeScrollTarget();
            scheduleTreeScrollIndicatorUpdate();
        }, { passive: true });
    }

    bindTreeScrollThumbDrag();

    const { historyTreeId, subjectFiltersId } = getCurrentMainSheetNodes();
    const historyTree = document.getElementById(historyTreeId);
    const subjectFilters = document.getElementById(subjectFiltersId);
    treeScrollIndicatorObserver = new MutationObserver(scheduleTreeScrollIndicatorUpdate);
    if (historyTree) {
        treeScrollIndicatorObserver.observe(historyTree, { childList: true, subtree: true, attributes: true });
    }
    if (subjectFilters) {
        treeScrollIndicatorObserver.observe(subjectFilters, { childList: true, subtree: true, attributes: true });
    }

    scheduleTreeScrollIndicatorUpdate();
}

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
                   || document.getElementById('notes-content')?.classList.contains('active')
                   || document.getElementById('admin-content')?.classList.contains('active');
    // guest-modal uses display:none/block instead of hidden class
    // Check style.display only — offsetParent forces reflow
    const guestModalOpen = (() => {
        const gm = document.getElementById('guest-modal');
        return gm ? gm.style.display !== 'none' && gm.style.display !== '' : false;
    })();
    const blocked = anyOpen || sheetOpen || guestModalOpen;

    const body = document.body;
    body.classList.toggle('modal-open', blocked);

    // ── DOM writes ────────────────────────────────────────────────────────────
    if (dashboard) {
        dashboard.classList.toggle('pointer-events-none', blocked);
        dashboard.classList.toggle('select-none', blocked);
    }
    try {
        const root = document.documentElement;
        if (blocked) {
            if (!body.hasAttribute('data-orig-overflow')) {
                body.setAttribute('data-orig-overflow', body.style.overflow || '');
            }
            if (!body.hasAttribute('data-orig-position')) {
                body.setAttribute('data-orig-position', body.style.position || '');
                body.setAttribute('data-orig-top', body.style.top || '');
                body.setAttribute('data-orig-left', body.style.left || '');
                body.setAttribute('data-orig-right', body.style.right || '');
                body.setAttribute('data-orig-width', body.style.width || '');
                bodyLockScrollY = window.scrollY || window.pageYOffset || 0;
            }
            body.style.overflow = 'hidden';
            body.style.position = 'fixed';
            body.style.top = `-${bodyLockScrollY}px`;
            body.style.left = '0';
            body.style.right = '0';
            body.style.width = '100%';
            root.style.overflow = 'hidden';
            body.setAttribute('data-scroll-lock', '1');
            try { getLenisInstance()?.stop?.(); } catch (e) {}
        } else {
            const origOverflow = body.getAttribute('data-orig-overflow');
            const origPosition = body.getAttribute('data-orig-position');
            const origTop = body.getAttribute('data-orig-top');
            const origLeft = body.getAttribute('data-orig-left');
            const origRight = body.getAttribute('data-orig-right');
            const origWidth = body.getAttribute('data-orig-width');
            body.style.overflow = origOverflow !== null ? origOverflow : '';
            body.style.position = origPosition !== null ? origPosition : '';
            body.style.top = origTop !== null ? origTop : '';
            body.style.left = origLeft !== null ? origLeft : '';
            body.style.right = origRight !== null ? origRight : '';
            body.style.width = origWidth !== null ? origWidth : '';
            root.style.overflow = '';
            body.removeAttribute('data-orig-overflow');
            body.removeAttribute('data-orig-position');
            body.removeAttribute('data-orig-top');
            body.removeAttribute('data-orig-left');
            body.removeAttribute('data-orig-right');
            body.removeAttribute('data-orig-width');
            body.removeAttribute('data-scroll-lock');
            if (bodyLockScrollY > 0) {
                window.scrollTo(0, bodyLockScrollY);
            }
            bodyLockScrollY = 0;
            try { getLenisInstance()?.start?.(); } catch (e) {}
        }
    } catch (e) {
        // no-op
    }

    if (dashboard) {
        if (blocked) {
            dashboard.setAttribute('inert', '');
            dashboard.setAttribute('aria-hidden', 'true');
        } else {
            dashboard.removeAttribute('inert');
            dashboard.removeAttribute('aria-hidden');
        }
    }

    // Global touchmove interception can break native modal scrolling on some mobile browsers.
    // Body lock + Lenis stop are sufficient for preventing background scroll.
    setModalTouchScrollLock(false);

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
        'guest-modal', 'delete-exam-modal',
        'accounts-management-modal'
    ];
    const SHEET_IDS = ['tree-content', 'notes-content', 'admin-content'];

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
    const dragSurface = el.querySelector('.sheet-handle') || el;
    let startY = 0;
    let isDragging = false;

    dragSurface.addEventListener('touchstart', (e) => {
        startY = e.touches[0].clientY;
        isDragging = true;
        el.style.transition = 'none';
    }, { passive: true });

    dragSurface.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > 0) el.style.transform = `translateY(${dy}px)`;
    }, { passive: true });

    dragSurface.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const dy = e.changedTouches[0].clientY - startY;
        el.style.transition = '';
        el.style.transform = '';
        if (dy > 80) closeFn();
    }, { passive: true });
}

/** فتح القائمة السفلية (Bottom Sheet) */
export function openBottomSheet(mode = null) {
    logFunctionStatus('openBottomSheet', false);
    const targetMode = mode || state.currentViewMode || 'exams';
    const nodes = getMainSheetNodes(targetMode);
    const sheet = document.getElementById(nodes.sheetId);
    const overlay = document.getElementById(nodes.overlayId);
    const content = document.getElementById(nodes.contentId);
    const otherNodes = getMainSheetNodes(nodes.mode === 'notes' ? 'exams' : 'notes');
    const otherSheet = document.getElementById(otherNodes.sheetId);
    const otherOverlay = document.getElementById(otherNodes.overlayId);
    const otherContent = document.getElementById(otherNodes.contentId);

    activeMainSheetMode = nodes.mode;

    otherOverlay?.classList.remove('active');
    otherContent?.classList.remove('active');
    if (otherSheet) otherSheet.classList.add('hidden');

    const dock = document.getElementById('ios-bottom-nav');
    if (dock) dock.classList.add('hidden');
    document.body.classList.add('modal-open');
    if (sheet) sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
        overlay?.classList.add('active');
        content?.classList.add('active');
        _syncMainInteractionState();
    });
    // Swipe-to-close disabled to keep touch scrolling fully native inside modal content.
    _showThemeToggle(false);
    _syncMainInteractionState();
}

/** إغلاق القائمة السفلية */
export function closeBottomSheet() {
    logFunctionStatus('closeBottomSheet', false);
    const sheetsToClose = [getMainSheetNodes('exams'), getMainSheetNodes('notes')];

    sheetsToClose.forEach((nodes) => {
        const sheet = document.getElementById(nodes.sheetId);
        const overlay = document.getElementById(nodes.overlayId);
        const content = document.getElementById(nodes.contentId);
        overlay?.classList.remove('active');
        content?.classList.remove('active');
        if (sheet) {
            clearTimeout(sheet._hideTimer);
            sheet._hideTimer = setTimeout(() => {
                const latestContent = document.getElementById(nodes.contentId);
                if (!latestContent?.classList.contains('active')) sheet.classList.add('hidden');
                _syncMainInteractionState();
            }, SHEET_CLOSE_MS);
        }
    });

    activeMainSheetMode = null;
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
            _syncMainInteractionState();
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
        'delete-subject-modal', 'rename-subject-modal', 'student-menu-modal',
        'accounts-management-modal', 'results-screen', 'confirm-modal-overlay',
        'delete-exam-modal'
    ];
    modalsToClose.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    const guestModal = document.getElementById('guest-modal');
    if (guestModal) guestModal.style.display = 'none';

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
    const nodes = getMainSheetNodes(section);
    const titleEl = document.getElementById(nodes.titleId);
    const iconEl = document.getElementById(nodes.iconId);
    if (section === 'exams') {
        if (titleEl) titleEl.innerText = "سجل الامتحانات";
        if (iconEl) iconEl.className = "bi bi-lightning-charge-fill text-2xl leading-none text-emerald-600";
    } else {
        if (titleEl) titleEl.innerText = "المذكرات والملفات";
        if (iconEl) iconEl.className = "bi bi-file-earmark-pdf-fill text-2xl leading-none text-rose-600";
    }
    renderSubjectFilters();
    renderHistoryTree();
    openBottomSheet(section);
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
        document.body.classList.add('modal-open');
        requestAnimationFrame(() => {
            adminOverlay?.classList.add('active');
            adminContent?.classList.add('active');
        });
        // إخفاء الشريط السفلي عند فتح لوحة الأدمن
        const dock = document.getElementById('ios-bottom-nav');
        if (dock) dock.classList.add('hidden');
        // Swipe-to-close disabled to keep touch scrolling fully native inside modal content.
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
    const icon = btn.querySelector('.fa-chevron-down, .bi-chevron-down');
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        content.classList.add('block');
        if (icon) {
            icon.classList.add('rotate-180');
        }
    } else {
        content.classList.remove('block');
        content.classList.add('hidden');
        if (icon) {
            icon.classList.remove('rotate-180');
        }
    }
    scheduleTreeScrollIndicatorUpdate();
}
