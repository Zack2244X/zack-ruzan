# ⚡ CHECKLIST سريع لأي مشروع جديد

## 📋 المرحلة 1: الإعداد الأولي (30 دقيقة)

### الملفات الأساسية
- [ ] انسخ `HTML-TEMPLATE.html` → `index.html`
- [ ] انسخ `CSS-TEMPLATE.css` → `assets/css/main.css`
- [ ] انسخ `JS-TEMPLATE.js` → `assets/js/main.js`

### Meta Tags و SEO
- [ ] غير `<title>` بـ اسم المشروع
- [ ] اكتب `<meta name="description">`
- [ ] أضف `og:image` للمشاركة
- [ ] ضع `theme-color` بـ لون المشروع الرئيسي

---

## 🎨 المرحلة 2: التخصيص (15 دقيقة)

### CSS Variables (الألوان)
```css
:root {
    --primary-600: #YOUR_COLOR;      /* changing this changes everything */
    --secondary-600: #YOUR_COLOR;
    --success: #YOUR_COLOR;
    --warning: #YOUR_COLOR;
    --error: #YOUR_COLOR;
}
```

**✅ Just change these 5 colors and you're done!**

### CSS Variables (اختياري)
- [ ] غير الخط (`--font-family`)
- [ ] اضبط border-radius إذا أردت (--radius-*)
- [ ] اضبط spacing إذا أردت (--space-*)

---

## 📝 المرحلة 3: المحتوى (30 دقيقة)

### استبدل الأقسام:

```html
<!-- استبدل Hero Section -->
<section id="home" class="hero section">
    <h1>محتواك هنا</h1>
    <p>الوصف</p>
    <button class="btn btn-primary">CTA</button>
</section>

<!-- استبدل Content Cards -->
<div class="grid grid-cols-3">
    <article class="card">
        <h3>Heading</h3>
        <p>Content</p>
    </article>
</div>

<!-- استبدل Contact Section -->
<section class="section">
    <form class="contact-form">
        <!-- استخدم form-group و form-input -->
    </form>
</section>
```

### صور الموقع
- [ ] ضع logo.svg في `/images/`
- [ ] ضع favicon.jpg
- [ ] ضع hero.jpg (الصورة الرئيسية)
- [ ] ضع og-image.jpg (للمشاركة)

---

## ✅ المرحلة 4: الاختبَار (30 دقيقة)

### Device Testing
- [ ] اختبر على mobile (Chrome DevTools)
- [ ] اختبر على tablet (768px)
- [ ] اختبر على desktop (1200px+)

### Browser Testing
- [ ] Chrome / Edge
- [ ] Firefox
- [ ] Safari (إذا كنت على Mac)

### Performance Testing
- [ ] افتح DevTools → Lighthouse
- [ ] اضغط Generate Report
- [ ] **الهدف: جميع القيم > 90**

### Accessibility Testing
- [ ] اضغط Tab (يجب أن يرى outline أزرق)
- [ ] اضغط Enter على الأزرار (يجب أن تشتغل)
- [ ] اختبر Dark Mode (ستلوم الألوان)

### Visual States
- [ ] اختبر Button Hover
- [ ] اختبر Form Focus
- [ ] اختبر Button Disabled
- [ ] اختبر Loading State

---

## 🚀 المرحلة 5: نشر (5 دقائق)

### قبل النشر
- [ ] تأكد من عدم وجود أخطاء في Console (F12)
- [ ] تأكد من عمل جميع الروابط
- [ ] تأكد من تحميل جميع الصور

### نشر الملفات
```bash
# اختر واحدة من:

# 1. نسخ ده مباشرة
scp -r new-project/* user@server:/public_html/

# 2. أو استخدم Git
git push origin main

# 3. أو استخدم FTP من editor
# اضغط Upload
```

---

## 🎯 معايير النجاح

**الموقع جاهز للإنتاج عندما:**

```
✅ Lighthouse Performance: > 90
✅ Lighthouse Accessibility: > 90
✅ جميع الأزرار تشتغل
✅ Form يرسل البيانات
✅ Mobile يعرض صح
✅ Dark mode يعمل
✅ لا توجد console errors
✅ جميع الصور تحمل
```

---

## 🧬 القوالب المرة والمشاريع المعقدة

### موقع تجارة إلكترونية:
```html
<!-- استخدم نفس .card للمنتجات -->
<!-- استخدم نفس .grid للـ layout -->
<!-- أضف slug, category, price بـ data-* -->
```

### تطبيق SPA:
```javascript
// استخدم JavaScript templates في JS-TEMPLATE.js
// أضف router للتنقل بين الصفحات
// استخدم Fetch API للبيانات
```

### مدونة:
```html
<!-- استخدم .card للمقالات -->
<!-- أضف data-date, data-author, data-category -->
<!-- استخدم Lazy Loading للصور -->
```

---

## ⚠️ أخطاء شائعة تجنبها

### ❌ لا تفعل:
```css
/* Slow animations */
animation: moveX 1s;
width: 200px; /* hard to animate */

/* Missing dark mode */
background: white; /* white في dark mode سيء */

/* No responsive */
padding: 100px; /* كبير جداً على mobile */

/* Missing accessibility */
button { outline: none; } /* تعطل الـ Focus */
```

### ✅ افعل:
```css
/* Smooth animations */
animation: moveX 0.3s cubic-bezier(0.4, 0, 0.2, 1);
transform: translateX(200px); /* سريع وسلس */

/* Dark mode built-in */
color: var(--gray-900); /* يتغير صقلياً */

/* Responsive */
padding: var(--space-6); /* يتغير مع الشاشة */

/* Accessible */
button:focus-visible { outline: 2px solid; } /* مرئي */
```

---

## 📱 اختختبار Mobile سريع

**بدون جهاز فعلي:**

1. افتح DevTools (F12)
2. اضغط `Ctrl + Shift + M` (Toggle Device Toolbar)
3. اختر iPhone SE (375px) و اختبر
4. اختر iPad (768px) و اختبر
5. اختر MacBook (1400px+) و اختبر

**النتيجة المتوقعة:** كل حاجة تعرض صح على الأحجام الثلاثة

---

## 💡 نصائح ذهبية

### 🌟 Tip 1: CSS Variables = Magic
غير لون واحد، تتغير الموقع كله!

```css
:root { --primary-600: #ff0000; }
/* جميع الأزرار و الروابط تحمرّ تلقائياً */
```

### 🌟 Tip 2: لا تحذف الـ Comments
Comments في الكود = خريطة الطريق

### 🌟 Tip 3: Test Dark Mode أولاً
إذا شغل في Dark Mode، شغل في Light Mode أكيد

### 🌟 Tip 4: استخدم Browser Extensions
- [WAVE](https://wave.webaim.org/) لـ Accessibility
- [Lighthouse](https://developers.google.com/web/tools/lighthouse) لـ Performance

### 🌟 Tip 5: Mobile First!
اختبر على Mobile أولاً، بعدين Desktop

---

## ⏱️ الوقت المتوقع

| المرحلة | الوقت |
|--------|-------|
| الإعداد | 30 دقيقة |
| التخصيص | 15 دقيقة |
| المحتوى | 30 دقيقة |
| الاختبار | 30 دقيقة |
| النشر | 5 دقائق |
| **الإجمالي** | **~2 ساعة** |

---

## 🔗 روابط مهمة

### Documentation
- [MDN Web Docs](https://developer.mozilla.org/)
- [Can I Use](https://caniuse.com/)
- [Web.dev](https://web.dev/)

### Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WAVE](https://wave.webaim.org/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)

### Images
- [Unsplash](https://unsplash.com/)
- [Pexels](https://www.pexels.com/)
- [Pixabay](https://pixabay.com/)

---

## ✨ تذكيرات أخيرة

> **"البساطة هي الأفضل"**
> لا تحاول أن تجعله معقداً - استخدم القوالب، اترك الباقي للـ CSS

> **"الأداء أولاً"**
> موقع جميل بطيء = موقع سيء
> موقع عادي سريع = موقع جيد

> **"الوصولية 101"**
> أي شخص يقدر يستخدمه = موقع احترافي

> **"التجربة أولا"**
> لا تصدق الشاشة - استخدم الموقع فعلاً

---

**أنت جاهز الآن! ابدأ المشروع! 🚀**

هل عندك سؤال؟ اقرأ `.instructions.md` في المشروع.
