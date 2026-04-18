(function () {
  const ICON_CLASS_PATTERN = /^(fa|bi)-[a-z0-9-]+$/;
  const BASE_ICON_CLASSES = new Set(["fa", "fas", "far", "fab", "bi"]);
  const SPIN_ICON_CLASSES = new Set(["fa-spin", "fa-pulse"]);
  const ICON_PALETTES = new Set(["ocean", "amber", "mint"]);
  const LUCIDE_RUNTIME_SRC = "/js/vendor/lucide.min.js?v=1";
  const ICON_CANDIDATE_SELECTOR =
    "i, span[data-lucide], span[class*='fa-'], span[class*='bi-'], span.fa, span.fas, span.far, span.fab, span.bi";

  const ICON_MAP = {
    "bi-calendar3": "calendar-days",
    "bi-chevron-down": "chevron-down",
    "bi-file-earmark-pdf-fill": "file-text",
    "bi-file-earmark-slides-fill": "presentation",
    "bi-folder2-open": "folder-open",
    "bi-lightning-charge-fill": "zap",
    "fa-arrow-left": "arrow-left",
    "fa-arrow-right": "arrow-right",
    "fa-award": "award",
    "fa-bolt": "zap",
    "fa-calendar": "calendar-days",
    "fa-chart-line": "chart-line",
    "fa-check": "check",
    "fa-check-circle": "circle-check",
    "fa-chevron-down": "chevron-down",
    "fa-clock": "clock-3",
    "fa-cog": "settings",
    "fa-coins": "coins",
    "fa-crown": "crown",
    "fa-download": "download",
    "fa-edit": "square-pen",
    "fa-exclamation-circle": "circle-alert",
    "fa-exclamation-triangle": "triangle-alert",
    "fa-file-alt": "file-text",
    "fa-file-import": "file-up",
    "fa-file-pdf": "file-text",
    "fa-file-powerpoint": "presentation",
    "fa-file-upload": "file-up",
    "fa-fire": "flame",
    "fa-folder-open": "folder-open",
    "fa-google": "log-in",
    "fa-graduation-cap": "graduation-cap",
    "fa-home": "house",
    "fa-link": "link",
    "fa-lock": "lock",
    "fa-moon": "moon",
    "fa-pen": "pencil",
    "fa-plus": "plus",
    "fa-plus-circle": "plus-circle",
    "fa-redo": "rotate-cw",
    "fa-redo-alt": "rotate-cw",
    "fa-save": "save",
    "fa-shield-alt": "shield-check",
    "fa-sign-out-alt": "log-out",
    "fa-spinner": "loader-circle",
    "fa-sun": "sun",
    "fa-sync": "refresh-cw",
    "fa-sync-alt": "refresh-cw",
    "fa-times": "x",
    "fa-trash": "trash-2",
    "fa-trash-alt": "trash-2",
    "fa-trophy": "trophy",
    "fa-user-cog": "user-cog",
    "fa-users": "users",
  };

  let observer = null;
  let applyQueued = false;
  let applyInProgress = false;
  let lucideWaitTimer = null;
  let flushDebounceTimer = null;
  let lucideScriptPromise = null;
  let legacyOnlyMode = false;
  const pendingRoots = new Set();

  function normalizeRoot(root) {
    if (!root || root === document || root === window) return document;
    if (root.nodeType === 1 || root.nodeType === 9) return root;
    return document;
  }

  function hasLegacyIconClass(el) {
    if (!el || !el.classList) return false;
    const classes = Array.from(el.classList);
    for (let i = 0; i < classes.length; i += 1) {
      const cls = classes[i];
      if (ICON_CLASS_PATTERN.test(cls) || BASE_ICON_CLASSES.has(cls)) {
        return true;
      }
    }
    return false;
  }

  function isPotentialIconElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.tagName === "I") return true;
    if (el.hasAttribute("data-lucide")) return true;
    if (el.tagName === "SPAN" && hasLegacyIconClass(el)) return true;
    return false;
  }

  function collectIconCandidates(root) {
    const iconNodes = [];
    if (!root) return iconNodes;

    if (isPotentialIconElement(root)) {
      iconNodes.push(root);
    }

    if (typeof root.querySelectorAll === "function") {
      const found = root.querySelectorAll(ICON_CANDIDATE_SELECTOR);
      for (let i = 0; i < found.length; i += 1) {
        if (isPotentialIconElement(found[i])) {
          iconNodes.push(found[i]);
        }
      }
    }

    return iconNodes;
  }

  function resolveIconSpec(el) {
    if (!el || !el.classList) return null;

    const explicit = (el.getAttribute("data-lucide") || "").trim();
    if (explicit) {
      return { token: null, iconName: explicit };
    }

    const classes = Array.from(el.classList);
    for (let i = 0; i < classes.length; i += 1) {
      const cls = classes[i];
      if (ICON_MAP[cls]) {
        return { token: cls, iconName: ICON_MAP[cls] };
      }
    }

    for (let i = 0; i < classes.length; i += 1) {
      const cls = classes[i];
      if (ICON_CLASS_PATTERN.test(cls)) {
        return { token: cls, iconName: ICON_MAP[cls] || "circle" };
      }
    }

    return null;
  }

  function toPascalCase(iconName) {
    if (!iconName) return "";
    return iconName
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("");
  }

  function resolveLucideIconDef(iconName) {
    const lucideApi = window.lucide;
    if (!lucideApi || !lucideApi.icons || !iconName) return null;

    return lucideApi.icons[iconName] || lucideApi.icons[toPascalCase(iconName)] || null;
  }

  function normalizeWrapperClasses(el, token) {
    if (!el || !el.classList) return;

    BASE_ICON_CLASSES.forEach((cls) => {
      el.classList.remove(cls);
    });

    let shouldSpin = false;
    SPIN_ICON_CLASSES.forEach((cls) => {
      if (el.classList.contains(cls)) {
        shouldSpin = true;
      }
      el.classList.remove(cls);
    });

    if (token) {
      el.classList.add(token);
    }

    if (token === "fa-chevron-down" || token === "bi-chevron-down") {
      el.classList.add("tree-chevron");
    }

    if (shouldSpin) {
      el.classList.add("animate-spin");
    }

    el.classList.add("ui-icon");
  }

  function renderIconElement(el) {
    if (!el || !el.tagName) return;

    // Only auto-convert non-i elements when they are pure icon placeholders.
    if (el.tagName !== "I") {
      const text = (el.textContent || "").trim();
      const hasNestedElements = el.children && el.children.length > 0;
      if (!el.hasAttribute("data-lucide") && (text || hasNestedElements)) {
        return;
      }
    }

    const spec = resolveIconSpec(el);
    if (!spec) return;

    const lucideApi = window.lucide;
    const iconDef = resolveLucideIconDef(spec.iconName);
    if (!lucideApi || !iconDef || typeof lucideApi.createElement !== "function") {
      return;
    }

    normalizeWrapperClasses(el, spec.token);

    const strokeWidth =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--icon-stroke-width")
        .trim() || "2.2";

    el.setAttribute("data-modern-icon", "1");
    el.setAttribute("data-lucide", spec.iconName);
    el.setAttribute("aria-hidden", "true");

    const svg = lucideApi.createElement(iconDef);
    svg.setAttribute("class", "ui-icon-svg");
    svg.setAttribute("stroke-width", strokeWidth);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    el.replaceChildren(svg);
  }

  function flushIconApplyQueue() {
    if (legacyOnlyMode) return;
    if (applyInProgress) return;

    if (!window.lucide || !window.lucide.icons) {
      ensureLucideReady();
      return;
    }

    applyInProgress = true;
    try {
      const roots = Array.from(pendingRoots);
      pendingRoots.clear();

      for (let r = 0; r < roots.length; r += 1) {
        const root = roots[r];
        const nodes = collectIconCandidates(root);
        for (let i = 0; i < nodes.length; i += 1) {
          renderIconElement(nodes[i]);
        }
      }
    } finally {
      applyInProgress = false;
    }
  }

  function queueIconApply(root) {
    if (legacyOnlyMode) return;
    const normalizedRoot = normalizeRoot(root);
    pendingRoots.add(normalizedRoot);

    if (applyQueued) return;
    applyQueued = true;

    if (flushDebounceTimer) clearTimeout(flushDebounceTimer);
    flushDebounceTimer = setTimeout(() => {
      flushDebounceTimer = null;
      applyQueued = false;
      if ("requestIdleCallback" in window) {
        requestIdleCallback(() => flushIconApplyQueue(), { timeout: 120 });
        return;
      }
      requestAnimationFrame(() => flushIconApplyQueue());
    }, 40);
  }

  async function shouldPreferLegacyIcons() {
    try {
      if (window.__powerSaverMode === true) return true;

      const conn =
        navigator.connection ||
        navigator.mozConnection ||
        navigator.webkitConnection;
      if (conn?.saveData === true) return true;

      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        return true;
      }

      if ("getBattery" in navigator) {
        const battery = await navigator.getBattery();
        if (battery && battery.charging === false) return true;
      }
    } catch (e) {
      // Ignore power capability errors and continue with default mode.
    }
    return false;
  }

  function enableLegacyOnlyMode() {
    if (legacyOnlyMode) return;
    legacyOnlyMode = true;

    if (flushDebounceTimer) {
      clearTimeout(flushDebounceTimer);
      flushDebounceTimer = null;
    }

    if (lucideWaitTimer) {
      clearInterval(lucideWaitTimer);
      lucideWaitTimer = null;
    }

    pendingRoots.clear();
    applyQueued = false;

    if (observer) {
      observer.disconnect();
      observer = null;
    }

    document.documentElement.setAttribute("data-icon-runtime", "legacy");
    try {
      window.__iconLegacyMode = true;
    } catch (e) {
      /* ignore */
    }
  }

  function loadLucideRuntime() {
    if (window.lucide && window.lucide.icons) {
      return Promise.resolve(true);
    }

    if (lucideScriptPromise) {
      return lucideScriptPromise;
    }

    lucideScriptPromise = new Promise((resolve) => {
      const existing = document.querySelector(
        "script[data-lucide-runtime='1'],script[src*='/js/vendor/lucide.min.js']",
      );

      if (existing) {
        if (window.lucide && window.lucide.icons) {
          resolve(true);
          return;
        }

        existing.addEventListener(
          "load",
          () => resolve(!!(window.lucide && window.lucide.icons)),
          { once: true },
        );
        existing.addEventListener("error", () => resolve(false), {
          once: true,
        });
        return;
      }

      const script = document.createElement("script");
      script.src = LUCIDE_RUNTIME_SRC;
      script.async = true;
      script.setAttribute("data-lucide-runtime", "1");

      const nonce =
        document
          .querySelector('meta[name="csp-nonce"]')
          ?.getAttribute("content") || "";
      if (nonce) {
        script.setAttribute("nonce", nonce);
      }

      script.onload = () => resolve(!!(window.lucide && window.lucide.icons));
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });

    return lucideScriptPromise;
  }

  function ensureLucideReady() {
    if (legacyOnlyMode) return;
    if (window.lucide && window.lucide.icons) return;
    loadLucideRuntime().then((ready) => {
      if (ready) {
        queueIconApply(document);
      }
    });

    if (lucideWaitTimer) return;

    let attempts = 0;
    lucideWaitTimer = setInterval(() => {
      attempts += 1;

      if (window.lucide && window.lucide.icons) {
        clearInterval(lucideWaitTimer);
        lucideWaitTimer = null;
        queueIconApply(document);
        return;
      }

      if (attempts >= 160) {
        clearInterval(lucideWaitTimer);
        lucideWaitTimer = null;
      }
    }, 50);
  }

  function initObserver() {
    if (observer || !document.body) return;

    const mayContainIcons = (node) => {
      if (!node || node.nodeType !== 1) return false;
      if (isPotentialIconElement(node)) return true;
      if (typeof node.querySelector === "function") {
        return !!node.querySelector(ICON_CANDIDATE_SELECTOR);
      }
      return false;
    };

    observer = new MutationObserver((mutations) => {
      if (applyInProgress) return;

      for (let i = 0; i < mutations.length; i += 1) {
        const mutation = mutations[i];

        if (mutation.type === "childList") {
          for (let j = 0; j < mutation.addedNodes.length; j += 1) {
            const node = mutation.addedNodes[j];
            if (mayContainIcons(node)) {
              queueIconApply(node);
            }
          }
        }

        if (
          mutation.type === "attributes" &&
          mutation.target &&
          mayContainIcons(mutation.target)
        ) {
          queueIconApply(mutation.target);
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-lucide"],
    });
  }

  function setIconPalette(paletteName) {
    const nextPalette = ICON_PALETTES.has(paletteName) ? paletteName : "ocean";
    document.documentElement.setAttribute("data-icon-palette", nextPalette);

    try {
      localStorage.setItem("icon-palette", nextPalette);
    } catch (err) {
      // no-op
    }

    queueIconApply(document);
    return nextPalette;
  }

  function initPalette() {
    let stored = "";
    try {
      stored = localStorage.getItem("icon-palette") || "";
    } catch (err) {
      stored = "";
    }
    setIconPalette(stored || "ocean");
  }

  window.applyModernIcons = function (root) {
    queueIconApply(root || document);
  };

  window.setIconPalette = setIconPalette;

  window.setModernIcon = function (target, iconName) {
    if (!target || !iconName) return;
    target.setAttribute("data-lucide", iconName);
    queueIconApply(target);
  };

  function bootstrap() {
    initPalette();

    shouldPreferLegacyIcons()
      .then((preferLegacy) => {
        if (preferLegacy) {
          enableLegacyOnlyMode();
          return;
        }

        ensureLucideReady();
        queueIconApply(document);

        // A second pass after full page load catches late-initialized modal markup.
        window.addEventListener(
          "load",
          function () {
            queueIconApply(document);
          },
          { once: true },
        );

        setTimeout(function () {
          queueIconApply(document);
        }, 1200);

        initObserver();
      })
      .catch(() => {
        ensureLucideReady();
        queueIconApply(document);
        initObserver();
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
