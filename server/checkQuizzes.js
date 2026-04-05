const sequelize = require('./models/index');
const Quiz = require('./models/Quiz');
async function check() {
  try {
    const count = await Quiz.count();
    console.log("Total: ", count);
  } catch(e) { console.error(e); }
  process.exit(0);
}
check();
