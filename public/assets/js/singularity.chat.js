const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { AccessToken } = require("livekit-server-sdk");

admin.initializeApp();

exports.createLivekitToken = functions.https.onCall(async (data, context) => {
	if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
	const room = String(data.room || "").slice(0, 128);
	if (!room) throw new functions.https.HttpsError("invalid-argument", "room is required.");

	const userSnap = await admin.firestore().collection("users").doc(context.auth.uid).get();
	const user = userSnap.data();
	if (!user) throw new functions.https.HttpsError("failed-precondition", "No profile set up yet.");
	if (user.bannedAt) throw new functions.https.HttpsError("permission-denied", "You are banned.");

	const { key, secret } = functions.config().livekit || {};
	if (!key || !secret) throw new functions.https.HttpsError("failed-precondition", "LiveKit is not configured");

	const at = new AccessToken(key, secret, {
		identity: context.auth.uid,
		name: user.display || user.username,
		metadata: JSON.stringify({ avatar_url: user.pfp || "" }),
	});
	at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });
	return { token: at.toJwt() };
});

exports.searchGifs = functions.https.onCall(async (data, context) => {
	if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
	const { key } = functions.config().giphy || {};
	if (!key) throw new functions.https.HttpsError("failed-precondition", "GIPHY is not configured");

	const q = String(data.query || "").slice(0, 100);
	const endpoint = q
		? `https://api.giphy.com/v1/gifs/search?q=${encodeURIComponent(q)}&api_key=${key}&limit=18&rating=pg`
		: `https://api.giphy.com/v1/gifs/trending?api_key=${key}&limit=18&rating=pg`;

	const res = await fetch(endpoint);
	const json = await res.json();
	const gifs = (json.data || [])
		.map(gif => ({
			preview: gif.images?.fixed_width_small?.url || gif.images?.fixed_width?.url,
			full: gif.images?.fixed_width?.url || gif.images?.original?.url,
		}))
		.filter(g => g.preview && g.full);
	return { gifs };
});

exports.unfurlLink = functions.https.onCall(async (data, context) => {
	if (!context.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in first.");
	const url = String(data.url || "");
	if (!/^https?:\/\//i.test(url)) throw new functions.https.HttpsError("invalid-argument", "Bad URL.");

	try {
		const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; CherriBot/1.0)" } });
		const html = await res.text();
		const pick = (prop) => {
			const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i"))
				|| html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
			return m ? m[1] : null;
		};
		const title = pick("title") || (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || null;
		const description = pick("description");
		if (!title) return { title: null };
		return { title: title.slice(0, 200), description: description ? description.slice(0, 300) : null };
	} catch {
		return { title: null };
	}
});
