const fs = require("fs");

const path = "client/js/modules/quiz.js";
let code = fs.readFileSync(path, "utf8");

// remove immediate toast and feedback logic in selectAnswer
// and just highlight selected
code = code.replace(
  /export function selectAnswer\(selectedIndex\) \{[\s\S]*?nextButton\.disabled = false;\n\}/m,
  `export function selectAnswer(selectedIndex) {
    logFunctionStatus('selectAnswer', false);
    if (state.userAnswers[state.currentQuestionIndex] !== null) return;

    const currentQ = state.currentQuizData.questions[state.currentQuestionIndex];
    const isCorrect = currentQ.answerOptions[selectedIndex].isCorrect;

    // Save answer silently
    state.userAnswers[state.currentQuestionIndex] = { 
        selectedIndex, 
        isCorrect, 
        rationale: '', 
        feedbackMessage: ''
    };

    if (isCorrect) state.score++;

    // Only mark visually as selected, without correct/incorrect colors
    Array.from(optionsContainerEl.children).forEach(el => {
        const index = parseInt(el.getAttribute('data-index'));
        el.classList.remove('selected');
        el.onclick = null; // disable further clicks
        if (index === selectedIndex) {
            el.classList.add('selected'); 
            el.style.borderColor = '#007bff';
            el.style.backgroundColor = '#e6f2ff';
        }
    });

    nextButton.disabled = false;
    // Auto proceed after short delay (optional, let's just let user click next)
}`,
);

// remove start timer warning colors maybe, but let's keep them if time is running out.

// modify initializeQuiz to handle progress
// modify showCustomExitModal
fs.writeFileSync(path, code);
