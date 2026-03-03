/**
 * @file Centralized Winston logger
 * @description Provides a configured Winston logger instance with console and file transports.
 *   In development: colorized, human-readable output. In production: JSON format with file rotation.
 * @module utils/logger
 */

// ============================================
//   Winston Logger — تسجيل مركزي محترف
// ============================================
const { createLogger, format, transports } = require('winston');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Winston logger instance.
 * - Development: colorized console output at 'debug' level.
 * - Production: JSON format at 'info' level with error and combined file transports.
 * @type {import('winston').Logger}
 */
const logger = createLogger({
    level: isProduction ? 'info' : 'debug',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        isProduction
            ? format.json()
            : format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message, stack, ...meta }) => {
                    let msg = `${timestamp} [${level}]: ${message}`;
                    if (stack) msg += `\n${stack}`;
                    if (Object.keys(meta).length) msg += ` ${JSON.stringify(meta)}`;
                    return msg;
                })
            )
    ),
    transports: [
        new transports.Console(),
        ...(isProduction ? [
            new transports.File({ filename: 'logs/error.log', level: 'error', maxsize: 5242880, maxFiles: 5 }),
            new transports.File({ filename: 'logs/combined.log', maxsize: 5242880, maxFiles: 5 })
        ] : [])
    ],
    defaultMeta: { service: 'quiz-platform' }
});

module.exports = logger;
