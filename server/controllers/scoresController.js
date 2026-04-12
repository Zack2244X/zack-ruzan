const scoresService = require('../services/scoresService');
const logger = require('../utils/logger'); // Assuming logger exists

async function getLeaderboard(req, res) {
  try {
    const result = await scoresService.getLeaderboard();
    if (result.cached) {
      res.setHeader("X-Cache-Hit", "true");
    }
    return res.json(result.data);
  } catch (error) {
    const dbMsg = error.original?.message || error.parent?.message || error.message;
    logger.error("خطأ في جلب لوحة الشرف:", { error: dbMsg, stack: error.stack });
    res.status(500).json({ error: "حدث خطأ." });
  }
}

async function getMyAttemptsCount(req, res) {
  try {
    const data = await scoresService.getMyAttemptsCount(req.user.id);
    return res.json(data);
  } catch (error) {
    res.status(500).json({ error: "حدث خطأ أثناء جلب عدد المحاولات." });
  }
}

module.exports = { getMyAttemptsCount, 
  getLeaderboard
};
