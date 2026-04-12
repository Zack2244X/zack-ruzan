CREATE INDEX idx_scores_user_quiz ON `scores` (userId, quizId);
CREATE INDEX idx_scores_official ON `scores` (isOfficial, attemptNumber);
