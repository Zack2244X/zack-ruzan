const DOMPurify = require("dompurify");
const sanitize = (dirty) => DOMPurify.sanitize(dirty);
window.sanitize = sanitize;
