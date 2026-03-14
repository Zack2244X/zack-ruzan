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

        // Wait a bit for Lenis to load from __loadMotionLibs
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
        const quizContainer = document.getElementById('quiz-container');
        const welcomeMsg = document.getElementById('welcome-msg');

        if (loginScreen) loginScreen.classList.add('hidden');
        if (loadingScreen) loadingScreen.classList.remove('hidden');

        // Update welcome message
        if (welcomeMsg) {
            welcomeMsg.innerText = 'مَرْحَبًا بِكَ يَا ضَيْفَنَا الكَرِيم — الدخول تجريبي ولن تُحفظ الدرجات';
        }

        console.log('[guest] ✓ بدء الدخول كضيف — جاري تحميل البيانات...');

        try {
            // Import required functions if available
            let loadDataFromServer, startDataPolling, renderDashboard, renderSubjectFilters, renderHistoryTree;

            // Try to get functions from window (if already loaded)
            if (window.loadDataFromServer) {
                loadDataFromServer = window.loadDataFromServer;
            }
            if (window.startDataPolling) {
                startDataPolling = window.startDataPolling;
            }
            if (window.renderDashboard) {
                renderDashboard = window.renderDashboard;
            }
            if (window.renderSubjectFilters) {
                renderSubjectFilters = window.renderSubjectFilters;
            }
            if (window.renderHistoryTree) {
                renderHistoryTree = window.renderHistoryTree;
            }

            // Render functions immediately
            if (typeof renderSubjectFilters === 'function') renderSubjectFilters();
            if (typeof renderHistoryTree === 'function') renderHistoryTree();
            if (typeof renderDashboard === 'function') renderDashboard();

            // Load data and show dashboard
            if (typeof loadDataFromServer === 'function') {
                await loadDataFromServer();
                
                // Hide loading screen, show dashboard
                if (loadingScreen) loadingScreen.classList.add('hidden');
                if (dashboardView) dashboardView.classList.remove('hidden');
                if (iosBottomNav) iosBottomNav.classList.remove('hidden');
                if (quizContainer) quizContainer.classList.add('hidden');

                // Start data polling
                if (typeof startDataPolling === 'function') {
                    startDataPolling(30000);
                }

                console.log('[guest] ✓ تم تحميل البيانات — وضع ضيف نشط');
            } else {
                // Fallback: show dashboard immediately if loadDataFromServer not available
                if (loadingScreen) loadingScreen.classList.add('hidden');
                if (dashboardView) dashboardView.classList.remove('hidden');
                if (iosBottomNav) iosBottomNav.classList.remove('hidden');
                if (quizContainer) quizContainer.classList.add('hidden');

                // Try to call app initialization functions
                if (typeof window.navToHome === 'function') {
                    try { window.navToHome(); } catch (e) { /* ignore */ }
                }

                console.log('[guest] ✓ وضع ضيف نشط (محتوى محلي)');
            }
        } catch (e) {
            console.error('[guest] login error:', e);
            // Fallback: show dashboard on error
            if (loadingScreen) loadingScreen.classList.add('hidden');
            if (dashboardView) dashboardView.classList.remove('hidden');
            if (iosBottomNav) iosBottomNav.classList.remove('hidden');
            if (quizContainer) quizContainer.classList.add('hidden');
        }
    };
})();
