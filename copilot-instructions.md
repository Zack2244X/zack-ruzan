# Development Standards & Guidelines

## 🎯 Core Principles (Non-Negotiable)

### 1. Smooth User Experience
- All transitions: 200ms - 500ms with cubic-bezier(0.4, 0, 0.2, 1)
- Use transform & opacity only (GPU accelerated)
- Immediate feedback on user interactions
- Graceful degradation on weak devices

### 2. Multi-Device Support
Responsive breakpoints:
- 320px (small phones)
- 480px (large phones)  
- 768px (tablets)
- 1024px (laptops)
- 1200px+ (large screens)

### 3. UI Stability (CLS < 0.1)
- Use aspect-ratio for images
- Preload fonts with font-display: swap
- Skeleton screens for loading
- No unexpected layout shifts

### 4. High Performance Animations
- Target 60 FPS minimum
- No long-running animations
- Disable on slow networks/weak devices
- Respect prefers-reduced-motion

### 5. Accessibility (WCAG 2.1 AA)
- Color contrast ≥ 4.5:1
- Keyboard navigation complete
- Focus indicators visible (2px outline)
- ARIA labels + Alt text
- Heading hierarchy correct

---

## 📁 File Structure

```
assets/
├── css/
│   ├── variables.css      # CSS Custom Properties
│   ├── base.css           # Reset, Typography
│   ├── animations.css     # Keyframes
│   ├── components.css     # Buttons, Forms, Cards
│   ├── responsive.css     # Media Queries
│   ├── accessibility.css  # Focus, Contrast
│   └── dark-mode.css      # Dark Mode Support
├── js/
│   ├── config.js          # Configuration
│   ├── utils.js           # Helpers
│   ├── components/        # JS Components
│   └── app.js             # Entry Point
└── img/ & font/
```

---

## 🎨 CSS Variable Template

```css
:root {
    /* Colors */
    --primary: #3b82f6;
    --secondary: #8b5cf6;
    --success: #10b981;
    --warning: #f59e0b;
    --error: #ef4444;
    
    /* Typography */
    --font-base: system-ui, -apple-system, sans-serif;
    --font-size-base: 16px;
    
    /* Spacing */
    --space-xs: 0.25rem;
    --space-sm: 0.5rem;
    --space-md: 1rem;
    --space-lg: 1.5rem;
    --space-xl: 2rem;
    
    /* Durations */
    --duration-fast: 200ms;
    --duration-normal: 300ms;
    --duration-slow: 500ms;
    --easing: cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: dark) {
    :root {
        color-scheme: dark;
        /* Override colors for dark mode */
    }
}
```

---

## ✅ Required Components

Every project must include:

1. **Buttons**: Primary, Secondary, Outline, Disabled
2. **Forms**: Inputs, Textareas, Selects with validation
3. **Cards**: Consistent styling & spacing
4. **Navigation**: Keyboard accessible
5. **Modals**: Proper focus trap
6. **Alerts**: Success, Error, Warning, Info
7. **Loading**: Spinners & Skeleton screens
8. **Accessibility**: ARIA, Focus management

---

## 🧪 Testing Requirements

### Device Testing
- [ ] Mobile (320px, 480px)
- [ ] Tablet (768px)
- [ ] Desktop (1024px, 1200px+)
- [ ] Multiple browsers

### Performance
- [ ] Lighthouse > 90
- [ ] CPU 4x Throttle
- [ ] Network Throttling (4G/3G)
- [ ] FPS Monitoring

### Accessibility
- [ ] Keyboard navigation only
- [ ] Screen reader (NVDA/JAWS)
- [ ] Color contrast (WCAG AA)
- [ ] Focus indicators visible

### Visual
- [ ] Light & Dark modes
- [ ] All component states (hover, focus, active, disabled)
- [ ] Loading states
- [ ] Error states

---

## 🚀 Development Phases

1. **HTML Structure** → Semantic markup
2. **CSS Foundation** → Variables, base, responsive
3. **Animation Base** → Keyframes, transitions
4. **Components** → Buttons, forms, cards
5. **Interactions** → Hover, focus, active states
6. **Refinement** → Dark mode, polish, optimization
7. **Testing** → All devices, browsers, accessibility
8. **Performance** → Lighthouse audit, optimization

---

## ⚠️ Common Mistakes to Avoid

❌ Animation on width/height → Use transform scale instead
❌ Missing focus styles → WCAG violation
❌ No dark mode consideration → 50% users using dark mode
❌ Animations on every interaction → Annoying UX
❌ Ignoring slow networks → Bad experience for 20% users
❌ Missing ARIA labels → Screen reader inaccessible
❌ Hard-coded colors → Difficult to theme later
❌ No responsive images → Slow on mobile
❌ Layout shift on load → Poor CLS score
❌ No error handling → Crashes look bad

---

## 📊 Performance Budget

- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1
- TTL: < 3s
- Animation Duration: 200ms-500ms
- Total JS: < 100KB (gzipped)
- Total CSS: < 50KB (gzipped)

---

## 🎯 Success Criteria

A project is complete when:
- ✅ All components working on 5+ devices
- ✅ Light + Dark mode fully styled
- ✅ All states (hover, focus, active, disabled) working
- ✅ Animations smooth (60 FPS)
- ✅ Keyboard navigation complete
- ✅ Lighthouse > 90 on all metrics
- ✅ No console errors/warnings
- ✅ Images optimized & responsive
- ✅ Fonts optimized
- ✅ WCAG 2.1 AA compliant
