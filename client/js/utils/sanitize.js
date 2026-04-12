import logger from './utils/logger.js';
/**
 * Sanitizes an HTML string to allow only specific safe formatting tags.
 * Preserves text content and <b>, <i>, <u>, <br> tags.
 * Strips all attributes to prevent XSS (like onerror).
 *
 * @param {string} dirtyStr - The potentially unsafe HTML string.
 * @returns {string} Sanitized safe HTML string.
 */
export function sanitizeHTML(dirtyStr) {
  if (!dirtyStr) return "";
  
  // Use native DOMParser to parse the string safely without executing scripts
  const parser = new DOMParser();
  const doc = parser.parseFromString(dirtyStr, 'text/html');
  const allowedTags = ["B", "I", "U", "BR"];
  
  // Recursive function to strip unsafe nodes or attributes
  const stripUnsafe = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.includes(child.tagName)) {
          // If it's not an allowed tag (like <script> or <img>), 
          // extract its exact text representation to avoid throwing it away, 
          // ensuring the user just sees raw `<img src=x onerror=logger.warn("Alert:", 1)>`
          const textNode = doc.createTextNode(child.outerHTML || child.textContent);
          child.replaceWith(textNode);
        } else {
          // It's allowed (e.g. <b>). Strip any malicious attributes (like onclick)
          while (child.attributes.length > 0) {
            child.removeAttribute(child.attributes[0].name);
          }
          // Recurse into children
          stripUnsafe(child);
        }
      }
    }
  };
  
  stripUnsafe(doc.body);
  return doc.body.innerHTML;
}
