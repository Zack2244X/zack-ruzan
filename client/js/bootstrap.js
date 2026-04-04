// Lightweight bootstrap: set minimal fallbacks and lazily load the full app when needed.
// Goal: avoid sending the large bundled app to anonymous users and defer heavy modules.
(function(){
    // queue for calls made before the real app loads
    // Keep any calls queued by inline fallbacks before bootstrap executes.
    window.__lazyCalls = window.__lazyCalls || [];
    window.__appLoading = false;

    // safe error handlers (small)
    window.addEventListener('error', (e) => {
        console.error('❌ خطأ غير متوقع (boot):', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.error('❌ Promise مرفوض (boot):', e.reason);
        e.preventDefault();
    });

    // list of common global functions that HTML may call via inline onclick.
    const lazyNames = [
        'toggleTheme','navToHome','navToSection','openAdminAuthOrPanel','closeStudentMenu',
        'openBottomSheet','closeBottomSheet','closeAdminSheet','closeAllOverlays','startGoogleRedirectLogin',
        'closeAdminAuth','logoutUser','handleStudentGoogleLogin','loadApp','playQuiz','selectAnswer','goToNextQuestion',
        'goToPreviousQuestion','submitQuiz','exitToMain','openCreateSection','closeCreateSection','goToBuilderStep2',
        'renderBuilderQuestion','updateBuilderData','updateBuilderOptionText','setBuilderCorrectOption','addBuilderOption',
        'removeBuilderOption','addBuilderQuestion','navBuilderQuestion','saveBuiltQuiz','loadQuizIntoBuilder','updateExistingQuiz',
        'triggerImportExamFile','reshuffleImportedAnswers','handleImportFileChange','setSubjectFilter','setEditSubjectFilter',
        'renderSubjectFilters','renameSubject','closeRenameModal','executeRenameSubject','confirmDeleteSubject','closeDeleteModal',
        'executeDeleteSubject','openAddNoteModal','closeAddNoteModal','saveNote','loadNoteIntoBuilder','updateExistingNote','forceDownload',
        'openGradesModal','closeGradesModal','openStatsModal','closeStatsModal','openEditSelectionModal','closeEditSelectionModal','switchEditTab','renderDashboard',
        'deleteQuiz','escapeHtml','showAlert','showConfirm','showLoading','getQuickDeviceTier','scrollToTop','scrollToElement',
        'playEntranceAnimation','playExitAnimation','animateElement','pauseAllAnimations','resumeAllAnimations'
    ];

    function triggerAppLoad() {
        if (window.__appLoadTriggered) return;
        window.__appLoadTriggered = true;
        window.__appLoading = true;
        // FA CSS and font preloads are now injected in HTML <head> as non-blocking preloads.
        // No need to inject them here — avoids double-loading and keeps bootstrap.js light.

        function flushQueue() {
            window.__appLoading = false;
            const queuedCalls = (window.__lazyCalls || []).splice(0);
            for (const call of queuedCalls) {
                try {
                    const fn = window[call.name];
                    if (typeof fn === 'function' && !fn.__isBootstrapStub) {
                        fn.apply(null, call.args || []);
                    } else {
                        // Keep calls queued until the real implementation is attached.
                        window.__lazyCalls.push(call);
                    }
                } catch (e) { console.error('Error invoking queued call', call.name, e); }
            }
            try { if (typeof wrapRegisteredFunctions === 'function') wrapRegisteredFunctions(); } catch(e) {}
        }

        // Primary: minified IIFE bundle (one request, all modules pre-bundled).
        // Injected as a classic <script> so the IIFE executes and auto-initializes the app.
        // Falls back to dynamic import() of ESM app.js if the bundle is unavailable.
        const bundleUrl = '/js/app.bundle.min.js?v=75';
        const esmUrl    = '/js/app.js';

        const bundleScript = document.createElement('script');
        bundleScript.src   = bundleUrl;
        bundleScript.async = true;
        bundleScript.onload = function() {
            // Bundle is a self-executing IIFE — app already initialized on script load.
            // Call window.startApp() only if the bundle explicitly exposes it.
            const startPromise = (typeof window.startApp === 'function')
                ? Promise.resolve(window.startApp())
                : Promise.resolve();
            startPromise
                .catch(() => {})
                .finally(flushQueue);
        };
        bundleScript.onerror = function(err) {
            console.warn('[bootstrap] bundle failed, falling back to ESM app.js:', err);
            import(esmUrl).then(mod => {
                const startPromise = (mod && typeof mod.startApp === 'function')
                    ? Promise.resolve(mod.startApp())
                    : Promise.resolve();
                startPromise
                    .catch(e => console.error('startApp failed', e))
                    .finally(flushQueue);
            }).catch(e => {
                console.error('[bootstrap] Both bundle and ESM fallback failed:', e);
                window.__appLoading = false;
            });
        };
        document.head.appendChild(bundleScript);

        // Wrap real functions once the app has attached them so we log invocations/errors
        function wrapRegisteredFunctions(){
            try{
                lazyNames.forEach(name => {
                    try{
                        const fn = window[name];
                        if (typeof fn === 'function' && !fn.__wrapped_by_bootstrap){
                            const original = fn;
                            const wrapped = function(...a){
                                try{
                                    const res = original.apply(this,a);
                                    return res;
                                }catch(err){
                                    console.error('[LAZY_CALL_ERROR]', name, err);
                                    throw err;
                                }
                            };
                            wrapped.__wrapped_by_bootstrap = true;
                            window[name] = wrapped;
                        }
                    }catch(e){/* ignore per-function errors */}
                });
            }catch(e){}
        }

    }

    // Expose loader so inline fallbacks can force app load when needed.
    window.__triggerAppLoad = triggerAppLoad;

    // create stub functions that queue the call and trigger app load
    lazyNames.forEach(name => {
        if (window[name]) return;
        const stub = function(...args) {
            window.__lazyCalls.push({name, args});
            // start loading app on first user interaction
            triggerAppLoad();
        };
        stub.__isBootstrapStub = true;
        window[name] = stub;
    });

    // If sessionStorage claims a user exists, validate cookie session first.
    // This prevents stale local state from briefly showing dashboard/UI before login.
    try {
        const saved = sessionStorage.getItem('currentUser');
        if (saved) {
            fetch('/api/auth/me', { credentials: 'include' })
                .then((res) => {
                    if (res.ok) {
                        triggerAppLoad();
                        return;
                    }
                    sessionStorage.removeItem('currentUser');
                    sessionStorage.removeItem('isAdmin');
                    if (typeof window.showLoginScreenWithDesktop === 'function') {
                        window.showLoginScreenWithDesktop();
                    }
                })
                .catch(() => {
                    sessionStorage.removeItem('currentUser');
                    sessionStorage.removeItem('isAdmin');
                    if (typeof window.showLoginScreenWithDesktop === 'function') {
                        window.showLoginScreenWithDesktop();
                    }
                });
            return;
        }
    } catch (e) { /* ignore */ }

    // No eager app boot for anonymous visits.
    // The app loads on first interaction via lazy stubs.
})();
