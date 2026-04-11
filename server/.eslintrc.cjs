module.exports = {
    root: true,
    env: {
        node: true,
        es2022: true,
        jest: true
    },
    extends: ['eslint:recommended'],
    rules: {
        'no-console': 'error'
    },
    overrides: [
        {
            files: ['__tests__/**/*.js', 'utils/test-*.js', 'checkQuizzes.js'],
            rules: {
                'no-console': 'off'
            }
        }
    ]
};
