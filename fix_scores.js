const fs = require('fs');

let content = fs.readFileSync('server/routes/scores.js', 'utf-8');

// 1. Remove the old resolveAttemptMeta comment and missing function (from line 85 to 97 approx)
const oldMeta = `// ============================================
//   resolveAttemptMeta — تحديد رقم المحاولة وطبيعتها
// ============================================
/**
 * يحسب رقم المحاولة الحالية ويحدد إن كانت رسمية أم تدريبية.
 * المحاولة الأولى دائماً رسمية (isOfficial = true) وتُحتسب في لوحة الشرف.
 * المحاولات التالية تدريبية (isOfficial = false) ولا تؤثر على الترتيب.
 *
 * @param {number} userId  — معرّف المستخدم
 * @param {number} quizId  — معرّف الاختبار
 * @returns {Promise<{ attemptNumber: number, isOfficial: boolean }>}
 */`;
content = content.replace(oldMeta, '');

// 2. Replace the POST body
const oldPost = `      // 1. تحديد رقم المحاولة وطبيعتها (رسمية أم تدريبية)
      const { attemptNumber, isOfficial } = await resolveAttemptMeta(
        req.user.id,
        quizId,
      );

      // 2. جلب الامتحان
      const quiz = await Quiz.findByPk(quizId);
      if (!quiz) {
        return res.status(404).json({ error: "الامتحان غير موجود." });
      }

      // 3. حساب الدرجة في السيرفر (منع الغش)
      let correctCount = 0;
      const gradedAnswers = [];
      const questions = quiz.questions; // JSON array

      for (const answer of answers) {
        const question = questions.find((q) => q.id === answer.questionId);
        if (!question) continue;

        const selectedOption = question.answerOptions[answer.selectedIndex];
        const isCorrect = selectedOption ? selectedOption.isCorrect : false;

        if (isCorrect) correctCount++;

        gradedAnswers.push({
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          isCorrect,
        });
      }

      // 4. حفظ السجل مع تمييز الرسمية والتدريبية
      const score = await Score.create({
        userId: req.user.id,
        quizId,
        answers: gradedAnswers,
        score: correctCount,
        total: questions.length,
        timeTaken: timeTaken || 0,
        isOfficial, // true للأولى فقط
        attemptNumber, // 1، 2، 3، ...
      });

      logger.info(
        \`[Score] userId=\${req.user.id} quizId=\${quizId}\` +
          \` attempt=\${attemptNumber} isOfficial=\${isOfficial}\` +
          \` score=\${correctCount}/\${questions.length}\`,
      );`;

const newPost = `      // 1. جلب الامتحان
      const quiz = await Quiz.findByPk(quizId);
      if (!quiz) {
        return res.status(404).json({ error: "الامتحان غير موجود." });
      }

      // 2. حساب الدرجة في السيرفر (منع الغش)
      let correctCount = 0;
      const gradedAnswers = [];
      const questions = quiz.questions; // JSON array

      for (const answer of answers) {
        const question = questions.find((q) => q.id === answer.questionId);
        if (!question) continue;

        const selectedOption = question.answerOptions[answer.selectedIndex];
        const isCorrect = selectedOption ? selectedOption.isCorrect : false;

        if (isCorrect) correctCount++;

        gradedAnswers.push({
          questionId: answer.questionId,
          selectedIndex: answer.selectedIndex,
          isCorrect,
        });
      }

      // 3. حفظ السجل مع معالجة Race Condition باستخدام retry loop
      let score = null;
      let attemptNumber = (await Score.count({ where: { userId: req.user.id, quizId } })) + 1;
      let isOfficial = false;
      const maxRetries = 3;

      for (let i = 0; i < maxRetries; i++) {
        try {
          isOfficial = attemptNumber === 1;
          score = await Score.create({
            userId: req.user.id,
            quizId,
            answers: gradedAnswers,
            score: correctCount,
            total: questions.length,
            timeTaken: timeTaken || 0,
            isOfficial,
            attemptNumber,
          });
          break; // نجاح
        } catch (error) {
          if (error.name === 'SequelizeUniqueConstraintError') {
            attemptNumber++;
            continue;
          }
          throw error;
        }
      }

      if (!score) {
        throw new Error(\`Max attempts reached. Could not resolve race condition.\`);
      }

      logger.info(
        \`[Score] userId=\${req.user.id} quizId=\${quizId}\` +
          \` attempt=\${attemptNumber} isOfficial=\${isOfficial}\` +
          \` score=\${correctCount}/\${questions.length}\`,
      );`;

content = content.replace(oldPost, newPost);
fs.writeFileSync('server/routes/scores.js', content, 'utf-8');
