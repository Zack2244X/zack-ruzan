const sequelize = require('./server/models/index');
const Quiz = require('./server/models/Quiz');
const User = require('./server/models/User');

async function test() {
  try {
    const quiz = await Quiz.create({
      title: 'TEST_QUIZ_' + Date.now(),
      subject: 'Test Subject',
      timeLimit: 1800,
      questions: [{ id: '1', question: 'q', answerOptions: [{text: 'a', isCorrect: true}, {text: 'b', isCorrect: false}] }],
      createdBy: 1
    });
    console.log('Created quiz createdAt: ', quiz.createdAt);
    
    // Now verify findAndCountAll order!
    const { rows } = await Quiz.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit: 2
    });
    console.log('Last quiz returned: ', rows[0].id, rows[0].title, rows[0].createdAt);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
test();
