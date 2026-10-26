import { auth, db, rtdb, storage, functions } from "./firebase-init.js";
import {
	signInAnonymously,
	onAuthStateChanged,
	updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
	doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
	collection, query, where, orderBy, limit, limitToLast, startAfter, endBefore,
	serverTimestamp, runTransaction, arrayUnion, arrayRemove, Timestamp,
	writeBatch, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
	ref as rtdbRef, onValue, onDisconnect, set as rtdbSet, remove as rtdbRemove,
	serverTimestamp as rtdbServerTimestamp, push as rtdbPush,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
	ref as storageRef, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const EMOJI_MAP = window.EMOJI_MAP || {};
const PAGE_SIZE = 50;
const TYPING_IDLE_MS = 2200;
const MAX_MESSAGE_LENGTH = 1500;
const ADMIN_USERNAMES_FALLBACK = []; 

function escapeHtml(text) {
	return String(text)
		.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function escapeHtmlAttribute(v) { return escapeHtml(v); }
function cleanContent(text) {
	return String(text)
		.trim()
		.replace(/[\u00AD\u200B\u200C\u2800\uFEFF]|\u200D/g, "")
		.replace(/\n{3,}/g, "\n\n");
}
function showToast(message, type = "info") {
	const container = document.getElementById("toast-container");
	if (!container) return;
	const icons = { success: "check-circle", error: "times-circle", info: "info-circle", warning: "exclamation-triangle" };
	const toast = document.createElement("div");
	toast.className = `chat-toast chat-toast-${type}`;
	toast.innerHTML = `<i class="fas fa-${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
	container.appendChild(toast);
	requestAnimationFrame(() => toast.classList.add("chat-toast-visible"));
	setTimeout(() => { toast.classList.remove("chat-toast-visible"); setTimeout(() => toast.remove(), 300); }, 3500);
}
function formatRelativeTime(dateStr) {
	const date = new Date(dateStr);
	const diff = Date.now() - date.getTime();
	if (diff < 60000) return "just now";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
	if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
	return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function tsToIso(ts) {
	if (!ts) return new Date().toISOString();
	if (typeof ts.toDate === "function") return ts.toDate().toISOString();
	return new Date(ts).toISOString();
}

let _audioCtx = null;
function getAudioCtx() { if (!_audioCtx) { try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } return _audioCtx; }
function isSoundEnabled() { return localStorage.getItem("singularity_sounds") !== "0"; }
function tone(freqs, type, gainPeak, dur) {
	if (!isSoundEnabled()) return;
	const ctx = getAudioCtx();
	if (!ctx) return;
	freqs.forEach((freq, i) => {
		const t = ctx.currentTime + i * 0.12;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = type;
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.frequency.setValueAtTime(freq, t);
		gain.gain.setValueAtTime(0, t);
		gain.gain.linearRampToValueAtTime(gainPeak, t + 0.012);
		gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
		osc.start(t);
		osc.stop(t + dur);
	});
}
function playMentionSound() { tone([784, 988], "sine", 0.38, 0.55); }
function playMessageSound() { tone([660], "sine", 0.1, 0.18); }
function playDmSound() { tone([523, 659], "triangle", 0.28, 0.45); }
function sendBrowserNotification(title, body) {
	if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
	if (document.visibilityState === "visible") return;
	try {
		const n = new Notification(title, { body: body?.slice(0, 100) || "", icon: "/assets/img/fav.png", tag: "singularity-chat" });
		setTimeout(() => n.close(), 6000);
	} catch {}
}

function parseMentions(text) {
	const myUsername = (window._currentUsername || "").toLowerCase();
	return text.replace(/(<[^>]*>)|@everyone\b|@([a-zA-Z0-9_]+)/gi, (match, tag, username) => {
		if (tag) return tag;
		if (!username) return '<span class="mention mention-everyone">@everyone</span>';
		const isMe = myUsername && username.toLowerCase() === myUsername;
		return `<span class="mention${isMe ? " mention-me" : ""}" data-mention="${escapeHtmlAttribute(username)}">@${username}</span>`;
	});
}
function emojiCodepoint(emoji) {
	const points = [];
	let i = 0;
	while (i < emoji.length) {
		const code = emoji.codePointAt(i);
		if (code !== 0xfe0f) points.push(code.toString(16));
		i += code > 0xffff ? 2 : 1;
	}
	return points.join("-");
}
function parseEmoji(text) {
	text = escapeHtml(text);
	text = text.replace(/:([a-zA-Z0-9_+\-]+):/g, (match, name, offset) => {
		const before = text.slice(0, offset);
		if ((before.match(/</g) || []).length > (before.match(/>/g) || []).length) return match;
		const emoji = EMOJI_MAP[name];
		if (!emoji) return match;
		const cp = emojiCodepoint(emoji);
		return `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg" alt="${emoji}" title=":${name}:" style="width:1.2em;height:1.2em;vertical-align:-0.2em;display:inline-block;margin:0 1px">`;
	});
	text = text.replace(
		/(\p{Emoji_Presentation}(\u200D\p{Emoji_Presentation})*\uFE0F?|\p{Extended_Pictographic}(\u200D\p{Extended_Pictographic})*\uFE0F?)/gu,
		(emoji) => {
			const cp = emojiCodepoint(emoji);
			return `<img src="https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${cp}.svg" alt="${emoji}" style="width:1.2em;height:1.2em;vertical-align:-0.2em;display:inline-block;margin:0 1px">`;
		},
	);
	return text;
}
const ALLOWED_GIF_HOSTS = new Set(["giphy.com","media.giphy.com","i.giphy.com","media0.giphy.com","media1.giphy.com","media2.giphy.com","media3.giphy.com","media4.giphy.com"]);
function isAllowedGifUrl(url) {
	if (typeof url !== "string" || !url.trim()) return false;
	try {
		if (url.startsWith("/")) return url.split(/[?#]/, 1)[0].toLowerCase().endsWith(".gif");
		const parsed = new URL(url);
		return parsed.protocol === "https:" && ALLOWED_GIF_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.pathname.toLowerCase().endsWith(".gif");
	} catch { return false; }
}
function parseQuoteTag(b64, srcMsgId) {
	try {
		const q = JSON.parse(decodeURIComponent(escape(atob(b64))));
		if (q.t == null) return null;
		const safeDisplay = escapeHtml(q.d || q.u);
		const safeUsername = escapeHtml(q.u);
		const safeBgStyle = escapeHtmlAttribute(`background-image:url(${JSON.stringify(q.a || "/assets/img/fav.png")})`);
		const safeText = escapeHtml(q.t);
		const safeSrcId = srcMsgId != null ? ` data-src-msg-id="${escapeHtmlAttribute(srcMsgId)}"` : "";
		return `<div class="quote-card"${safeSrcId}><div class="quote-card-bg" style="${safeBgStyle}"></div><div class="quote-card-content"><div class="quote-card-body">${safeText}</div><div class="quote-card-author">— ${safeDisplay}</div><div class="quote-card-username">@${safeUsername}</div></div><div class="quote-card-watermark">Make it a Quote</div><button class="quote-card-save" onclick="window.chat.saveQuoteFromCard(this)" title="Save quote"><i class="fas fa-bookmark"></i></button></div>`;
	} catch { return null; }
}
function parseMarkdown(text, msgId = null) {
	text = text.replace(/\[quote:([A-Za-z0-9+/=]+)\]/g, (match, b64) => parseQuoteTag(b64, msgId) || match);
	text = text.replace(/\[gif:([^\]]+)\]/g, (match, url) => {
		if (!isAllowedGifUrl(url)) return match;
		return `<img src="${escapeHtmlAttribute(url)}" class="chat-gif" alt="GIF" onclick="window.open(this.src,'_blank','noopener,noreferrer')" />`;
	});
	text = text.replace(/```([\s\S]*?)```/g, '<code style="display:block;white-space:pre-wrap;background:var(--bg-3);border:1px solid var(--border-4);border-radius:6px;padding:8px 12px;margin:4px 0;font-size:0.88em;font-family:monospace">$1</code>');
	text = text.replace(/`([^`]+)`/g, '<code style="background:var(--bg-3);border:1px solid var(--border-4);border-radius:4px;padding:1px 5px;font-size:0.88em;font-family:monospace">$1</code>');
	text = text.replace(/^### (.+)$/gm, '<div style="font-size:1em;font-weight:700;line-height:1.3">$1</div>');
	text = text.replace(/^## (.+)$/gm, '<div style="font-size:1.2em;font-weight:700;line-height:1.3">$1</div>');
	text = text.replace(/^# (.+)$/gm, '<div style="font-size:1.5em;font-weight:700;line-height:1.3">$1</div>');
	text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
	text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
	text = text.replace(/~~(.+?)~~/g, "<s>$1</s>");
	text = text.replace(/__(.*?)__/g, "<u>$1</u>");
	text = text.replace(/\n/g, "<br>");
	return text;
}
function parseLinks(text) {
	return text.replace(/(?<![='"(])https?:\/\/[^\s<>"'()]+/g, (url) =>
		`<a href="${escapeHtmlAttribute(url)}" data-external="true" style="color:var(--accent);text-decoration:underline;text-decoration-color:rgba(255,255,255,0.2);cursor:pointer">${escapeHtml(url)}</a>`);
}
function extractFirstEmbedUrl(content) {
	if (!content || typeof content !== "string" || /^\[gif:/.test(content.trim())) return null;
	const m = content.match(/(?<![='"(])https?:\/\/[^\s<>"'()]+/);
	if (!m) return null;
	if (/giphy\.com|tenor\.com/i.test(m[0])) return null;
	return m[0];
}

const _embedCache = new Map();
const unfurlLinkFn = httpsCallable(functions, "unfurlLink");
async function loadLinkEmbed(container) {
	const url = container.dataset.url;
	if (!url) return;
	if (_embedCache.has(url)) { const data = _embedCache.get(url); if (data) _renderEmbed(container, data); return; }
	try {
		const res = await unfurlLinkFn({ url });
		const data = res.data;
		if (!data || !data.title) { _embedCache.set(url, false); return; }
		_embedCache.set(url, data);
		if (document.contains(container)) _renderEmbed(container, data);
	} catch { _embedCache.set(url, false); }
}
function _renderEmbed(container, data) {
	const safeTitle = escapeHtml(data.title || "");
	const safeDesc = data.description ? escapeHtml(data.description) : "";
	container.innerHTML = `<div class="link-embed"><div class="link-embed-accent"></div><div class="link-embed-body"><span class="link-embed-title">${safeTitle}</span>${safeDesc ? `<div class="link-embed-desc">${safeDesc}</div>` : ""}</div></div>`;
}

function buildVoiceWaveform(seed) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
	const bars = [];
	for (let i = 0; i < 18; i++) { h = (Math.imul(1664525, h) + 1013904223) | 0; bars.push(`<span class="vbar" data-i="${i}" style="height:${18 + (Math.abs(h) % 74)}%"></span>`); }
	return bars.join("");
}

window.voicePlayerToggle = (function () {
	let _audio = null, _src = null, _rafId = null, _playPending = false;
	function fmt(s) { if (!isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60), sec = Math.floor(s % 60); return `${m}:${sec.toString().padStart(2, "0")}`; }
	function getContainer() { return _src ? document.querySelector(`.voice-msg[data-src="${CSS.escape(_src)}"]`) : null; }
	function setIcon(icon) { const c = getContainer(); const i = c?.querySelector(".voice-play-btn i"); if (i) i.className = `fas fa-${icon}`; }
	function tick() {
		const c = getContainer();
		if (!c || !_audio) return;
		const dur = _audio.duration, ct = _audio.currentTime;
		if (isFinite(dur) && dur > 0) {
			const played = Math.round((ct / dur) * c.querySelectorAll(".vbar").length);
			c.querySelectorAll(".vbar").forEach((b, i) => b.classList.toggle("played", i < played));
			c.querySelector(".voice-time").textContent = fmt(ct);
		}
		_rafId = requestAnimationFrame(tick);
	}
	function stopTick() { if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; } }
	function resetContainer(container) {
		if (!container) return;
		const i = container.querySelector(".voice-play-btn i");
		if (i) i.className = "fas fa-play";
		container.querySelectorAll(".vbar").forEach(b => b.classList.remove("played"));
		const timeEl = container.querySelector(".voice-time");
		if (timeEl) timeEl.textContent = "0:00";
	}
	function safePause(audio) {
		if (_playPending) { const h = setInterval(() => { if (!_playPending) { clearInterval(h); audio.pause(); } }, 10); }
		else audio.pause();
	}
	function stop() { stopTick(); const c = getContainer(); const a = _audio; _audio = null; _src = null; _playPending = false; if (a) safePause(a); if (c) resetContainer(c); }
	window.voiceSeek = function (waveform, event) {
		if (!_audio || _playPending) return;
		const c = waveform.closest(".voice-msg");
		if (!c || c !== getContainer() || !isFinite(_audio.duration)) return;
		const rect = waveform.getBoundingClientRect();
		_audio.currentTime = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * _audio.duration;
	};
	return function toggle(btn) {
		const container = btn.closest(".voice-msg");
		if (!container) return;
		const src = container.dataset.src;
		if (!src) return;
		if (_audio && _src === src) {
			if (_playPending) return;
			if (_audio.paused) { _playPending = true; _audio.play().then(() => { _playPending = false; }).catch(e => { _playPending = false; if (e.name !== "AbortError") stop(); }); }
			else _audio.pause();
			return;
		}
		if (_audio) { stopTick(); const old = getContainer(); safePause(_audio); _audio = null; _src = null; _playPending = false; if (old) resetContainer(old); }
		const audio = new Audio(src);
		_audio = audio; _src = src; _playPending = true;
		audio.addEventListener("play", () => { setIcon("pause"); if (!_rafId) tick(); });
		audio.addEventListener("pause", () => { setIcon("play"); stopTick(); });
		audio.addEventListener("ended", () => { stopTick(); setIcon("play"); });
		audio.addEventListener("loadedmetadata", () => { const c = getContainer(); if (c) c.querySelector(".voice-time").textContent = fmt(audio.duration); });
		audio.play().then(() => { _playPending = false; }).catch(e => { _playPending = false; if (e.name !== "AbortError") stop(); });
	};
})();

const createLivekitTokenFn = httpsCallable(functions, "createLivekitToken");
const VoiceChat = {
	room: null, roomHandle: null, muted: false,
	getParticipants() {
		if (!this.roomHandle) return [];
		return [this.roomHandle.localParticipant, ...Array.from(this.roomHandle.remoteParticipants.values())];
	},
	_attachDrag(panel) {
		panel.addEventListener("mousedown", (e) => {
			if (e.target.closest("button")) return;
			e.preventDefault();
			const rect = panel.getBoundingClientRect();
			this._dragState = { startX: e.clientX, startY: e.clientY, startLeft: rect.left, startTop: rect.top };
			panel.style.right = "auto"; panel.style.bottom = "auto";
			panel.style.left = rect.left + "px"; panel.style.top = rect.top + "px";
			panel.style.cursor = "grabbing";
		});
		document.addEventListener("mousemove", (e) => {
			if (!this._dragState) return;
			panel.style.left = this._dragState.startLeft + (e.clientX - this._dragState.startX) + "px";
			panel.style.top = this._dragState.startTop + (e.clientY - this._dragState.startY) + "px";
		});
		document.addEventListener("mouseup", () => { if (this._dragState) { this._dragState = null; panel.style.cursor = "grab"; } });
	},
	setParticipantVolume(identity, value) {
		const vol = Number(value) / 100;
		localStorage.setItem(`vc_vol_${identity}`, value);
		if (!this.roomHandle) return;
		for (const [, p] of this.roomHandle.remoteParticipants) {
			if (p.identity === identity) { for (const pub of p.audioTrackPublications.values()) if (pub.track) pub.track.setVolume(vol); break; }
		}
	},
	renderUI() {
		const existing = document.getElementById("vc-panel");
		if (!this.room) { existing?.remove(); return; }
		const panel = existing || document.createElement("div");
		panel.id = "vc-panel";
		if (!existing) {
			const initialRight = document.body.classList.contains("online-board-collapsed") ? 16 : 296;
			panel.style.cssText = `position:fixed;bottom:90px;right:${initialRight}px;background:var(--bg-2);border:1px solid var(--border-4);border-radius:14px;padding:10px 12px;min-width:180px;max-width:240px;z-index:20;display:flex;flex-direction:column;gap:6px;cursor:grab;user-select:none;`;
			this._attachDrag(panel);
		}
		const participants = this.getParticipants();
		const list = participants.map((p) => {
			const isLocal = p === this.roomHandle.localParticipant;
			const isMuted = isLocal ? this.muted : !p.isMicrophoneEnabled;
			let pfp = "/assets/img/fav.png";
			if (isLocal && window.chat._myUser?.pfp) pfp = window.chat._myUser.pfp;
			else if (p.metadata) { try { const meta = JSON.parse(p.metadata); pfp = meta.avatar_url || meta.pfp || pfp; } catch {} }
			if (pfp.length > 1000) pfp = "/assets/img/fav.png";
			const ringStyle = p.isSpeaking ? "box-shadow: 0 0 0 2px var(--accent); border-color: transparent;" : "border-color: var(--border-4);";
			const storedVol = !isLocal ? Number(localStorage.getItem(`vc_vol_${p.identity}`)) || 100 : null;
			const volSlider = !isLocal ? `<input type="range" min="0" max="150" value="${storedVol}" style="width:56px;height:3px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;" title="Volume" oninput="window.VoiceChat.setParticipantVolume('${p.identity}', this.value)" />` : "";
			return `<div style="display:flex;align-items:center;gap:8px;font-size:0.82rem;">
				<img src="${escapeHtmlAttribute(pfp)}" alt="pfp" style="width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid;transition:box-shadow 0.1s ease,border-color 0.1s ease;${ringStyle}" />
				<span style="color:var(--bright-text);font-weight:500;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name || p.identity)}${isLocal ? " (you)" : ""}</span>
				${isMuted ? '<i class="fas fa-microphone-slash" style="opacity:0.5;font-size:11px;color:#f04747;"></i>' : ""}
				${volSlider}
			</div>`;
		}).join("");
		panel.innerHTML = `
			<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;">
				<span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-2);opacity:0.7;">Voice · #${escapeHtml(this.room)}</span>
				<div style="display:flex;gap:4px;">
					<button onclick="window.VoiceChat.toggleMute()" title="${this.muted ? "Unmute" : "Mute"}" style="background:none;border:none;color:${this.muted ? "#f04747" : "var(--text-2)"};cursor:pointer;padding:3px 5px;border-radius:6px;font-size:12px;"><i class="fas fa-microphone${this.muted ? "-slash" : ""}"></i></button>
					<button onclick="window.VoiceChat.leave()" title="Leave voice" style="background:none;border:none;color:#f04747;cursor:pointer;padding:3px 5px;border-radius:6px;font-size:12px;"><i class="fas fa-phone-slash"></i></button>
				</div>
			</div>
			${list || '<span style="font-size:0.8rem;opacity:0.4;">Connecting...</span>'}`;
		if (!existing) document.body.appendChild(panel);
	},
	async join(room) {
		if (this.roomHandle) await this.leave();
		this.renderUI(true);
		let token;
		try {
			const res = await createLivekitTokenFn({ room });
			token = res.data.token;
		} catch { showToast("Could not join voice — check Cloud Function logs.", "error"); return; }

		const roomHandle = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
		roomHandle.on(LivekitClient.RoomEvent.Connected, () => this.renderUI());
		roomHandle.on(LivekitClient.RoomEvent.Disconnected, () => { this.room = null; this.roomHandle = null; this.muted = false; this.renderUI(); });
		roomHandle.on(LivekitClient.RoomEvent.ParticipantConnected, () => this.renderUI());
		roomHandle.on(LivekitClient.RoomEvent.ParticipantDisconnected, () => this.renderUI());
		roomHandle.on(LivekitClient.RoomEvent.TrackSubscribed, (track, pub, participant) => {
			if (track.kind === LivekitClient.Track.Kind.Audio) {
				track.attach();
				const stored = Number(localStorage.getItem(`vc_vol_${participant.identity}`));
				if (stored >= 0) track.setVolume(stored / 100);
			}
			this.renderUI();
		});
		roomHandle.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => { track.detach(); this.renderUI(); });
		roomHandle.on(LivekitClient.RoomEvent.ActiveSpeakersChanged, () => this.renderUI());

		try {
			const livekitUrl = window.LIVEKIT_URL || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/livekit`;
			await roomHandle.connect(livekitUrl, token);
			await roomHandle.localParticipant.setMicrophoneEnabled(true);
			this.room = room;
			this.roomHandle = roomHandle;
			this.renderUI();
		} catch {}
	},
	async leave() { if (this.roomHandle) await this.roomHandle.disconnect(); this.room = null; this.roomHandle = null; this.muted = false; this.renderUI(); },
	async toggleMute() { if (!this.roomHandle) return; this.muted = !this.muted; await this.roomHandle.localParticipant.setMicrophoneEnabled(!this.muted); this.renderUI(); },
};
window.VoiceChat = VoiceChat;

function isAdminUser() { return window.chat?._myUser?.isAdmin === true; }
function isOwnerUser() { return window.chat?._myUser?.isOwner === true; }

const SLASH_COMMANDS = [
	{ name: "me", args: "<action>", desc: "Send an action/emote", mod: false },
	{ name: "shrug", args: "", desc: "¯\\_(ツ)_/¯", mod: false },
	{ name: "tableflip", args: "", desc: "(╯°□°）╯︵ ┻━┻", mod: false },
	{ name: "unflip", args: "", desc: "┬─┬ノ( º _ ºノ)", mod: false },
	{ name: "roll", args: "[sides]", desc: "Roll a dice (default d6)", mod: false },
	{ name: "coinflip", args: "", desc: "Heads or tails", mod: false },
	{ name: "help", args: "", desc: "Show available commands", mod: false },
	{ name: "mute", args: "<username> [mins]", desc: "Mute a user from chat", mod: true },
	{ name: "unmute", args: "<username>", desc: "Remove a chat mute", mod: true },
	{ name: "ban", args: "<username> [reason]", desc: "Ban a user", mod: true },
	{ name: "lock", args: "", desc: "Lock the current channel", mod: true },
	{ name: "unlock", args: "", desc: "Unlock the current channel", mod: true },
];

function showEphemeralMessage(html) {
	const container = document.getElementById("msg-container");
	if (!container) return;
	const div = document.createElement("div");
	div.className = "message-group ephemeral-message";
	div.innerHTML = `<div class="message-details"><div class="message-text">${html}</div></div>`;
	container.appendChild(div);
	container.scrollTop = container.scrollHeight;
	setTimeout(() => div.remove(), 12000);
}
function showModerationWarning(reason, issuedBy) {
	document.getElementById("mod-warning-modal")?.remove();
	const modal = document.createElement("div");
	modal.id = "mod-warning-modal";
	modal.innerHTML = `<div class="mod-warning-backdrop"><div class="mod-warning-box">
		<div class="mod-warning-icon"><i class="fas fa-triangle-exclamation"></i></div>
		<div class="mod-warning-title">Warning from Staff</div>
		<div class="mod-warning-body">${escapeHtml(reason)}</div>
		<div class="mod-warning-by">Issued by <strong>${escapeHtml(issuedBy)}</strong></div>
		<button class="mod-warning-close" onclick="document.getElementById('mod-warning-modal')?.remove()">Acknowledge</button>
	</div></div>`;
	document.body.appendChild(modal);
}

async function resolveUsernameToUid(username) {
	username = username.replace(/^@/, "").toLowerCase();
	try {
		const snap = await getDoc(doc(db, "usernames", username));
		return snap.exists() ? { uid: snap.data().uid, username } : null;
	} catch { return null; }
}

async function handleSlashCommand(rawText) {
	const text = rawText.trim();
	if (!text.startsWith("/")) return false;
	const spaceIdx = text.indexOf(" ");
	const cmd = (spaceIdx === -1 ? text.slice(1) : text.slice(1, spaceIdx)).toLowerCase();
	const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim();
	const isAdmin = isAdminUser();
	const isOwner = isOwnerUser();

	switch (cmd) {
		case "me":
			if (!args) { showEphemeralMessage('<span style="opacity:0.5">Usage: /me &lt;action&gt;</span>'); return true; }
			await window.chat.sendMessage(`*${args}*`);
			return true;
		case "shrug": await window.chat.sendMessage(`¯\\_(ツ)_/¯${args ? " " + args : ""}`); return true;
		case "tableflip": await window.chat.sendMessage(`(╯°□°）╯︵ ┻━┻${args ? " " + args : ""}`); return true;
		case "unflip": await window.chat.sendMessage(`┬─┬ノ( º _ ºノ)${args ? " " + args : ""}`); return true;
		case "roll": {
			const sides = parseInt(args) || 6;
			await window.chat.sendMessage(`🎲 rolled a d${sides} and got **${Math.floor(Math.random() * sides) + 1}**`);
			return true;
		}
		case "coinflip":
			await window.chat.sendMessage(`🪙 flipped a coin: **${Math.random() < 0.5 ? "Heads 🪙" : "Tails 🪙"}**`);
			return true;
		case "help": {
			const visible = SLASH_COMMANDS.filter(c => !c.mod || isAdmin);
			const rows = visible.map(c => `<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:var(--accent);font-weight:700;min-width:100px">/${escapeHtml(c.name)} <span style="opacity:0.5;font-weight:400">${escapeHtml(c.args)}</span></span><span style="opacity:0.65">${escapeHtml(c.desc)}</span></div>`).join("");
			showEphemeralMessage(`<div style="font-size:0.85rem"><strong style="font-size:0.9rem">Available commands</strong><div style="margin-top:6px">${rows}</div><div style="margin-top:6px;opacity:0.4;font-size:0.75rem">Only visible to you</div></div>`);
			return true;
		}
		case "mute": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const [targetName, minStr] = args.split(/\s+/);
			const minutes = parseInt(minStr) || 60;
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /mute &lt;username&gt; [minutes]</span>'); return true; }
			const target = await resolveUsernameToUid(targetName);
			if (!target) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			const mutedUntil = Timestamp.fromMillis(Date.now() + minutes * 60000);
			await updateDoc(doc(db, "users", target.uid), { mutedUntil });
			showEphemeralMessage(`<span style="color:#3dd56d">Muted @${escapeHtml(target.username)} for ${minutes} minute${minutes !== 1 ? "s" : ""}.</span>`);
			return true;
		}
		case "unmute": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const targetName = args.replace(/^@/, "");
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /unmute &lt;username&gt;</span>'); return true; }
			const target = await resolveUsernameToUid(targetName);
			if (!target) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			await updateDoc(doc(db, "users", target.uid), { mutedUntil: null });
			showEphemeralMessage(`<span style="color:#3dd56d">Unmuted @${escapeHtml(target.username)}.</span>`);
			return true;
		}
		case "ban": {
			if (!isAdmin) { showEphemeralMessage('<span style="color:#f04747">You don\'t have permission to use this command.</span>'); return true; }
			const spIdx = args.indexOf(" ");
			const targetName = spIdx === -1 ? args : args.slice(0, spIdx);
			const reason = spIdx === -1 ? "Banned via chat command" : args.slice(spIdx + 1).trim();
			if (!targetName) { showEphemeralMessage('<span style="opacity:0.5">Usage: /ban &lt;username&gt; [reason]</span>'); return true; }
			const target = await resolveUsernameToUid(targetName);
			if (!target) { showEphemeralMessage(`<span style="color:#f04747">User "${escapeHtml(targetName)}" not found.</span>`); return true; }
			await updateDoc(doc(db, "users", target.uid), { bannedAt: serverTimestamp(), banReason: reason });
			showEphemeralMessage(`<span style="color:#3dd56d">Banned @${escapeHtml(target.username)}. Reason: ${escapeHtml(reason)}</span>`);
			return true;
		}
		case "lock":
		case "unlock": {
			if (!isOwner) { showEphemeralMessage('<span style="color:#f04747">Only the owner can lock channels.</span>'); return true; }
			const room = window.chat?.currentRoom;
			if (!room) { showEphemeralMessage('<span style="opacity:0.5">You must be in a channel to use this command.</span>'); return true; }
			await updateDoc(doc(db, "channels", room), { locked: cmd === "lock" });
			showEphemeralMessage(`<span style="color:#3dd56d">#${escapeHtml(room)} is now ${cmd === "lock" ? "locked 🔒" : "unlocked 🔓"}.</span>`);
			window.chatUI?.renderSidebar();
			return true;
		}
		default:
			showEphemeralMessage(`<span style="color:#f04747">Unknown command: /${escapeHtml(cmd)}. Type /help to see available commands.</span>`);
			return true;
	}
}

let mentionPickerIndex = 0, mentionPickerMatches = [];
function showMentionPicker(matches) {
	mentionPickerMatches = matches; mentionPickerIndex = 0;
	const picker = document.getElementById("mention-picker");
	if (!picker) return;
	picker.innerHTML = "";
	matches.forEach((user, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		row.innerHTML = `<img src="${escapeHtmlAttribute(user.pfp || "/assets/img/fav.png")}" onerror="this.src='/assets/img/fav.png'" style="width:18px;height:18px;border-radius:50%;object-fit:cover;flex-shrink:0"><span style="color:var(--bright-text);font-weight:600">@${escapeHtml(user.username)}</span><span style="opacity:0.45;font-size:11px;margin-left:2px">${escapeHtml(user.display || "")}</span>`;
		row.addEventListener("mousedown", (e) => { e.preventDefault(); insertMention(user.username); });
		row.addEventListener("mouseenter", () => { mentionPickerIndex = i; highlightMentionPicker(); });
		picker.appendChild(row);
	});
	picker.style.display = "block";
}
function highlightMentionPicker() {
	const picker = document.getElementById("mention-picker");
	if (!picker) return;
	[...picker.children].forEach((el, i) => el.classList.toggle("active", i === mentionPickerIndex));
	picker.children[mentionPickerIndex]?.scrollIntoView({ block: "nearest" });
}
function hideMentionPicker() { const p = document.getElementById("mention-picker"); if (p) p.style.display = "none"; mentionPickerMatches = []; }
function insertMention(username) {
	const text = msgInput.innerText;
	const atIdx = text.lastIndexOf("@");
	if (atIdx === -1) return;
	msgInput.innerText = text.slice(0, atIdx) + "@" + username + " ";
	placeCaretAtEnd();
	hideMentionPicker();
	msgInput.dispatchEvent(new Event("input"));
}

let slashPickerIndex = 0, slashPickerMatches = [];
function showSlashPicker(matches) {
	slashPickerMatches = matches; slashPickerIndex = 0;
	const picker = document.getElementById("slash-picker");
	if (!picker) return;
	picker.innerHTML = "";
	matches.forEach((cmd, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		row.innerHTML = `<span style="color:var(--accent);font-weight:700;font-size:13px;min-width:90px">/${escapeHtml(cmd.name)}</span><span style="opacity:0.5;font-size:11px">${escapeHtml(cmd.args)}</span><span style="opacity:0.7;font-size:12px;margin-left:auto">${escapeHtml(cmd.desc)}</span>`;
		row.addEventListener("mousedown", (e) => { e.preventDefault(); insertSlashCommand(cmd); });
		row.addEventListener("mouseenter", () => { slashPickerIndex = i; highlightSlashPicker(); });
		picker.appendChild(row);
	});
	picker.style.display = "block";
}
function highlightSlashPicker() {
	const picker = document.getElementById("slash-picker");
	if (!picker) return;
	[...picker.children].forEach((el, i) => el.classList.toggle("active", i === slashPickerIndex));
	picker.children[slashPickerIndex]?.scrollIntoView({ block: "nearest" });
}
function hideSlashPicker() { const p = document.getElementById("slash-picker"); if (p) p.style.display = "none"; slashPickerMatches = []; }
function insertSlashCommand(cmd) {
	msgInput.innerText = `/${cmd.name}${cmd.args ? " " : ""}`;
	placeCaretAtEnd();
	hideSlashPicker();
	msgInput.focus();
}

let emojiPickerIndex = 0, emojiPickerMatches = [];
function showEmojiPicker(matches) {
	emojiPickerMatches = matches; emojiPickerIndex = 0;
	const picker = document.getElementById("emoji-picker");
	picker.innerHTML = "";
	matches.forEach((name, i) => {
		const row = document.createElement("div");
		row.className = "emoji-picker-row" + (i === 0 ? " active" : "");
		row.innerHTML = `<span class="emoji-glyph">${EMOJI_MAP[name]}</span><span>:${name}:</span>`;
		row.addEventListener("mousedown", (e) => { e.preventDefault(); insertPickerEmoji(name); });
		row.addEventListener("mouseenter", () => { emojiPickerIndex = i; highlightEmojiPicker(); });
		picker.appendChild(row);
	});
	picker.style.display = "block";
}
function highlightEmojiPicker() {
	const picker = document.getElementById("emoji-picker");
	[...picker.children].forEach((el, i) => el.classList.toggle("active", i === emojiPickerIndex));
	picker.children[emojiPickerIndex]?.scrollIntoView({ block: "nearest" });
}
function hideEmojiPicker() { const p = document.getElementById("emoji-picker"); if (p) p.style.display = "none"; emojiPickerMatches = []; }
function insertPickerEmoji(name) {
	const text = msgInput.innerText;
	const colonIdx = text.lastIndexOf(":");
	if (colonIdx === -1) return;
	msgInput.innerText = text.slice(0, colonIdx) + EMOJI_MAP[name] + " ";
	placeCaretAtEnd();
	hideEmojiPicker();
	msgInput.dispatchEvent(new Event("input"));
}
function placeCaretAtEnd() {
	const range = document.createRange();
	range.selectNodeContents(msgInput);
	range.collapse(false);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
}

function makeBadge(label, bg, color, marginLeft = "-5px") {
	const b = document.createElement("span");
	b.className = "chat-badge";
	b.innerText = label;
	Object.assign(b.style, { background: bg, color, fontWeight: "bold", padding: "2px 5px", borderRadius: "4px", fontSize: "10px", marginLeft, width: "fit-content", display: "inline-block" });
	return b;
}
async function showUserProfile(username) {
	document.getElementById("user-profile-modal")?.remove();
	const modal = document.createElement("div");
	modal.id = "user-profile-modal";
	modal.innerHTML = `<div class="upm-backdrop" onclick="closeUserProfile(event)"><div class="upm-card">
		<div class="upm-banner" id="upm-banner"></div>
		<div class="upm-below-banner"><img class="upm-avatar" id="upm-avatar" src="/assets/img/fav.png" alt=""><div class="upm-header-actions"><button class="upm-close" onclick="document.getElementById('user-profile-modal')?.remove()"><i class="fas fa-xmark"></i></button></div></div>
		<div class="upm-info"><div class="upm-loading"><i class="fas fa-spinner fa-spin"></i></div>
		<div class="upm-body" style="display:none">
			<div class="upm-nameline"><span class="upm-display" id="upm-display"></span><i class="fas fa-circle-check upm-verified" id="upm-verified" style="display:none"></i></div>
			<div class="upm-username" id="upm-username"></div><div class="upm-badges" id="upm-badges"></div>
			<p class="upm-bio" id="upm-bio" style="display:none"></p>
			<div class="upm-stats" id="upm-stats"></div><div class="upm-actions" id="upm-actions"></div>
		</div></div></div></div>`;
	document.body.appendChild(modal);

	try {
		const target = await resolveUsernameToUid(username);
		if (!target) throw new Error("not found");
		const snap = await getDoc(doc(db, "users", target.uid));
		if (!snap.exists()) throw new Error("not found");
		const p = { id: target.uid, ...snap.data() };

		if (p.bannerUrl) document.getElementById("upm-banner").style.backgroundImage = `url(${JSON.stringify(p.bannerUrl)})`;
		const av = document.getElementById("upm-avatar");
		av.src = p.pfp || "/assets/img/fav.png";
		av.onerror = () => { av.src = "/assets/img/fav.png"; };
		document.getElementById("upm-display").textContent = p.display || p.username;
		if (p.trusted) document.getElementById("upm-verified").style.display = "";
		document.getElementById("upm-username").textContent = `@${p.username}`;

		const badgeCls = b => b === "admin" ? "upm-badge-admin" : b === "mod" ? "upm-badge-mod" : b === "dev" ? "upm-badge-dev" : b === "trusted" ? "upm-badge-trusted" : "upm-badge-user";
		const bads = (p.badges || []).filter(b => b !== "user");
		if (p.trusted && !bads.includes("trusted")) bads.unshift("trusted");
		document.getElementById("upm-badges").innerHTML = bads.map(b => `<span class="upm-badge ${badgeCls(b)}">${b}</span>`).join("");
		if (p.bio) { const el = document.getElementById("upm-bio"); el.textContent = p.bio; el.style.display = ""; }
		const joined = p.createdAt ? new Date(tsToIso(p.createdAt)).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
		document.getElementById("upm-stats").innerHTML = joined ? `<span class="upm-stat">Joined <strong>${joined}</strong></span>` : "";

		const actEl = document.getElementById("upm-actions");
		const isSelf = window.chat._myUserId === p.id;
		const msgBtn = document.createElement("a");
		msgBtn.className = "upm-btn upm-btn-secondary";
		if (isSelf) { msgBtn.href = "/pages/profile.html"; msgBtn.innerHTML = `<i class="fas fa-pen"></i> Edit Profile`; }
		else { msgBtn.href = "#"; msgBtn.innerHTML = `<i class="fas fa-comment"></i> Message`; msgBtn.onclick = (e) => { e.preventDefault(); modal.remove(); window.chatUI.openDmWithUser(p.id, p.display || p.username, p.pfp); }; }
		actEl.appendChild(msgBtn);

		modal.querySelector(".upm-loading").style.display = "none";
		modal.querySelector(".upm-body").style.display = "";
	} catch {
		const loading = modal.querySelector(".upm-loading");
		if (loading) loading.innerHTML = `<span style="opacity:.5">Failed to load profile.</span>`;
	}
}
function closeUserProfile(e) { if (e.target === e.currentTarget) document.getElementById("user-profile-modal")?.remove(); }
window.showUserProfile = showUserProfile;
window.closeUserProfile = closeUserProfile;
function copyUsername(username) { navigator.clipboard.writeText(username).catch(() => {}); showToast(`@${username} copied`, "success"); }
window.copyUsername = copyUsername;

function normalizeMessage(id, raw) {
	if (!raw) return null;
	return {
		id,
		from: raw.fromUid || "",
		username: raw.username || "unknown",
		display: raw.display || raw.username || "unknown",
		avatar_url: raw.avatarUrl || "/assets/img/fav.png",
		content: raw.content || "",
		badges: Array.isArray(raw.badges) ? raw.badges : [],
		sent_at: tsToIso(raw.sentAt),
		reply_to_id: raw.replyToId || null,
		trusted: raw.trusted === true,
		message_type: raw.messageType || "text",
		attachment_url: raw.attachmentUrl || null,
		reactions: raw.reactions || {},
	};
}

window.chat = {
	messages: [],
	displayLimit: PAGE_SIZE,
	isLoadingMore: false,
	hasMoreHistory: true,
	currentRoom: null,
	currentDmUserId: null,
	currentDmRecipient: null,
	currentGroupId: null,
	replyingTo: null,
	presence: { room: [], dm: [], group: [] },
	typing: { room: [], dm: [], group: [] },
	typingStopTimer: null,
	isTyping: false,
	gifPickerOpen: false,
	gifSearchTimeout: null,
	blockedIds: new Set(),
	revealedBlockedIds: new Set(),
	_myUserId: null,
	_myUser: null,
	_unsubMessages: null,
	_unsubPresence: null,
	_unsubTyping: null,
	_unsubUserDoc: null,

	async ensureCurrentUser() {
		return new Promise((resolve) => {
			onAuthStateChanged(auth, async (fbUser) => {
				if (!fbUser) { await signInAnonymously(auth).catch(() => {}); return; }
				this._myUserId = fbUser.uid;
				this._unsubUserDoc?.();
				this._unsubUserDoc = onSnapshot(doc(db, "users", fbUser.uid), (snap) => {
					this._myUser = snap.exists() ? { id: fbUser.uid, ...snap.data() } : null;
					window._currentUsername = this._myUser?.username || "";
					const input = document.getElementById("msg-input");
					if (input) {
						input.contentEditable = this._myUser ? "true" : "false";
						input.dataset.placeholder = this._myUser ? "Send a message here..." : "Set a username to start chatting.";
					}
					if (this._myUser && !document.getElementById("modal-username-setup").classList.contains("open")) {
            
					}
					resolve(this._myUser);
				});
			});
		});
	},

	async claimUsername(rawUsername) {
		const username = rawUsername.trim();
		if (!/^[a-zA-Z0-9_]{2,24}$/.test(username)) throw new Error("2-24 characters: letters, numbers and underscores only.");
		const usernameLower = username.toLowerCase();
		const uid = auth.currentUser?.uid;
		if (!uid) throw new Error("Not signed in yet. try again in a second.");
		await runTransaction(db, async (tx) => {
			const nameRef = doc(db, "usernames", usernameLower);
			const nameSnap = await tx.get(nameRef);
			if (nameSnap.exists() && nameSnap.data().uid !== uid) throw new Error("That username is taken.");
			tx.set(nameRef, { uid });
			tx.set(doc(db, "users", uid), {
				username, usernameLower, display: username,
				pfp: "/assets/img/fav.png", badges: ["user"], trusted: false,
				isAdmin: false, isOwner: false, createdAt: serverTimestamp(),
				mutedUntil: null, bannedAt: null,
			}, { merge: true });
		});
	},

	watchChannels(cb) {
		return onSnapshot(collection(db, "channels"), (snap) => {
			const channels = snap.docs.map(d => ({ name: d.id, ...d.data() }));
			cb(channels);
		});
	},

	async createChannel(name, isPrivate) {
		const clean = name.trim().replace(/[^a-zA-Z0-9_\-]/g, "");
		if (!clean) throw new Error("Channel name is required.");
		const ref = doc(db, "channels", clean);
		if ((await getDoc(ref)).exists()) throw new Error("A channel with that name already exists.");
		const inviteCode = isPrivate ? Math.random().toString(36).slice(2, 10) : null;
		await setDoc(ref, {
			name: clean, private: !!isPrivate, locked: false, inviteCode,
			ownerId: this._myUserId, members: isPrivate ? [this._myUserId] : [], createdAt: serverTimestamp(),
		});
		return { name: clean, private: !!isPrivate };
	},

	async joinChannelByCode(code) {
		const snap = await getDocs(query(collection(db, "channels"), where("inviteCode", "==", code)));
		if (snap.empty) throw new Error("Invalid invite code.");
		const d = snap.docs[0];
		await updateDoc(d.ref, { members: arrayUnion(this._myUserId) });
		return { name: d.id, ...d.data() };
	},

	_scopeCollectionPath() {
		if (this.currentDmUserId) return `dms/${[this._myUserId, this.currentDmUserId].sort().join("_")}/messages`;
		if (this.currentGroupId) return `groups/${this.currentGroupId}/messages`;
		return `channels/${this.currentRoom || "general"}/messages`;
	},

	_teardownScope() {
		this._unsubMessages?.(); this._unsubMessages = null;
		this._unsubPresence?.(); this._unsubPresence = null;
		this._unsubTyping?.(); this._unsubTyping = null;
		this.stopTyping();
	},

	setRoom(roomName) {
		this._teardownScope();
		this.currentRoom = roomName; this.currentDmUserId = null; this.currentDmRecipient = null; this.currentGroupId = null;
		this.presence.dm = []; this.typing.dm = [];
		this._resetMessageState();
		this._attachScopeListeners("room", roomName);
		window.chatUI?.renderSidebar();
	},

	setDm(userId) {
		this._teardownScope();
		this.currentDmUserId = userId; this.currentRoom = null; this.currentGroupId = null; this.currentDmRecipient = null;
		this.presence.room = []; this.typing.room = [];
		this._resetMessageState();
		this._attachScopeListeners("dm", userId);
		window.chatUI?.renderSidebar();
	},

	setGroup(groupId, groupName) {
		this._teardownScope();
		this.currentGroupId = groupId; this.currentRoom = null; this.currentDmUserId = null; this.currentDmRecipient = null;
		this.presence.room = []; this.presence.dm = []; this.typing.room = []; this.typing.dm = [];
		this._resetMessageState();
		this._attachScopeListeners("group", groupId);
		window.chatUI?.renderSidebar();
	},

	closeDm() { this.setRoom("general"); },

	_resetMessageState() {
		this.messages = []; this.displayLimit = PAGE_SIZE; this.hasMoreHistory = true; this.renderFingerprint = "";
		document.getElementById("msg-container").innerHTML = "";
	},

	_attachScopeListeners(scope, scopeId) {
		const path = this._scopeCollectionPath();
		const q = query(collection(db, path), orderBy("sentAt", "asc"), limitToLast(PAGE_SIZE));
		this._unsubMessages = onSnapshot(q, (snap) => {
			snap.docChanges().forEach((change) => {
				const message = normalizeMessage(change.doc.id, change.doc.data());
				if (!message) return;
				if (change.type === "removed") { this.removeMessage(message.id); return; }
				const isNew = !this.messages.find(m => m.id === message.id);
				this.addOrUpdateMessage(message);
				if (isNew && message.from !== this._myUserId) this._notifyIncoming(message);
			});
			this.renderFingerprint = "";
			this.renderMessages(this.isNearBottom() || snap.metadata.hasPendingWrites);
		});

		const presencePath = scope === "dm" ? `presence/dms/${[this._myUserId, scopeId].sort().join("_")}` : `presence/${scope}s/${scopeId}`;
		const myPresenceRef = rtdbRef(rtdb, `${presencePath}/${this._myUserId}`);
		rtdbSet(myPresenceRef, { username: this._myUser?.username, display: this._myUser?.display, pfp: this._myUser?.pfp, id: this._myUserId, ts: rtdbServerTimestamp() });
		onDisconnect(myPresenceRef).remove();
		this._unsubPresence = onValue(rtdbRef(rtdb, presencePath), (snap) => {
			const users = snap.exists() ? Object.values(snap.val()) : [];
			this.presence[scope] = users;
			document.dispatchEvent(new CustomEvent("chat:presence", { detail: { scope, room: scope === "room" ? scopeId : null, userId: scope === "dm" ? scopeId : null, groupId: scope === "group" ? scopeId : null, users } }));
		});

		const typingPath = scope === "dm" ? `typing/dms/${[this._myUserId, scopeId].sort().join("_")}` : `typing/${scope}s/${scopeId}`;
		this._unsubTyping = onValue(rtdbRef(rtdb, typingPath), (snap) => {
			const all = snap.exists() ? Object.values(snap.val()) : [];
			this.typing[scope] = all.filter(u => u.id !== this._myUserId);
			this.renderTypingIndicator();
		});
		this._typingPath = typingPath;
	},

	_notifyIncoming(message) {
		const myName = (window._currentUsername || "").toLowerCase();
		const everyonePing = message.content && /@everyone\b/i.test(message.content);
		const mentionsMe = myName && message.content && new RegExp(`@${myName}\\b`, "i").test(message.content);
		if (everyonePing || mentionsMe) {
			playMentionSound();
			sendBrowserNotification(everyonePing ? `${message.display} pinged @everyone` : `${message.display} mentioned you`, message.content);
		} else if (!this.currentRoom && !this.currentGroupId) {
			playDmSound();
			sendBrowserNotification(`DM from ${message.display}`, message.content);
		} else {
			playMessageSound();
		}
	},

	isSocketReady() { return true; }, 

	startTyping() {
		if (!this._typingPath || !this._myUserId) return;
		if (!this.isTyping) {
			this.isTyping = true;
			rtdbSet(rtdbRef(rtdb, `${this._typingPath}/${this._myUserId}`), { id: this._myUserId, username: this._myUser?.username, display: this._myUser?.display });
			onDisconnect(rtdbRef(rtdb, `${this._typingPath}/${this._myUserId}`)).remove();
		}
		if (this.typingStopTimer) clearTimeout(this.typingStopTimer);
		this.typingStopTimer = setTimeout(() => this.stopTyping(), TYPING_IDLE_MS);
	},
	stopTyping() {
		if (this.typingStopTimer) { clearTimeout(this.typingStopTimer); this.typingStopTimer = null; }
		if (!this.isTyping) return;
		this.isTyping = false;
		if (this._typingPath && this._myUserId) rtdbRemove(rtdbRef(rtdb, `${this._typingPath}/${this._myUserId}`)).catch(() => {});
	},
	renderTypingIndicator() {
		const indicator = document.getElementById("typing-indicator");
		if (!indicator) return;
		const users = this.currentGroupId ? this.typing.group : this.currentDmUserId ? this.typing.dm : this.typing.room;
		if (!users || users.length === 0) { indicator.textContent = ""; indicator.classList.remove("visible"); return; }
		const names = users.map(u => u.display || u.username);
		indicator.textContent = names.length === 1 ? `${names[0]} is typing...` : names.length === 2 ? `${names[0]} and ${names[1]} are typing...` : `${names[0]} and ${names.length - 1} others are typing...`;
		indicator.classList.add("visible");
	},

	addOrUpdateMessage(message) {
		const i = this.messages.findIndex(m => m.id === message.id);
		if (i >= 0) this.messages.splice(i, 1, message);
		else { this.messages.push(message); this.messages.sort((a, b) => new Date(a.sent_at) - new Date(b.sent_at)); }
	},
	removeMessage(id) { this.messages = this.messages.filter(m => m.id !== id); },
	getVisibleMessages() { return this.messages.slice(-this.displayLimit); },
	isNearBottom() {
		const c = document.getElementById("msg-container");
		if (!c) return true;
		return c.scrollHeight - c.scrollTop <= c.clientHeight + 100;
	},

	async loadMore() {
		if (this.isLoadingMore || !this.hasMoreHistory || this.messages.length === 0) return;
		this.isLoadingMore = true;
		const container = document.getElementById("msg-container");
		const previousHeight = container.scrollHeight;
		const oldestSentAt = Timestamp.fromDate(new Date(this.messages[0].sent_at));
		const path = this._scopeCollectionPath();
		const q = query(collection(db, path), orderBy("sentAt", "asc"), endBefore(oldestSentAt), limitToLast(PAGE_SIZE));
		const snap = await getDocs(q);
		const older = snap.docs.map(d => normalizeMessage(d.id, d.data())).filter(Boolean);
		if (older.length < PAGE_SIZE) this.hasMoreHistory = false;
		if (older.length > 0) {
			older.forEach(m => this.addOrUpdateMessage(m));
			this.displayLimit += older.length;
			this.renderFingerprint = "";
			this.renderMessages(false);
			container.scrollTop = container.scrollHeight - previousHeight;
		}
		this.isLoadingMore = false;
	},

	initScrollObserver() {
		const container = document.getElementById("msg-container");
		if (!container) return;
		container.addEventListener("scroll", () => {
			if (container.scrollTop <= 80 && !this.isLoadingMore && this.hasMoreHistory) this.loadMore();
			const jumpBtn = document.getElementById("jump-to-bottom");
			if (jumpBtn) jumpBtn.classList.toggle("visible", container.scrollHeight - container.scrollTop > container.clientHeight + 120);
		});
	},

	buildMessageElement(msg, user, previousMessage = null) {
		const isMe = msg.from === user?.id;
		let pfp = msg.avatar_url || (isMe ? user?.pfp || "/assets/img/fav.png" : "/assets/img/fav.png");
		if (pfp.length > 1000) pfp = "/assets/img/fav.png";

		const currentT = new Date(msg.sent_at).getTime();
		const prevT = previousMessage ? new Date(previousMessage.sent_at).getTime() : null;
		const shouldChain = previousMessage && previousMessage.from === msg.from && prevT && currentT - prevT < 5 * 60 * 1000;

		const div = document.createElement("div");
		const badgeContainerId = `badges-${msg.id}`;
		div.className = "message-group" + (shouldChain ? " chained" : "");
		div.dataset.msgId = msg.id;

		const isActuallyBlocked = this.blockedIds.has(msg.from);
		const isBlocked = isActuallyBlocked && !this.revealedBlockedIds.has(msg.from) && !isMe;
		const isAdmin = isAdminUser();
		const safeUsernameAttr = escapeHtmlAttribute(msg.username);
		const safeUsername = escapeHtml(msg.username);
		const safeDisplay = escapeHtml(msg.display || msg.username);
		const safePfp = escapeHtmlAttribute(pfp);
		const isTrusted = msg.trusted === true;
		const displayStyle = isTrusted ? "cursor:pointer;background:linear-gradient(90deg,var(--accent),var(--accent-2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text" : (isMe ? "" : "cursor:pointer");
		const trustedBadgeHtml = isTrusted ? `<i class="fas fa-circle-check" title="Verified account" style="font-size:11px;color:var(--accent);flex-shrink:0"></i>` : "";
		const atHtml = !isMe ? `<span class="user-at" onclick="copyUsername('${safeUsernameAttr}')" title="Copy username">@${safeUsername}</span>` : "";
		const blockBtn = !isMe ? (isActuallyBlocked
			? `<button onclick="window.chat.unblockUser('${msg.from}')" title="Unblock user"><i class="fas fa-user-check"></i></button>`
			: `<button onclick="window.chat.blockUser('${msg.from}')" title="Block user"><i class="fas fa-ban"></i></button>`) : "";
		const quoteBtn = msg.message_type === "text" && msg.content && !msg.content.startsWith("[quote:")
			? `<button onclick="window.chat.makeItAQuote('${msg.id}', this)" title="Make it a Quote"><i class="fas fa-quote-right"></i></button>` : "";
		const actionHtml = `<div class="message-actions">
			<button onclick="window.chat.setReply('${msg.id}')" title="Reply"><i class="fas fa-reply"></i></button>
			<button onclick="window.chat.openReactPicker('${msg.id}', this)" title="React"><i class="fas fa-face-smile"></i></button>
			${quoteBtn}
			${!isMe ? `<button onclick="window.chat.reportMessage('${msg.id}')" title="Report message"><i class="fas fa-flag"></i></button>` : ""}
			${blockBtn}
			${isAdmin && !isMe ? `<button onclick="window.chat.muteUser('${msg.from}', '${safeUsernameAttr}')" title="Mute user"><i class="fas fa-microphone-slash"></i></button>` : ""}
			${isMe ? `<button onclick="window.chat.editMessage('${msg.id}')" title="Edit message"><i class="fas fa-pen"></i></button>` : ""}
			${isMe || isAdmin ? `<button onclick="window.chat.deleteMessage('${msg.id}')" title="Delete"><i class="fas fa-trash"></i></button>` : ""}
		</div>`;

		const replyMsg = msg.reply_to_id ? this.messages.find(m => m.id === msg.reply_to_id) : null;
		const replyPreviewHtml = replyMsg
			? `<div class="reply-preview" onclick="window.chat.scrollToMessage('${replyMsg.id}')"><span class="reply-preview-name">${escapeHtml(replyMsg.username)}</span><span class="reply-preview-text">${escapeHtml(replyMsg.content.length > 60 ? replyMsg.content.slice(0, 60) + "..." : replyMsg.content)}</span></div>` : "";

		if (isBlocked) {
			div.innerHTML = shouldChain
				? `<div class="message-details"><div class="message-text" style="opacity:0.35;font-size:0.85rem;font-style:italic;cursor:pointer;" onclick="window.chat.revealBlocked('${msg.from}')">— blocked message — <span style="text-decoration:underline;opacity:0.7;">click to reveal</span></div></div>${actionHtml}`
				: `<img src="${safePfp}" alt="pfp" class="user-pfp" style="opacity:0.3;" /><div class="message-details">${replyPreviewHtml}<div class="message-info"><span class="user-name" style="opacity:0.35;">${safeUsername}</span></div><div class="message-text" style="opacity:0.35;font-size:0.85rem;font-style:italic;cursor:pointer;" onclick="window.chat.revealBlocked('${msg.from}')">— blocked message — <span style="text-decoration:underline;opacity:0.7;">click to reveal</span></div></div>${actionHtml}`;
			return div;
		}

		const profileClickAttr = !isMe ? `onclick="showUserProfile('${safeUsernameAttr}')"` : "";
		const relTime = formatRelativeTime(msg.sent_at);
		const fullTime = new Date(msg.sent_at).toLocaleString();
		const reactBarId = `reactions-${msg.id}`;

		let msgBodyHtml, embedUrl = null;
		if (msg.message_type === "image" && msg.attachment_url) {
			msgBodyHtml = `<div class="message-text"><img src="${escapeHtmlAttribute(msg.attachment_url)}" class="chat-image-attachment" alt="image" loading="lazy" onclick="window.open(this.src,'_blank','noopener,noreferrer')" /></div>`;
		} else if (msg.message_type === "voice" && msg.attachment_url) {
			const bars = buildVoiceWaveform(msg.attachment_url);
			msgBodyHtml = `<div class="message-text"><div class="voice-msg" data-src="${escapeHtmlAttribute(msg.attachment_url)}"><button class="voice-play-btn" onclick="window.voicePlayerToggle(this)" aria-label="Play"><i class="fas fa-play"></i></button><div class="voice-waveform" onclick="window.voiceSeek(this,event)">${bars}</div><span class="voice-time">0:00</span></div></div>`;
		} else {
			msgBodyHtml = `<div class="message-text">${parseMentions(parseLinks(parseMarkdown(parseEmoji(msg.content), msg.id)))}</div>`;
			embedUrl = extractFirstEmbedUrl(msg.content);
		}
		const embedContainerHtml = embedUrl ? `<div class="link-embed-container" data-url="${escapeHtmlAttribute(embedUrl)}"></div>` : "";

		div.innerHTML = shouldChain
			? `<div class="message-details">${replyPreviewHtml}${msgBodyHtml}${embedContainerHtml}<div class="reaction-bar" id="${reactBarId}"></div></div>${actionHtml}`
			: `<img src="${safePfp}" alt="pfp" class="user-pfp" /><div class="message-details">${replyPreviewHtml}<div class="message-info"><span class="user-name-wrap"><span class="user-name" ${profileClickAttr} style="${displayStyle}">${safeDisplay}</span>${trustedBadgeHtml}${atHtml}</span><div id="${badgeContainerId}" class="badge-container"></div><span class="message-time" title="${escapeHtmlAttribute(fullTime)}">${relTime}</span></div>${msgBodyHtml}${embedContainerHtml}<div class="reaction-bar" id="${reactBarId}"></div></div>${actionHtml}`;

		if (embedUrl) { const c = div.querySelector(".link-embed-container"); if (c) loadLinkEmbed(c); }
		this.renderReactionsInto(div.querySelector(`#${reactBarId}`), msg.reactions);
		return div;
	},

	renderReactionsInto(bar, reactions) {
		if (!bar) return;
		const entries = Object.entries(reactions || {}).filter(([, users]) => users?.length);
		if (!entries.length) { bar.innerHTML = ""; return; }
		bar.innerHTML = entries.map(([emoji, users]) => {
			const isMe = users.includes(this._myUserId);
			return `<button class="reaction-pill${isMe ? " me" : ""}" title="${users.length} reacted" onclick="window.chat.toggleReaction('${bar.id.replace("reactions-", "")}','${escapeHtmlAttribute(emoji)}')">${emoji} <span>${users.length}</span></button>`;
		}).join("");
	},

	revealBlocked(userId) { this.revealedBlockedIds.add(userId); this.renderFingerprint = ""; this.renderMessages(false); },

	renderMessages(shouldScrollToBottom = false) {
		const container = document.getElementById("msg-container");
		if (!container) return;
		const user = this._myUser;
		const visible = this.getVisibleMessages();
		const signature = JSON.stringify(visible.map(m => [m.id, m.content, m.reactions]));
		if (signature === this.renderFingerprint) return;
		this.renderFingerprint = signature;
		container.innerHTML = "";
		let prev = null;
		for (const msg of visible) {
			const el = this.buildMessageElement(msg, user, prev);
			container.appendChild(el);
			prev = msg;
		}
		if (shouldScrollToBottom) container.scrollTop = container.scrollHeight;
	},

	setReply(id) {
		const msg = this.messages.find(m => m.id === id);
		if (!msg) return;
		this.replyingTo = msg;
		const bar = document.getElementById("reply-bar");
		document.getElementById("reply-bar-name").textContent = msg.username;
		document.getElementById("reply-bar-preview").textContent = msg.content.length > 80 ? msg.content.slice(0, 80) + "..." : msg.content;
		bar.style.display = "flex";
		document.getElementById("msg-input")?.focus();
	},
	cancelReply() { this.replyingTo = null; document.getElementById("reply-bar").style.display = "none"; },
	scrollToMessage(id) {
		const el = document.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!el) return;
		el.scrollIntoView({ behavior: "smooth", block: "center" });
		el.classList.add("highlight");
		setTimeout(() => el.classList.remove("highlight"), 1500);
	},

	async sendMessage(text) {
		if (!text.trim() || !this._myUser) return;
		if (this._myUser.mutedUntil && tsToIso(this._myUser.mutedUntil) > new Date().toISOString()) {
			showToast("You're muted and can't send messages right now.", "error");
			return;
		}
		const content = cleanContent(text);
		const path = this._scopeCollectionPath();
		const replyToId = this.replyingTo?.id ?? null;
		this.cancelReply();
		this.stopTyping();
		try {
			await addDoc(collection(db, path), {
				fromUid: this._myUserId, username: this._myUser.username, display: this._myUser.display,
				avatarUrl: this._myUser.pfp || "/assets/img/fav.png", content, badges: this._myUser.badges || ["user"],
				sentAt: serverTimestamp(), replyToId, trusted: !!this._myUser.trusted, messageType: "text", reactions: {},
			});
			
		} catch (e) {
			showToast(e?.message || "Failed to send message.", "error");
		}
	},

	async sendMediaMessage(file, messageType) {
		if (!this._myUser) { showToast("You must be logged in to send media.", "error"); return; }
		try {
			const path = `uploads/${this._myUserId}/${Date.now()}-${file.name}`;
			const ref = storageRef(storage, path);
			await uploadBytes(ref, file);
			const url = await getDownloadURL(ref);
			await addDoc(collection(db, this._scopeCollectionPath()), {
				fromUid: this._myUserId, username: this._myUser.username, display: this._myUser.display,
				avatarUrl: this._myUser.pfp || "/assets/img/fav.png", content: "", badges: this._myUser.badges || ["user"],
				sentAt: serverTimestamp(), replyToId: null, trusted: !!this._myUser.trusted, messageType, attachmentUrl: url, reactions: {},
			});
		} catch {
			showToast("Failed to send media.", "error");
		}
	},

	async sendGif(url) {
		if (!isAllowedGifUrl(url)) return;
		await this.sendMessage(`[gif:${url}]`);
	},

	editMessage(id) {
		const msgEl = document.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!msgEl || msgEl.dataset.editing === "1") return;
		const msg = this.messages.find(m => m.id === id);
		if (!msg) return;
		msgEl.dataset.editing = "1";
		const textEl = msgEl.querySelector(".message-text");
		if (!textEl) return;
		const wrap = document.createElement("div");
		wrap.className = "inline-edit-wrap";
		const input = document.createElement("div");
		input.className = "inline-edit-input";
		input.contentEditable = "true";
		input.textContent = msg.content;
		const actions = document.createElement("div");
		actions.className = "inline-edit-actions";
		actions.innerHTML = `<span class="inline-edit-hint">esc to cancel · enter to save</span>
			<button class="btn btn-ghost" style="padding:3px 10px;font-size:0.8rem;" onclick="window.chat.cancelEdit('${id}')">Cancel</button>
			<button class="btn btn-primary" style="padding:3px 10px;font-size:0.8rem;" onclick="window.chat.saveEdit('${id}')">Save</button>`;
		wrap.appendChild(input); wrap.appendChild(actions);
		textEl.replaceWith(wrap);
		input.focus();
		const range = document.createRange(); range.selectNodeContents(input); range.collapse(false);
		const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.saveEdit(id); }
			if (e.key === "Escape") this.cancelEdit(id);
		});
	},
	cancelEdit(id) {
		const msgEl = document.querySelector(`.message-group[data-msg-id="${id}"]`);
		if (!msgEl) return;
		delete msgEl.dataset.editing;
		this.renderFingerprint = ""; this.renderMessages(false);
	},
	async saveEdit(id) {
		const msgEl = document.querySelector(`.message-group[data-msg-id="${id}"]`);
		const input = msgEl?.querySelector(".inline-edit-input");
		if (!input) return;
		const newContent = cleanContent(input.innerText);
		if (!newContent) return;
		try {
			await updateDoc(doc(db, this._scopeCollectionPath(), id), { content: newContent });
			delete msgEl.dataset.editing;
			showToast("Message edited", "success");
		} catch (e) {
			showToast(e?.message || "Failed to edit message", "error");
		}
	},
	async deleteMessage(id) {
		try { await deleteDoc(doc(db, this._scopeCollectionPath(), id)); }
		catch { showToast("Failed to delete message.", "error"); }
	},

	async toggleReaction(messageId, emoji) {
		const ref = doc(db, this._scopeCollectionPath(), messageId);
		try {
			await runTransaction(db, async (tx) => {
				const snap = await tx.get(ref);
				if (!snap.exists()) return;
				const reactions = snap.data().reactions || {};
				const users = new Set(reactions[emoji] || []);
				if (users.has(this._myUserId)) users.delete(this._myUserId); else users.add(this._myUserId);
				reactions[emoji] = [...users];
				tx.update(ref, { reactions });
			});
		} catch {}
	},
	openReactPicker(messageId, btn) {
		const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "🎉", "✅"];
		const existing = document.getElementById("quick-react-picker");
		if (existing) { existing.remove(); if (existing.dataset.msgId === messageId) return; }
		const picker = document.createElement("div");
		picker.id = "quick-react-picker";
		picker.dataset.msgId = messageId;
		picker.innerHTML = QUICK_EMOJIS.map(e => `<button onclick="window.chat.toggleReaction('${messageId}','${e}');document.getElementById('quick-react-picker')?.remove()">${e}</button>`).join("");
		const rect = btn.getBoundingClientRect();
		picker.style.cssText = `position:fixed;top:${rect.top - 46}px;left:${rect.left}px;z-index:200;background:var(--bg-2);border:1px solid var(--border-4);border-radius:12px;padding:4px 6px;display:flex;gap:2px;box-shadow:0 4px 16px rgba(0,0,0,0.4)`;
		document.body.appendChild(picker);
		const close = (e) => { if (!picker.contains(e.target) && e.target !== btn) { picker.remove(); document.removeEventListener("click", close); } };
		setTimeout(() => document.addEventListener("click", close), 10);
	},

	makeItAQuote(messageId, btn) {
		const msg = this.messages.find(m => m.id === messageId);
		if (!msg || msg.message_type !== "text") return;
		document.getElementById("quote-action-menu")?.remove();
		const previewText = msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]").slice(0, 300);
		const preview = previewText.length > 80 ? previewText.slice(0, 80) + "…" : previewText;
		const menu = document.createElement("div");
		menu.id = "quote-action-menu";
		menu.className = "quote-action-menu";
		menu.innerHTML = `<div class="qam-preview"><img src="${escapeHtmlAttribute(msg.avatar_url)}" class="qam-avatar" onerror="this.src='/assets/img/fav.png'" /><div class="qam-info"><span class="qam-display">${escapeHtml(msg.display)}</span><span class="qam-text">"${escapeHtml(preview)}"</span></div></div>
			<div class="qam-actions">
				<button class="qam-btn" onclick="window.chat.saveQuote('${messageId}')"><i class="fas fa-bookmark"></i> Save Quote</button>
				<button class="qam-btn qam-btn-share" onclick="window.chat.shareQuoteToChat('${messageId}')"><i class="fas fa-share"></i> Share in Chat</button>
			</div>`;
		document.body.appendChild(menu);
		const rect = btn.getBoundingClientRect();
		const mRect = menu.getBoundingClientRect();
		let top = rect.top - mRect.height - 8;
		if (top < 8) top = rect.bottom + 8;
		menu.style.top = `${top}px`;
		menu.style.left = `${Math.min(rect.right - mRect.width, window.innerWidth - mRect.width - 8)}px`;
		setTimeout(() => {
			const close = (e) => { if (!e.target.closest("#quote-action-menu")) { menu.remove(); document.removeEventListener("click", close); } };
			document.addEventListener("click", close);
		}, 0);
	},
	async saveQuote(messageId) {
		document.getElementById("quote-action-menu")?.remove();
		const msg = this.messages.find(m => m.id === messageId);
		if (!msg) return;
		try {
			await addDoc(collection(db, "users", this._myUserId, "savedQuotes"), {
				authorUsername: msg.username, authorDisplay: msg.display, authorAvatar: msg.avatar_url,
				content: msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]"), sourceMessageId: messageId, savedAt: serverTimestamp(),
			});
			showToast("Quote saved!", "success");
		} catch (e) { showToast(e?.message || "Failed to save quote.", "error"); }
	},
	async saveQuoteFromCard(btn) {
		const card = btn.closest(".quote-card");
		const srcMsgId = card?.dataset?.srcMsgId;
		if (!srcMsgId) { showToast("Cannot save this quote — no message reference found.", "error"); return; }
		btn.disabled = true;
		await this.saveQuote(srcMsgId);
		btn.innerHTML = `<i class="fas fa-check"></i>`;
		btn.classList.add("saved");
	},
	async shareQuoteToChat(messageId) {
		const msg = this.messages.find(m => m.id === messageId);
		if (!msg) return;
		document.getElementById("quote-action-menu")?.remove();
		const t = msg.content.replace(/\[gif:[^\]]+\]/g, "[gif]").slice(0, 300);
		const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ u: msg.username, d: msg.display, a: msg.avatar_url, t }))));
		await this.sendMessage(`[quote:${payload}]`);
	},
	async loadSavedQuotes() {
		const container = document.getElementById("quotes-results");
		if (!container) return;
		container.innerHTML = `<span class="quotes-empty">Loading…</span>`;
		try {
			const snap = await getDocs(query(collection(db, "users", this._myUserId, "savedQuotes"), orderBy("savedAt", "desc")));
			if (snap.empty) { container.innerHTML = `<span class="quotes-empty">No saved quotes yet.<br>Click <i class="fas fa-quote-right" style="font-size:11px"></i> on any message to save one!</span>`; return; }
			container.innerHTML = "";
			snap.forEach((d) => {
				const q = d.data();
				const item = document.createElement("div");
				item.className = "saved-quote-item";
				item.innerHTML = `<div class="sqi-bg" style="background-image:url(${JSON.stringify(q.authorAvatar || "/assets/img/fav.png")})"></div>
					<div class="sqi-body"><div class="sqi-text">${escapeHtml(q.content)}</div><div class="sqi-author">— ${escapeHtml(q.authorDisplay || q.authorUsername)}</div></div>
					<button class="sqi-delete" onclick="event.stopPropagation();window.chat.deleteSavedQuote('${d.id}',this.closest('.saved-quote-item'))" title="Remove"><i class="fas fa-times"></i></button>`;
				item.addEventListener("click", () => {
					const payload = btoa(unescape(encodeURIComponent(JSON.stringify({ u: q.authorUsername, d: q.authorDisplay, a: q.authorAvatar, t: q.content }))));
					this.sendMessage(`[quote:${payload}]`);
					this.hideGifPicker();
				});
				container.appendChild(item);
			});
		} catch { container.innerHTML = `<span class="quotes-empty">Failed to load quotes.</span>`; }
	},
	async deleteSavedQuote(id, el) {
		try { await deleteDoc(doc(db, "users", this._myUserId, "savedQuotes", id)); el?.remove(); }
		catch { showToast("Failed to remove quote.", "error"); }
	},

	toggleGifPicker() {
		const picker = document.getElementById("gif-picker");
		this.gifPickerOpen = !this.gifPickerOpen;
		picker.classList.toggle("open", this.gifPickerOpen);
		if (this.gifPickerOpen) this.switchPickerTab("gifs");
	},
	hideGifPicker() { this.gifPickerOpen = false; document.getElementById("gif-picker").classList.remove("open"); },
	switchPickerTab(tab) {
		document.querySelectorAll(".picker-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
		document.getElementById("gif-tab-content").style.display = tab === "gifs" ? "flex" : "none";
		document.getElementById("quotes-tab-content").style.display = tab === "quotes" ? "flex" : "none";
		if (tab === "quotes") this.loadSavedQuotes();
		else { document.getElementById("gif-search")?.focus(); if (!this._gifTrendingCached) { this.fetchGifs(""); this._gifTrendingCached = true; } }
	},
	async fetchGifs(query_) {
		const results = document.getElementById("gif-results");
		results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">Loading...</span>`;
		try {
			const searchGifsFn = httpsCallable(functions, "searchGifs");
			const res = await searchGifsFn({ query: query_ });
			results.innerHTML = "";
			for (const gif of res.data.gifs || []) {
				const img = document.createElement("img");
				img.src = gif.preview;
				img.loading = "lazy";
				img.addEventListener("click", () => { this.sendGif(gif.full); this.hideGifPicker(); });
				results.appendChild(img);
			}
			if (!results.children.length) results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">No results.</span>`;
		} catch { results.innerHTML = `<span style="grid-column:1/-1;font-size:12px;opacity:0.4;padding:8px 4px">Failed to load.</span>`; }
	},

	async blockUser(userId) {
		await updateDoc(doc(db, "users", this._myUserId), { blockedIds: arrayUnion(userId) });
		this.blockedIds.add(userId);
		this.renderFingerprint = ""; this.renderMessages(false);
	},
	async unblockUser(userId) {
		await updateDoc(doc(db, "users", this._myUserId), { blockedIds: arrayRemove(userId) });
		this.blockedIds.delete(userId); this.revealedBlockedIds.delete(userId);
		this.renderFingerprint = ""; this.renderMessages(false);
	},
	muteUser(userId, username) { document.dispatchEvent(new CustomEvent("chat:open-mute-modal", { detail: { userId, username } })); },
	async executeMute(userId, username, minutes) {
		try {
			await updateDoc(doc(db, "users", userId), { mutedUntil: Timestamp.fromMillis(Date.now() + minutes * 60000) });
			showToast(`${username} muted for ${minutes} minute(s)`, "success");
		} catch (e) { showToast(e?.message || "Failed to mute user", "error"); }
	},
	reportMessage(messageId) {
		const message = this.messages.find(m => m.id === messageId);
		if (!message) return;
		window.chatUI.openReportModal?.(message);
	},

	formatText(type) {
		msgInput.focus();
		const sel = window.getSelection();
		const selected = sel?.toString() ?? "";
		const map = {
			bold: `**${selected || "bold text"}**`, italic: `*${selected || "italic text"}*`,
			strike: `~~${selected || "text"}~~`, underline: `__${selected || "text"}__`,
			code: `\`${selected || "code"}\``, codeblock: `\`\`\`\n${selected || "code"}\n\`\`\``,
			h1: `# ${selected || "Heading"}`, h2: `## ${selected || "Heading"}`,
		};
		const snippet = map[type];
		if (!snippet) return;
		document.execCommand("insertText", false, snippet);
		msgInput.dispatchEvent(new Event("input"));
	},
};

const CLOSED_DMS_STORAGE_KEY = "singularity_closed_dm_user_ids";

window.chatUI = {
	dms: [],
	groups: [],
	unreadDmUserIds: new Set(),
	unreadChannels: new Set(),
	pingChannels: new Set(),
	onlineUsers: [],
	closedDmUserIds: new Set(),
	_channelCache: [],
	_unsubChannels: null,
	_unsubGroups: null,
	_unsubDmInbox: null,

	loadPersistedDmState() {
		try { this.closedDmUserIds = new Set(JSON.parse(localStorage.getItem(CLOSED_DMS_STORAGE_KEY) || "[]")); } catch { this.closedDmUserIds = new Set(); }
	},
	persistClosedDmState() { localStorage.setItem(CLOSED_DMS_STORAGE_KEY, JSON.stringify([...this.closedDmUserIds])); },

	applyOnlineBoardState() {
		document.body.classList.toggle("online-board-collapsed", localStorage.getItem("singularity_online_board_collapsed") === "1");
	},
	setError(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; },
	clearError(id) { const el = document.getElementById(id); if (el) el.textContent = ""; },

	startWatching() {
		this._unsubChannels = window.chat.watchChannels((channels) => { this._channelCache = channels; this.renderSidebar(); });
		this._unsubGroups = onSnapshot(query(collection(db, "groups"), where("members", "array-contains", window.chat._myUserId)), (snap) => {
			this.groups = snap.docs.map(d => ({ id: d.id, ...d.data() }));
			this.renderSidebar();
		});
		
		this._unsubDmInbox = onSnapshot(query(collection(db, "dms"), where("participants", "array-contains", window.chat._myUserId)), (snap) => {
			snap.docChanges().forEach(async (change) => {
				const data = change.doc.data();
				const otherUid = data.participants.find(p => p !== window.chat._myUserId);
				if (!otherUid) return;
				if (!this.dms.find(d => d.userId === otherUid) && !this.closedDmUserIds.has(otherUid)) {
					const userSnap = await getDoc(doc(db, "users", otherUid));
					if (userSnap.exists()) {
						const u = userSnap.data();
						this.dms.push({ userId: otherUid, username: u.username, display: u.display, pfp: u.pfp });
						this.renderSidebar();
					}
				}
			});
		});
	},

	async renderSidebar() {
		const channels = this._channelCache;
		const currentRoom = window.chat.currentRoom;
		const currentDm = window.chat.currentDmUserId;
		const channelList = document.getElementById("channels-list");
		channelList.innerHTML = "";
		if (!channels.length) channelList.innerHTML = '<li style="padding: 6px 10px; font-size: 12px; opacity: 0.4;">No channels</li>';
		for (const ch of channels) {
			const li = document.createElement("li");
			const isActive = currentRoom === ch.name && !currentDm;
			li.className = "sidebar-item" + (isActive ? " active" : "");
			const icon = ch.private ? "hashtag-lock" : "hashtag";
			const isMember = !ch.private || (ch.members || []).includes(window.chat._myUserId);
			if (ch.private && !isMember) {
				li.style.opacity = "0.4"; li.style.cursor = "default";
				li.innerHTML = `<i class="fas fa-${icon} item-icon"></i><span class="item-label">${escapeHtml(ch.name)}</span>`;
			} else {
				const hasPing = this.pingChannels.has(ch.name) && !isActive;
				const hasUnread = this.unreadChannels.has(ch.name) && !isActive;
				const dot = hasPing ? `<span class="channel-ping-dot" title="You were mentioned"></span>` : (hasUnread ? `<span class="unread-dot"></span>` : "");
				const copyBtn = ch.private && ch.inviteCode ? `<button class="item-copy-code" title="Copy invite code" onclick="event.stopPropagation();window.chatUI.copyCode('${ch.inviteCode}')"><i class="fas fa-copy"></i></button>` : "";
				li.innerHTML = `<i class="fas fa-${icon} item-icon"></i><span class="item-label">${escapeHtml(ch.name)}</span>${dot}${copyBtn}`;
				li.onclick = () => {
					if (window.innerWidth <= 500) document.body.classList.add("sidebar-collapsed");
					this.unreadChannels.delete(ch.name); this.pingChannels.delete(ch.name);
					window.chat.setRoom(ch.name);
					this.updateHeader(icon, ch.name);
					this.applyLockedChannelUi(ch);
				};
			}
			channelList.appendChild(li);
		}
		if (currentRoom && !currentDm) { const active = channels.find(c => c.name === currentRoom); if (active) this.applyLockedChannelUi(active); }

		const dmList = document.getElementById("dms-list");
		dmList.innerHTML = "";
		for (const dmEntry of this.dms) {
			const li = document.createElement("li");
			const isActive = currentDm === dmEntry.userId;
			const hasUnread = this.unreadDmUserIds.has(dmEntry.userId) && !isActive;
			li.className = "sidebar-item" + (isActive ? " active" : "");
			if (isActive) this.unreadDmUserIds.delete(dmEntry.userId);
			li.innerHTML = `<img class="dm-pfp" src="${escapeHtmlAttribute(dmEntry.pfp || "/assets/img/fav.png")}" alt="" onerror="this.src='/assets/img/fav.png'" /><span class="item-label">${escapeHtml(dmEntry.display || dmEntry.username)}</span>${hasUnread ? '<span class="unread-dot"></span>' : ''}<button class="item-copy-code" title="Close DM" onclick="event.stopPropagation();window.chatUI.closeDmEntry('${dmEntry.userId}')"><i class="fas fa-times"></i></button>`;
			li.onclick = () => {
				if (window.innerWidth <= 500) document.body.classList.add("sidebar-collapsed");
				this.unreadDmUserIds.delete(dmEntry.userId);
				this.closedDmUserIds.delete(dmEntry.userId); this.persistClosedDmState();
				window.chat.setDm(dmEntry.userId);
				this.updateHeader("at", dmEntry.display || dmEntry.username, true);
			};
			dmList.appendChild(li);
		}

		const groupList = document.getElementById("groups-list");
		if (groupList) {
			groupList.innerHTML = "";
			for (const g of this.groups) {
				const li = document.createElement("li");
				const isActive = window.chat.currentGroupId === g.id;
				li.className = "sidebar-item" + (isActive ? " active" : "");
				li.innerHTML = `<i class="fas fa-users item-icon"></i><span class="item-label">${escapeHtml(g.name)}</span>`;
				li.onclick = () => {
					if (window.innerWidth <= 500) document.body.classList.add("sidebar-collapsed");
					window.chat.setGroup(g.id, g.name);
					this.updateHeader("users", g.name, false, true);
				};
				groupList.appendChild(li);
			}
		}
	},

	applyLockedChannelUi(ch) {
		const input = document.getElementById("msg-input");
		let banner = document.getElementById("locked-channel-banner");
		const mediaButtons = document.getElementById("media-upload-buttons");
		if (ch?.locked) {
			if (input) { input.contentEditable = "false"; input.dataset.placeholder = "📢 This channel is read-only."; }
			if (!banner) {
				banner = document.createElement("div"); banner.id = "locked-channel-banner";
				banner.innerHTML = '<i class="fas fa-lock" style="margin-right:6px"></i>Announcements — read only';
				document.getElementById("msg-input-wrap")?.prepend(banner);
			}
			if (mediaButtons) mediaButtons.style.display = "none";
		} else {
			if (input && window._currentUsername) { input.contentEditable = "true"; input.dataset.placeholder = "Send a message here..."; }
			banner?.remove();
			if (mediaButtons) mediaButtons.style.display = "flex";
		}
	},

	handleImageUpload(input) {
		const file = input.files?.[0];
		input.value = "";
		if (file) window.chat.sendMediaMessage(file, "image");
	},
	startVoiceRecording() {
		if (this._mediaRecorder) { this._mediaRecorder.stop(); return; }
		navigator.mediaDevices?.getUserMedia({ audio: true }).then(stream => {
			const chunks = [];
			const recorder = new MediaRecorder(stream);
			this._mediaRecorder = recorder;
			const btn = document.querySelector("#media-upload-buttons button[title='Send voice clip']");
			if (btn) { btn.style.color = "var(--accent)"; btn.title = "Stop recording"; }
			recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
			recorder.onstop = () => {
				stream.getTracks().forEach(t => t.stop());
				this._mediaRecorder = null;
				if (btn) { btn.style.color = ""; btn.title = "Send voice clip"; }
				if (!chunks.length) return;
				const mimeType = recorder.mimeType || "audio/webm";
				const blob = new Blob(chunks, { type: mimeType });
				const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
				window.chat.sendMediaMessage(new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType }), "voice");
			};
			recorder.start();
			showToast("Recording… click mic again to stop", "info");
		}).catch(() => showToast("Microphone access denied", "error"));
	},

	openDmWithUser(userId, username, pfp) {
		if (!window.chat._myUserId || userId === window.chat._myUserId) return;
		if (!this.dms.find(d => d.userId === userId)) this.dms.push({ userId, username, display: username, pfp: pfp || "/assets/img/fav.png" });
		this.closedDmUserIds.delete(userId); this.persistClosedDmState();
		window.chat.setDm(userId);
		this.updateHeader("at", username, true);
		this.renderSidebar();
	},
	closeDmEntry(userId) {
		this.closedDmUserIds.add(userId); this.persistClosedDmState();
		this.dms = this.dms.filter(d => d.userId !== userId);
		this.unreadDmUserIds.delete(userId);
		if (window.chat.currentDmUserId === userId) { window.chat.closeDm(); this.updateHeader("hashtag", "general", false); }
		this.renderSidebar();
	},
	closeCurrentDm() { const userId = window.chat.currentDmUserId; if (userId) this.closeDmEntry(userId); },

	updateHeader(icon, name, isDm = false, isGroup = false) {
		document.getElementById("chat-header").querySelector("i").className = `fas fa-${icon}`;
		document.getElementById("chat-header-name").textContent = name;
		document.getElementById("chat-header-close-dm").style.display = isDm ? "block" : "none";
		this.setOnlineUsers(isGroup ? window.chat.presence.group : isDm ? window.chat.presence.dm : window.chat.presence.room);
	},
	setOnlineUsers(users) { this.onlineUsers = Array.isArray(users) ? users : []; this.renderOnlineBoard(); },
	renderOnlineBoard() {
		const title = document.getElementById("online-board-title");
		const subtitle = document.getElementById("online-board-subtitle");
		const count = document.getElementById("online-count");
		const summary = document.getElementById("online-summary-text");
		const list = document.getElementById("online-users-list");
		const empty = document.getElementById("online-empty-state");
		if (!title) return;
		const isDm = Boolean(window.chat.currentDmUserId);
		const scopeName = isDm ? (window.chat.currentDmRecipient?.display || "Direct Message") : `#${window.chat.currentRoom || "general"}`;
		const users = [...this.onlineUsers].sort((a, b) => {
			const aMe = a.id === window.chat._myUserId ? -1 : 0, bMe = b.id === window.chat._myUserId ? -1 : 0;
			return aMe !== bMe ? aMe - bMe : (a.display || a.username || "").localeCompare(b.display || b.username || "");
		});
		title.textContent = "Online"; subtitle.textContent = scopeName; count.textContent = `${users.length} online`; summary.textContent = scopeName;
		list.innerHTML = "";
		for (const user of users) {
			const li = document.createElement("li");
			const isMe = user.id === window.chat._myUserId;
			li.className = "online-user";
			if (!isMe) { li.style.cursor = "pointer"; li.title = `DM @${user.username}`; li.onclick = () => this.openDmWithUser(user.id, user.display || user.username, user.pfp); }
			li.innerHTML = `<div class="online-user-pfp-wrap"><img class="online-user-pfp" src="${escapeHtmlAttribute(user.pfp || "/assets/img/fav.png")}" alt="" onerror="this.src='/assets/img/fav.png'" /></div><div class="online-user-info"><div class="online-user-name"><strong>${escapeHtml(isMe ? "You" : (user.display || user.username))}</strong></div><span class="online-user-handle">@${escapeHtml(user.username)}${!isMe ? ' · click to DM' : ''}</span></div>`;
			list.appendChild(li);
		}
		empty.style.display = users.length ? "none" : "block";
		empty.textContent = isDm ? "No one is in this DM right now." : "No one is in this room right now.";
	},

	copyCode(code) {
		navigator.clipboard.writeText(code).then(() => showToast("Invite code copied", "success"));
	},

	openNewChannelModal() { this.clearError("new-channel-error"); document.getElementById("new-channel-name").value = ""; document.getElementById("new-channel-private").checked = false; document.getElementById("modal-new-channel").classList.add("open"); setTimeout(() => document.getElementById("new-channel-name").focus(), 50); },
	openJoinModal() { this.clearError("join-channel-error"); document.getElementById("join-channel-code").value = ""; document.getElementById("modal-join-channel").classList.add("open"); setTimeout(() => document.getElementById("join-channel-code").focus(), 50); },
	openNewDmModal() { this.clearError("new-dm-error"); document.getElementById("new-dm-username").value = ""; document.getElementById("modal-new-dm").classList.add("open"); setTimeout(() => document.getElementById("new-dm-username").focus(), 50); },
	openNewGroupModal() { this.clearError("new-group-error"); document.getElementById("new-group-name").value = ""; document.getElementById("new-group-members").value = ""; document.getElementById("modal-new-group").classList.add("open"); setTimeout(() => document.getElementById("new-group-name").focus(), 50); },
	closeModal(id) { document.getElementById(id).classList.remove("open"); },

	async createChannel() {
		this.clearError("new-channel-error");
		const raw = document.getElementById("new-channel-name").value.trim();
		const isPrivate = document.getElementById("new-channel-private").checked;
		try {
			const ch = await window.chat.createChannel(raw, isPrivate);
			this.closeModal("modal-new-channel");
			window.chat.setRoom(ch.name);
			this.updateHeader(ch.private ? "hashtag-lock" : "hashtag", ch.name, false);
		} catch (e) { this.setError("new-channel-error", e.message || "Failed to create channel."); }
	},
	async joinChannel() {
		this.clearError("join-channel-error");
		const code = document.getElementById("join-channel-code").value.trim();
		if (!code) { this.setError("join-channel-error", "Please enter an invite code."); return; }
		try {
			const ch = await window.chat.joinChannelByCode(code);
			this.closeModal("modal-join-channel");
			window.chat.setRoom(ch.name);
			this.updateHeader("hashtag-lock", ch.name, false);
		} catch (e) { this.setError("join-channel-error", e.message || "Invalid invite code."); }
	},
	async startDm() {
		this.clearError("new-dm-error");
		const username = document.getElementById("new-dm-username").value.trim().toLowerCase();
		if (!username) { this.setError("new-dm-error", "Please enter a username."); return; }
		try {
			const target = await resolveUsernameToUid(username);
			if (!target) { this.setError("new-dm-error", "User not found."); return; }
			const userSnap = await getDoc(doc(db, "users", target.uid));
			const u = userSnap.data();
			if (!this.dms.find(d => d.userId === target.uid)) this.dms.push({ userId: target.uid, username: u.username, display: u.display, pfp: u.pfp });
			this.closedDmUserIds.delete(target.uid); this.persistClosedDmState();
			this.closeModal("modal-new-dm");
			window.chat.setDm(target.uid);
			this.updateHeader("at", u.display || u.username, true);
		} catch { this.setError("new-dm-error", "Could not find user."); }
	},
	async createGroup() {
		this.clearError("new-group-error");
		const name = document.getElementById("new-group-name").value.trim();
		const membersRaw = document.getElementById("new-group-members").value.trim();
		if (!name) { this.setError("new-group-error", "Group name is required."); return; }
		const usernames = membersRaw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
		if (!usernames.length) { this.setError("new-group-error", "Add at least one member."); return; }
		try {
			const resolved = await Promise.all(usernames.map(resolveUsernameToUid));
			if (resolved.some(r => !r)) { this.setError("new-group-error", "One or more users not found."); return; }
			const members = [window.chat._myUserId, ...resolved.map(r => r.uid)];
			const ref = await addDoc(collection(db, "groups"), { name, members, ownerId: window.chat._myUserId, createdAt: serverTimestamp() });
			this.closeModal("modal-new-group");
			window.chat.setGroup(ref.id, name);
			this.updateHeader("users", name, false, true);
		} catch { this.setError("new-group-error", "Something went wrong."); }
	},

	async submitUsernameSetup() {
		this.clearError("username-setup-error");
		const name = document.getElementById("username-setup-input").value.trim();
		if (!name) { this.setError("username-setup-error", "Enter a username."); return; }
		try {
			await window.chat.claimUsername(name);
			this.closeModal("modal-username-setup");
			this.finishBoot();
		} catch (e) { this.setError("username-setup-error", e.message || "Could not set username."); }
	},

	finishBoot() {
		this.startWatching();
		this.renderSidebar();
		this.renderOnlineBoard();
		const soundBtn = document.getElementById("sound-toggle-btn");
		if (soundBtn) {
			const on = localStorage.getItem("singularity_sounds") !== "0";
			soundBtn.innerHTML = on ? '<i class="fas fa-volume-high"></i>' : '<i class="fas fa-volume-xmark"></i>';
			soundBtn.title = on ? "Sounds on — click to mute" : "Sounds off — click to enable";
		}
		if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission();
	},
};

window.chatUI.loadPersistedDmState();

document.querySelectorAll(".modal-backdrop").forEach(el => {
	if (el.id === "modal-username-setup") return;
	el.addEventListener("click", e => { if (e.target === el) el.classList.remove("open"); });
});
document.addEventListener("keydown", e => {
	if (e.key === "Escape") document.querySelectorAll(".modal-backdrop.open").forEach(el => { if (el.id !== "modal-username-setup") el.classList.remove("open"); });
});
document.getElementById("new-channel-name").addEventListener("keydown", e => { if (e.key === "Enter") window.chatUI.createChannel(); });
document.getElementById("join-channel-code").addEventListener("keydown", e => { if (e.key === "Enter") window.chatUI.joinChannel(); });
document.getElementById("new-dm-username").addEventListener("keydown", e => { if (e.key === "Enter") window.chatUI.startDm(); });
document.getElementById("new-group-name").addEventListener("keydown", e => { if (e.key === "Enter") window.chatUI.createGroup(); });
document.getElementById("username-setup-input").addEventListener("keydown", e => { if (e.key === "Enter") window.chatUI.submitUsernameSetup(); });

document.getElementById("sidebar-search-input")?.addEventListener("input", (e) => {
	const q = e.target.value.toLowerCase().trim();
	["#channels-list", "#dms-list", "#groups-list"].forEach(sel => {
		document.querySelectorAll(`${sel} .sidebar-item`).forEach(li => {
			const label = li.querySelector(".item-label")?.textContent?.toLowerCase() || "";
			li.style.display = (!q || label.includes(q)) ? "" : "none";
		});
	});
});

document.getElementById("msg-container").addEventListener("click", (e) => {
	const a = e.target.closest("a[data-external]");
	if (!a) return;
	e.preventDefault();
	const url = a.getAttribute("href");
	document.getElementById("leaving-url").textContent = url;
	document.getElementById("leaving-continue").onclick = () => { window.open(url, "_blank", "noopener,noreferrer"); window.chatUI.closeModal("modal-leaving"); };
	document.getElementById("modal-leaving").classList.add("open");
});

const msgInput = document.getElementById("msg-input");
const msgToolbar = document.getElementById("msg-toolbar");
const msgPreview = document.getElementById("msg-preview");

msgInput.addEventListener("focus", () => msgToolbar.classList.add("visible"));
msgInput.addEventListener("blur", () => {
	setTimeout(() => { if (!msgToolbar.matches(":hover")) msgToolbar.classList.remove("visible"); }, 150);
	setTimeout(hideEmojiPicker, 100);
	window.chat.stopTyping();
});

msgInput.addEventListener("input", () => {
	const cleaned = msgInput.innerText.replace(/[\u00AD\u200B\u200C\u200D\u2800\uFEFF]/g, "");
	if (cleaned !== msgInput.innerText) { msgInput.innerText = cleaned; placeCaretAtEnd(); }
	if (msgInput.innerText.length > MAX_MESSAGE_LENGTH) { msgInput.innerText = msgInput.innerText.slice(0, MAX_MESSAGE_LENGTH); placeCaretAtEnd(); }

	const text = msgInput.innerText;
	if (text.startsWith("/") && !text.includes(" ")) {
		const q = text.slice(1).toLowerCase();
		const matches = SLASH_COMMANDS.filter(c => (!c.mod || isAdminUser()) && c.name.startsWith(q));
		if (matches.length) showSlashPicker(matches); else hideSlashPicker();
	} else hideSlashPicker();

	const colonIdx = text.lastIndexOf(":");
	if (colonIdx !== -1) {
		const q = text.slice(colonIdx + 1);
		if (q && !q.includes(" ")) {
			const matches = Object.keys(EMOJI_MAP).filter(k => k.startsWith(q)).slice(0, 8);
			if (matches.length) showEmojiPicker(matches); else hideEmojiPicker();
		} else hideEmojiPicker();
	} else hideEmojiPicker();

	const atIdx = text.lastIndexOf("@");
	if (atIdx !== -1) {
		const q = text.slice(atIdx + 1);
		if (!q.includes(" ") && !q.includes("\n")) {
			const present = [...(window.chat.presence.room || []), ...(window.chat.presence.dm || []), ...(window.chat.presence.group || [])]
				.filter((u, i, arr) => u?.username && arr.findIndex(x => x?.id === u.id) === i);
			const matches = present.filter(u => u.username.toLowerCase().startsWith(q.toLowerCase()) && u.id !== window.chat._myUserId).slice(0, 6);
			if (matches.length) showMentionPicker(matches); else hideMentionPicker();
		} else hideMentionPicker();
	} else hideMentionPicker();

	const hasMarkdown = /[*_~`#]/.test(text);
	if (hasMarkdown && text.trim()) { msgPreview.innerHTML = parseMarkdown(parseEmoji(text)); msgPreview.classList.add("visible"); }
	else msgPreview.classList.remove("visible");

	const counter = document.getElementById("char-counter");
	if (counter) {
		counter.textContent = `${text.length}/${MAX_MESSAGE_LENGTH}`;
		counter.style.color = text.length >= MAX_MESSAGE_LENGTH ? "red" : text.length > MAX_MESSAGE_LENGTH * 0.85 ? "orange" : "var(--text-3)";
	}
	if (text.trim()) window.chat.startTyping(); else window.chat.stopTyping();
});

msgInput.addEventListener("keydown", (event) => {
	const replaced = msgInput.innerText.replace(/:([a-zA-Z0-9_+\-]+):/g, (m, name) => EMOJI_MAP[name] ?? m);
	if (replaced !== msgInput.innerText) {
		const sel = window.getSelection();
		const offset = sel.getRangeAt(0).startOffset;
		msgInput.innerText = replaced;
		try {
			const range = document.createRange();
			const node = msgInput.firstChild;
			if (node) { range.setStart(node, Math.min(offset, node.length)); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); }
		} catch {}
	}
	if (emojiPickerMatches.length) {
		if (event.key === "ArrowDown") { event.preventDefault(); emojiPickerIndex = (emojiPickerIndex + 1) % emojiPickerMatches.length; highlightEmojiPicker(); return; }
		if (event.key === "ArrowUp") { event.preventDefault(); emojiPickerIndex = (emojiPickerIndex - 1 + emojiPickerMatches.length) % emojiPickerMatches.length; highlightEmojiPicker(); return; }
		if (event.key === "Tab" || event.key === "Enter") { event.preventDefault(); insertPickerEmoji(emojiPickerMatches[emojiPickerIndex]); return; }
		if (event.key === "Escape") { hideEmojiPicker(); return; }
	}
	if (slashPickerMatches.length) {
		if (event.key === "ArrowDown") { event.preventDefault(); slashPickerIndex = (slashPickerIndex + 1) % slashPickerMatches.length; highlightSlashPicker(); return; }
		if (event.key === "ArrowUp") { event.preventDefault(); slashPickerIndex = (slashPickerIndex - 1 + slashPickerMatches.length) % slashPickerMatches.length; highlightSlashPicker(); return; }
		if (event.key === "Tab" || (event.key === "Enter" && !msgInput.innerText.includes(" "))) { event.preventDefault(); insertSlashCommand(slashPickerMatches[slashPickerIndex]); return; }
		if (event.key === "Escape") { hideSlashPicker(); return; }
	}
	if (mentionPickerMatches.length) {
		if (event.key === "ArrowDown") { event.preventDefault(); mentionPickerIndex = (mentionPickerIndex + 1) % mentionPickerMatches.length; highlightMentionPicker(); return; }
		if (event.key === "ArrowUp") { event.preventDefault(); mentionPickerIndex = (mentionPickerIndex - 1 + mentionPickerMatches.length) % mentionPickerMatches.length; highlightMentionPicker(); return; }
		if (event.key === "Tab" || event.key === "Enter") { event.preventDefault(); insertMention(mentionPickerMatches[mentionPickerIndex].username); return; }
		if (event.key === "Escape") { hideMentionPicker(); return; }
	}
	if (event.key !== "Backspace" && event.key !== "Delete" && !event.ctrlKey && !event.metaKey && msgInput.innerText.length >= MAX_MESSAGE_LENGTH) { event.preventDefault(); return; }
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		if (msgInput._slowmode) return;
		const text = msgInput.innerText;
		if (text.trim()) {
			if (text.trim().startsWith("/")) {
				hideSlashPicker(); hideMentionPicker(); hideEmojiPicker();
				msgInput.innerText = ""; msgPreview.classList.remove("visible");
				window.chat.stopTyping();
				handleSlashCommand(text.trim());
			} else {
				window.chat.sendMessage(text);
				msgInput.innerText = ""; msgPreview.classList.remove("visible");
				window.chat.stopTyping();
				msgInput._slowmode = true;
				setTimeout(() => { msgInput._slowmode = false; }, 500);
			}
		}
	}
});

document.getElementById("gif-search").addEventListener("input", (e) => {
	clearTimeout(window.chat.gifSearchTimeout);
	window.chat.gifSearchTimeout = setTimeout(() => window.chat.fetchGifs(e.target.value.trim()), 800);
});
document.getElementById("gif-search").addEventListener("keydown", (e) => { if (e.key === "Escape") window.chat.hideGifPicker(); });
document.addEventListener("click", (e) => { if (!e.target.closest("#gif-picker") && !e.target.closest("#msg-toolbar")) window.chat.hideGifPicker(); });

setInterval(() => {
	document.querySelectorAll(".message-time").forEach((el) => { if (el.title) el.textContent = formatRelativeTime(new Date(el.title).toISOString()); });
}, 60000);

(async function boot() {
	const user = await window.chat.ensureCurrentUser();
	window.chat.initScrollObserver();
	window.chatUI.applyOnlineBoardState();
	if (user) {
		window.chat.setRoom("general");
		window.chatUI.finishBoot();
	} else {
		document.getElementById("modal-username-setup").classList.add("open");
		setTimeout(() => document.getElementById("username-setup-input")?.focus(), 50);
	}
})();
