const OBF_KEY = [173, 91, 202, 17, 138, 64, 229, 53];

const GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash"];
const GEMINI_RETRY_STATUSES = [403, 429, 500, 503];
const GEMINI_MAX_CONTENT_CHARS = 4000000;
const GEMINI_MAX_TURNS = 40;

const IMPORT_MAX_TRACKS = 300;

const IMPORT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|spotify\.link)$/i;
const SHORT_LINK_HOSTS = /^(spotify\.link|youtu\.be)$/i;

const listKeys = (value) => (value || "").split(",").map((s) => s.trim()).filter(Boolean);

const clamp = (value, fallback, min, max) => {
	const n = Number(value);
	return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

const obf = (buf) => {
	const out = Buffer.alloc(buf.length);
	for (let i = 0; i < buf.length; i++) {
		out[i] = buf[i] ^ OBF_KEY[i % OBF_KEY.length] ^ (i & 255);
	}
	return out;
};

async function readRaw(req) {
	if (Buffer.isBuffer(req.body)) return req.body;
	if (req.body !== undefined) return null;
	const chunks = [];
	for await (const chunk of req) chunks.push(chunk);
	return Buffer.concat(chunks);
}

function makeReply(res, binary) {
	const reply = (status, obj) => {
		if (binary) {
			res.setHeader("Content-Type", "application/octet-stream");
			return res.status(status).send(obf(Buffer.from(JSON.stringify(obj), "utf8")));
		}
		return res.status(status).json(obj);
	};
	reply.binary = binary;
	return reply;
}

async function youtubeSearch(rawQuery, rawLimit, reply, res) {
	const q = String(rawQuery || "").trim().slice(0, 200);
	const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 25, 1), 50);
	if (!q) return reply(400, { error: "Missing q" });

	const keys = listKeys(process.env.YT_KEYS);
	if (!keys.length) return reply(500, { error: "No API keys configured" });

	const start = Math.floor(Math.random() * keys.length);
	let lastStatus = 502;

	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];
		const url =
			"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10" +
			"&maxResults=" + limit +
			"&q=" + encodeURIComponent(q) +
			"&key=" + encodeURIComponent(key);

		try {
			const yt = await fetch(url);
			if (yt.ok) {
				const data = await yt.json();
				res.setHeader(
					"Cache-Control",
					reply.binary ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400"
				);
				return reply(200, data);
			}
			lastStatus = yt.status;
			if (yt.status !== 403 && yt.status !== 400) break;
		} catch {
			lastStatus = 502;
		}
	}

	return reply(503, { error: " exhausted or unavailable", status: lastStatus });
}

class ImportError extends Error {}

async function resolveShortLink(rawUrl) {
	let url = rawUrl;
	for (let hop = 0; hop < 5; hop++) {
		const u = new URL(url);
		if (u.protocol !== "https:" || !IMPORT_HOSTS.test(u.hostname)) {
			throw new ImportError("That link isn't supported.");
		}
		if (!SHORT_LINK_HOSTS.test(u.hostname)) return u;
		const r = await fetch(url, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
		const loc = r.headers.get("location");
		if (!loc) return u;
		url = new URL(loc, url).toString();
	}
	throw new ImportError("Too many redirects.");
}

async function ytApi(path, params) {
	const keys = listKeys(process.env.YT_KEYS);
	if (!keys.length) throw new ImportError("No configuration set on this domain");
	const start = Math.floor(Math.random() * keys.length);
	let lastMsg = "YouTube request failed";
	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];
		const qs = new URLSearchParams({ ...params, key }).toString();
		try {
			const r = await fetch("https://www.googleapis.com/youtube/v3/" + path + "?" + qs);
			const d = await r.json();
			if (r.ok) return d;
			lastMsg = (d && d.error && d.error.message) || lastMsg;
			if (r.status === 404) throw new ImportError("Playlist not found (is it public?).");
			if (r.status !== 403 && r.status !== 400) break;
		} catch (err) {
			if (err instanceof ImportError) throw err;
		}
	}
	throw new ImportError(lastMsg);
}

async function importYouTube(u) {
	const list = u.searchParams.get("list");
	if (!list) throw new ImportError("No playlist ID in that YouTube link.");
	if (/^RD/.test(list)) {
		throw new ImportError("YouTube Mix playlists can't be imported. Use a regular playlist.");
	}

	let name = "";
	try {
		const meta = await ytApi("playlists", { part: "snippet", id: list });
		name = meta.items && meta.items[0] && meta.items[0].snippet && meta.items[0].snippet.title;
	} catch (err) {
		if (!(err instanceof ImportError)) throw err;
	}

	const tracks = [];
	let page = "";
	do {
		const params = { part: "snippet,contentDetails", maxResults: "50", playlistId: list };
		if (page) params.pageToken = page;
		const d = await ytApi("playlistItems", params);
		for (const it of d.items || []) {
			const s = it.snippet;
			if (!s || s.title === "Deleted video" || s.title === "Private video") continue;
			const vid = (it.contentDetails && it.contentDetails.videoId) || (s.resourceId && s.resourceId.videoId);
			if (!vid) continue;
			const th = s.thumbnails && (s.thumbnails.high || s.thumbnails.medium || s.thumbnails.default);
			tracks.push({
				videoId: vid,
				title: s.title,
				artist: (s.videoOwnerChannelTitle || s.channelTitle || "").replace(/\s*-\s*Topic$/, ""),
				artwork: th ? th.url : "",
			});
		}
		page = d.nextPageToken || "";
	} while (page && tracks.length < IMPORT_MAX_TRACKS);

	return { name: name || "Imported from YouTube", tracks: tracks.slice(0, IMPORT_MAX_TRACKS) };
}
async function importSpotify(u) {
	const m = u.pathname.match(/(playlist|album)\/([A-Za-z0-9]+)/);
	if (!m) throw new ImportError("Couldn't read that Spotify link.");
	const r = await fetch("https://open.spotify.com/embed/" + m[1] + "/" + m[2], {
		headers: { "User-Agent": "Mozilla/5.0" },
	});
	if (!r.ok) throw new ImportError("Spotify couldn't find that " + m[1] + " (is it public?).");
	const html = await r.text();
	const json = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
	if (!json) throw new ImportError("Spotify blocked the import.");
	let entity;
	try {
		entity = JSON.parse(json[1]).props.pageProps.state.data.entity;
	} catch {
		throw new ImportError("Spotify changed their page format. Import is unavailable right now.");
	}
	const sources = (entity.coverArt && entity.coverArt.sources) || [];
	const art = sources.length ? sources[sources.length - 1].url : "";
	return {
		name: entity.name || entity.title || "Imported from Spotify",
		tracks: (entity.trackList || []).slice(0, IMPORT_MAX_TRACKS).map((x) => ({
			title: x.title,
			artist: x.subtitle,
			artwork: art,
		})),
	};
}

async function importPlaylist(rawUrl, reply, res) {
	const input = String(rawUrl || "").trim().slice(0, 500);
	let u;
	try {
		u = await resolveShortLink(input);
	} catch (err) {
		if (err instanceof ImportError) return reply(400, { error: err.message });
		return reply(400, { error: "That doesn't look like a valid link." });
	}

	try {
		let out;
		const host = u.hostname;
		if (/youtube\.com$|youtu\.be$/i.test(host)) out = await importYouTube(u);
		else if (/spotify\.com$/i.test(host)) out = await importSpotify(u);
		else return reply(400, { error: "That link isn't supported." });

		out.tracks = (out.tracks || []).filter((t) => t && t.title);
		res.setHeader("Cache-Control", "no-store");
		return reply(200, out);
	} catch (err) {
		if (err instanceof ImportError) return reply(502, { error: err.message });
		return reply(502, { error: "Import failed. Try again later." });
	}
}
async function geminiChat(body, reply, res) {
	const keys = listKeys(process.env.GEMINI_KEYS);
	if (!keys.length) return reply(500, { error: { message: "No API keys configured" } });

	if (!body || typeof body !== "object") {
		return reply(400, { error: { message: "Invalid body" } });
	}
	if (!GEMINI_MODELS.includes(body.model)) {
		return reply(400, { error: { message: "Unsupported model" } });
	}
	if (!Array.isArray(body.contents) || !body.contents.length || body.contents.length > GEMINI_MAX_TURNS) {
		return reply(400, { error: { message: "Invalid contents" } });
	}
	if (JSON.stringify(body.contents).length > GEMINI_MAX_CONTENT_CHARS) {
		return reply(413, { error: { message: "Request too large" } });
	}

	const gc = body.generationConfig || {};
	const payload = {
		contents: body.contents,
		generationConfig: {
			temperature: clamp(gc.temperature, 0.7, 0, 2),
			maxOutputTokens: Math.round(clamp(gc.maxOutputTokens, 1024, 1, 8192)),
		},
	};

	const url = "https://generativelanguage.googleapis.com/v1beta/models/" + body.model + ":generateContent";
	const start = Math.floor(Math.random() * keys.length);
	let lastStatus = 502;

	for (let i = 0; i < keys.length; i++) {
		const key = keys[(start + i) % keys.length];

		try {
			const g = await fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json", "x-goog-api-key": key },
				body: JSON.stringify(payload),
			});

			if (g.ok) {
				const data = await g.json();
				res.setHeader("Cache-Control", "no-store");
				return reply(200, data);
			}

			lastStatus = g.status;
			let message = "Gemini request failed";
			try {
				const err = await g.json();
				if (err && err.error && err.error.message) message = err.error.message;
			} catch {}

			const badKey = g.status === 400 && /api key/i.test(message);
			if (GEMINI_RETRY_STATUSES.includes(g.status) || badKey) continue;

			return reply(g.status, { error: { message, status: g.status } });
		} catch {
			lastStatus = 502;
		}
	}

	return reply(503, {
		error: { message: " exhausted or unavailable", status: lastStatus },
	});
}

export default async function handler(req, res) {
	if (req.method === "GET") return youtubeSearch(req.query.q, req.query.limit, makeReply(res, false), res);

	if (req.method === "POST") {
		const binary = String(req.headers["content-type"] || "").includes("octet-stream");
		const reply = makeReply(res, binary);

		let body = req.body;
		if (binary) {
			const raw = await readRaw(req);
			if (!raw) return reply(400, { error: { message: "Invalid body" } });
			try {
				body = JSON.parse(obf(raw).toString("utf8"));
			} catch {
				return reply(400, { error: { message: "Invalid body" } });
			}
		} else if (typeof body === "string") {
			try {
				body = JSON.parse(body);
			} catch {
				body = null;
			}
		}

		if (body && body.type === "youtube") return youtubeSearch(body.q, body.limit, reply, res);
		if (body && body.type === "playlist") return importPlaylist(body.url, reply, res);
		return geminiChat(body, reply, res);
	}

	res.setHeader("Allow", "GET, POST");
	return res.status(405).json({ error: { message: "Method not allowed" } });
}
