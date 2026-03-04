/**
 * @module builder
 * @description وحدة بناء الاختبارات — إنشاء، تعديل، استيراد الأسئلة
 */
import state from './state.js';
import { escapeHtml, showAlert, shuffleArray, logFunctionStatus } from './helpers.js';
import { apiCall } from './api.js';
import { closeAdminSheet, closeBottomSheet, _showThemeToggle } from './navigation.js';

/**
 * فتح نافذة بناء اختبار جديد — تصفير الواجهة للخطوة 1
 */
export function openCreateSection() {
    logFunctionStatus('openCreateSection', false);
    closeAdminSheet();
    closeBottomSheet();
    _showThemeToggle(false);
    document.getElementById('create-section-modal').classList.remove('hidden');

    // تصفير الواجهة للخطوة 1
    document.getElementById('builder-step-1').classList.remove('hidden');
    document.getElementById('builder-step-2').classList.add('hidden');
    document.getElementById('btn-to-step-2').classList.remove('hidden');
    document.getElementById('btn-save-final').classList.add('hidden');
    document.getElementById('builder-subtitle').innerText = 'الخطوة 1: الإعدادات الأساسية';

    document.getElementById('new-q-title').value = '';
    document.getElementById('new-q-time').value = '';
    document.getElementById('new-q-desc').value = '';
    state.quizDraft = null;
}

/**
 * إغلاق نافذة بناء الاختبار
 */
export function closeCreateSection() {
    logFunctionStatus('closeCreateSection', false);
    document.getElementById('create-section-modal').classList.add('hidden');
    _showThemeToggle(true);
}

/**
 * التحقق من العنوان والمادة ثم إنشاء المسودة والانتقال للخطوة 2
 */
export function goToBuilderStep2() {
    logFunctionStatus('goToBuilderStep2', false);
    const title = document.getElementById('new-q-title').value.trim();
    const subject = document.getElementById('new-q-subject').value;

    if (!title) { showAlert('⚠️ يجب إدخال عنوان للامتحان للبدء!', 'warning'); return; }
    if (!subject) { showAlert('⚠️ يجب اختيار مادة للامتحان للبدء!', 'warning'); return; }

    const closingMsg = document.getElementById('new-q-closing-msg').value.trim() || 'شكراً لمشاركتك في الاختبار!';

    if (!state.quizDraft) {
        state.quizDraft = {
            config: {
                id: 'quiz-' + Date.now(),
                title,
                subject,
                description: document.getElementById('new-q-desc').value.trim() || '',
                timeLimit: (parseInt(document.getElementById('new-q-time').value) || 30) * 60,
                streakGoal: 3,
                language: 'ar',
                closingMessage: closingMsg,
                feedback: {
                    correct: { message: 'ماشاء الله! إجابة صحيحة.', onStreak: 'أحسنت! سلسلة متتالية من الإجابات الصحيحة!' },
                    incorrect: { message: 'للأسف، الإجابة غير صحيحة.' }
                }
            },
            questions: [
                { question: '', hint: '', answerOptions: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }] }
            ]
        };
    } else {
        state.quizDraft.config.title = title;
        state.quizDraft.config.subject = subject;
        state.quizDraft.config.closingMessage = closingMsg;
        state.quizDraft.config.timeLimit = (parseInt(document.getElementById('new-q-time').value) || 30) * 60;
        state.quizDraft.config.description = document.getElementById('new-q-desc').value.trim() || '';
    }

    state.bCurrentQIndex = 0;
    document.getElementById('builder-step-1').classList.add('hidden');
    document.getElementById('builder-step-2').classList.remove('hidden');
    document.getElementById('btn-to-step-2').classList.add('hidden');
    document.getElementById('btn-save-final').classList.remove('hidden');
    document.getElementById('builder-subtitle').innerText = 'الخطوة 2: إضافة الأسئلة وتحديد الإجابات';

    renderBuilderQuestion();
}

/**
 * رسم السؤال الحالي في واجهة البناء مع الخيارات وأزرار الراديو
 */
export function renderBuilderQuestion() {
    logFunctionStatus('renderBuilderQuestion', false);
    const q = state.quizDraft.questions[state.bCurrentQIndex];
    document.getElementById('b-current-num').innerText = state.bCurrentQIndex + 1;
    document.getElementById('b-total-num').innerText = state.quizDraft.questions.length;
    document.getElementById('b-question-text').value = q.question;
    document.getElementById('b-question-hint').value = q.hint;

    const optsContainer = document.getElementById('b-options-container');
    optsContainer.innerHTML = '';
    let optsHtml = '';
    q.answerOptions.forEach((opt, idx) => {
        optsHtml += `
            <div class="flex items-center gap-4 p-4 border-2 ${opt.isCorrect ? 'border-green-400 bg-green-50 shadow-sm' : 'border-gray-200 bg-white'} rounded-xl transition group">
                <input type="radio" name="b-correct" onchange="setBuilderCorrectOption(${idx})" ${opt.isCorrect ? 'checked' : ''} class="w-6 h-6 cursor-pointer accent-green-600">
                <input type="text" value="${escapeHtml(opt.text)}" onblur="updateBuilderOptionText(${idx}, this.value)" placeholder="اكتب خيار الإجابة هنا..." class="flex-1 bg-transparent outline-none font-medium text-gray-800 placeholder-gray-400 text-lg">
                <button onclick="removeBuilderOption(${idx})" class="w-10 h-10 flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg hover:bg-red-100 hover:text-red-500 transition"><i class="fas fa-trash"></i></button>
            </div>
        `;
    });
    optsContainer.innerHTML = optsHtml;

    document.getElementById('b-prev-btn').disabled = (state.bCurrentQIndex === 0);
    document.getElementById('b-next-btn').disabled = (state.bCurrentQIndex === state.quizDraft.questions.length - 1);
}

/**
 * حفظ بيانات السؤال الحالي من الواجهة إلى المسودة
 */
export function updateBuilderData() {
    logFunctionStatus('updateBuilderData', false);
    if (!state.quizDraft) return;
    const q = state.quizDraft.questions[state.bCurrentQIndex];
    q.question = document.getElementById('b-question-text').value;
    q.hint = document.getElementById('b-question-hint').value;
}

/**
 * تحديث نص خيار محدد في السؤال الحالي
 * @param {number} idx — فهرس الخيار
 * @param {string} val — النص الجديد
 */
export function updateBuilderOptionText(idx, val) {
    logFunctionStatus('updateBuilderOptionText', false);
    state.quizDraft.questions[state.bCurrentQIndex].answerOptions[idx].text = val;
}

/**
 * تعيين الخيار الصحيح بفهرسه في السؤال الحالي
 * @param {number} idx — فهرس الخيار الصحيح
 */
export function setBuilderCorrectOption(idx) {
    logFunctionStatus('setBuilderCorrectOption', false);
    state.quizDraft.questions[state.bCurrentQIndex].answerOptions.forEach((o, i) => o.isCorrect = (i === idx));
    renderBuilderQuestion();
}

/**
 * إضافة خيار جديد فارغ للسؤال الحالي
 */
export function addBuilderOption() {
    logFunctionStatus('addBuilderOption', false);
    state.quizDraft.questions[state.bCurrentQIndex].answerOptions.push({ text: '', isCorrect: false });
    renderBuilderQuestion();
}

/**
 * حذف خيار من السؤال الحالي (بحد أدنى خيارين)
 * @param {number} idx — فهرس الخيار المراد حذفه
 */
export function removeBuilderOption(idx) {
    logFunctionStatus('removeBuilderOption', false);
    const q = state.quizDraft.questions[state.bCurrentQIndex];
    if (q.answerOptions.length > 2) {
        q.answerOptions.splice(idx, 1);
        if (!q.answerOptions.some(o => o.isCorrect)) q.answerOptions[0].isCorrect = true;
        renderBuilderQuestion();
    } else {
        showAlert('⚠️ يجب أن يحتوي السؤال على خيارين على الأقل!', 'warning');
    }
}

/**
 * إضافة سؤال جديد فارغ إلى المسودة
 */
export function addBuilderQuestion() {
    logFunctionStatus('addBuilderQuestion', false);
    updateBuilderData();
    state.quizDraft.questions.push({
        question: '', hint: '', answerOptions: [{ text: '', isCorrect: true }, { text: '', isCorrect: false }]
    });
    state.bCurrentQIndex = state.quizDraft.questions.length - 1;
    renderBuilderQuestion();
}

/**
 * التنقل بين أسئلة المسودة
 * @param {number} dir — الاتجاه (+1 تالي، -1 سابق)
 */
export function navBuilderQuestion(dir) {
    logFunctionStatus('navBuilderQuestion', false);
    updateBuilderData();
    state.bCurrentQIndex += dir;
    renderBuilderQuestion();
}

/**
 * حفظ المسودة كاختبار جديد على السيرفر وإضافته للمصفوفة المحلية
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} renderDashboard — دالة رسم لوحة التحكم
 */
export async function saveBuiltQuiz(renderHistoryTree, renderEditTree, renderDashboard) {
    logFunctionStatus('saveBuiltQuiz', true);
    updateBuilderData();

    for (let i = 0; i < state.quizDraft.questions.length; i++) {
        if (!state.quizDraft.questions[i].question.trim()) {
            showAlert(`⚠️ السؤال رقم ${i + 1} فارغ! يرجى كتابته قبل الحفظ.`, 'warning');
            state.bCurrentQIndex = i;
            renderBuilderQuestion();
            return;
        }
    }

    try {
        const saved = await apiCall('POST', '/api/quizzes', {
            title: state.quizDraft.config.title,
            subject: state.quizDraft.config.subject,
            description: state.quizDraft.config.description || '',
            timeLimit: state.quizDraft.config.timeLimit,
            closingMessage: state.quizDraft.config.closingMessage || '',
            questions: state.quizDraft.questions
        });

        const serverQuiz = saved.quiz || saved;
        const serverId = serverQuiz.id;
        state.quizDraft.id = serverId;
        state.quizDraft.config.id = serverId;
        // تحديث الأسئلة بالـ UUIDs اللي السيرفر أضافها — ضروري لحساب الدرجة صح
        if (serverQuiz.questions) {
            state.quizDraft.questions = serverQuiz.questions;
        }
        state.allQuizzes.push(state.quizDraft);

        console.log(`[saveQuiz] ✓ تم الحفظ على السيرفر — ID: ${serverId}, العنوان: "${state.quizDraft.config.title}", أسئلة بـ UUID: ${!!serverQuiz.questions}`);
        showAlert('✅ تم بناء الاختبار وحفظه بنجاح!');
    } catch (e) {
        console.error(`[saveQuiz] ✗ فشل الحفظ على السيرفر:`, e.message);
        state.allQuizzes.push(state.quizDraft);
        showAlert('⚠️ تعذر الحفظ على السيرفر: ' + e.message, 'warning');
    }

    closeCreateSection();
    renderHistoryTree();
    renderEditTree();
    renderDashboard();
}

/**
 * تحميل اختبار موجود للتعديل داخل واجهة البناء
 * @param {number} index — فهرس الاختبار في allQuizzes
 */
export function loadQuizIntoBuilder(index) {
    logFunctionStatus('loadQuizIntoBuilder', false);
    document.getElementById('edit-selection-modal').classList.add('hidden');

    openCreateSection();

    const qData = state.allQuizzes[index];
    state.quizDraft = JSON.parse(JSON.stringify(qData));

    document.getElementById('new-q-title').value = qData.config.title;
    document.getElementById('new-q-subject').value = qData.config.subject || '';
    document.getElementById('new-q-time').value = qData.config.timeLimit / 60;
    document.getElementById('new-q-desc').value = qData.config.description || '';
    document.getElementById('new-q-closing-msg').value = qData.config.closingMessage || '';

    const saveBtn = document.getElementById('btn-save-final');
    saveBtn.innerText = 'حفظ التعديلات';
    saveBtn.onclick = function () {
        window.updateExistingQuiz(index);
    };
}

/**
 * تحديث اختبار موجود على السيرفر والمصفوفة المحلية
 * @param {number} index — فهرس الاختبار في allQuizzes
 * @param {Function} renderHistoryTree — دالة رسم الشجرة الرئيسية
 * @param {Function} renderEditTree — دالة رسم شجرة التعديل
 * @param {Function} renderDashboard — دالة رسم لوحة التحكم
 */
export async function updateExistingQuiz(index, renderHistoryTree, renderEditTree, renderDashboard) {
    logFunctionStatus('updateExistingQuiz', true);
    updateBuilderData();

    for (let i = 0; i < state.quizDraft.questions.length; i++) {
        if (!state.quizDraft.questions[i].question.trim()) {
            showAlert(`⚠️ السؤال رقم ${i + 1} فارغ! يرجى كتابته قبل الحفظ.`, 'warning');
            state.bCurrentQIndex = i;
            renderBuilderQuestion();
            return;
        }
    }

    const quizId = state.allQuizzes[index].id || state.allQuizzes[index].config?.id;
    console.log(`[updateQuiz] بدء تحديث الامتحان — ID: ${quizId}, العنوان: "${state.quizDraft.config.title}"`);
    try {
        const saved = await apiCall('PUT', '/api/quizzes/' + quizId, {
            title: state.quizDraft.config.title,
            subject: state.quizDraft.config.subject,
            description: state.quizDraft.config.description || '',
            timeLimit: state.quizDraft.config.timeLimit,
            closingMessage: state.quizDraft.config.closingMessage || '',
            questions: state.quizDraft.questions,
            isActive: true
        });
        // تحديث الأسئلة بالـ UUIDs اللي السيرفر أضافها
        const serverQuiz = saved.quiz || saved;
        if (serverQuiz.questions) {
            state.quizDraft.questions = serverQuiz.questions;
        }
        console.log(`[updateQuiz] ✓ تم التحديث على السيرفر — ID: ${quizId}, أسئلة بـ UUID: ${!!serverQuiz.questions}`);
        showAlert('✅ تم تحديث الامتحان بنجاح!');
    } catch (e) {
        console.error(`[updateQuiz] ✗ فشل التحديث:`, e.message);
        showAlert('⚠️ تعذر التحديث على السيرفر: ' + e.message, 'warning');
    }

    state.allQuizzes[index] = state.quizDraft;
    closeCreateSection();
    if (renderHistoryTree) renderHistoryTree();
    if (renderEditTree) renderEditTree();
    if (renderDashboard) renderDashboard();

    const saveBtn = document.getElementById('btn-save-final');
    saveBtn.innerText = 'حفظ الامتحان في السجل';
    saveBtn.onclick = null;
}

/**
 * تفعيل نقرة حقل ملف الاستيراد
 */
export function triggerImportExamFile() {
    logFunctionStatus('triggerImportExamFile', false);
    const input = document.getElementById('import-exam-file');
    if (input) input.click();
}

/**
 * إعادة توزيع الإجابات عشوائياً في المسودة مع الحفاظ على الصحيح
 */
export function reshuffleImportedAnswers() {
    logFunctionStatus('reshuffleImportedAnswers', false);
    if (!state.quizDraft || !state.quizDraft.questions || !state.quizDraft.questions.length) {
        showAlert('⚠️ لا توجد أسئلة لإعادة توزيع الإجابات بعد. استورد ملف أولاً.', 'warning');
        return;
    }
    state.quizDraft.questions.forEach(q => shuffleOptionsPreserveCorrect(q));
    balanceCorrectLetters(state.quizDraft.questions);
    state.bCurrentQIndex = 0;
    renderBuilderQuestion();
    showAlert('✅ تم إعادة توزيع الإجابات مع الحفاظ على الصح وضبط تكرار الحروف.');
}

/**
 * معالجة تغيير حقل ملف الاستيراد (TXT أو PDF)
 * @param {Event} event — حدث تغيير حقل الملف
 */
export async function handleImportFileChange(event) {
    logFunctionStatus('handleImportFileChange', false);
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        let text = '';
        const name = file.name.toLowerCase();
        if (file.type === 'text/plain' || name.endsWith('.txt')) {
            text = await file.text();
        } else if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
            if (!window.pdfjsLib) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js';
                    s.onload = resolve;
                    s.onerror = () => reject(new Error('تعذر تحميل مكتبة قراءة PDF'));
                    document.head.appendChild(s);
                });
            }
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';
            text = await extractTextFromPdf(file);
        } else {
            throw new Error('صيغة الملف غير مدعومة. استخدم TXT أو PDF.');
        }

        const parsedQuestions = parseIconQuestions(text);
        if (!parsedQuestions.length) throw new Error('لم يتم العثور على أسئلة بصيغة أيكن.');

        applyImportedQuestions(parsedQuestions);
        showAlert(`✅ تم استيراد ${parsedQuestions.length} سؤالاً مع خلط الإجابات وضبط تكرار الحروف.`);
    } catch (err) {
        showAlert('⚠️ تعذر استيراد الملف: ' + (err.message || err), 'error');
    } finally {
        event.target.value = '';
    }
}

/**
 * استخراج النص من ملف PDF باستخدام pdfjsLib
 * @param {File} file — ملف PDF
 * @returns {Promise<string>} النص المستخرج
 */
export async function extractTextFromPdf(file) {
    logFunctionStatus('extractTextFromPdf', false);
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

/**
 * تحليل نص بصيغة Aiken واستخراج الأسئلة
 * @param {string} rawText — النص الخام
 * @returns {Array<Object>} مصفوفة الأسئلة المستخرجة
 */
export function parseIconQuestions(rawText) {
    logFunctionStatus('parseIconQuestions', false);
    const lines = rawText.replace(/\r/g, '').split(/\n+/).map(l => l.trim()).filter(Boolean);
    const questions = [];
    let current = null;
    const questionRegex = /^Q\s*\d*\.?\s*(.+)$/i;
    const optionRegex = /^([A-Za-zأ-ي])\s*[).،\.\-:]?\s*(.+)$/;

    const pushCurrent = () => {
        if (!current) return;
        if (!current.answerOptions.length) return;
        if (!current.answerOptions.some(o => o.isCorrect)) {
            current.answerOptions[0].isCorrect = true;
        }
        questions.push(current);
        current = null;
    };

    lines.forEach(line => {
        const qMatch = line.match(questionRegex);
        if (qMatch) {
            pushCurrent();
            current = { question: qMatch[1].trim(), hint: '', answerOptions: [] };
            return;
        }

        const oMatch = line.match(optionRegex);
        if (current && oMatch) {
            const rawText = oMatch[2].trim();
            const isCorrect = /\*$/.test(rawText);
            const cleanText = rawText.replace(/\*+\s*$/, '').trim();
            current.answerOptions.push({ text: cleanText, isCorrect });
        }
    });
    pushCurrent();

    questions.forEach(q => shuffleOptionsPreserveCorrect(q));
    balanceCorrectLetters(questions);
    return questions;
}

/**
 * خلط خيارات سؤال عشوائياً مع الحفاظ على علامة الإجابة الصحيحة
 * @param {Object} question — كائن السؤال
 */
export function shuffleOptionsPreserveCorrect(question) {
    logFunctionStatus('shuffleOptionsPreserveCorrect', false);
    const options = question.answerOptions.map(o => ({ ...o }));
    const correctOption = options.find(o => o.isCorrect) || options[0];
    shuffleArray(options);
    options.forEach(o => o.isCorrect = (o === correctOption));
    question.answerOptions = options;
}

/**
 * موازنة مواقع الإجابات الصحيحة لتقليل التكرار المتتالي
 * @param {Array<Object>} questions — مصفوفة الأسئلة
 * @param {number} [maxRepeat=2] — الحد الأقصى للتكرار المتتالي
 */
export function balanceCorrectLetters(questions, maxRepeat = 2) {
    logFunctionStatus('balanceCorrectLetters', false);
    let lastLetter = null;
    let repeatCount = 0;
    questions.forEach(q => {
        let correctIdx = q.answerOptions.findIndex(o => o.isCorrect);
        if (correctIdx === -1) { q.answerOptions[0].isCorrect = true; correctIdx = 0; }
        let letter = String.fromCharCode(65 + correctIdx);
        if (letter === lastLetter) {
            repeatCount++;
            if (repeatCount > maxRepeat) {
                const swapIdx = q.answerOptions.findIndex((_, idx) => idx !== correctIdx);
                if (swapIdx >= 0) {
                    [q.answerOptions[correctIdx], q.answerOptions[swapIdx]] = [q.answerOptions[swapIdx], q.answerOptions[correctIdx]];
                    correctIdx = swapIdx;
                    letter = String.fromCharCode(65 + correctIdx);
                    repeatCount = 1;
                }
            }
        } else {
            repeatCount = 1;
        }
        lastLetter = letter;
    });
}

/**
 * تطبيق الأسئلة المستوردة على واجهة البناء
 * @param {Array<Object>} importedQuestions — مصفوفة الأسئلة المستوردة
 */
export function applyImportedQuestions(importedQuestions) {
    logFunctionStatus('applyImportedQuestions', false);
    const title = document.getElementById('new-q-title').value.trim();
    const subject = document.getElementById('new-q-subject').value;
    if (!title) { showAlert('⚠️ يجب إدخال عنوان للامتحان للبدء!', 'warning'); return; }
    if (!subject) { showAlert('⚠️ يجب اختيار مادة للامتحان للبدء!', 'warning'); return; }

    const closingMsg = document.getElementById('new-q-closing-msg').value.trim() || 'شكراً لمشاركتك في الاختبار!';
    const desc = document.getElementById('new-q-desc').value.trim() || '';
    const timeLimit = (parseInt(document.getElementById('new-q-time').value) || 30) * 60;

    state.quizDraft = {
        config: {
            id: 'quiz-' + Date.now(),
            title,
            subject,
            description: desc,
            timeLimit,
            streakGoal: 3,
            language: 'ar',
            closingMessage: closingMsg,
            feedback: {
                correct: { message: 'ماشاء الله! إجابة صحيحة.', onStreak: 'أحسنت! سلسلة متتالية من الإجابات الصحيحة!' },
                incorrect: { message: 'للأسف، الإجابة غير صحيحة.' }
            }
        },
        questions: importedQuestions
    };

    state.bCurrentQIndex = 0;
    document.getElementById('builder-step-1').classList.add('hidden');
    document.getElementById('builder-step-2').classList.remove('hidden');
    document.getElementById('btn-to-step-2').classList.add('hidden');
    document.getElementById('btn-save-final').classList.remove('hidden');
    document.getElementById('builder-subtitle').innerText = 'الخطوة 2: إضافة الأسئلة وتحديد الإجابات';

    renderBuilderQuestion();
}
