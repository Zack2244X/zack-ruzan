const sequelize = require("./models/index");
const Quiz = require("./models/Quiz");
const logger = require("./utils/logger");
async function check() {
  try {
    const count = await Quiz.count();
    logger.info("Quiz count check complete", { total: count });
  } catch (e) {
    logger.error("Quiz count check failed", { error: e.message });
  }
  process.exit(0);
}
check();
