const fs = require('fs');
let code = fs.readFileSync('client/js/modules/quiz.js', 'utf8');

code = code.replace(/if \(state\.userAnswers\[state\.currentQuestionIndex\] !== null\) \{\s*const \{ selectedIndex, isCorrect \} = state\.userAnswers\[state\.currentQuestionIndex\];\s*disableOptions\(\);\s*if \(index === selectedIndex\) optionEl\.classList\.add\('selected', isCorrect \? 'correct-answer' : 'incorrect-answer'\);\s*if \(option\.isCorrect\) optionEl\.classList\.add\('correct-answer'\);\s*\}/g, `if (state.userAnswers[state.currentQuestionIndex] !== null) {
            const { selectedIndex } = state.userAnswers[state.currentQuestionIndex];
            disableOptions();
            if (index === selectedIndex) {
                optionEl.classList.add('selected');
                optionEl.style.borderColor = '#007bff';
                optionEl.style.backgroundColor = '#e6f2ff';
            }
        }`);

// Remove the feedback rendering
code = code.replace(/if \(state\.userAnswers\[state\.currentQuestionIndex\] !== null\) \{\s*const \{ isCorrect, rationale, feedbackMessage \} = state\.userAnswers\[state\.currentQuestionIndex\];\s*showFeedback\(isCorrect, rationale, feedbackMessage\);\s*\}/g, `// Feedback disabled in normal running`);

// Remove hiding feedback
code = code.replace(/if \(state\.userAnswers\[state\.currentQuestionIndex\] === null\) hideFeedback\(\);/g, `hideFeedback();`);

fs.writeFileSync('client/js/modules/quiz.js', code);
