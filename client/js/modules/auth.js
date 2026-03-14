/**
 * @module auth
 * @description تسجيل الدخول بـ Google OAuth، إدارة الجلسة، تسجيل الخروج
 */
import state from './state.js';
import { showAlert, logFunctionStatus } from './helpers.js';
import { apiCall, loadDataFromServer, getClientDeviceId, startDataPolling, stopDataPolling } from './api.js';
import { navToHome, showLoginScreen, _showThemeToggle, openAdminAuthOrPanel, updateDockUI } from './navigation.js';
import { startLeaderboardAutoRefresh } from './dashboard.js';

function getClientDevicePayload() {
    return {
        deviceId: getClientDeviceId(),
        deviceName: navigator.userAgent || 'Unknown Device'
    };
}

/**
 * بدء تسجيل دخول Google عبر Redirect
 * @param {'student'|'admin'} mode — وضع التسجيل
 */
export function startGoogleRedirectLogin(mode) {
    window.startGoogleRedirectLogin = startGoogleRedirectLogin;
    try {
        logFunctionStatus('startGoogleRedirectLogin', false);
        const redirectMode = mode === 'admin' ? 'admin' : 'student';
        const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        // Save to both sessionStorage and localStorage (mobile compat)
        sessionStorage.setItem('googleLoginMode', redirectMode);
        sessionStorage.setItem('googleNonce', nonce);
        localStorage.setItem('googleLoginMode', redirectMode);
        localStorage.setItem('googleNonce', nonce);

        const currentUrl = new URL(window.location.href);
        let redirectUri = currentUrl.origin + currentUrl.pathname;
        if (redirectUri.endsWith('/')) redirectUri = redirectUri.slice(0, -1);
        if (redirectUri.toLowerCase().endsWith('/index.html')) {
            redirectUri = redirectUri.slice(0, -'/index.html'.length);
        }
        const oauthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        oauthUrl.searchParams.set('client_id', state.GOOGLE_CLIENT_ID);
        oauthUrl.searchParams.set('redirect_uri', redirectUri);
        oauthUrl.searchParams.set('response_type', 'id_token');
        oauthUrl.searchParams.set('scope', 'openid email profile');
        oauthUrl.searchParams.set('nonce', nonce);
        oauthUrl.searchParams.set('prompt', 'select_account');
        window.location.href = oauthUrl.toString();
    } catch (err) {
        console.error('❌ startGoogleRedirectLogin error:', err);
        alert('خطأ في تسجيل الدخول: ' + err.message);
    }
}

/**
 * معالجة رد Google بعد Redirect
 * @returns {boolean} هل تم معالجة التوكن
 */
export function handleGoogleRedirectToken() {
    logFunctionStatus('handleGoogleRedirectToken', false);
    // Handle Google error redirect (e.g., access_denied)
    if (window.location.hash && window.location.hash.includes('error=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const error = hashParams.get('error');
        const errorDesc = hashParams.get('error_description') || error;
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
        console.error('❌ Google OAuth error:', error, errorDesc);
        const errorEl = document.getElementById('login-error');
        if (errorEl) {
            errorEl.textContent = '❌ خطأ من Google: ' + decodeURIComponent(errorDesc || 'غير معروف');
            errorEl.classList.remove('hidden');
        }
        return true;
    }

    if (!window.location.hash || !window.location.hash.includes('id_token=')) return false;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const idToken = hashParams.get('id_token');
    // Try both sessionStorage and localStorage for nonce (mobile compat)
    const expectedNonce = sessionStorage.getItem('googleNonce') || localStorage.getItem('googleNonce');
    const savedMode = sessionStorage.getItem('googleLoginMode') || localStorage.getItem('googleLoginMode') || 'student';

    history.replaceState({}, document.title, window.location.pathname + window.location.search);
    sessionStorage.removeItem('googleNonce');
    sessionStorage.removeItem('googleLoginMode');
    localStorage.removeItem('googleNonce');
    localStorage.removeItem('googleLoginMode');

    if (!idToken) return false;

    // Nonce verification: decode the JWT payload to extract the nonce
    // (Google implicit flow embeds nonce inside the id_token, not as a URL parameter)
    if (expectedNonce) {
        try {
            const payload = JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
            if (payload.nonce !== expectedNonce) {
                showAlert('❌ فشل التحقق من تسجيل Google (nonce mismatch). حاول مرة أخرى.', 'error');
                return true;
            }
        } catch {
            showAlert('❌ فشل التحقق من تسجيل Google. حاول مرة أخرى.', 'error');
            return true;
        }
    }

    state.googleLoginMode = savedMode;
    const response = { credential: idToken };
    if (savedMode === 'admin') {
        handleGoogleAdminResponse(response);
    } else {
        // Always use the window wrapper (set by app.js) which includes all callbacks
        if (window.handleStudentGoogleLogin) {
            window.handleStudentGoogleLogin(response);
        } else {
            console.warn('handleStudentGoogleLogin wrapper not ready, deferring...');
            window.addEventListener('load', () => {
                if (window.handleStudentGoogleLogin) window.handleStudentGoogleLogin(response);
            }, { once: true });
        }
    }
    return true;
}

/** @private */
export function initGoogleSignIn() { state.gsiRetries = 0; }

export function initGoogleSignInWrapper() { logFunctionStatus('initGoogleSignIn', false); initGoogleSignIn(); }

/**
 * معالجة تسجيل دخول المعلم (أدمن) عبر Google
 * @param {{ credential: string }} response — استجابة Google
 */
export async function handleGoogleAdminResponse(response) {
    const errorEl = document.getElementById('admin-auth-error');
    const loadingEl = document.getElementById('admin-auth-loading');
    logFunctionStatus('handleGoogleAdminResponse', true);
    errorEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Id': getClientDeviceId()
            },
            credentials: 'include',
            body: JSON.stringify({
                idToken: response.credential,
                ...getClientDevicePayload()
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'فشل التحقق');
        if (data.user.role === 'admin') {
            state.isAdmin = true;
            loadingEl.classList.add('hidden');
            // Load core CSS immediately before showing admin panel
            if (window.__loadCoreCss) window.__loadCoreCss();
            closeAdminAuth();
            openAdminAuthOrPanel();
        } else {
            loadingEl.classList.add('hidden');
            errorEl.textContent = '❌ هذا الحساب ليس لديه صلاحيات إدارة. تواصل مع المعلم.';
            errorEl.classList.remove('hidden');
        }
    } catch (err) {
        loadingEl.classList.add('hidden');
        errorEl.textContent = '❌ ' + (err.message || 'حدث خطأ أثناء التحقق');
        errorEl.classList.remove('hidden');
    }
}

/** إغلاق مودل مصادقة الأدمن */
export function closeAdminAuth() {
    document.getElementById('admin-auth-modal').classList.add('hidden');
    _showThemeToggle(true);
    const errorEl = document.getElementById('admin-auth-error');
    const loadingEl = document.getElementById('admin-auth-loading');
    if (errorEl) errorEl.classList.add('hidden');
    if (loadingEl) loadingEl.classList.add('hidden');
    state.googleLoginMode = 'student';
    updateDockUI('home');
}

/** رسالة ترحيب المعلم */
export function showAdminToast() {
    const toast = document.createElement('div');
    toast.className = 'fixed top-6 left-1/2 -translate-x-1/2 z-[200] bg-green-500 text-white px-8 py-4 rounded-2xl shadow-2xl font-extrabold text-lg flex items-center gap-3 transition-all duration-500';
    toast.innerHTML = '<i class="fas fa-crown text-yellow-300 text-xl"></i> مرحباً بك، حساب معلم <i class="fas fa-check-circle"></i>';
    toast.style.opacity = '0'; toast.style.transform = 'translate(-50%, -20px)';
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translate(-50%, 0)'; });
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translate(-50%, -20px)'; setTimeout(() => toast.remove(), 500); }, 3000);
}

/**
 * معالجة تسجيل دخول الطالب عبر Google
 * @param {{ credential: string }} response — استجابة Google
 * @param {Function} renderSubjectFilters — دالة رسم الفلاتر
 * @param {Function} renderHistoryTree — دالة رسم الشجرة
 * @param {Function} renderDashboard — دالة رسم لوحة القيادة
 * @param {Function} startTokenRefresh — دالة بدء تجديد التوكن
 */
export async function handleStudentGoogleLogin(response, renderSubjectFilters, renderHistoryTree, renderDashboard, startTokenRefresh) {
    logFunctionStatus('handleStudentGoogleLogin', true);
    console.log('[auth] بدء تسجيل دخول الطالب...');
    const errorEl = document.getElementById('login-error');
    const loadingEl = document.getElementById('login-loading');
    errorEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');
    try {
        const res = await fetch('/api/auth/google', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Device-Id': getClientDeviceId()
            },
            credentials: 'include',
            body: JSON.stringify({
                idToken: response.credential,
                ...getClientDevicePayload()
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.debug ? `${data.error} [${data.debug}]` : (data.error || 'فشل تسجيل الدخول'));

        let fname = data.user.fname || '';
        let lname = data.user.lname || '';
        if (!fname) {
            const payload = JSON.parse(atob(response.credential.split('.')[1]));
            const fullName = payload.name || payload.email.split('@')[0];
            const parts = fullName.trim().split(/\s+/);
            fname = parts[0] || '';
            lname = parts.slice(1).join(' ') || '';
            if (fname) {
                // إرسال الاسم حتى لو lname فارغة (أسماء أحادية)
                await fetch('/api/auth/complete-profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ fname, lname: lname || '' })
                }).catch(() => { });
            }
        }

        state.currentUser = {
            fname: fname || data.user.fname, lname: lname || data.user.lname,
            fullName: ((fname + ' ' + lname).trim() || data.user.fullName || data.user.email || '').trim(),
            avatar: data.user.avatar || '',
            role: data.user.role, email: data.user.email || ''
        };

        if (data.user.role === 'admin') { state.isAdmin = true; }
        loadingEl.classList.add('hidden');
        console.log(`[auth] ✓ تسجيل دخول ناجح — ${state.currentUser.fullName} (${state.isAdmin ? 'أدمن' : 'طالب'})`);

        // Load core CSS immediately before showing dashboard
        if (window.__loadCoreCss) window.__loadCoreCss();

        const safeName = (state.currentUser.fname || state.currentUser.fullName || state.currentUser.email || 'صديقنا').trim();
        const greetings = [
            `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}، قال تعالى: ﴿وَقُل رَّبِّ زِدْنِي عِلْمًا﴾`,
            `مَرْحَبًا بِكَ يَا أَيُّهَا الدَّرْعَمِيُّ ${safeName}، أَسْأَلُ اللهَ أَنْ يَنْفَعَكَ بِمَا تَعَلَّمْتَ`
        ];
        document.getElementById('welcome-msg').innerText = greetings[Math.floor(Math.random() * greetings.length)];
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('dashboard-view').classList.remove('hidden');
        document.getElementById('ios-bottom-nav').classList.remove('hidden');
        if (data.user.role === 'admin') showAdminToast();

        navToHome();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof startTokenRefresh === 'function') startTokenRefresh();

        // Store user info in sessionStorage (token is in httpOnly cookie only)
        sessionStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        sessionStorage.setItem('isAdmin', state.isAdmin.toString());

        loadDataFromServer().then(() => {
            state.dataLoaded = true;
            if (typeof renderSubjectFilters === 'function') renderSubjectFilters();
            if (typeof renderHistoryTree === 'function') renderHistoryTree();
            if (typeof renderDashboard === 'function') renderDashboard();
            
            // Start automatic data polling (refresh every 30 seconds)
            startDataPolling(30000);
        });
    } catch (err) {
        loadingEl.classList.add('hidden');
        console.error('❌ Login error details:', err);
        errorEl.textContent = '❌ ' + (err.message || 'حدث خطأ أثناء تسجيل الدخول');
        errorEl.classList.remove('hidden');
    }
}

/**
 * تسجيل الخروج مع إلغاء التوكن ومزامنة بين التبويبات
 */
export async function logoutUser() {
    logFunctionStatus('logoutUser', true);
    console.log('[auth] بدء تسجيل الخروج...');
    
    // Turn off the lamp on logout
    if (window.toggleLamp) {
        // Set lamp to off state (!1 means false/off)
        const lampSvg = document.getElementById('lamp-svg');
        if (lampSvg) {
            // Only turn off if lamp is currently on
            if (!lampSvg.classList.contains('off')) {
                window.toggleLamp();
            }
        }
    }
    
    // Stop automatic data polling on logout
    stopDataPolling();
    
    const isGuest = state.currentUser?.role === 'guest' || localStorage.getItem('guest-mode') === 'true';
    if (!isGuest) {
        try { await apiCall('POST', '/api/auth/logout').catch(() => { }); } catch (e) { /* ignore */ }
    }
    state.currentUser = null;
    state.isAdmin = false;
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('guest-mode');
    localStorage.removeItem('guest-mode');
    document.body.classList.remove('guest-mode');
    // Signal other tabs to logout (non-guest only)
    if (!isGuest) {
        localStorage.setItem('logout_event', Date.now().toString());
        localStorage.removeItem('logout_event');
    }
    console.log('[auth] ✓ تم تسجيل الخروج');
    location.reload();
}

/**
 * بدء تجديد التوكن تلقائياً كل 6 ساعات
 */
export function startTokenRefresh() {
    logFunctionStatus('startTokenRefresh', true);
    if (state.tokenRefreshTimer) clearInterval(state.tokenRefreshTimer);
    console.log('[auth] ✓ بدء تجديد التوكن التلقائي (كل 6 ساعات)');
    state.tokenRefreshTimer = setInterval(async () => {
        if (!state.currentUser) return;
        try {
            await apiCall('POST', '/api/auth/refresh');
            console.log('[auth] ✓ تم تجديد التوكن تلقائياً');
            // Token refreshed in httpOnly cookie automatically
            sessionStorage.setItem('currentUser', JSON.stringify(state.currentUser));
        } catch (e) { console.error('[auth] ✗ فشل تجديد التوكن:', e.message); }
    }, 6 * 60 * 60 * 1000);
}

// ملاحظة: startLeaderboardAutoRefresh تُستدعى من dashboard.js بعد تسجيل الدخول فعلياً
// لا تستدعِها هنا عند تحميل الموديول تجنباً للـ polling قبل وجود جلسة
