/**
 * @module animations
 * @description وحدة الحركات باستخدام GSAP
 *
 * تعتمد على GSAP المحمّل عبر CDN في index.html (متاح كـ window.gsap).
 * تضبط معدل الإطارات وتعقيد الحركات بناءً على مستوى أداء الجهاز.
 */

import { getDevicePerformanceTier } from './helpers.js';

// ============================================
//  الحصول على GSAP من النطاق العام (ديناميكي)
//  ننتظر تحميله عند الحاجة بدلاً من طباعة خطأ فوري
// ============================================
let gsap = window.gsap;
let ScrollTrigger = window.ScrollTrigger;

/**
 * Ensure `window.gsap` is available, waiting up to `timeout` ms.
 * If found, updates module-scoped `gsap` and `ScrollTrigger` bindings.
 * @param {number} timeout
 * @returns {Promise<boolean>} true if loaded, false otherwise
 */
function ensureGsapLoaded(timeout = 3000) {
    if (window.gsap) {
        gsap = window.gsap;
        ScrollTrigger = window.ScrollTrigger;
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        const interval = 100;
        let waited = 0;
        const iv = setInterval(() => {
            if (window.gsap) {
                clearInterval(iv);
                gsap = window.gsap;
                ScrollTrigger = window.ScrollTrigger;
                resolve(true);
                return;
            }
            waited += interval;
            if (waited >= timeout) {
                clearInterval(iv);
                resolve(false);
            }
        }, interval);
    });
}

/**
 * Ensure ScrollTrigger script is loaded. We inject it on demand and wait for
 * `window.ScrollTrigger` to become available. This avoids it running during
 * initial page load and causing layout measurements.
 */
function ensureScrollTriggerLoaded(timeout = 3000) {
    if (window.ScrollTrigger) return Promise.resolve(true);
    return new Promise((resolve) => {
        const src = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js';
        const s = document.createElement('script');
        s.src = src;
        s.crossOrigin = 'anonymous';
        s.onload = function() {
            // wait a tick for the global to settle
            requestAnimationFrame(() => { resolve(!!window.ScrollTrigger); });
        };
        s.onerror = function() { resolve(false); };
        // inject during idle where possible
        if ('requestIdleCallback' in window) requestIdleCallback(() => document.head.appendChild(s), { timeout: 2000 });
        else setTimeout(() => document.head.appendChild(s), 600);

        // fallback timeout
        setTimeout(() => resolve(!!window.ScrollTrigger), timeout);
    });
}

// ============================================
//  الحالة الداخلية
// ============================================

/** @type {boolean} هل تمت التهيئة */
let initialized = false;

/** @type {boolean} هل وضع reduced-motion مفعّل */
let reducedMotion = false;

/** @type {number} مضاعف السرعة (1 = طبيعي، 0 = بلا حركة) */
let speedMultiplier = 1.0;

/** @type {'high'|'medium'|'low'} مستوى أداء الجهاز */
let currentTier = 'high';

/** @type {Map<string, gsap.core.Tween|gsap.core.Timeline>} الحركات النشطة */
const activeAnimations = new Map();

// ============================================
//  ضبط معدل إطارات GSAP
// ============================================

/**
 * يقيس معدل تحديث الشاشة الفعلي ويُسجّله للتشخيص.
 * يؤجّل القياس حتى يصبح المتصفح خاملاً (requestIdleCallback)
 * لضمان دقة القراءة — خاصةً على شاشات 90/120Hz.
 * @returns {Promise<number>} معدل الشاشة المكتشف (Hz)
 */
async function detectAndApplyRefreshRate() {
    return new Promise((resolve) => {
        const startMeasurement = () => {
            let frames = 0;
            let lastTime = performance.now();
            const SAMPLE_MS = 1500; // عينة 1.5 ثانية — أدق بعد استقرار الصفحة

            function countFrame(now) {
                frames++;
                if (now - lastTime < SAMPLE_MS) {
                    requestAnimationFrame(countFrame);
                } else {
                    const fps = Math.round(frames / ((now - lastTime) / 1000));

                    // تحديد معدل الشاشة الفعلي
                    let nativeHz;
                    if (fps <= 35)       nativeHz = 30;
                    else if (fps <= 70)  nativeHz = 60;
                    else if (fps <= 100) nativeHz = 90;
                    else if (fps <= 130) nativeHz = 120;
                    else                 nativeHz = 144;

                    console.log(`[Animations] 🖥️ معدل تحديث الشاشة: ${fps}fps → Native: ${nativeHz}Hz`);

                    // الـ ticker مُضبوط على 0 (uncapped) في applyTierSettings للـ high/medium.
                    // نتدخل فقط على الأجهزة الضعيفة يحدد سقف الـ 30fps
                    if (gsap && currentTier === 'low') {
                        gsap.ticker.fps(30);
                        console.log('[Animations] 📉 Low tier → ticker: 30fps (توفير موارد)');
                    }

                    resolve(nativeHz);
                }
            }

            requestAnimationFrame(countFrame);
        };

        // تأجيل حتى idle لضمان أن الـ CPU فاضي والقياس دقيق
        if ('requestIdleCallback' in window) {
            requestIdleCallback(startMeasurement, { timeout: 2500 });
        } else {
            setTimeout(startMeasurement, 1200);
        }
    });
}

// ============================================
//  التهيئة الرئيسية
// ============================================

/**
 * تهيئة وحدة الحركات
 *
 * - يسجّل ScrollTrigger مع GSAP
 * - يكتشف معدل تحديث الشاشة ويضبط الـ ticker
 * - يقرأ مستوى أداء الجهاز ويضبط التعقيد
 *
 * @returns {Promise<void>}
 */
export async function initAnimations(perfOverride) {
    if (initialized) {
        console.warn('[Animations] ⚠️ تم التهيئة مسبقاً');
        return;
    }

    // Ensure GSAP is available. We may be running before the deferred loader finishes.
    const gsapAvailable = await ensureGsapLoaded(3000);
    if (!gsapAvailable) {
        console.warn('[Animations] ❌ GSAP غير موجود بعد الانتظار — إلغاء تهيئة الأنيميشن');
        return;
    }

    // ── تسجيل ScrollTrigger وكشف معدل التحديث بعد أول رسم (لتجنب forced reflows)
    await new Promise((resolve) => {
        // Run registration after first paint to avoid measuring while styles are still loading
        const runAfterPaint = () => {
            // Move heavy registration to idle time to avoid layout reads on the critical path
            const registerDuringIdle = async () => {
                try {
                    // Ensure ScrollTrigger file is loaded on demand
                    const loaded = await ensureScrollTriggerLoaded(3000);
                    if (loaded && window.ScrollTrigger && typeof window.ScrollTrigger.config === 'function') {
                        try { window.ScrollTrigger.config({ autoRefreshEvents: '' }); } catch(e){}
                        // Register plugin with gsap now that both are present
                        if (gsap && window.ScrollTrigger && typeof gsap.registerPlugin === 'function') {
                            gsap.registerPlugin(window.ScrollTrigger);
                            console.log('[Animations] ✓ ScrollTrigger loaded & registered (idle)');
                        }
                        // DO NOT call ScrollTrigger.refresh() — it triggers a forced reflow
                        // (reads geometry of every observed element) and is redundant because
                        // autoRefreshEvents:'' already disables automatic refresh events.
                    }
                } catch (e) {
                    console.warn('[Animations] failed to register ScrollTrigger:', e);
                }
            };

            if ('requestIdleCallback' in window) requestIdleCallback(registerDuringIdle, { timeout: 2000 });
            else setTimeout(registerDuringIdle, 700);

            // Detect and apply refresh rate off the critical path
            detectAndApplyRefreshRate().then(() => {
                if ('requestIdleCallback' in window) requestIdleCallback(() => resolve());
                else setTimeout(() => requestAnimationFrame(() => resolve()), 50);
            }).catch(() => resolve());
        };

        // Prefer rAF so we run right after the browser paints
        requestAnimationFrame(runAfterPaint);
    });

    // ── كشف أداء الجهاز وضبط التعقيد ──────────────────────────────────────────
    try {
        const perf = perfOverride || await getDevicePerformanceTier({ skipFPSTest: true });
        try { window.__devicePerf = perf; } catch (e) { /* ignore */ }
        currentTier = (perf && perf.tier) ? perf.tier : (typeof perf === 'string' ? perf : 'low');
        const dpr = perf?.dpr || window.devicePixelRatio || 1;
        applyTierSettings(currentTier, dpr);
    } catch (e) {
        console.warn('[Animations] ⚠️ فشل كشف الأداء، استخدام الإعدادات الافتراضية:', e);
    }

    // ── إعدادات GSAP العامة ───────────────────────────────────────────────
    gsap.config({
        nullTargetWarn: false,  // تجنب تحذيرات العناصر غير الموجودة
        trialWarn: false
    });

    // ── defaults لجميع الحركات ───────────────────────────────────────────
    gsap.defaults({
        ease: 'power2.out',
        duration: 0.4 * speedMultiplier,
        // force3D: true — يُجبر GSAP على استخدام translate3d بدل translate2d
        // هذا يضمن إنشاء GPU compositing layer لكل حركة تلقائياً
        force3D: true
    });
    // تفعيل RAF mode صراحةً — يضمن مزامنة الحركات مع vsync المتصفح
    if (gsap.ticker?.useRAF) gsap.ticker.useRAF(true);

    initialized = true;
    console.log(`[Animations] ✓ تهيئة كاملة — tier:${currentTier} speed:${speedMultiplier} reducedMotion:${reducedMotion}`);
}

/**
 * تطبيق إعدادات الأداء بناءً على المستوى
 * @param {'high'|'medium'|'low'} tier
 */
function applyTierSettings(tier) {
    switch (tier) {
        case 'high':
            speedMultiplier = 1.0;
            reducedMotion = false;
            if (gsap?.ticker) {
                // تعطيل lagSmoothing تماماً — يتيح للـ ticker العمل بأقصى سرعة
                // lagSmoothing يُبطّئ الحركة عمداً عند أي تأخر وهو عكس ما نريد على الشاشات عالية التردد
                gsap.ticker.lagSmoothing(0);
                // 0 = uncapped — GSAP يطابق معدل vsync الفعلي للشاشة (60/90/120/144Hz)
                gsap.ticker.fps(0);
            }
            console.log('[Animations] ⚡ High tier — حركات كاملة / ticker uncapped');
            break;

        case 'medium':
            speedMultiplier = 0.75;
            reducedMotion = false;
            if (gsap?.ticker) {
                // تخفيف — 33ms = فريم واحد بـ30fps كـ threshold للـ lag
                gsap.ticker.lagSmoothing(500, 33);
                // uncapped أيضاً — الشاشة 120Hz ستستفيد تلقائياً
                gsap.ticker.fps(0);
            }
            console.log('[Animations] 🔆 Medium tier — حركات مخففة / ticker uncapped');
            break;

        case 'low':
        default:
            speedMultiplier = 0;
            reducedMotion = true;
            if (gsap?.ticker) {
                gsap.ticker.lagSmoothing(0);
                // fps(30) سيُضبط بعد قياس الشاشة في detectAndApplyRefreshRate
            }
            console.log('[Animations] 🔇 Low tier — حركات معطلة');
            break;
    }
}

// ============================================
//  التحكم في الإعدادات (للاستخدام من app.js)
// ============================================

/**
 * تفعيل أو تعطيل وضع reduced-motion
 * @param {boolean} enabled
 */
export function setReducedMotion(enabled) {
    reducedMotion = enabled;

    if (enabled && gsap) {
        // إنهاء كل الحركات النشطة فوراً
        gsap.globalTimeline.timeScale(1000);
        setTimeout(() => {
            if (gsap) gsap.globalTimeline.timeScale(1);
        }, 100);
    }

    console.log(`[Animations] reduced-motion: ${enabled}`);
}

/**
 * ضبط مضاعف سرعة الحركات
 * @param {number} multiplier — (0 = بلا حركة، 1 = طبيعي، 2 = ضعف السرعة)
 */
export function setAnimationSpeed(multiplier) {
    speedMultiplier = Math.max(0, multiplier);

    if (gsap) {
        // 0 يعني لا حركة — نضبط timeScale للقيمة الصغيرة جداً بدل الصفر
        const scale = speedMultiplier === 0 ? 1000 : (1 / speedMultiplier);
        // لا نضبط globalTimeline مباشرة — نُحدّث defaults فقط
        gsap.defaults({ duration: 0.4 * (speedMultiplier || 0.001) });
    }

    console.log(`[Animations] سرعة الحركة: ${multiplier}`);
}

// ============================================
//  دوال مساعدة داخلية
// ============================================

/**
 * حساب مدة الحركة مع مراعاة مضاعف السرعة
 * @param {number} baseDuration — المدة الأساسية بالثواني
 * @returns {number}
 */
function dur(baseDuration) {
    if (reducedMotion || speedMultiplier === 0) return 0.001;
    return baseDuration * speedMultiplier;
}

/**
 * حساب تأخير الحركة مع مراعاة reduced-motion
 * @param {number} baseDelay
 * @returns {number}
 */
function delay(baseDelay) {
    if (reducedMotion || speedMultiplier === 0) return 0;
    return baseDelay * speedMultiplier;
}

/**
 * التحقق من جاهزية GSAP والوضع غير المعطّل
 * @returns {boolean}
 */
function canAnimate() {
    return !!(gsap && initialized);
}

// ============================================
//  حركات الظهور والاختفاء
// ============================================

/**
 * حركة دخول لعنصر (fadeIn + حركة للأعلى)
 *
 * @param {string|HTMLElement|HTMLElement[]} target — العنصر أو selector
 * @param {Object} options — خيارات إضافية
 * @param {number} options.duration — المدة الأساسية (ثانية)
 * @param {number} options.delay — التأخير (ثانية)
 * @param {number} options.y — مسافة الحركة العمودية (px)
 * @param {string} options.ease — دالة التسهيل
 * @param {string} options.id — معرف للحركة (لإلغائها لاحقاً)
 * @returns {gsap.core.Tween|null}
 */
export function playEntranceAnimation(target, options = {}) {
    if (!canAnimate()) return null;

    const {
        duration: baseDuration = 0.5,
        delay: baseDelay = 0,
        y = reducedMotion ? 0 : 24,
        ease = 'power3.out',
        id = null
    } = options;

    // إذا كان reduced-motion، أظهر العنصر فوراً بلا حركة
    if (reducedMotion) {
        gsap.set(target, { opacity: 1, y: 0, clearProps: 'all' });
        return null;
    }

    // إخفاء العنصر أولاً لضمان البداية الصحيحة
    gsap.set(target, { opacity: 0, y });

    const tween = gsap.to(target, {
        opacity: 1,
        y: 0,
        duration: dur(baseDuration),
        delay: delay(baseDelay),
        ease,
        clearProps: 'transform',
        onComplete: () => {
            if (id) activeAnimations.delete(id);
        }
    });

    if (id) activeAnimations.set(id, tween);
    return tween;
}

/**
 * حركة خروج لعنصر (fadeOut + حركة للأسفل)
 *
 * @param {string|HTMLElement|HTMLElement[]} target
 * @param {Object} options
 * @param {number} options.duration
 * @param {number} options.delay
 * @param {number} options.y — مسافة الحركة (موجبة = للأسفل)
 * @param {string} options.ease
 * @param {Function} options.onComplete — callback بعد الانتهاء
 * @param {string} options.id
 * @returns {gsap.core.Tween|null}
 */
export function playExitAnimation(target, options = {}) {
    if (!canAnimate()) {
        // حتى بدون حركة، يجب إخفاء العنصر
        if (typeof target === 'string') {
            const el = document.querySelector(target);
            if (el) el.style.opacity = '0';
        } else if (target instanceof HTMLElement) {
            target.style.opacity = '0';
        }
        if (options.onComplete) options.onComplete();
        return null;
    }

    const {
        duration: baseDuration = 0.35,
        delay: baseDelay = 0,
        y = reducedMotion ? 0 : 16,
        ease = 'power2.in',
        onComplete = null,
        id = null
    } = options;

    if (reducedMotion) {
        gsap.set(target, { opacity: 0 });
        if (onComplete) onComplete();
        return null;
    }

    const tween = gsap.to(target, {
        opacity: 0,
        y,
        duration: dur(baseDuration),
        delay: delay(baseDelay),
        ease,
        onComplete: () => {
            if (onComplete) onComplete();
            if (id) activeAnimations.delete(id);
        }
    });

    if (id) activeAnimations.set(id, tween);
    return tween;
}

/**
 * حركة عامة قابلة للتخصيص الكامل
 *
 * @param {string|HTMLElement} target
 * @param {Object} fromVars — خصائص البداية (gsap.from)
 * @param {Object} toVars — خصائص النهاية (gsap.to)
 * @param {string} id — معرف اختياري
 * @returns {gsap.core.Tween|null}
 */
export function animateElement(target, fromVars = {}, toVars = {}, id = null) {
    if (!canAnimate() || reducedMotion) {
        if (toVars) gsap.set(target, toVars);
        return null;
    }

    // ضبط المدة
    const adjustedToVars = {
        ...toVars,
        duration: dur(toVars.duration || 0.4),
        delay: delay(toVars.delay || 0)
    };

    const tween = Object.keys(fromVars).length > 0
        ? gsap.fromTo(target, fromVars, adjustedToVars)
        : gsap.to(target, adjustedToVars);

    if (id) activeAnimations.set(id, tween);
    return tween;
}

// ============================================
//  حركات الكروت (للوحة القيادة والشجرة)
// ============================================

/**
 * تحريك مجموعة من الكروت بتأخير متتالي (stagger)
 *
 * @param {string|HTMLElement[]} targets — العناصر أو selector
 * @param {Object} options
 * @param {number} options.stagger — التأخير بين كل كرت (ثانية)
 * @param {number} options.duration — مدة الحركة لكل كرت
 * @param {number} options.y — مسافة الحركة
 * @param {string} options.ease
 * @returns {gsap.core.Tween|null}
 */
export function animateCards(targets, options = {}) {
    if (!canAnimate()) return null;

    const {
        stagger: baseStagger = 0.08,
        duration: baseDuration = 0.45,
        y = 30,
        ease = 'power2.out'
    } = options;

    if (reducedMotion) {
        gsap.set(targets, { opacity: 1, y: 0, clearProps: 'all' });
        return null;
    }

    // للأجهزة متوسطة الأداء، تقليل عدد العناصر المتحركة في نفس الوقت
    const actualStagger = currentTier === 'medium'
        ? Math.max(baseStagger, 0.12)
        : baseStagger;

    gsap.set(targets, { opacity: 0, y });

    return gsap.to(targets, {
        opacity: 1,
        y: 0,
        duration: dur(baseDuration),
        stagger: reducedMotion ? 0 : actualStagger * speedMultiplier,
        ease,
        clearProps: 'transform'
    });
}

/**
 * تحريك عناصر القائمة / الشجرة عند الفتح
 *
 * @param {string|HTMLElement[]} targets
 * @param {Object} options
 * @returns {gsap.core.Tween|null}
 */
export function animateListItems(targets, options = {}) {
    if (!canAnimate() || reducedMotion) {
        if (gsap) gsap.set(targets, { opacity: 1, x: 0, clearProps: 'all' });
        return null;
    }

    const {
        stagger = 0.05,
        duration: baseDuration = 0.3,
        x = 20,   // يدخل من اليسار (RTL) أو اليمين
        ease = 'power1.out'
    } = options;

    gsap.set(targets, { opacity: 0, x });

    return gsap.to(targets, {
        opacity: 1,
        x: 0,
        duration: dur(baseDuration),
        stagger: stagger * speedMultiplier,
        ease,
        clearProps: 'transform'
    });
}

// ============================================
//  حركات الـ Bottom Sheet
// ============================================

/**
 * حركة فتح Bottom Sheet (يصعد من الأسفل)
 * @param {HTMLElement} sheetEl — عنصر المحتوى
 * @param {HTMLElement} overlayEl — عنصر الخلفية المعتمة
 * @returns {gsap.core.Timeline|null}
 */
export function animateSheetOpen(sheetEl, overlayEl) {
    if (!canAnimate()) return null;

    if (reducedMotion) {
        gsap.set(sheetEl, { y: 0, opacity: 1 });
        gsap.set(overlayEl, { opacity: 1 });
        return null;
    }

    const tl = gsap.timeline();

    tl.fromTo(overlayEl,
        { opacity: 0 },
        { opacity: 1, duration: dur(0.25), ease: 'none' }
    ).fromTo(sheetEl,
        { y: '100%', opacity: 0.8 },
        { y: '0%', opacity: 1, duration: dur(0.38), ease: 'power3.out' },
        '-=0.15'
    );

    return tl;
}

/**
 * حركة إغلاق Bottom Sheet (ينزل للأسفل)
 * @param {HTMLElement} sheetEl
 * @param {HTMLElement} overlayEl
 * @param {Function} onComplete — callback بعد الانتهاء
 * @returns {gsap.core.Timeline|null}
 */
export function animateSheetClose(sheetEl, overlayEl, onComplete) {
    if (!canAnimate()) {
        if (onComplete) onComplete();
        return null;
    }

    if (reducedMotion) {
        gsap.set(sheetEl, { y: '100%', opacity: 0 });
        gsap.set(overlayEl, { opacity: 0 });
        if (onComplete) onComplete();
        return null;
    }

    const tl = gsap.timeline({ onComplete });

    tl.to(sheetEl,
        { y: '100%', opacity: 0.6, duration: dur(0.3), ease: 'power2.in' }
    ).to(overlayEl,
        { opacity: 0, duration: dur(0.2), ease: 'none' },
        '-=0.15'
    );

    return tl;
}

// ============================================
//  حركات الـ Modal
// ============================================

/**
 * حركة فتح Modal
 * @param {HTMLElement} modalEl — العنصر الرئيسي
 * @param {HTMLElement} dialogEl — الحوار الداخلي
 * @returns {gsap.core.Timeline|null}
 */
export function animateModalOpen(modalEl, dialogEl) {
    if (!canAnimate()) return null;

    if (reducedMotion) {
        gsap.set([modalEl, dialogEl], { opacity: 1, scale: 1, clearProps: 'all' });
        return null;
    }

    const tl = gsap.timeline();

    tl.fromTo(modalEl,
        { opacity: 0 },
        { opacity: 1, duration: dur(0.2), ease: 'none' }
    ).fromTo(dialogEl,
        { opacity: 0, scale: 0.9, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: dur(0.35), ease: 'back.out(1.2)' },
        '-=0.1'
    );

    return tl;
}

/**
 * حركة إغلاق Modal
 * @param {HTMLElement} modalEl
 * @param {HTMLElement} dialogEl
 * @param {Function} onComplete
 * @returns {gsap.core.Timeline|null}
 */
export function animateModalClose(modalEl, dialogEl, onComplete) {
    if (!canAnimate()) {
        if (onComplete) onComplete();
        return null;
    }

    if (reducedMotion) {
        gsap.set([modalEl, dialogEl], { opacity: 0 });
        if (onComplete) onComplete();
        return null;
    }

    const tl = gsap.timeline({ onComplete });

    tl.to(dialogEl,
        { opacity: 0, scale: 0.92, y: 10, duration: dur(0.25), ease: 'power2.in' }
    ).to(modalEl,
        { opacity: 0, duration: dur(0.15), ease: 'none' },
        '-=0.1'
    );

    return tl;
}

// ============================================
//  حركة شريط التقدم (Quiz)
// ============================================

/**
 * تحريك شريط التقدم بسلاسة
 * @param {HTMLElement} barEl — عنصر الشريط
 * @param {number} percentage — النسبة المئوية (0-100)
 * @returns {gsap.core.Tween|null}
 */
export function animateProgressBar(barEl, percentage) {
    if (!canAnimate() || !barEl) return null;

    if (reducedMotion) {
        barEl.style.width = `${percentage}%`;
        return null;
    }

    return gsap.to(barEl, {
        width: `${percentage}%`,
        duration: dur(0.4),
        ease: 'power1.inOut'
    });
}

// ============================================
//  حركات النتيجة النهائية
// ============================================

/**
 * تحريك شاشة النتيجة النهائية (bounce + confetti effect)
 * @param {HTMLElement} scoreEl — عنصر النقاط
 * @param {number} finalScore — النقاط النهائية
 * @param {number} totalScore — المجموع الكلي
 * @returns {gsap.core.Timeline|null}
 */
export function animateScoreReveal(scoreEl, finalScore, totalScore) {
    if (!canAnimate() || !scoreEl) {
        if (scoreEl) scoreEl.textContent = finalScore;
        return null;
    }

    if (reducedMotion) {
        scoreEl.textContent = finalScore;
        return null;
    }

    // تحريك العداد من 0 إلى النقاط الفعلية
    const counter = { value: 0 };
    const tl = gsap.timeline();

    tl.to(counter, {
        value: finalScore,
        duration: dur(1.2),
        ease: 'power1.out',
        onUpdate: () => {
            scoreEl.textContent = Math.round(counter.value);
        }
    });

    // bounce للعنصر الحاوي
    const parentEl = scoreEl.closest('.text-4xl') || scoreEl.parentElement;
    if (parentEl) {
        tl.fromTo(parentEl,
            { scale: 0.8, opacity: 0 },
            { scale: 1, opacity: 1, duration: dur(0.5), ease: 'back.out(1.5)' },
            0
        );
    }

    return tl;
}

// ============================================
//  التحكم في الحركات العامة
// ============================================

/**
 * إيقاف جميع الحركات مؤقتاً (مثلاً عند فتح modal ثقيل)
 */
export function pauseAllAnimations() {
    if (gsap) {
        gsap.globalTimeline.pause();
        console.log('[Animations] ⏸ كل الحركات موقوفة');
    }
}

/**
 * استئناف جميع الحركات
 */
export function resumeAllAnimations() {
    if (gsap) {
        gsap.globalTimeline.resume();
        console.log('[Animations] ▶ كل الحركات مستأنفة');
    }
}

/**
 * إلغاء حركة محددة بمعرفها
 * @param {string} id
 */
export function cancelAnimation(id) {
    if (activeAnimations.has(id)) {
        activeAnimations.get(id).kill();
        activeAnimations.delete(id);
    }
}

/**
 * إلغاء جميع الحركات النشطة المسجلة
 */
export function cancelAllAnimations() {
    activeAnimations.forEach((tween) => tween.kill());
    activeAnimations.clear();
    if (gsap) gsap.killTweensOf('*');
    console.log('[Animations] 🗑 جميع الحركات ملغاة');
}

// ============================================
//  ScrollTrigger — حركات عند التمرير
// ============================================

/**
 * تفعيل حركة دخول عند وصول العنصر لمنطقة الرؤية
 * يعمل فقط مع مستوى الأداء العالي
 *
 * @param {string} selector — CSS selector للعناصر
 * @param {Object} options
 * @param {string} options.start — نقطة البداية ('top 85%' افتراضياً)
 * @param {number} options.y — مسافة الحركة
 * @param {number} options.stagger — التأخير بين العناصر
 */
export function initScrollAnimations(selector, options = {}) {
    if (!canAnimate() || reducedMotion || !ScrollTrigger) return;
    if (currentTier === 'low') return;

    const {
        start = 'top 85%',
        y = 30,
        stagger = 0.1,
        duration: baseDuration = 0.5,
        ease = 'power2.out'
    } = options;

    const elements = document.querySelectorAll(selector);
    if (!elements.length) return;

    gsap.set(elements, { opacity: 0, y });

    ScrollTrigger.batch(elements, {
        start,
        onEnter: (batch) => {
            gsap.to(batch, {
                opacity: 1,
                y: 0,
                duration: dur(baseDuration),
                stagger: stagger * speedMultiplier,
                ease,
                clearProps: 'transform'
            });
        },
        once: true
    });
}

// ============================================
//  تصدير افتراضي
// ============================================

export default {
    initAnimations,
    setReducedMotion,
    setAnimationSpeed,
    playEntranceAnimation,
    playExitAnimation,
    animateElement,
    animateCards,
    animateListItems,
    animateSheetOpen,
    animateSheetClose,
    animateModalOpen,
    animateModalClose,
    animateProgressBar,
    animateScoreReveal,
    initScrollAnimations,
    pauseAllAnimations,
    resumeAllAnimations,
    cancelAnimation,
    cancelAllAnimations
};