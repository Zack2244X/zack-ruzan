import { showAlert } from "../modules/helpers.js";
import logger from '../utils/logger.js';

/**
 * Handle, categorize, report and display errors.
 * @param {Error} error 
 * @param {Object} context 
 */
export function handleError(error, context = {}) {
  // 1. Categorize error
  let category = "Unknown";
  const msg = (error.message || "").toLowerCase();
  
  const isNetwork = msg.includes("fetch") || 
                    msg.includes("network") || 
                    msg.includes("offline") || 
                    msg.includes("failed to fetch") ||
                    msg.includes("networkerror");
                    
  if (isNetwork) {
    category = "Network";
  } else if (error.status === 400 || error.name === "ValidationError" || msg.includes("validation")) {
    category = "Validation";
  } else if (error.status >= 500) {
    category = "Server";
  }

  // 2. Dev logging
  const isDev = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (isDev) {
    logger.error(`[${category} Error]`, error, "\\nContext:", context);
  }

  // 3. User-friendly message
  let showMessage = "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.";
  if (category === "Network") {
    showMessage = "عذراً، فشل الاتصال. يرجى التحقق من اتصالك بالإنترنت.";
  } else if (category === "Validation") {
    showMessage = "البيانات المدخلة غير صالحة. يرجى التحقق منها.";
  } else if (category === "Server") {
    showMessage = "عذراً، الخادم يواجه مشكلة حالياً. الرجاء المحاولة لاحقاً.";
  }

  if (error.userMessage) {
    showMessage = error.userMessage;
  } else if (error.message && category !== "Unknown" && category !== "Server" && !isNetwork) {
    showMessage = error.message;
  }

  if (!context.hideAlert) {
    showAlert(showMessage, "error");
  }

  // 4. Send background report
  try {
    const payload = {
      message: error.message,
      stack: error.stack,
      category,
      context,
      url: window.location.href,
      userAgent: navigator.userAgent
    };
    
    // Background fetch without blocking user
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => {});
  } catch (ignore) {}
}

/**
 * Executes a function with a retry mechanism for network errors.
 * @param {Function} asyncFn Function returning a promise
 * @param {Number} maxRetries Number of retries (default 2)
 * @param {Object} context Context dict for handleError
 * @param {Number} delayMs Base delay in milliseconds
 */
export async function withRetry(asyncFn, context = {}, maxRetries = 2, delayMs = 1500) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (e) {
      lastError = e;
      const msg = (e.message || "").toLowerCase();
      const isNetwork = msg.includes("fetch") || 
                        msg.includes("network") || 
                        msg.includes("offline") || 
                        msg.includes("failed to fetch") ||
                        msg.includes("networkerror");
                        
      if (isNetwork && attempt < maxRetries) {
        showAlert("فشل الاتصال، جاري إعادة المحاولة...", "warning");
        await new Promise(res => setTimeout(res, delayMs * (attempt + 1)));
        continue;
      }
      
      // If it's the last attempt or not a network error, handle it
      handleError(e, { ...context, attempt: attempt + 1, isRetryFailure: attempt > 0 });
      throw e; 
    }
  }
  
  handleError(lastError, { ...context, attempt: maxRetries + 1, isRetryFailure: true });
  throw lastError;
}
