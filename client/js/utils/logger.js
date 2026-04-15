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
  info: (...args) => {
    if (isDev) console.info(...args);
  },
  log: (...args) => {
    if (isDev) console.log(...args);
  },
  warn: (...args) => {
    if (isDev) console.warn(...args);
  },
  debug: (...args) => {
    if (isDev) console.debug(...args);
  },
  error: (...args) => {
    // Keep error logging safe in all modes.
    console.error(...args);
  }
};

// Legacy non-module bundles in this project read `logger` from global scope.
if (typeof window !== "undefined") {
  window.logger = logger;
}

export default logger;
