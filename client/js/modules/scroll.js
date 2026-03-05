/**
 * @module scroll
 * @description وحدة التمرير الموحّد — تُغلِّف Lenis وتُصدِّر واجهة بسيطة لبقية الوحدات.
 *
 * التصميم:
 *  • نسخة Lenis واحدة (singleton) تعيش طوال دورة حياة التطبيق.
 *  • حلقة رسم (RAF loop) مستقلة تُحدِّث Lenis في كل إطار.
 *  • دوال مُصدَّرة تتحقق دائماً من وجود النسخة قبل الاستدعاء لتجنب الأخطاء
 *    في حال استُدعيت قبل initScroll() أو بعد تعطيل الوحدة.
 *  • IntersectionObserver اختياري لتشغيل callbacks عند دخول العناصر للمنظور
 *    (scroll-enter) — يمكن تعطيله على الأجهزة المحدودة.
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  الحالة الداخلية للوحدة (private — لا تُصدَّر)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('lenis').default|null} النسخة الفعّالة من Lenis */
let _lenis = null;

/** @type {number|null} معرّف requestAnimationFrame الحالي */
let _rafId = null;

/** @type {boolean} هل التمرير الناعم مُفعَّل حالياً */
let _smoothEnabled = true;

/** @type {IntersectionObserver|null} مراقب الدخول للمنظور */
let _scrollObserver = null;

/** @type {boolean} هل scroll-enter callbacks مُفعَّلة */
let _scrollEnterEnabled = false;

/**
 * خريطة العناصر المُراقَبة وdcallbacks الخاصة بها.
 * @type {Map<Element, Function>}
 */
const _observedElements = new Map();

// ─────────────────────────────────────────────────────────────────────────────
//  حلقة الرسم (RAF Loop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * حلقة requestAnimationFrame التي تُغذِّي Lenis بالوقت في كل إطار.
 * تُوقف نفسها تلقائياً إن لم تعد هناك نسخة Lenis.
 *
 * @param {DOMHighResTimeStamp} time — الوقت المُمرَّر من RAF
 */
function _rafLoop(time) {
    if (!_lenis) return; // الوحدة أُلغيت — أوقف الحلقة
    _lenis.raf(time);
    _rafId = requestAnimationFrame(_rafLoop);
}

// ─────────────────────────────────────────────────────────────────────────────
//  IntersectionObserver — scroll-enter callbacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ينشئ IntersectionObserver يُراقب دخول العناصر للمنظور.
 * عند الدخول: يُطلق الـ callback المرتبط بالعنصر ثم يُلغي مراقبته (مرة واحدة).
 */
function _buildScrollObserver() {
    if (typeof IntersectionObserver === 'undefined') {
        console.warn('[scroll] IntersectionObserver غير مدعوم في هذا المتصفح.');
        return null;
    }

    return new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const cb = _observedElements.get(entry.target);
                if (typeof cb === 'function') {
                    try {
                        cb(entry.target);
                    } catch (err) {
                        console.warn('[scroll] خطأ في scroll-enter callback:', err);
                    }
                }

                // كل عنصر يُطلَق مرة واحدة فقط — إلغاء المراقبة بعد الدخول
                _scrollObserver?.unobserve(entry.target);
                _observedElements.delete(entry.target);
            });
        },
        {
            // العنصر يُعتبر "داخلاً" حين يظهر 15% منه على الأقل
            threshold: 0.15,
        }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
//  الدوال المُصدَّرة (Public API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تهيئة وحدة التمرير — يجب أن تُستدعى مرة واحدة عند بدء التشغيل (في window.onload).
 *
 * تُنشئ نسخة Lenis مع إعدادات مُحسَّنة للتطبيق، وتبدأ حلقة RAF.
 * إن كانت Lenis غير مُثبَّتة (مشروع بدون bundler)، تسقط بهدوء وتُسجّل تحذيراً.
 *
 * @param {Object} [options={}] — خيارات إضافية تُمرَّر مباشرةً لـ Lenis
 * @returns {import('lenis').default|null} نسخة Lenis أو null في حال الفشل
 *
 * @example
 * // في app.js — window.onload
 * import { initScroll } from './modules/scroll.js';
 * initScroll();
 */
export function initScroll(options = {}) {
    // خيارات مساعدة: تمكين/تعطيل أو تخطّي التهيئة على الأجهزة منخفضة الأداء
    const { enabled = true, skipOnLowTier = true } = options || {};
    if (!enabled) {
        console.log('[scroll] init skipped via options.enabled=false');
        return null;
    }
    if (skipOnLowTier && typeof window !== 'undefined' && window.__devicePerf?.tier === 'low') {
        console.log('[scroll] init skipped on low-tier device');
        return null;
    }
    // تجنب التهيئة المزدوجة
    if (_lenis) {
        console.warn('[scroll] initScroll() استُدعيت مرة ثانية — تجاهل.');
        return _lenis;
    }

    // تحقق من توافر Lenis (CDN أو import)
    const LenisClass =
        (typeof window !== 'undefined' && window.Lenis) || // CDN
        null; // bundler import يُعالَج أدناه

    // ── محاولة استيراد Lenis ديناميكياً إن لم يكن على window ─────────────────
    // نستخدم try/catch لأن import() يرمي في بيئات بدون bundler
    if (!LenisClass) {
        // محاولة استخدام Lenis عبر CDN أو حزمة مثبّتة
        try {
            // إن كانت Lenis مُضمَّنة في window (عبر <script> في HTML)، نستخدمها
            if (typeof Lenis !== 'undefined') {
                // eslint-disable-next-line no-undef
                return _initWithClass(Lenis, options);
            }
        } catch (_) {
            // Lenis غير متاحة — نعمل بدون تمرير ناعم
        }

        console.warn('[scroll] ⚠️ Lenis غير متاح — التمرير الناعم معطّل. أضف Lenis عبر npm أو CDN.');
        return null;
    }

    return _initWithClass(LenisClass, options);
}

/**
 * @private الدالة الفعلية لإنشاء نسخة Lenis وبدء الحلقة
 * @param {Function} LenisClass — الكلاس
 * @param {Object}   options    — الخيارات الإضافية
 * @returns {import('lenis').default}
 */
function _initWithClass(LenisClass, options) {
    _lenis = new LenisClass({
        // ─── إعدادات الحركة ─────────────────────────────────────────────────
        duration: 1.2,           // مدة انتقال التمرير بالثواني
        easing: (t) =>           // منحنى ease-out-expo لشعور طبيعي
            t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
        smoothWheel: true,       // تمرير ناعم عبر عجلة الماوس
        smoothTouch: false,      // iOS يتعامل مع اللمس بكفاءة أصلاً — لا نتدخل
        touchMultiplier: 1.5,    // حساسية اللمس على Android

        // ─── إعدادات اتجاه التمرير ──────────────────────────────────────────
        orientation: 'vertical', // التطبيق عمودي بالكامل
        gestureOrientation: 'vertical',

        // ─── إمكانية الوصول ─────────────────────────────────────────────────
        // Lenis يحترم prefers-reduced-motion تلقائياً عبر هذا الخيار
        syncTouch: false,

        // ─── خيارات المستخدم (تتغلب على الافتراضيات) ────────────────────────
        ...options,
    });

    // ابدأ حلقة RAF
    _rafId = requestAnimationFrame(_rafLoop);

    console.log('[scroll] ✓ Lenis مُهيَّأ — التمرير الناعم يعمل');
    return _lenis;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * تمرير الصفحة إلى الأعلى بانسيابية.
 *
 * @param {Object} [options={}]
 * @param {number} [options.duration=1.0]   — مدة الانتقال (ثواني)
 * @param {Function} [options.onComplete]   — callback بعد الانتهاء
 *
 * @example
 * scrollToTop({ duration: 0.8 });
 */
export function scrollToTop({ duration = 1.0, onComplete } = {}) {
    if (!_lenis) {
        // fallback إن كان Lenis غير متاح
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }
    _lenis.scrollTo(0, { duration, onComplete });
}

/**
 * تمرير الصفحة إلى عنصر معيّن بانسيابية.
 *
 * @param {string|Element} target           — محدد CSS أو عنصر DOM
 * @param {Object}         [options={}]
 * @param {number}         [options.offset=0]     — إزاحة بالبكسل (سالب = أعلى)
 * @param {number}         [options.duration=1.0] — مدة الانتقال
 * @param {Function}       [options.onComplete]   — callback بعد الانتهاء
 *
 * @example
 * scrollToElement('#quiz-section', { offset: -80 });
 */
export function scrollToElement(target, { offset = 0, duration = 1.0, onComplete } = {}) {
    if (!_lenis) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    _lenis.scrollTo(target, { offset, duration, onComplete });
}

/**
 * تفعيل التمرير الناعم (إن كان مُعطَّلاً).
 * آمنة للاستدعاء في أي وقت حتى لو لم تُهيَّأ Lenis.
 */
export function enableSmoothScroll() {
    _smoothEnabled = true;
    if (_lenis) {
        _lenis.start();
        console.log('[scroll] التمرير الناعم: مُفعَّل');
    }
}

/**
 * تعطيل التمرير الناعم مؤقتاً (مثلاً على الأجهزة المحدودة).
 * يُوقف Lenis لكن يُبقي النسخة حية للإعادة لاحقاً.
 */
export function disableSmoothScroll() {
    _smoothEnabled = false;
    if (_lenis) {
        _lenis.stop();
        console.log('[scroll] التمرير الناعم: مُعطَّل');
    }
}

/**
 * تفعيل scroll-enter callbacks عبر IntersectionObserver.
 * يُنشئ Observer إن لم يكن موجوداً.
 */
export function onScrollEnter() {
    if (_scrollEnterEnabled) return; // مُفعَّل مسبقاً
    _scrollObserver = _buildScrollObserver();
    _scrollEnterEnabled = !!_scrollObserver;

    // أعِد مراقبة العناصر المُسجَّلة مسبقاً (إن وُجدت)
    if (_scrollObserver) {
        _observedElements.forEach((_, el) => _scrollObserver.observe(el));
        console.log('[scroll] scroll-enter callbacks: مُفعَّلة');
    }
}

/**
 * تعطيل scroll-enter callbacks وإلغاء Observer.
 * العناصر المُراقَبة تظل في الخريطة وتُعاد مراقبتها إن أُعيد تفعيل onScrollEnter().
 */
export function offScrollEnter() {
    if (_scrollObserver) {
        _scrollObserver.disconnect();
        _scrollObserver = null;
    }
    _scrollEnterEnabled = false;
    console.log('[scroll] scroll-enter callbacks: مُعطَّلة');
}

/**
 * يُسجِّل عنصراً ليُطلَق callback عند دخوله للمنظور (مرة واحدة).
 * إن كان scroll-enter مُعطَّلاً، تُطلَق الـ callback فوراً كـ fallback.
 *
 * @param {Element}  element  — العنصر المُراد مراقبته
 * @param {Function} callback — دالة تُستدعى بـ (element) عند الدخول
 *
 * @example
 * registerScrollEnter(cardEl, (el) => el.classList.add('visible'));
 */
export function registerScrollEnter(element, callback) {
    if (!element || typeof callback !== 'function') return;

    _observedElements.set(element, callback);

    if (_scrollEnterEnabled && _scrollObserver) {
        _scrollObserver.observe(element);
    } else if (!_scrollEnterEnabled) {
        // scroll-enter مُعطَّل — شغّل الـ callback فوراً حتى لا تختفي المحتويات
        try { callback(element); } catch (e) { /* ignore */ }
    }
}

/**
 * يُلغي مراقبة عنصر سبق تسجيله.
 *
 * @param {Element} element
 */
export function unregisterScrollEnter(element) {
    if (_scrollObserver) _scrollObserver.unobserve(element);
    _observedElements.delete(element);
}

/**
 * يعيد نسخة Lenis الحالية (للاستخدام المباشر في حالات متقدمة).
 * @returns {import('lenis').default|null}
 */
export function getLenisInstance() {
    return _lenis;
}

/**
 * يُدمِّر نسخة Lenis ويُوقف حلقة RAF — للاختبارات أو إعادة التهيئة.
 * نادراً ما تحتاجه في الإنتاج.
 */
export function destroyScroll() {
    if (_rafId !== null) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
    }
    if (_lenis) {
        _lenis.destroy();
        _lenis = null;
    }
    offScrollEnter();
    _observedElements.clear();
    console.log('[scroll] Lenis مُدمَّر — وحدة التمرير أُعيدت لحالتها الأولى');
}