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
        'openGradesModal','closeGradesModal','openStatsModal','closeStatsModal','openEditSelectionModal','switchEditTab','renderDashboard',
        'deleteQuiz','escapeHtml','showAlert','showConfirm','showLoading','getQuickDeviceTier','scrollToTop','scrollToElement',
        'playEntranceAnimation','playExitAnimation','animateElement','pauseAllAnimations','resumeAllAnimations'
    ];

    function triggerAppLoad() {
        if (window.__appLoadTriggered) return;
        window.__appLoadTriggered = true;
        window.__appLoading = true;
        // Inject Font Awesome stylesheet + preload font to avoid fetching it on first paint
        try {
            if (!document.querySelector('link[data-fa]')) {
                const faPre = document.createElement('link');
                faPre.rel = 'preload';
                faPre.as = 'font';
                faPre.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2';
                faPre.type = 'font/woff2';
                faPre.crossOrigin = 'anonymous';
                faPre.setAttribute('data-fa', '1');
                document.head.appendChild(faPre);

                const faLink = document.createElement('link');
                faLink.rel = 'stylesheet';
                faLink.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
                faLink.setAttribute('data-fa', '1');
                document.head.appendChild(faLink);
            }
        } catch (e) { /* ignore */ }
        // Prefer the unbundled `app.js` here so runtime startup behavior (deferred scroll init)
        // from the source entrypoint is respected. If that fails, fall back to the minified bundle.
        const primary = '/js/app.js';
        const fallback = '/js/app.bundle.min.js?v=31';
        import(primary).then(mod => {
            // if module exports startApp, call it
            if (mod && typeof mod.startApp === 'function') {
                mod.startApp().catch(err => console.error('startApp failed', err));
            }
            // flush queued calls
            window.__appLoading = false;
            while (window.__lazyCalls.length) {
                const call = window.__lazyCalls.shift();
                try {
                    if (typeof window[call.name] === 'function') window[call.name].apply(null, call.args || []);
                } catch (e) {
                    console.error('Error invoking queued call', call.name, e);
                }
            }
        }).catch(err => {
            console.warn('Failed to import primary app.js, falling back to bundle:', err);
            // Many bundles are produced as classic scripts (non-ESM). Dynamic `import()` will
            // fail for those with strict MIME checks. Inject a classic script tag as a
            // robust fallback and call `window.startApp()` if the bundle exposes it.
            try {
                const script = document.createElement('script');
                script.src = fallback;
                script.async = true;
                script.onload = function() {
                    try {
                        if (typeof window.startApp === 'function') {
                            // bundle may attach startApp to window
                            Promise.resolve(window.startApp()).catch(()=>{});
                        }
                    } catch (e) {
                        console.error('Error while invoking startApp from fallback bundle', e);
                    }
                    // flush queued calls if bundle attached functions to window
                    window.__appLoading = false;
                    while (window.__lazyCalls && window.__lazyCalls.length) {
                        const call = window.__lazyCalls.shift();
                        try {
                            if (typeof window[call.name] === 'function') window[call.name].apply(null, call.args || []);
                        } catch (e) {
                            console.error('Error invoking queued call', call.name, e);
                        }
                    }
                };
                script.onerror = function(e){
                    console.error('Failed to load fallback bundle script', e);
                    window.__appLoading = false;
                };
                document.head.appendChild(script);
            } catch (e) {
                console.error('Both app.js and bundle failed to load (fallback injection error):', e);
                window.__appLoading = false;
            }
        });
        });
    }

    // create stub functions that queue the call and trigger app load
    lazyNames.forEach(name => {
        if (window[name]) return;
        window[name] = function(...args) {
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
