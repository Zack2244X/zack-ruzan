const fs = require('fs');

const path = 'client/js/modules/quiz.js';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
    /state\.quizStarted          = false;/,
    `state.quizStarted          = false;

    // Reset button from review mode
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.textContent = 'تسليم الاختبار';
        submitBtn.onclick = window.submitQuiz || function() { submitQuiz(); };
    }
`
);

fs.writeFileSync(path, code);
