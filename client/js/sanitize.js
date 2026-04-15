(function () {
	function fallbackSanitize(value) {
		var template = document.createElement("template");
		template.textContent = String(value == null ? "" : value);
		return template.innerHTML;
	}

	function sanitize(dirty) {
		var input = String(dirty == null ? "" : dirty);
		if (window.DOMPurify && typeof window.DOMPurify.sanitize === "function") {
			return window.DOMPurify.sanitize(input);
		}
		return fallbackSanitize(input);
	}

	window.sanitize = sanitize;
})();
