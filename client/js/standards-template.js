/**
 * PROJECT TEMPLATE - JavaScript Utilities & Initialization
 * Use this as a starting point for any new project
 * All functions are reusable and framework-agnostic
 */

// ========================================
// 1. CONFIGURATION
// ========================================

const CONFIG = {
    // Animation settings
    animations: {
        duration: {
            fast: 150,
            normal: 300,
            slow: 500,
            slower: 800
        },
        easing: {
            linear: 'linear',
            ease: 'ease',
            easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)'
        }
    },

    // Responsive breakpoints
    breakpoints: {
        sm: 480,
        md: 768,
        lg: 1024,
        xl: 1200,
        '2xl': 1400
    },

    // Performance settings
    performance: {
        // Disable animations on slow networks
        disableAnimationsOn: {
            slowNetwork: true,
            lowBattery: true,
            reducedMotion: true,
            weakDevice: true
        },
        // Lazy loading config
        lazyLoadMargin: '50px',
        lazyLoadThreshold: 0.01
    },

    // Accessibility
    accessibility: {
        focusOutlineWidth: '2px',
        focusOutlineColor: '#3b82f6',
        focusOutlineOffset: '2px'
    }
};

// ========================================
// 2. UTILITY FUNCTIONS
// ========================================

/**
 * Check if animations should be disabled
 */
function shouldDisableAnimations() {
    // Check for prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
    }

    // Check for slow network
    const connection = navigator.connection || navigator.mozConnection;
    if (connection?.effectiveType === '2g' || connection?.effectiveType === '3g') {
        return true;
    }

    // Check for weak device
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 2) {
        return true;
    }

    return false;
}

/**
 * Debounce function for expensive operations
 */
function debounce(fn, delay = 300) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function for scroll/resize events
 */
function throttle(fn, delay = 300) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            fn(...args);
        }
    };
}

/**
 * Add animation to element with fallback
 */
function animateElement(element, animationName, duration = 300) {
    return new Promise((resolve) => {
        if (shouldDisableAnimations()) {
            resolve();
            return;
        }

        element.style.animation = `${animationName} ${duration}ms ease`;
        
        function handleAnimationEnd() {
            element.style.animation = '';
            element.removeEventListener('animationend', handleAnimationEnd);
            resolve();
        }

        element.addEventListener('animationend', handleAnimationEnd, { once: true });
    });
}

/**
 * Check if element is in viewport
 */
function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
    );
}

/**
 * Get current breakpoint
 */
function getCurrentBreakpoint() {
    const width = window.innerWidth;
    if (width < CONFIG.breakpoints.sm) return 'xs';
    if (width < CONFIG.breakpoints.md) return 'sm';
    if (width < CONFIG.breakpoints.lg) return 'md';
    if (width < CONFIG.breakpoints.xl) return 'lg';
    if (width < CONFIG.breakpoints['2xl']) return 'xl';
    return '2xl';
}

/**
 * Check if dark mode is enabled
 */
function isDarkMode() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// ========================================
// 3. CORE INITIALIZATION FUNCTIONS
// ========================================

/**
 * Setup responsive font sizes
 */
function setupResponsiveTypography() {
    function updateFontSize() {
        const width = window.innerWidth;
        let fontSize = '18px';

        if (width < 480) fontSize = '14px';
        else if (width < 768) fontSize = '15px';
        else if (width < 1024) fontSize = '16px';

        document.documentElement.style.fontSize = fontSize;
    }

    updateFontSize();
    window.addEventListener('resize', debounce(updateFontSize, 200));
}

/**
 * Setup Intersection Observer for lazy loading
 */
function setupLazyLoading() {
    const options = {
        root: null,
        rootMargin: CONFIG.performance.lazyLoadMargin,
        threshold: CONFIG.performance.lazyLoadThreshold
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                const element = entry.target;

                // Load image
                if (element.tagName === 'IMG' && element.dataset.src) {
                    element.src = element.dataset.src;
                    element.removeAttribute('data-src');
                    element.classList.add('loaded');
                }

                // Trigger AOS animation
                if (element.dataset.aos) {
                    element.classList.add('aos-animate');
                }

                observer.unobserve(element);
            }
        });
    }, options);

    document.querySelectorAll('[data-src], [data-aos]').forEach((el) => {
        observer.observe(el);
    });
}

/**
 * Setup accessibility features
 */
function setupAccessibility() {
    // Setup keyboard navigation indicator
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            document.body.classList.add('keyboard-nav');
        }
    });

    document.addEventListener('mousedown', () => {
        document.body.classList.remove('keyboard-nav');
    });

    // Auto-add ARIA labels to buttons
    document.querySelectorAll('button:not([aria-label])').forEach((btn) => {
        if (btn.textContent.trim()) {
            btn.setAttribute('aria-label', btn.textContent.trim());
        }
    });

    // Auto-add ARIA labels to icon-only links
    document.querySelectorAll('a:not([aria-label])').forEach((link) => {
        if (!link.textContent.trim()) {
            const icon = link.querySelector('[class*="icon"]');
            if (icon && icon.getAttribute('aria-label')) {
                link.setAttribute('aria-label', icon.getAttribute('aria-label'));
            }
        }
    });
}

/**
 * Setup responsive behavior tracking
 */
function setupResponsiveTracking() {
    const updateDevice = () => {
        const breakpoint = getCurrentBreakpoint();
        document.documentElement.dataset.device = breakpoint;
    };

    updateDevice();
    window.addEventListener('resize', debounce(updateDevice, 300));
}

/**
 * Setup dark mode listener
 */
function setupDarkModeListener() {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const updateTheme = (e) => {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
    };

    darkModeQuery.addListener(updateTheme);
    updateTheme(darkModeQuery);
}

/**
 * Setup smooth scroll behavior
 */
function setupSmoothScroll() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('a[href^="#"]');
        if (!target) return;

        const hash = target.getAttribute('href');
        const element = document.querySelector(hash);
        
        if (element) {
            e.preventDefault();
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            element.focus();
        }
    });
}

/**
 * Setup error handling
 */
function setupErrorHandling() {
    // Global error handler
    window.addEventListener('error', (e) => {
        console.error('Global error:', e.error);
        // Send to error tracking service
    });

    // Unhandled promise rejection
    window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
        // Send to error tracking service
    });
}

/**
 * Setup performance monitoring
 */
function setupPerformanceMonitoring() {
    // Log Core Web Vitals
    if ('web-vital' in window) {
        console.log('Performance monitoring active');
    }

    // Monitor FPS drop
    let lastTime = performance.now();
    let frames = 0;

    const measureFPS = () => {
        frames++;
        const currentTime = performance.now();
        if (currentTime >= lastTime + 1000) {
            const fps = Math.round(frames * 1000 / (currentTime - lastTime));
            if (fps < 30) {
                console.warn('Low FPS detected:', fps);
            }
            frames = 0;
            lastTime = currentTime;
        }
        requestAnimationFrame(measureFPS);
    };

    if (window.requestIdleCallback) {
        window.requestIdleCallback(() => {
            requestAnimationFrame(measureFPS);
        }, { timeout: 2000 });
    }
}

/**
 * Setup image optimization
 */
function setupImageOptimization() {
    document.querySelectorAll('img').forEach((img) => {
        // Add error handler
        img.addEventListener('error', function () {
            this.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxyZWN0IHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiBmaWxsPSIjRjNGNEY2Ii8+Cjwvc3ZnPg==';
            this.setAttribute('alt', 'Image not available');
        });

        // Ensure alt text
        if (!img.getAttribute('alt')) {
            const filename = img.src.split('/').pop().split('.')[0];
            img.setAttribute('alt', filename.replace(/[-_]/g, ' '));
        }
    });
}

/**
 * Setup form validation
 */
function setupFormValidation() {
    document.querySelectorAll('form').forEach((form) => {
        form.addEventListener('submit', (e) => {
            const inputs = form.querySelectorAll('[required]');
            let isValid = true;

            inputs.forEach((input) => {
                if (!input.value.trim()) {
                    input.classList.add('error');
                    isValid = false;
                } else {
                    input.classList.remove('error');
                }
            });

            if (!isValid) {
                e.preventDefault();
            }
        });

        // Clear error on input
        form.querySelectorAll('[required]').forEach((input) => {
            input.addEventListener('input', () => {
                input.classList.remove('error');
            });
        });
    });
}

/**
 * Setup scroll performance optimization
 */
function setupScrollOptimization() {
    let ticking = false;

    function updateOnScroll() {
        // Your scroll logic here
        ticking = false;
    }

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(updateOnScroll);
            ticking = true;
        }
    }, { passive: true });
}

/**
 * Disable animations on slow network/weak device
 */
function disableAnimationsIfNeeded() {
    if (shouldDisableAnimations()) {
        document.documentElement.style.setProperty('--duration-fast', '0.01ms');
        document.documentElement.style.setProperty('--duration-normal', '0.01ms');
        document.documentElement.style.setProperty('--duration-slow', '0.01ms');
        document.documentElement.style.setProperty('--duration-slower', '0.01ms');
        console.log('Animations disabled for performance');
    }
}

// ========================================
// 4. MAIN INITIALIZATION
// ========================================

/**
 * Initialize all features
 */
function initializeApp() {
    // Order matters - performance first
    disableAnimationsIfNeeded();
    setupResponsiveTypography();
    setupResponsiveTracking();
    setupDarkModeListener();
    
    // Core features
    setupAccessibility();
    setupLazyLoading();
    setupSmoothScroll();
    setupImageOptimization();
    setupFormValidation();
    setupScrollOptimization();
    
    // Monitoring
    setupErrorHandling();
    setupPerformanceMonitoring();

    console.log('✅ App initialized successfully');
    console.log('Device:', getCurrentBreakpoint());
    console.log('Dark mode:', isDarkMode());
    console.log('Animations disabled:', shouldDisableAnimations());
}

/**
 * Start initialization when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========================================
// 5. EXPORTABLE UTILITIES (for modules)
// ========================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        shouldDisableAnimations,
        debounce,
        throttle,
        animateElement,
        isElementInViewport,
        getCurrentBreakpoint,
        isDarkMode,
        setupLazyLoading,
        setupAccessibility,
        initializeApp
    };
}
