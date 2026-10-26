(function () {
	if (window.__sgCursorLoaded) return;
	window.__sgCursorLoaded = true;

	var ARROW = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='%23b57bff' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z'/%3E%3C/svg%3E\") 0 0, auto";

	var CSS =
		"nav#navbar, #nav-grip, #dock-guide { display: none !important; }" +
		"html, html * { cursor: " + ARROW + " !important; }" +
		"html input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), html textarea, html [contenteditable=''], html [contenteditable='true'] { cursor: text !important; }";

	var STYLE_ID = "sg-cursor-style";

	function inject(doc) {
		try {
			if (!doc || doc.getElementById(STYLE_ID)) return;
			var root = doc.head || doc.documentElement;
			if (!root) return;
			var s = doc.createElement("style");
			s.id = STYLE_ID;
			s.textContent = CSS;
			root.appendChild(s);
		} catch (e) {}
	}

	function hookFrame(frame) {
		if (frame.__sgCursor) return;
		frame.__sgCursor = true;
		function run() {
			try {
				var d = frame.contentDocument;
				if (!d) return;
				inject(d);
				scan(d);
			} catch (e) { }
		}
		frame.addEventListener("load", run);
		run();
	}

	function scan(doc) {
		try {
			var frames = doc.querySelectorAll("iframe");
			for (var i = 0; i < frames.length; i++) hookFrame(frames[i]);
		} catch (e) {}
	}

	function watch(doc) {
		try {
			new MutationObserver(function () { scan(doc); }).observe(doc.documentElement, { childList: true, subtree: true });
		} catch (e) {}
	}
	
	try {
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.getRegistration("/").then(function (reg) {
				var cur = reg && (reg.active || reg.waiting || reg.installing);
				if (cur && !/\/sw1\.js(\?|$)/.test(cur.scriptURL)) return;
				return navigator.serviceWorker.register("/sw1.js", { scope: "/" });
			}).catch(function () {});
		}
	} catch (e) {}

	inject(document);
	scan(document);
	watch(document);
	document.addEventListener("DOMContentLoaded", function () { inject(document); scan(document); });
})();
