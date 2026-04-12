const path = require('path');
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, '../error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(__dirname, '../combined.log') }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});
module.exports = logger;
