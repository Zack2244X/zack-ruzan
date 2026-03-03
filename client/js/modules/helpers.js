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
