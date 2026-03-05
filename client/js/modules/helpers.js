/**
 * @module helpers
 * @description دوال مساعدة عامة — لا تعتمد على أي وحدة أخرى
 */

/**
 * إزالة أكواد HTML الخطرة من النص لمنع XSS
 * @param {string} str — النص المدخل
 * @returns {string} النص الآمن
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Logs function invocation status to the browser console.
 * @param {string} fnName — function name
 * @param {boolean} serverBound — whether the function is expected to call the server
 */
export function logFunctionStatus(fnName, serverBound = false) {
    try {
        const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
        console.log(`[FUNC] ${fnName} — online:${online} serverBound:${serverBound}`);
    } catch (e) {
        // ignore logging errors
    }
}

/**
 * عرض رسالة Toast مع شريط تقدم
 * @param {string} message — نص الرسالة
 * @param {'success'|'error'|'warning'|'streak'} type — نوع الرسالة
 */
export function showAlert(message, type) {
    const variant = type === 'error' ? 'error' : type === 'warning' ? 'error' : type === 'streak' ? 'streak' : 'success';
    const duration = variant === 'error' ? 4000 : 2800;
    const toast = document.createElement('div');
    toast.className = `toast-float toast-${variant}`;
    toast.style.position = 'relative';
    toast.innerHTML = `${escapeHtml(message)}<div class="toast-progress" style="animation-duration:${duration}ms"></div>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -12px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/**
 * عرض مربع تأكيد مخصص بدلاً من confirm() الأصلي
 * @param {string} title — عنوان مربع التأكيد
 * @param {string} message — نص السؤال
 * @param {string} icon — أيقونة (إيموجي)
 * @returns {Promise<boolean>} true لو وافق المستخدم
 */
export function showConfirm(title, message, icon = '⚠️') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        document.getElementById('confirm-icon').textContent = icon;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        overlay.classList.remove('hidden');
        requestAnimationFrame(() => overlay.classList.add('show'));

        const cleanup = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.classList.add('hidden'), 250);
            resolve(result);
        };
        document.getElementById('confirm-ok-btn').onclick = () => cleanup(true);
        document.getElementById('confirm-cancel-btn').onclick = () => cleanup(false);
        overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
}

/**
 * عرض مؤشر تحميل داخل عنصر
 * @param {string|HTMLElement} elOrId — العنصر أو معرّفه
 */
export function showLoading(elOrId) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (el) el.innerHTML = '<div class="flex justify-center items-center py-16"><i class="fas fa-spinner fa-spin text-4xl text-blue-400"></i></div>';
}

/**
 * تنسيق الثواني إلى صيغة MM:SS
 * @param {number} seconds — الثواني
 * @returns {string} الوقت بصيغة "00:00"
 */
export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * عرض رسالة Toast بسيطة
 * @param {string} text — النص
 * @param {'success'|'error'|'streak'} variant — النوع
 */
export function showToastMessage(text, variant = 'success') {
    if (!text) return;
    const toast = document.createElement('div');
    toast.className = `toast-float toast-${variant}`;
    toast.innerText = text;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, 0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -12px)';
        setTimeout(() => toast.remove(), 300);
    }, 2200);
}

/**
 * اختيار عنصر عشوائي من مصفوفة
 * @param {Array} arr — المصفوفة
 * @returns {*} العنصر المختار
 */
export function pickRandom(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * خلط مصفوفة عشوائياً (Fisher-Yates)
 * @param {Array} arr — المصفوفة (تُعدَّل مباشرة)
 */
export function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  أداة كشف أداء الجهاز
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {'high'|'medium'|'low'} PerformanceTier
 */

/**
 * @typedef {Object} DevicePerformanceResult
 * @property {PerformanceTier} tier      — المستوى النهائي للأداء
 * @property {number}          cores     — عدد النوى المنطقية (hardwareConcurrency)
 * @property {number}          memory    — ذاكرة RAM المُبلَّغ عنها بـ GB (أو -1 إن لم تُدعم)
 * @property {number}          fps       — متوسط FPS المقاس عبر requestAnimationFrame
 * @property {boolean}         prefersReducedMotion — هل المستخدم فعّل تقليل الحركة
 */

/**
 * يقيس FPS الفعلي للمتصفح عبر `requestAnimationFrame` خلال نافذة زمنية محددة.
 *
 * الفكرة: نحسب عدد الإطارات التي يرسمها المتصفح خلال `durationMs` ملّي ثانية،
 * ثم نقسم على الزمن الفعلي للحصول على متوسط دقيق حتى لو تأخر أول إطار.
 *
 * @param {number} [durationMs=500] — مدة القياس بالملّي ثانية
 * @returns {Promise<number>} متوسط الـ FPS (مُقرَّب لأقرب عدد صحيح)
 */
function measureFPS(durationMs = 500) {
    return new Promise((resolve) => {
        let frames = 0;
        let startTime = null;

        /**
         * دالة الإطار — تُستدعى من المتصفح في كل vsync
         * @param {DOMHighResTimeStamp} timestamp
         */
        function frame(timestamp) {
            if (startTime === null) {
                // أول إطار: نسجّل وقت البداية الفعلي
                startTime = timestamp;
            }

            frames++;
            const elapsed = timestamp - startTime;

            if (elapsed < durationMs) {
                // لم تنته مدة القياس — طلب الإطار التالي
                requestAnimationFrame(frame);
            } else {
                // انتهت المدة — احسب المتوسط وأعده
                // نطرح 1 لأن الإطار الأول يُحتسب بداية لا قياساً
                const measuredFPS = Math.round(((frames - 1) / elapsed) * 1000);
                resolve(measuredFPS);
            }
        }

        requestAnimationFrame(frame);
    });
}

/**
 * يكتشف مستوى أداء الجهاز ويعيد تقريراً شاملاً.
 *
 * منطق التصنيف (كل معيار يُخفِّض النقاط):
 * ```
 * نقطة البداية = 3 (high)
 *   cores  < 4  → -1
 *   memory < 4  → -1   (يُتجاهل إن لم يُدعم)
 *   fps    < 50 → -1
 *   prefersReducedMotion → tier = 'low' مباشرةً (إرادة المستخدم فوق كل شيء)
 * ```
 * النتيجة:
 *  3 → 'high' | 2 → 'medium' | ≤1 → 'low'
 *
 * @returns {Promise<DevicePerformanceResult>}
 *
 * @example
 * import { getDevicePerformanceTier } from './helpers.js';
 * const result = await getDevicePerformanceTier();
 * // { tier: 'high', cores: 8, memory: 8, fps: 60, prefersReducedMotion: false }
 */
export async function getDevicePerformanceTier() {
    // ── 1. إرادة المستخدم — لها الأولوية القصوى ─────────────────────────────
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
        // لا نحتاج لقياس FPS — المستخدم طلب صراحةً تقليل الحركة
        console.log('[DevicePerf] prefers-reduced-motion: true → tier=low (بدون قياس FPS)');
        return {
            tier: 'low',
            cores: navigator.hardwareConcurrency ?? -1,
            memory: navigator.deviceMemory ?? -1,
            fps: 0,
            prefersReducedMotion: true,
        };
    }

    // ── 2. قراءة مواصفات الأجهزة ─────────────────────────────────────────────
    // hardwareConcurrency: عدد النوى المنطقية (Logical CPU cores)
    // مدعوم في جميع المتصفحات الحديثة؛ fallback = 1 (أضعف افتراض ممكن)
    const cores = navigator.hardwareConcurrency ?? 1;

    // deviceMemory: ذاكرة RAM بـ GB (مُقرَّبة لأقرب قوة من 2)
    // مدعوم في Chrome/Edge فقط؛ Firefox وSafari يُعيدان undefined
    // القيمة -1 تعني "غير مدعوم" ولن تُحتسب في النقاط
    const memory = navigator.deviceMemory ?? -1;

    // ── 3. قياس FPS الفعلي ───────────────────────────────────────────────────
    // نقيس على 500ms — وقت قصير بما يكفي لعدم إبطاء التطبيق
    // وطويل بما يكفي للحصول على متوسط موثوق
    const fps = await measureFPS(500);

    // ── 4. حساب النقاط ───────────────────────────────────────────────────────
    let score = 3; // نبدأ من الأفضل ونطرح

    if (cores < 4) score--;          // نوى قليلة → أداء محدود
    if (memory !== -1 && memory < 4) score--; // ذاكرة منخفضة (إن كانت متاحة)
    if (fps < 50) score--;           // FPS منخفض → GPU/CPU متعب

    // ── 5. تحويل النقاط إلى مستوى ────────────────────────────────────────────
    /** @type {PerformanceTier} */
    const tier = score >= 3 ? 'high' : score === 2 ? 'medium' : 'low';

    const result = { tier, cores, memory, fps, prefersReducedMotion: false };
    console.log('[DevicePerf]', result);
    return result;
}