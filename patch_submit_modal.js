const fs = require("fs");

const path = "client/js/modules/quiz.js";
let code = fs.readFileSync(path, "utf8");

// Use SweetAlert to show the modal when submit finishes
code = code.replace(
  /        document\.getElementById\('quiz-container'\)\.classList\.add\('hidden'\);\n        document\.getElementById\('results-screen'\)\.classList\.remove\('hidden'\);/,
  `        document.getElementById('quiz-container').classList.add('hidden');
        document.getElementById('results-screen').classList.remove('hidden');
        
        // Show result modal
        if (window.Swal) {
            Swal.fire({
                title: 'انتهى الاختبار!',
                html: \`لقد حصلت على <b>\$\{state.score\}</b> من <b>\$\{state.totalQuestions\}</b>\`,
                icon: 'success',
                confirmButtonText: 'مراجعة الإجابات',
                confirmButtonColor: '#007bff',
                allowOutsideClick: false
            });
        }
`,
);

// We need to also make sure that when reviewing answers, correct/incorrect is shown.
// However, the current code renders correct/incorrect ON THE RESULTS SCREEN if we render it there.
// Actually, `results-screen` usually has a button to review. But wait, `renderQuestion` handles `quiz-container`. How do they review? Let's check `client/index.html` structure.

fs.writeFileSync(path, code);
