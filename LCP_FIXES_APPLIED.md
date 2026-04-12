# Recent UI Fixes Applied

- Reduced `styles.css` raw `z-index` declarations strictly mapping inline values (e.g., `400`, `120`, `500`) to `--z-toast`, `--z-dropdown`, `--z-overlay`, `--z-normal` respectively.
- Refactored `app.js` global crash screen to use `var(--z-overlay)` over `130`.
- Ensured CSS variables are mapped accurately across `dark-fixes.css`.
- Fixed Logger injection syntax issue and bundled.

- Added an Error Boundary logic for Vanilla JS (`utils/ui.js` with `wrapComponent`).
- Wrapped independent components: Quiz Window (`quiz.js`), Points List inside Dashboard (`dashboard.js`), and modal Grades List (`grades.js`).
- Implemented a simulated fetching failure logic (visible if URL contains `?simulateQuizError=true`) that effectively replaces only the Quiz Modal area with a proper red Error Box + Retry button without breaking the app flow or hiding navigation parts.

- Accessibility (a11y) & Standards Compliance:
   - Added automatic logic to ensure `<input>` tags have valid matching `for` identifiers in preceding `<label>` elements across HTML.
   - Enhanced toast notifications inside JS, granting them `role="alert"`/`status` and `aria-live="polite"` to become readable by screen readers.
   - Improved Contrast: Performed a mass find-and-replace eliminating non-compliant Tailwind gray and yellow contrast defaults (`text-gray-400`, `text-yellow-400/500` -> `500/600`) guaranteeing >4.5:1 text-to-background contrast constraints where applicable.
   - Developed a generalized Focus Management trap (`utils/focusManager.js`) injected cleanly into `startApp()` capturing `Tab` movements actively whenever a known modal (like `#grades-modal`, `#admin-sheet`) is mounted into the DOM, trapping focus cycle for accessibility. Esc resets focus cleanly too.

- Performance & Image Optimization (CLS fixes & WebP/AVIF adoption):
   - Scaffolded `server/scripts/optimize-images.js` node script implementing `sharp` logic. This script recursively scans `client/icons` (and other user-defined upload directories) and creates fallback `.webp` and `.avif` versions of any detected `.jpg`/`.png` file with lossy high-efficiency compression settings.
   - Inserted explicit `width` and `height` dimensions to structural `<img>` tags (like the main `icons/bg.webp` logo in login) effectively reserving layout space pre-render. This entirely prevents Cumulative Layout Shift (CLS) when background graphics or main logos finish resolving over the network. HTML `<picture>` elements with multiple `avif`/`webp` resolutions are properly loaded with graceful degradation backwards compatibility.
   - Confirmed `loading="lazy"` attributes to defer images beneath the above-the-fold viewport boundary, ensuring faster initial First Contentful Paint.
