const CURSOR_TAG = '<script src="/assets/js/cursor.js"></script>';

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET" || req.mode !== "navigate") return;
	if (new URL(req.url).origin !== self.location.origin) return;

	try {
		if (typeof scramjet !== "undefined" && scramjet && typeof scramjet.route === "function" && scramjet.route(event)) return;
	} catch (err) {}
	if (/\/(scramjet|~\/scramjet|service)\//i.test(new URL(req.url).pathname)) return;

	try {
	event.respondWith(
		(async () => {
			let res;
			try {
				res = await fetch(req);
			} catch (err) {
				return Response.error();
			}

			const type = res.headers.get("content-type") || "";
			if (!res.ok || !type.includes("text/html")) return res;

			let html = await res.text();
			if (html.includes("/assets/js/cursor.js")) return new Response(html, res);

			if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, CURSOR_TAG + "</head>");
			else html = CURSOR_TAG + html;

			const headers = new Headers(res.headers);
			headers.delete("content-length");
			headers.delete("content-encoding");
			return new Response(html, { status: res.status, statusText: res.statusText, headers });
		})()
	);
	} catch (err) { }
});
