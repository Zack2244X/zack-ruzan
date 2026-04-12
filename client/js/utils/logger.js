/**
 * @file logger.js
 * @description Wrapper around console methods to prevent debug info leakage in production.
 * Only logs when in development mode.
 */

// We consider localhost or explicit localStorage flag as development natively
// but we also check for process.env.NODE_ENV if it's injected by a bundler.
const isDev = (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') || 
              window.location.hostname === 'localhost' || 
              window.location.hostname === '127.0.0.1' || 
              localStorage.getItem('debug') === 'true';

export const logger = {
  log: (...args) => {
    if (isDev) logger.log(...args);
  },
  warn: (...args) => {
    if (isDev) logger.warn(...args);
  },
  debug: (...args) => {
    if (isDev) logger.debug(...args);
  },
  error: (...args) => {
    // Errors are usually kept even in production, or can be masked.
    // We retain them but you can change this if needed.
    console.error(...args);
  }
};

export default logger;
