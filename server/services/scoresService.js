const dbLayer = require('./safeQueryLayer');
const NodeCache = require('node-cache');
const logger = require('../utils/logger'); // Assuming logger exists

// Cache for 60 seconds
const leaderboardCache = new NodeCache({ stdTTL: 60 });

async function getLeaderboard() {
  const cacheKey = 'leaderboard_data';
  const cachedData = leaderboardCache.get(cacheKey);

  if (cachedData) {
    return { data: cachedData, cached: true };
  }

    const [rows] = await dbLayer.executeReadOnlyQuery(`
    SELECT
        s.userId, u.fname, u.lname, u.email,
        SUM(s.score) AS totalScore,
        SUM(s.total) AS totalMax,
        COUNT(s.id) AS examsCount,
        (SUM(s.score) / NULLIF(SUM(s.total), 0)) * 100 AS avgPercentage,
        SUM(CASE WHEN s.score = s.total THEN 1 ELSE 0 END) AS fullMarksCount
    FROM (
        SELECT * FROM (
            SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.userId, s.quizId ORDER BY s.attemptNumber ASC, s.id ASC) AS rn
            FROM scores s
            WHERE s.isOfficial = 1 AND s.deletedAt IS NULL
        ) ranked_scores WHERE ranked_scores.rn = 1
    ) s
    INNER JOIN users u ON s.userId = u.id AND u.deletedAt IS NULL
    GROUP BY s.userId, u.fname, u.lname, u.email
    ORDER BY fullMarksCount DESC, avgPercentage DESC, totalScore DESC
    LIMIT 50
  `);

  const result = rows.map((entry) => ({
    userName: entry.fname ? \`\${entry.fname} \${entry.lname || ""}\`.trim() : entry.email || "مستخدم محذوف",
    totalScore: parseInt(entry.totalScore) || 0,
    totalMax: parseInt(entry.totalMax) || 0,
    examsCount: parseInt(entry.examsCount) || 0,
    avgPercentage: Math.round(parseFloat(entry.avgPercentage) || 0),
    fullMarksCount: parseInt(entry.fullMarksCount) || 0,
  }));

  leaderboardCache.set(cacheKey, result);
  return { data: result, cached: false };
}

module.exports = {
  getLeaderboard
};

async function getMyAttemptsCount(userId) {
  const dbLayer = require('./safeQueryLayer');
  const [rows] = await dbLayer.executeReadOnlyQuery(
    `SELECT quizId, COUNT(id) AS attemptCount, MAX(CASE WHEN isOfficial = 1 THEN 1 ELSE 0 END) AS hasOfficial
     FROM scores WHERE userId = :userId AND deletedAt IS NULL
     GROUP BY quizId`,
    { replacements: { userId } }
  );
  return rows.map((r) => ({
    quizId: r.quizId,
    attemptCount: parseInt(r.attemptCount) || 0,
    hasOfficial: Boolean(parseInt(r.hasOfficial)),
  }));
}
module.exports.getMyAttemptsCount = getMyAttemptsCount;
