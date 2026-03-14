/**
 * @file guest-login.js
 * @description وحدة الدخول كضيف — بدون حفظ الدرجات
 */

(function() {
    'use strict';

    let modalAttached = false;

    function getGuestModal() {
        const modal = document.getElementById('guest-modal');
        if (!modal) return null;
        if (modal.parentElement !== document.body) {
            document.body.appendChild(modal);
        }
        // Attach close handler on outside click
        if (!modalAttached) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal && window.closeGuestModal) {
                    window.closeGuestModal();
                }
            });
            modalAttached = true;
        }
        return modal;
    }

    window.showGuestModal = function() {
        const modal = getGuestModal();
        if (modal) modal.style.display = 'flex';
    };

    window.closeGuestModal = function() {
        const modal = document.getElementById('guest-modal');
        if (modal) modal.style.display = 'none';
    };

    window.agreeGuestLogin = function() {
        window.closeGuestModal();
        if (window.startGuestLogin) {
            window.startGuestLogin();
        }
    };

    window.startGuestLogin = async function() {
        document.body.classList.add('guest-mode');

        // Load core CSS immediately
        if (window.__loadCoreCss) {
            window.__loadCoreCss();
        }

        // Wait for motion libs to load from __loadMotionLibs
        await new Promise(resolve => setTimeout(resolve, 100));

        // Set guest user state
        const guestUser = {
            fname: 'ضيف',
            lname: '',
            fullName: 'ضيف',
            avatar: '',
            role: 'guest',
            email: ''
        };

        try {
            sessionStorage.setItem('currentUser', JSON.stringify(guestUser));
            sessionStorage.setItem('isAdmin', 'false');
            localStorage.setItem('guest-mode', 'true');
            sessionStorage.setItem('guest-mode', 'true');
        } catch (e) {
            console.error('[guest] failed to save session', e);
            return;
        }

        // Hide login screen, show loading screen
        const loginScreen = document.getElementById('login-screen');
        const loadingScreen = document.getElementById('loading-screen');
        const dashboardView = document.getElementById('dashboard-view');
        const iosBottomNav = document.getElementById('ios-bottom-nav');

        if (loginScreen) loginScreen.classList.add('hidden');
        if (loadingScreen) loadingScreen.classList.remove('hidden');

        console.log('[guest] ✓ بدء الدخول كضيف — جاري تحميل البيانات...');

        try {
            // Trigger app load which will handle everything for guest mode
            if (typeof window.loadApp === 'function') {
                window.loadApp();
            } else {
                console.warn('[guest] loadApp not available yet, waiting...');
                // Wait for app to be ready
                await new Promise(resolve => {
                    const checkReady = () => {
                        if (typeof window.loadApp === 'function') {
                            window.loadApp();
                            resolve();
                        } else {
                            setTimeout(checkReady, 100);
                        }
                    };
                    checkReady();
                });
            }
        } catch (e) {
            console.error('[guest] login error:', e);
            // Fallback: show dashboard on error
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (dashboardView) dashboardView.classList.remove('hidden');
            if (iosBottomNav) iosBottomNav.classList.remove('hidden');
        }
    };
})();
