import logger from '../utils/logger.js';
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

"use strict";

// ─────────────────────────────────────────────────────────────────────────────
//  الحالة الداخلية للوحدة (private — لا تُصدَّر)
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import('lenis').default|null} النسخة الفعّالة من Lenis */
let _lenis = null;

/** @type {number|null} معرّف requestAnimationFrame الحالي */
let _rafId = null;

/** @type {Function|null} callback مربوط مع GSAP ticker */
let _tickerDriverFn = null;

/** @type {boolean} هل Lenis مربوط حالياً مع GSAP ticker */
let _tickerDriverAttached = false;

/** @type {boolean} هل التمرير الناعم مُفعَّل حالياً */
let _smoothEnabled = true;

/** @type {boolean} تفعيل ربط ScrollTrigger مع Lenis */
let _scrollTriggerSyncEnabled = true;

/** @type {number|null} RAF id for deferred ScrollTrigger.update */
let _scrollTriggerSyncRaf = null;

/** @type {number|null} timeout id for delayed ScrollTrigger sync */
let _scrollTriggerSyncTimer = null;

/** @type {number} آخر وقت تم فيه مزامنة ScrollTrigger */
let _scrollTriggerSyncLastTs = 0;

/** @type {number} أقل فترة بين تحديثات ScrollTrigger (ms) */
const _SCROLL_TRIGGER_SYNC_MIN_INTERVAL = 80;

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
 * حلقة requestAnimationFrame fallback التي تُغذِّي Lenis بالوقت في كل إطار.
 * تُوقف نفسها تلقائياً إن لم تعد هناك نسخة Lenis.
 *
 * @param {DOMHighResTimeStamp} time — الوقت المُمرَّر من RAF
 */
function _rafLoop(time) {
  if (!_lenis) {
    _rafId = null;
    return; // الوحدة أُلغيت — أوقف الحلقة
  }
  if (_smoothEnabled) {
    _lenis.raf(time);
  }
  _rafId = requestAnimationFrame(_rafLoop);
}

/**
 * Schedules a throttled ScrollTrigger sync on the next frame.
 * This avoids main-thread pressure from per-scroll-event updates.
 */
function _scheduleScrollTriggerSync() {
  if (!_scrollTriggerSyncEnabled) return;
  if (typeof window === "undefined") return;
  if (window.__scrollAnimationsEnabled !== true) return;
  if (_scrollTriggerSyncRaf !== null) return;

  const now = performance.now();
  const elapsed = now - _scrollTriggerSyncLastTs;
  const waitMs = _SCROLL_TRIGGER_SYNC_MIN_INTERVAL - elapsed;

  if (waitMs > 0) {
    if (_scrollTriggerSyncTimer !== null) return;

    _scrollTriggerSyncTimer = setTimeout(() => {
      _scrollTriggerSyncTimer = null;
      if (_scrollTriggerSyncRaf !== null) return;
      _scrollTriggerSyncRaf = requestAnimationFrame(() => {
        _scrollTriggerSyncRaf = null;
        _scrollTriggerSyncLastTs = performance.now();

        try {
          window.ScrollTrigger?.update?.();
        } catch (e) {
          /* ignore */
        }
      });
    }, Math.ceil(waitMs));
    return;
  }

  _scrollTriggerSyncRaf = requestAnimationFrame(() => {
    _scrollTriggerSyncRaf = null;
    _scrollTriggerSyncLastTs = performance.now();

    try {
      window.ScrollTrigger?.update?.();
    } catch (e) {
      /* ignore */
    }
  });
}

/**
 * يربط Lenis مع GSAP ticker (الربط الموصى به مع ScrollTrigger).
 * @returns {boolean} true عند نجاح الربط، false عند عدم توفر GSAP ticker.
 */
function _attachGsapTickerDriver() {
  const gsapApi = window.gsap;
  if (!gsapApi?.ticker?.add) return false;
  if (_tickerDriverAttached) return true;

  _tickerDriverFn = (timeInSeconds) => {
    if (!_lenis || !_smoothEnabled) return;
    // GSAP ticker يمرر الوقت بالثواني بينما Lenis.raf يتوقع milliseconds.
    _lenis.raf(timeInSeconds * 1000);
  };

  gsapApi.ticker.add(_tickerDriverFn);

  // إيقاف lag smoothing يمنع القفزات/التعويض الزمني العدواني أثناء التمرير السريع.
  if (typeof gsapApi.ticker.lagSmoothing === "function") {
    gsapApi.ticker.lagSmoothing(0);
  }

  _tickerDriverAttached = true;
  logger.log("[scroll] ✓ Lenis مربوط مع GSAP ticker (lagSmoothing=0)");
  return true;
}

/**
 * يفصل Lenis عن GSAP ticker إن كان مربوطاً.
 */
function _detachGsapTickerDriver() {
  if (!_tickerDriverAttached || !_tickerDriverFn) return;
  const gsapApi = window.gsap;
  if (gsapApi?.ticker?.remove) {
    gsapApi.ticker.remove(_tickerDriverFn);
  }
  _tickerDriverFn = null;
  _tickerDriverAttached = false;
}

/**
 * يبدأ driver الخاص بـ Lenis: يفضّل GSAP ticker، ويعود لـ RAF عند عدم توفره.
 */
function _startLenisDriver() {
  if (_attachGsapTickerDriver()) {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    return;
  }

  if (_rafId === null) {
    _rafId = requestAnimationFrame(_rafLoop);
    logger.log("[scroll] ℹ️ GSAP ticker غير متاح — استخدام RAF fallback");
  }
}

/**
 * يوقف أي driver فعّال (GSAP ticker أو RAF fallback).
 */
function _stopLenisDriver() {
  _detachGsapTickerDriver();
  if (_rafId !== null) {
    cancelAnimationFrame(_rafId);
    _rafId = null;
  }
  if (_scrollTriggerSyncRaf !== null) {
    cancelAnimationFrame(_scrollTriggerSyncRaf);
    _scrollTriggerSyncRaf = null;
  }
  if (_scrollTriggerSyncTimer !== null) {
    clearTimeout(_scrollTriggerSyncTimer);
    _scrollTriggerSyncTimer = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  IntersectionObserver — scroll-enter callbacks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ينشئ IntersectionObserver يُراقب دخول العناصر للمنظور.
 * عند الدخول: يُطلق الـ callback المرتبط بالعنصر ثم يُلغي مراقبته (مرة واحدة).
 */
function _buildScrollObserver() {
  if (typeof IntersectionObserver === "undefined") {
    logger.warn("[scroll] IntersectionObserver غير مدعوم في هذا المتصفح.");
    return null;
  }

  return new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const cb = _observedElements.get(entry.target);
        if (typeof cb === "function") {
          try {
            cb(entry.target);
          } catch (err) {
            logger.warn("[scroll] خطأ في scroll-enter callback:", err);
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
    },
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
    logger.log("[scroll] init skipped via options.enabled=false");
    return null;
  }
  if (
    skipOnLowTier &&
    typeof window !== "undefined" &&
    window.__devicePerf?.tier === "low"
  ) {
    logger.log("[scroll] init skipped on low-tier device");
    return null;
  }
  // تجنب التهيئة المزدوجة
  if (_lenis) {
    logger.warn("[scroll] initScroll() استُدعيت مرة ثانية — تجاهل.");
    return _lenis;
  }

  // Default wrapper: attach Lenis to `body` (not `html`) to avoid HTML class toggles
  try {
    if (typeof document !== "undefined" && !options.wrapper)
      options.wrapper = document.body;
  } catch (e) {
    /* ignore */
  }

  // تحقق من توافر Lenis (CDN أو import)
  const LenisClass =
    (typeof window !== "undefined" && window.Lenis) || // CDN
    null; // bundler import يُعالَج أدناه

  // ── محاولة استيراد Lenis ديناميكياً إن لم يكن على window ─────────────────
  // نستخدم try/catch لأن import() يرمي في بيئات بدون bundler
  if (!LenisClass) {
    // محاولة استخدام Lenis عبر CDN أو حزمة مثبّتة
    try {
      // إن كانت Lenis مُضمَّنة في window (عبر <script> في HTML)، نستخدمها
      if (typeof Lenis !== "undefined") {
        // eslint-disable-next-line no-undef
        return _initWithClass(Lenis, options);
      }
    } catch (_) {
      // Lenis غير متاحة — نعمل بدون تمرير ناعم
    }

    logger.warn(
      "[scroll] ⚠️ Lenis غير متاح — التمرير الناعم معطّل. أضف Lenis عبر npm أو CDN.",
    );
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
  _smoothEnabled = true;

  _lenis = new LenisClass({
    // ─── إعدادات الحركة ─────────────────────────────────────────────────
    duration: 1.0, // مدة انتقال أقصر لخفض الكلفة وتحسين الاستجابة
    easing: (
      t, // منحنى ease-out-expo لشعور طبيعي
    ) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    smoothWheel: true, // تمرير ناعم عبر عجلة الماوس
    smoothTouch: false, // iOS يتعامل مع اللمس بكفاءة أصلاً — لا نتدخل
    touchMultiplier: 1.5, // حساسية اللمس على Android

    // ─── إعدادات اتجاه التمرير ──────────────────────────────────────────
    orientation: "vertical", // التطبيق عمودي بالكامل
    gestureOrientation: "vertical",

    // ─── إمكانية الوصول ─────────────────────────────────────────────────
    // Lenis يحترم prefers-reduced-motion تلقائياً عبر هذا الخيار
    syncTouch: false,

    // ─── خيارات المستخدم (تتغلب على الافتراضيات) ────────────────────────
    ...options,
  });

  // ابدأ driver Lenis (GSAP ticker أولاً، مع fallback)
  _startLenisDriver();

  // On touch devices, avoid per-scroll ScrollTrigger sync to reduce main-thread pressure.
  const isMobileRuntime =
    navigator.maxTouchPoints > 1 &&
    !!window.matchMedia?.("(hover: none)").matches;
  _scrollTriggerSyncEnabled = !isMobileRuntime;

  // ── ربط Lenis بـ GSAP ScrollTrigger ─────────────────────────────────────
  // Lenis يُحرِّك موضع التمرير بشكل مستقل عبر RAF.
  // ScrollTrigger بالمقابل يقرأ window.scrollY مباشرةً.
  // بدون هذا الربط: scroll-triggered animations تتأخر فريمَين عن الحركة الفعلية
  // → جانك ظاهر بوضوح على الأجهزة البطيئة (Adreno/Mali mid-range).
  // الحل: عند كل تحديث Lenis نُخبر ScrollTrigger بإعادة حساب مواضعه.
  _lenis.on("scroll", () => {
    _scheduleScrollTriggerSync();
  });

  logger.log(
    "[scroll] ✓ Lenis مُهيَّأ — التمرير الناعم يعمل + ScrollTrigger مرتبط",
  );
  return _lenis;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * يضبط سلوك Lenis بناءً على مستوى أداء الجهاز.
 * يُستدعى من app.js بعد اكتمال getDevicePerformanceTier().
 *
 * المنطق:
 *  - high    → مدة 1.2s (افتراضي) — أقصى سلاسة
 *  - medium / موبايل → مدة أقصر + touchMultiplier أقل = استجابة أسرع
 *  - low     → تعطيل smoothWheel (native فقط)
 *
 * @param {'high'|'medium'|'low'} tier
 * @param {boolean} [isMobile=false]
 */
export function setScrollTierOptions(tier, isMobile = false) {
  if (!_lenis) return;
  try {
    _scrollTriggerSyncEnabled = !isMobile && tier !== "low";

    if (tier === "low" || isMobile) {
      // Mobile or Low tier: disable JS smooth scrolling entirely to save GPU/CPU
      if (_lenis.options) {
        _lenis.options.smoothWheel = false;
        _lenis.options.smoothTouch = false;
        _lenis.options.orientation = "native"; // or just destroy the instance usually
      }
      disableSmoothScroll();
      document.documentElement.style.scrollBehavior = "smooth";
    } else if (tier === "medium") {
      // Medium tier desktop
      if (_lenis.options) {
        _lenis.options.duration = 1.0;
        _lenis.options.touchMultiplier = 1.5;
      }
    }
    logger.log(
      `[scroll] tier=${tier} mobile=${isMobile} → Lenis options updated`,
    );
  } catch (e) {
    // Some Lenis versions do not expose options directly
  }
}

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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
export function scrollToElement(
  target,
  { offset = 0, duration = 1.0, onComplete } = {},
) {
  if (!_lenis) {
    const el =
      typeof target === "string" ? document.querySelector(target) : target;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    _startLenisDriver();
    logger.log("[scroll] التمرير الناعم: مُفعَّل");
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
    _stopLenisDriver();
    logger.log("[scroll] التمرير الناعم: مُعطَّل");
  }
}

/**
 * هل التمرير الناعم مفعّل منطقياً حالياً.
 * يفيد في استعادة الحالة بعد إيقاف مؤقت بسبب modal focus mode.
 * @returns {boolean}
 */
export function isSmoothScrollEnabled() {
  return _smoothEnabled;
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
    logger.log("[scroll] scroll-enter callbacks: مُفعَّلة");
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
  logger.log("[scroll] scroll-enter callbacks: مُعطَّلة");
}

/**
 * هل scroll-enter callbacks مفعّلة حالياً.
 * @returns {boolean}
 */
export function isScrollEnterEnabled() {
  return _scrollEnterEnabled;
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
  if (!element || typeof callback !== "function") return;

  _observedElements.set(element, callback);

  if (_scrollEnterEnabled && _scrollObserver) {
    _scrollObserver.observe(element);
  } else if (!_scrollEnterEnabled) {
    // scroll-enter مُعطَّل — شغّل الـ callback فوراً حتى لا تختفي المحتويات
    try {
      callback(element);
    } catch (e) {
      /* ignore */
    }
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
  _stopLenisDriver();
  if (_lenis) {
    _lenis.destroy();
    _lenis = null;
  }
  offScrollEnter();
  _observedElements.clear();
  _scrollTriggerSyncLastTs = 0;
  if (_scrollTriggerSyncTimer !== null) {
    clearTimeout(_scrollTriggerSyncTimer);
    _scrollTriggerSyncTimer = null;
  }
  logger.log("[scroll] Lenis مُدمَّر — وحدة التمرير أُعيدت لحالتها الأولى");
}
