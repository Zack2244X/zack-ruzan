export function setupFocusManagement() {
  const modalSelectors = [
    '#grades-modal', '#admin-sheet', '#bottom-sheet', '#accounts-management-modal',
    '#create-section', '#edit-selection-modal', '#add-note-modal',
    '#global-crash-fallback'
  ];

  let activeModal = null;
  let previousActiveElement = null;

  function trapFocus(e) {
    if (!activeModal) return;
    const focusableEls = activeModal.querySelectorAll('a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]');
    const firstFocusableEl = focusableEls[0];
    const lastFocusableEl = focusableEls[focusableEls.length - 1];

    if (e.key === 'Tab') {
      if (e.shiftKey) { /* shift + tab */
        if (document.activeElement === firstFocusableEl) {
          lastFocusableEl.focus();
          e.preventDefault();
        }
      } else { /* tab */
        if (document.activeElement === lastFocusableEl) {
          firstFocusableEl.focus();
          e.preventDefault();
        }
      }
    } else if (e.key === 'Escape') {
        const closeBtn = activeModal.querySelector('button[aria-label="إغلاق"], button[aria-label="إغلاق إضافة مذكرة"], button[aria-label="إغلاق إنشاء امتحان"]');
        if (closeBtn) closeBtn.click();
    }
  }

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const target = mutation.target;
        if (modalSelectors.includes('#' + target.id) || target.id === 'global-crash-fallback') {
          const isHidden = target.classList.contains('hidden');
          if (!isHidden && activeModal !== target) {
            // Modal opened
            if (!activeModal) previousActiveElement = document.activeElement;
            activeModal = target;
            activeModal.setAttribute('aria-modal', 'true');
            activeModal.setAttribute('role', 'dialog');
            document.addEventListener('keydown', trapFocus);
            // Focus first element
            setTimeout(() => {
                const firstInput = activeModal.querySelector('input:not([disabled]), button:not([disabled])');
                if (firstInput) firstInput.focus();
            }, 50);
          } else if (isHidden && activeModal === target) {
            // Modal closed
            activeModal.removeAttribute('aria-modal');
            activeModal.removeAttribute('role');
            activeModal = null;
            document.removeEventListener('keydown', trapFocus);
            if (previousActiveElement) {
                previousActiveElement.focus();
                previousActiveElement = null;
            }
          }
        }
      }
    });
  });

  const bodyObserver = new MutationObserver((mutations) => {
     mutations.forEach(m => {
        m.addedNodes.forEach(node => {
           if (node.id && modalSelectors.includes('#' + node.id)) {
               observer.observe(node, { attributes: true });
           }
        });
     });
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });

  modalSelectors.forEach(selector => {
    const el = document.querySelector(selector);
    if (el) observer.observe(el, { attributes: true });
  });

  // Observe crash fallback if it appears
}
