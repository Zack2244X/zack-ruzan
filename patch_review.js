const fs = require('fs');
const path = 'client/js/modules/quiz.js';
let code = fs.readFileSync(path, 'utf8');

code += `\n
window.reviewQuiz = function() {
    state.isReviewMode = true;
    
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-container').classList.remove('hidden');
    
    // Hide timer
    const timerDisplayEl = document.getElementById('timer-display');
    if (timerDisplayEl) timerDisplayEl.classList.add('hidden');
    
    // Disable submit
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.textContent = 'إنهاء المراجعة';
        submitBtn.onclick = () => window.exitToMain();
    }
    
    state.currentQuestionIndex = 0;
    renderReviewQuestion();
};

function renderReviewQuestion() {
    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
    document.getElementById('current-question-number').textContent = state.currentQuestionIndex + 1;
    document.getElementById('question-text').innerHTML = \`<span class="quiz-question-gradient">\$\{state.currentQuestionIndex + 1\}. \$\{currentQ.question\}</span>\`;
    const hintEl = document.getElementById('question-hint');
    if (currentQ.hint) {
        hintEl.innerHTML = \`<span class="font-bold">تلميح:</span> \$\{currentQ.hint\}\`;
        hintEl.classList.remove('hidden');
    } else {
        hintEl.classList.add('hidden');
    }

    const previousBtn = document.getElementById('previous-btn');
    const nextBtn = document.getElementById('next-btn');
    const submitBtn = document.getElementById('submit-btn');

    previousBtn.disabled = state.currentQuestionIndex === 0;

    if (state.currentQuestionIndex === state.totalQuestions - 1) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }

    // Set next and previous cleanly for review mode
    nextBtn.onclick = () => {
        if (state.currentQuestionIndex < state.totalQuestions - 1) {
            state.currentQuestionIndex++;
            renderReviewQuestion();
        }
    };

    previousBtn.onclick = () => {
        if (state.currentQuestionIndex > 0) {
            state.currentQuestionIndex--;
            renderReviewQuestion();
        }
    };
    
    // ensure it is enabled in review
    nextBtn.disabled = false;

    const optContainer = document.getElementById('options-container');
    optContainer.innerHTML = '';
    
    const ans = state.userAnswers[state.currentQuestionIndex];
    const selectedIdx = ans ? ans.selectedIndex : -1;

    currentQ.answerOptions.forEach((option, index) => {
        const optionEl = document.createElement('div');
        optionEl.className = 'answer-option p-4 border-2 border-gray-300 rounded-xl m-1 font-medium text-arabic';
        optionEl.textContent = option.text;

        // No clicking in review mode
        optionEl.onclick = null;
        
        if (option.isCorrect) {
            optionEl.classList.add('correct-answer');
            optionEl.style.backgroundColor = '#d4edda';
            optionEl.style.borderColor = '#28a745';
        }
        
        if (index === selectedIdx && !option.isCorrect) {
            optionEl.classList.add('incorrect-answer');
            optionEl.style.backgroundColor = '#f8d7da';
            optionEl.style.borderColor = '#dc3545';
        }
        
        optContainer.appendChild(optionEl);
    });
}
`;

fs.writeFileSync(path, code);
