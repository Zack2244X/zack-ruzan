import logger from '../utils/logger.js';
export async function wrapComponent(containerElement, renderFunction, fallbackHtml = null, retryCallback = null) {
  if (!containerElement) return;
  const originalContent = containerElement.innerHTML;
  try {
    await renderFunction(containerElement);
  } catch (error) {
    logger.error(`[ErrorBoundary] Component failed to render:`, error);
    
    containerElement.innerHTML = fallbackHtml || `
      <div class="error-boundary " role="alert" bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 p-6 rounded-lg my-4 flex flex-col items-center justify-center text-center">
        <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
        <h4 class="text-lg font-bold mb-2">عذراً، حدث خطأ في هذا الجزء فقط</h4>
        <p class="text-sm opacity-80 mb-4">${error.message || 'فشل في تحميل المكون'}</p>
        <button class="retry-btn bg-red-100 hover:bg-red-200 dark:bg-red-800/40 dark:hover:bg-red-700/60 text-red-700 dark:text-red-300 font-bold px-4 py-2 rounded-md transition-colors cursor-pointer flex items-center justify-center">
          <i class="fas fa-redo ml-2"></i> إعادة المحاولة
        </button>
      </div>
    `;

    const retryBtn = containerElement.querySelector('.retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', async () => {
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<i class="fas fa-spinner fa-spin ml-2"></i> جاري المحاولة...';
        
        if (retryCallback) {
          await retryCallback(containerElement);
        } else {
          containerElement.innerHTML = originalContent;
          wrapComponent(containerElement, renderFunction, fallbackHtml, retryCallback);
        }
      });
    }
  }
}
