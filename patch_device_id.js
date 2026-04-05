const fs = require('fs');

// 1. Update quiz.js
let code = fs.readFileSync('client/js/modules/quiz.js', 'utf8');

if (!code.includes('function getClientDeviceId()')) {
    code = `function getClientDeviceId() {
    let id = localStorage.getItem('device_id_progress');
    if (!id) {
        id = 'dev_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('device_id_progress', id);
    }
    return id;
}\n` + code;
}

code = code.replace(
    /const progressObj = await apiCall\('GET', `\/api\/attempts\/progress\/\$\{quizId\}`\);/,
    `const progressObj = await apiCall('GET', \`/api/attempts/progress/\$\{quizId\}?deviceId=\$\{getClientDeviceId()\}\`);`
);

code = code.replace(
    /answers: state\.userAnswers,\n(\s*)timeRemaining: state\.timeRemaining,\n(\s*)currentQuestionIndex: state\.currentQuestionIndex/g,
    `answers: state.userAnswers,
$1timeRemaining: state.timeRemaining,
$2currentQuestionIndex: state.currentQuestionIndex,
$2deviceId: getClientDeviceId()`
);

code = code.replace(
    /await apiCall\('DELETE', `\/api\/attempts\/progress\/\$\{payload\.quizId\}`\);/,
    `await apiCall('DELETE', \`/api/attempts/progress/\$\{payload.quizId\}?deviceId=\$\{getClientDeviceId()\}\`);`
);

fs.writeFileSync('client/js/modules/quiz.js', code);

// 2. Update QuizProgress.js Model
const modelCode = `const { DataTypes } = require('sequelize');
const sequelize = require('./index');

const QuizProgress = sequelize.define('QuizProgress', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    deviceId: {
        type: DataTypes.STRING,
        allowNull: true
    },
    quizId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    answers: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    timeRemaining: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    currentQuestionIndex: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    timestamps: true
});

module.exports = QuizProgress;
`;
fs.writeFileSync('server/models/QuizProgress.js', modelCode);

// 3. Update attempts.js Routes
let attemptsCode = fs.readFileSync('server/routes/attempts.js', 'utf8');
const startIndex = attemptsCode.indexOf('// GET /api/attempts/progress/:quizId');
if (startIndex !== -1) {
    attemptsCode = attemptsCode.substring(0, startIndex);
}

attemptsCode += `// GET /api/attempts/progress/:quizId
router.get('/progress/:quizId', authenticate, async (req, res) => {
    try {
        const { quizId } = req.params;
        const { deviceId } = req.query;
        const { Op } = require('sequelize');
        
        const conditions = [{ userId: req.user.id }];
        if (deviceId) conditions.push({ deviceId });

        const progress = await require('../models/QuizProgress').findOne({
            where: { 
                quizId,
                [Op.or]: conditions
            },
            order: [['updatedAt', 'DESC']]
        });
        res.json(progress || { answers: [], timeRemaining: null, currentQuestionIndex: 0 });
    } catch (error) {
        require('../utils/logger').error('خطأ في GET /progress:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء جلب التقدم' });
    }
});

// POST /api/attempts/progress
router.post('/progress', authenticate, async (req, res) => {
    try {
        const { quizId, answers, timeRemaining, currentQuestionIndex, deviceId } = req.body;
        if (!quizId) return res.status(400).json({ error: 'quizId مطلوب' });

        const QuizProgress = require('../models/QuizProgress');
        const { Op } = require('sequelize');

        const conditions = [{ userId: req.user.id }];
        if (deviceId) conditions.push({ deviceId });

        let progress = await QuizProgress.findOne({ 
            where: { 
                quizId,
                [Op.or]: conditions
            },
            order: [['updatedAt', 'DESC']]
        });
        
        if (progress) {
            progress.answers = answers;
            progress.timeRemaining = timeRemaining;
            progress.currentQuestionIndex = currentQuestionIndex;
            progress.userId = req.user.id;
            progress.deviceId = deviceId || progress.deviceId;
            await progress.save();
        } else {
            progress = await QuizProgress.create({
                userId: req.user.id,
                deviceId,
                quizId,
                answers,
                timeRemaining,
                currentQuestionIndex
            });
        }
        res.json({ message: 'تم حفظ التقدم' });
    } catch (error) {
        require('../utils/logger').error('خطأ في POST /progress:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء حفظ التقدم' });
    }
});

// DELETE /api/attempts/progress/:quizId
router.delete('/progress/:quizId', authenticate, async (req, res) => {
    try {
        const { quizId } = req.params;
        const { deviceId } = req.query;
        const { Op } = require('sequelize');

        const conditions = [{ userId: req.user.id }];
        if (deviceId) conditions.push({ deviceId });

        await require('../models/QuizProgress').destroy({
            where: { 
                quizId,
                [Op.or]: conditions
            }
        });
        res.json({ message: 'تم الحذف' });
    } catch (error) {
        require('../utils/logger').error('خطأ في DELETE /progress:', { error: error.message });
        res.status(500).json({ error: 'حدث خطأ أثناء حذف التقدم' });
    }
});

module.exports = router;
`;
fs.writeFileSync('server/routes/attempts.js', attemptsCode);

