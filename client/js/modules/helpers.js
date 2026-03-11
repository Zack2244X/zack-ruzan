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
 * @typedef {Object} GPUInfo
 * @property {PerformanceTier} tier       — مستوى أداء الـ GPU
 * @property {string}          renderer   — اسم معالج الرسوميات (عبر OpenGL ES)
 * @property {string}          vendor     — الشركة المصنّعة
 * @property {boolean}         webgl2     — يدعم WebGL2 = OpenGL ES 3.0+
 * @property {number}          maxTexSize — أقصى حجم texture (يعكس bandwidth الـ VRAM)
 * @property {number}          gpuScore   — النقاط الخام
 */

/**
 * @typedef {Object} DevicePerformanceResult
 * @property {PerformanceTier} tier               — المستوى النهائي (CPU+GPU+battery+DPR)
 * @property {number}          cores              — عدد النوى المنطقية
 * @property {number}          memory             — ذاكرة RAM بـ GB  (-1 = غير متاح)
 * @property {number}          fps                — متوسط FPS  (-1 = لم يُقَس)
 * @property {boolean}         prefersReducedMotion
 * @property {GPUInfo}         gpu                — نتائج فحص WebGL
 * @property {number}          dpr                — Device Pixel Ratio
 * @property {number}          batteryLevel       — 0-1  (-1 = غير متاح)
 * @property {boolean}         batteryCharging
 */

// ─────────────────────────────────────────────────────────────────────────────
//  فحص GPU عبر WebGL / OpenGL ES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يُنشئ WebGL context مخفي 1×1 لقراءة تفاصيل معالج الرسوميات
 * ثم يُتلفه فوراً لتجنب احتجاز أي VRAM.
 *
 * يعتمد على:
 *  - WEBGL_debug_renderer_info  للحصول على اسم الـ GPU الحقيقي (OpenGL ES renderer)
 *  - MAX_TEXTURE_SIZE           لتقييم عرض نطاق الـ VRAM
 *  - WebGL2 support             للتمييز بين OpenGL ES 2.0 و 3.0
 *
 * @returns {GPUInfo}
 */
function probeGPU() {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        // نجرب WebGL2 (= OpenGL ES 3.0) أولاً، ثم WebGL (= OpenGL ES 2.0)
        const gl2 = canvas.getContext('webgl2');
        const gl  = gl2
            || canvas.getContext('webgl')
            || canvas.getContext('experimental-webgl');

        if (!gl) {
            console.log('[DevicePerf/GPU] لا يوجد دعم WebGL — GPU tier=low');
            return { tier: 'low', renderer: 'none', vendor: 'none',
                     webgl2: false, maxTexSize: 0, gpuScore: 0 };
        }

        const webgl2 = !!gl2;

        // WEBGL_debug_renderer_info يكشف عن اسم الـ GPU الحقيقي
        // (بعض المتصفحات تحجبه لأسباب الخصوصية — نتعامل مع ذلك بـ fallback)
        const dbg      = gl.getExtension('WEBGL_debug_renderer_info');
        const renderer = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '').toLowerCase();
        const vendor   = (dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)   : '').toLowerCase();

        const maxTexSize      = gl.getParameter(gl.MAX_TEXTURE_SIZE)              || 0;
        const maxVertUniforms = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)    || 0;
        const maxFragUniforms = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)  || 0;

        // حرر الـ context فوراً لتجنب تسرب VRAM
        try { (gl.getExtension('WEBGL_lose_context') || {}).loseContext?.(); } catch (e) {}

        // ── تسجيل نقاط GPU ────────────────────────────────────────────────────
        let gpuScore = 0;

        // WebGL2 = GPU يدعم OpenGL ES 3.0+ → جيل حديث
        if (webgl2) gpuScore += 2;

        // حجم الـ texture الأقصى: علامة على bandwidth الـ VRAM
        if      (maxTexSize >= 16384) gpuScore += 2;
        else if (maxTexSize >=  8192) gpuScore += 1;

        // عدد shader uniforms: كلما كان أكبر دلّ على معالج أقوى
        if (maxVertUniforms >= 256 && maxFragUniforms >= 256) gpuScore += 1;

        const g = `${renderer} ${vendor}`;

        // ── GPUs عالية الأداء ─────────────────────────────────────────────────
        // Adreno 6xx/7xx/8xx (Snapdragon 8-series flagship)
        // Mali-G7x/G8x/G9x/G1xx (Samsung/MediaTek flagship)
        // Apple GPU (A-series / M-series)
        // GPU كمبيوتر مكتبي/لابتوب: NVIDIA, AMD, Intel Iris/Arc/Xe
        if (/adreno\s*[6-9]\d\d/.test(g) ||
            /mali-g[789]\d|mali-g1\d\d/.test(g) ||
            /apple\s*(gpu|m\d)|apple\s*a1[0-9]/.test(g) ||
            /apple/.test(vendor) ||
            /nvidia|geforce|rtx|gtx|quadro|tesla/.test(g) ||
            /amd|radeon|rx\s*\d/.test(g) ||
            /intel\s*(iris|arc|uhd\s*7|xe)/.test(g)) {
            gpuScore += 3;
        }
        // ── GPUs متوسطة الأداء ────────────────────────────────────────────────
        // Adreno 5xx (Snapdragon 6/7 series)
        // Mali-G5x/G6x (mid-range)
        // PowerVR GX (mid iPad/iPhone)
        // Intel HD/UHD 600-series (كمبيوتر mid-range)
        else if (/adreno\s*[45]\d\d/.test(g) ||
                 /mali-g[56]\d/.test(g) ||
                 /powervr\s*g[ex]/.test(g) ||
                 /intel\s*(hd|uhd\s*[456]|uhd\s*6[0-9]\d)/.test(g)) {
            gpuScore += 1;
        }
        // ── GPUs ضعيفة الأداء ─────────────────────────────────────────────────
        // Adreno 2xx/3xx (أجهزة قديمة جداً)
        // Mali-T7xx/T8xx/400/450 (كانت شائعة في Android 4-6)
        // PowerVR SGX (iPhone 4 era)
        // SwiftShader/LLVMpipe/Mesa Software (محاكي / بدون GPU حقيقي)
        else if (/adreno\s*[23]\d\d/.test(g) ||
                 /mali-t[0-9]|mali-4/.test(g) ||
                 /powervr\s*sgx/.test(g) ||
                 /swiftshader|llvmpipe|softpipe|software|rasterizer/.test(g)) {
            gpuScore -= 2;
        }

        const tier = gpuScore >= 5 ? 'high' : gpuScore >= 2 ? 'medium' : 'low';
        const result = { tier, renderer, vendor, webgl2, maxTexSize, gpuScore };
        console.log('[DevicePerf/GPU]', result);
        return result;

    } catch (err) {
        console.warn('[DevicePerf/GPU] فشل فحص WebGL:', err.message);
        return { tier: 'medium', renderer: 'error', vendor: 'error',
                 webgl2: false, maxTexSize: 0, gpuScore: 1 };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  قراءة مستوى البطارية (Battery Status API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يقرأ مستوى البطارية الحالي.
 * الهواتف تُخفّض تردد CPU+GPU تلقائياً عند انخفاض البطارية (Power Management).
 * @returns {Promise<{ level: number, charging: boolean }>}
 */
async function getBatteryInfo() {
    try {
        if ('getBattery' in navigator) {
            const bat = await navigator.getBattery();
            return { level: bat.level, charging: bat.charging };
        }
    } catch (e) { /* API غير مدعوم */ }
    return { level: 1, charging: true }; // افتراض كامل/متصل
}

// ─────────────────────────────────────────────────────────────────────────────
//  قياس FPS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يقيس FPS الفعلي عبر requestAnimationFrame.
 * @param {number} durationMs — مدة القياس بالملّي ثانية
 * @returns {Promise<number>}
 */
function measureFPS(durationMs = 1000) {
    return new Promise((resolve) => {
        let frames = 0;
        let startTime = null;
        function frame(ts) {
            if (startTime === null) startTime = ts;
            frames++;
            if (ts - startTime < durationMs) {
                requestAnimationFrame(frame);
            } else {
                resolve(Math.round(((frames - 1) / (ts - startTime)) * 1000));
            }
        }
        requestAnimationFrame(frame);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  الدالة الرئيسية لكشف أداء الجهاز
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يكتشف مستوى أداء الجهاز بشكل شامل:
 *  1. CPU (cores + memory)
 *  2. GPU (WebGL probe — renderer/vendor/texture size/WebGL2)
 *  3. Battery (تخفيض التردد عند انخفاض البطارية)
 *  4. DPR (كثافة البكسل — هاتف رخيص بشاشة 3x = ضغط رهيب على GPU)
 *  5. FPS test (اختياري)
 *  6. prefers-reduced-motion (إرادة المستخدم — أعلى أولوية)
 *
 * منطق الدمج:
 *  - إذا CPU low أو GPU low → النتيجة low
 *  - إذا كلاهما high → high
 *  - غير ذلك → medium
 *  - البطارية < 15% وغير متصلة → تخفيض مستوى واحد
 *  - DPR > 2.5 مع medium/high → يبقى medium (pixel fill rate عالٍ)
 *
 * @param {{ skipFPSTest?: boolean }} [options]
 * @returns {Promise<DevicePerformanceResult>}
 */
export async function getDevicePerformanceTier(options = {}) {
    const { skipFPSTest = false } = options || {};

    // ── 0. prefers-reduced-motion له الأولوية القصوى ────────────────────────
    const prefersReducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const dpr = (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1;

    if (prefersReducedMotion) {
        console.log('[DevicePerf] prefers-reduced-motion → tier=low');
        return {
            tier: 'low', cores: navigator.hardwareConcurrency ?? -1,
            memory: navigator.deviceMemory ?? -1, fps: 0,
            prefersReducedMotion: true,
            gpu: { tier: 'low', renderer: '', vendor: '', webgl2: false, maxTexSize: 0, gpuScore: 0 },
            dpr, batteryLevel: -1, batteryCharging: true
        };
    }

    // ── 1. CPU ───────────────────────────────────────────────────────────────
    const cores  = navigator.hardwareConcurrency ?? 1;
    const memory = navigator.deviceMemory ?? -1;

    let cpuScore = 3;
    if (cores  < 4)                      cpuScore--;
    if (memory !== -1 && memory < 4)     cpuScore--;

    // ── 2. GPU (WebGL probe) ─────────────────────────────────────────────────
    const gpu = probeGPU();

    // ── 3. Battery ───────────────────────────────────────────────────────────
    const { level: batteryLevel, charging: batteryCharging } = await getBatteryInfo();

    // ── 4. FPS (اختياري) ────────────────────────────────────────────────────
    let fps = -1;
    if (!skipFPSTest) fps = await measureFPS(1000);
    if (fps !== -1 && fps < 50) cpuScore--;

    // ── 5. الدمج: CPU + GPU ──────────────────────────────────────────────────
    const cpuTier = cpuScore >= 3 ? 'high' : cpuScore === 2 ? 'medium' : 'low';
    const gpuTier = gpu.tier;

    let tier;
    if (cpuTier === 'low' || gpuTier === 'low')   tier = 'low';
    else if (cpuTier === 'high' && gpuTier === 'high') tier = 'high';
    else                                              tier = 'medium';

    // ── 6. تعديل بسبب البطارية المنخفضة ─────────────────────────────────────
    // الهاتف يُخفّض تردد GPU تلقائياً — نعكس ذلك في خياراتنا
    if (!batteryCharging && batteryLevel !== -1 && batteryLevel < 0.15) {
        if (tier === 'high')   tier = 'medium';
        else if (tier === 'medium') tier = 'low';
        console.log(`[DevicePerf] 🔋 بطارية منخفضة (${Math.round(batteryLevel * 100)}%) → تخفيض مستوى`);
    }

    // ── 7. تعديل بسبب كثافة البكسل ──────────────────────────────────────────
    // هاتف بشاشة DPR=3 مع GPU متوسط = fill rate عالٍ جداً → نُبقيه على medium
    if (dpr > 2.5 && tier === 'high' && gpuTier !== 'high') {
        tier = 'medium';
        console.log(`[DevicePerf] 📱 DPR ${dpr.toFixed(1)} عالٍ → يُبقى على medium`);
    }

    const result = {
        tier, cores, memory, fps, prefersReducedMotion: false,
        gpu, dpr, batteryLevel, batteryCharging
    };
    console.log('[DevicePerf] ✅ نتيجة شاملة:', result);
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────
//  كشف سريع متزامن (بدون async) — للاستخدام في inline scripts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * كشف سريع متزامن عن مستوى الأداء.
 * يُضيف فحص WebGL سريع مقارنةً بالنسخة السابقة.
 * @returns {'high'|'medium'|'low'}
 */
export function getQuickDeviceTier() {
    try {
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'low';

        const cores  = navigator.hardwareConcurrency ?? 1;
        const memory = navigator.deviceMemory        ?? -1;
        const dpr    = window.devicePixelRatio       || 1;

        let score = 3;
        if (cores  < 4)                  score--;
        if (memory !== -1 && memory < 4) score--;

        // فحص WebGL سريع: هل يدعم WebGL2؟
        try {
            const c = document.createElement('canvas');
            c.width  = 1;
            c.height = 1;
            const gl2 = c.getContext('webgl2');
            const gl  = gl2 || c.getContext('webgl');
            if (!gl)        score -= 2;  // لا GPU = ضعيف جداً
            else if (gl2)   score += 1;  // WebGL2 = GPU حديث
            // حرر فوراً
            try { (gl.getExtension('WEBGL_lose_context') || {}).loseContext?.(); } catch (e) {}
        } catch (e) {}

        // DPR عالٍ مع score منخفض = ضغط زائد
        if (dpr > 2.5 && score >= 3) score--;

        return score >= 3 ? 'high' : score >= 2 ? 'medium' : 'low';
    } catch (e) {
        return 'low';
    }
}