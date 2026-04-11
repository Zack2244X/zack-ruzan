require("dotenv").config();
const sequelize = require("./server/models/index");
const QuizProgress = require("./server/models/QuizProgress");
QuizProgress.sync({ force: true })
  .then(() => {
    console.log("QuizProgress table dropped and recreated successfully!");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error syncing:", e.message);
    process.exit(1);
  });
