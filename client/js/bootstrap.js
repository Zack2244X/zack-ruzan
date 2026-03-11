// Lightweight bootstrap: set minimal fallbacks and lazily load the full app when needed.
// Goal: avoid sending the large bundled app to anonymous users and defer heavy modules.
(function(){
    // queue for calls made before the real app loads
    window.__lazyCalls = [];
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
        'closeAdminAuth','logoutUser','handleStudentGoogleLogin','playQuiz','selectAnswer','goToNextQuestion',
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
            while (window.__lazyCalls && window.__lazyCalls.length) {
                const call = window.__lazyCalls.shift();
                try {
                    if (typeof window[call.name] === 'function') window[call.name].apply(null, call.args || []);
                } catch (e) { console.error('Error invoking queued call', call.name, e); }
            }
            try { if (typeof wrapRegisteredFunctions === 'function') wrapRegisteredFunctions(); } catch(e) {}
        }

        // Primary: minified IIFE bundle (one request, all modules pre-bundled).
        // Injected as a classic <script> so the IIFE executes and auto-initializes the app.
        // Falls back to dynamic import() of ESM app.js if the bundle is unavailable.
        const bundleUrl = '/js/app.bundle.min.js?v=36';
        const esmUrl    = '/js/app.js';

        const bundleScript = document.createElement('script');
        bundleScript.src   = bundleUrl;
        bundleScript.async = true;
        bundleScript.onload = function() {
            // Bundle is a self-executing IIFE — app already initialized on script load.
            // Call window.startApp() only if the bundle explicitly exposes it.
            if (typeof window.startApp === 'function') {
                Promise.resolve(window.startApp()).catch(() => {});
            }
            flushQueue();
        };
        bundleScript.onerror = function(err) {
            console.warn('[bootstrap] bundle failed, falling back to ESM app.js:', err);
            import(esmUrl).then(mod => {
                if (mod && typeof mod.startApp === 'function') {
                    mod.startApp().catch(e => console.error('startApp failed', e));
                }
                flushQueue();
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
                                console.info('[LAZY_CALL] invoking', name, a);
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

    // create stub functions that queue the call and trigger app load
    lazyNames.forEach(name => {
        if (window[name]) return;
        window[name] = function(...args) {
            try{ console.info('[LAZY_CALL_QUEUE] queued', name, args); }catch(e){}
            window.__lazyCalls.push({name, args});
            // start loading app on first user interaction
            triggerAppLoad();
        };
    });

    // If user is already logged-in (sessionStorage), load app immediately
    try {
        const saved = sessionStorage.getItem('currentUser');
        if (saved) {
            triggerAppLoad();
            return;
        }
    } catch (e) { /* ignore */ }

    // Otherwise, load app on first interaction to avoid blocking initial render
    const onFirstInput = () => {
        triggerAppLoad();
        removeListeners();
    };
    const events = ['pointerdown','keydown','touchstart'];
    function removeListeners() { events.forEach(e=>document.removeEventListener(e,onFirstInput)); }
    events.forEach(e=>document.addEventListener(e,onFirstInput, {passive:true, capture:true}));

    // For robustness, also load app after idle timeout (3s) — covers bots and slow interactions
    if ('requestIdleCallback' in window) requestIdleCallback(triggerAppLoad, {timeout:3000});
    else setTimeout(triggerAppLoad, 3000);
})();
