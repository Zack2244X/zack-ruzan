const fs = require('fs');

const path = 'client/js/modules/quiz.js';
let code = fs.readFileSync(path, 'utf8');

// Patch selectAnswer
code = code.replace(
    /export function selectAnswer\(selectedIndex\) \{[\s\S]*?nextButton\.disabled = false;\n(\s*)\}/m,
    `export function selectAnswer(selectedIndex) {
    logFunctionStatus('selectAnswer', false);
    
    // Allow changing answers: remove "if (state.userAnswers !== null) return"

    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
    const isCorrect = currentQ.answerOptions[selectedIndex].isCorrect;

    // Save answer silently
    state.userAnswers[state.currentQuestionIndex] = { 
        selectedIndex, 
        isCorrect, 
        rationale: '', 
        feedbackMessage: ''
    };

    // Calculate score on the fly so we don't accidentally add multiple times if user changes answer
    state.score = state.userAnswers.reduce((acc, ans) => {
        return acc + (ans && ans.isCorrect ? 1 : 0);
    }, 0);

    // Only mark visually as selected, without correct/incorrect colors
    Array.from(optionsContainerEl.children).forEach(el => {
        const index = parseInt(el.getAttribute('data-index'));
        el.classList.remove('selected');
        
        // Reset styles from previous selections
        el.style.borderColor = '';
        el.style.backgroundColor = '';
        el.style.color = '';
        el.style.fontWeight = '';

        if (index === selectedIndex) {
            el.classList.add('selected'); 
            
            // Highlight with vibrant green color (readable in both modes)
            el.style.borderColor = '#10b981'; // Tailwind emerald-500
            el.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'; // transparent emerald
            el.style.color = '#10b981'; 
            el.style.fontWeight = 'bold';
        }
    });

    nextButton.disabled = false;
}`
);

// We need to also patch renderQuestion to not remove onclick handler via disableOptions()
// OR ensure disableOptions() is removed
code = code.replace(/disableOptions\(\);/g, '// disableOptions();');

// In renderQuestion, apply the new style to already selected items:
code = code.replace(
    /if \(index === selectedIndex\) \{\s*optionEl\.classList\.add\('selected'\);\s*optionEl\.style\.borderColor = '#3b82f6';\s*optionEl\.style\.backgroundColor = 'rgba\(59, 130, 246, 0\.15\)';\s*\}/g,
    `if (index === selectedIndex) {
                optionEl.classList.add('selected');
                optionEl.style.borderColor = '#10b981';
                optionEl.style.backgroundColor = 'rgba(16, 185, 129, 0.2)';
                optionEl.style.color = '#10b981';
                optionEl.style.fontWeight = 'bold';
            }`
);

fs.writeFileSync(path, code);
