const dbLayer = require('./safeQueryLayer');
const NodeCache = require('node-cache');
const logger = require('../utils/logger'); // Assuming logger exists
const sequelize = require('../models');
const Score = require('../models/Score');
const { QueryTypes } = require('sequelize');

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
    userName: entry.fname ? `${entry.fname} ${entry.lname || ""}`.trim() : entry.email || "مستخدم محذوف",
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

/**
 * Creates a score attempt with retry semantics to mitigate TOCTOU races.
 * Security: the DB unique constraint remains the source of truth.
 */
async function createAttempt(userId, quizId, payload = {}) {
  const maxRetries = 5;

  for (let i = 0; i < maxRetries; i++) {
    const transaction = await sequelize.transaction();
    try {
      // SECURITY: lock the user's quiz-attempt row range to reduce concurrent collisions.
      const [row] = await sequelize.query(
        `SELECT COALESCE(MAX(attemptNumber), 0) + 1 AS nextAttempt
           FROM scores
          WHERE userId = :userId AND quizId = :quizId
          FOR UPDATE`,
        {
          replacements: { userId, quizId },
          type: QueryTypes.SELECT,
          transaction,
        },
      );

      const attemptNumber = Number(row?.nextAttempt || 1);
      const isOfficial = attemptNumber === 1;
      const score = await Score.create(
        {
          userId,
          quizId,
          answers: payload.answers || [],
          score: Number(payload.score || 0),
          total: Number(payload.total || 0),
          timeTaken: Number(payload.timeTaken || 0),
          isOfficial,
          attemptNumber,
        },
        { transaction },
      );
      await transaction.commit();
      return { score, attemptNumber, isOfficial };
    } catch (error) {
      await transaction.rollback();
      if (error.name === 'SequelizeUniqueConstraintError') {
        const backoffMs = Math.min(200, 25 * (2 ** i));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max attempts reached while resolving concurrent submissions.');
}

module.exports.createAttempt = createAttempt;
