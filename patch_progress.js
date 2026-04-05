const fs = require('fs');

const path = 'client/js/modules/quiz.js';
let code = fs.readFileSync(path, 'utf8');

// Patch showCustomExitModal
code = code.replace(
  /document\.getElementById\('exit-ok-btn'\)\.onclick = \(\) => \{[\s\S]*?modal\.remove\(\);/m,
  `document.getElementById('exit-ok-btn').onclick = async () => {
        const exitBtn = document.getElementById('exit-ok-btn');
        exitBtn.textContent = 'جارٍ الحفظ...';
        exitBtn.disabled = true;

        try {
            const quizId = getQuizId(state.currentQuizData);
            if (quizId) {
                await apiCall('POST', '/api/attempts/progress', {
                    quizId: String(quizId),
                    answers: state.userAnswers,
                    timeRemaining: state.timeRemaining,
                    currentQuestionIndex: state.currentQuestionIndex
                });
            }
        } catch(e) {
            console.error('Failed to save progress', e);
        }

        modal.remove();`
);

// Patch playQuiz signature
code = code.replace(/export function playQuiz\(index\) \{/, 'export async function playQuiz(index) {');

// Inject progress loading before initializeQuiz()
code = code.replace(
    /    \/\/ 7\. بدء الاختبار\n    initializeQuiz\(\);/,
    `    // 7. استعادة التقدم إن وجد
    try {
        const progressObj = await apiCall('GET', \`/api/attempts/progress/\$\{quizId\}\`);
        if (progressObj && progressObj.timeRemaining !== null && progressObj.answers && progressObj.answers.length > 0) {
            console.log('Restoring progress', progressObj);
            
            // Validate length matches
            if (progressObj.answers.length === state.totalQuestions) {
                state.userAnswers = progressObj.answers;
                state.timeRemaining = progressObj.timeRemaining;
                state.currentQuestionIndex = progressObj.currentQuestionIndex || 0;
            }
        }
    } catch(e) {
        console.error('Failed to load progress', e);
    }

    // 8. بدء الاختبار
    initializeQuiz();`
);

fs.writeFileSync(path, code);
