module.exports = {
  up: async (queryInterface) => {
    await queryInterface.addConstraint('scores', {
      fields: ['userId', 'quizId', 'attemptNumber'],
      type: 'unique',
      name: 'unique_user_quiz_attempt'
    });
  },
  down: async (queryInterface) => {
    await queryInterface.removeConstraint('scores', 'unique_user_quiz_attempt');
  }
};
