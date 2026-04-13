const scoresService = require('../services/scoresService');
const logger = require('../utils/logger'); // Assuming logger exists
const sendInternalError = require('../utils/errorResponse');

async function getLeaderboard(req, res) {
  try {
    const result = await scoresService.getLeaderboard();
    if (result.cached) {
      res.setHeader("X-Cache-Hit", "true");
    }
    return res.json(result.data);
  } catch (error) {
    logger.error("خطأ في جلب لوحة الشرف");
    return sendInternalError(res, error, req, {
      action: "scoresController.getLeaderboard",
      userId: req.user?.id || null,
    });
  }
}

async function getMyAttemptsCount(req, res) {
  try {
    const data = await scoresService.getMyAttemptsCount(req.user.id);
    return res.json(data);
  } catch (error) {
    return sendInternalError(res, error, req, {
      action: "scoresController.getMyAttemptsCount",
      userId: req.user?.id || null,
    });
  }
}

module.exports = { getMyAttemptsCount, 
  getLeaderboard
};
