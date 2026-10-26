
const bar = document.getElementById("bar");
const toggleBookmarksButton = document.getElementById("toggle-bookmarks");

const wispUrl =
	(window.location.protocol === "https:" ? "wss://" : "ws://") +
	window.location.host +
	"/socket/";

const SCRAM_PATHS = {
	scramjetPath: "/scram/scramjet.js",
	wasmPath: "/scram/scramjet.wasm",
	injectPath: "/scram/controller/controller.inject.js",
};

let activeTab = 0;
let tabs = [];
let tabCounter = 1;

let scramjet = null; 

function showError(message) {
	console.error(message);
	let banner = document.getElementById("proxyError");
	if (!banner) {
		banner = document.createElement("div");
		banner.id = "proxyError";
		banner.style.cssText =
			"position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:9999;" +
			"background:#3d1f1f;color:#ffb4b4;padding:10px 16px;border-radius:12px;" +
			"font:14px system-ui,sans-serif;max-width:90vw;";
		document.body.appendChild(banner);
	}
	banner.textContent = message;
}

async function initProxy() {
	const sjCtl = globalThis.$scramjetController;
	const sj = globalThis.$scramjet;
	if (!sjCtl || !sj) {
		throw new Error(
			"Scramjet scripts did not load ($scramjet / $scramjetController are missing). " +
				"Check /scram/scramjet.js and /scram/controller/controller.api.js in the Network tab.",
		);
	}
	const { Controller } = sjCtl;
	const { defaultConfig } = sj;

	if (!("serviceWorker" in navigator)) {
		throw new Error("This browser does not support service workers.");
	}
	await navigator.serviceWorker.register("/sw.js");
	const registration = await navigator.serviceWorker.ready;
	const serviceworker = navigator.serviceWorker.controller || registration.active;

	const selectedTransport = localStorage.getItem("singularity_transport") || "libcurl";
	let transport;
	if (selectedTransport === "epoxy") {
		const { default: EpoxyTransport } = await import("/epoxy/index.mjs");
		transport = new EpoxyTransport({ wisp: wispUrl });
	} else {
		const { default: LibcurlTransport } = await import("/libcurl/index.mjs");
		transport = new LibcurlTransport({ websocket: wispUrl });
	}
	await transport.init();

	scramjet = new Controller({
		serviceworker,
		transport,
		scramjetConfig: { ...defaultConfig, ...SCRAM_PATHS },
	});
	await scramjet.wait();
}

const proxyReady = initProxy().catch((e) => {
	showError("Failed to start proxy: " + (e && e.message ? e.message : e));
	throw e;
});
proxyReady.catch(() => {}); 

function setBookmarksCollapsed(collapsed) {
	document.body.classList.toggle("bookmarks-collapsed", collapsed);
	if (toggleBookmarksButton) {
		toggleBookmarksButton.classList.toggle("collapsed", collapsed);
		toggleBookmarksButton.title = collapsed
			? "Show bookmarks bar"
			: "Hide bookmarks bar";
	}
	localStorage.setItem("singularity_bookmarks_collapsed", collapsed ? "1" : "0");
}

function toggleBookmarksBar() {
	setBookmarksCollapsed(
		!document.body.classList.contains("bookmarks-collapsed"),
	);
}

function applyObfuscation(el) {
	if (window.obfuscateElement && el) {
		el.removeAttribute("data-ob-done");
		window.obfuscateElement(el);
	}
}

function unwrapProxyUrl(rawUrl) {
	try {
		const marker = "/~/sj/";
		const idx = rawUrl.indexOf(marker);
		if (idx === -1) return rawUrl;
		const rest = rawUrl.slice(idx + marker.length);
		const parts = rest.split("/");
		if (parts.length < 3) return rawUrl;
		let encodedTarget = parts.slice(2).join("/");
		const qIdx = encodedTarget.indexOf("?");
		if (qIdx !== -1) encodedTarget = encodedTarget.slice(0, qIdx);
		return decodeURIComponent(encodedTarget);
	} catch (e) {
		return rawUrl;
	}
}

function newTab() {
	const tabContainer = document.querySelector(".tabs");
	const newTabData = {
		id: tabCounter++,
		title: "New Tab",
		url: "",
		frame: null, 
		iframe: null,
	};
	tabs.push(newTabData);
	if (!tabContainer) return;

	const newTabButton = document.getElementById("newtab");
	const tab = document.createElement("div");
	tab.classList.add("tab", "obfuscate");
	tab.dataset.tabId = newTabData.id;
	tab.innerHTML = `
        <img src="/assets/img/fav.png" alt="" data-fav-id="${newTabData.id}">
        <span>New Tab</span>
        <i class="far fa-close closetab" onclick="closeTab(${newTabData.id})"></i>
    `;

	tab.addEventListener("click", (e) => {
		if (!e.target.closest(".closetab")) {
			switchTab(newTabData.id);
		}
	});

	tabContainer.insertBefore(tab, newTabButton);

	const tabFrame = document.createElement("iframe");
	tabFrame.classList.add("viewframe", "browser-frame");
	tabFrame.dataset.frameId = newTabData.id;
	tabFrame.setAttribute("allowfullscreen", "true");
	tabFrame.src = "/pages/newtab.html";
	newTabData.iframe = tabFrame;
	document.getElementById("browserframecontainer").appendChild(tabFrame);

	switchTab(newTabData.id);
	applyObfuscation(tab);
}

function switchTab(id) {
	activeTab = id;
	document.querySelectorAll(".tab").forEach((t) => {
		t.classList.toggle("active", parseInt(t.dataset.tabId) === id);
	});
	document.querySelectorAll(".viewframe").forEach((f) => {
		f.classList.toggle("active", parseInt(f.dataset.frameId) === id);
	});

	const currentTab = tabs.find((t) => t.id === id);
	if (currentTab && bar) {
		bar.value = currentTab.url;
		applyObfuscation(bar);
	}
}

function closeTab(id) {
	if (tabs.length <= 1) return;
	const tabIndex = tabs.findIndex((t) => t.id === id);
	if (tabIndex === -1) return;

	tabs.splice(tabIndex, 1);
	const tab = document.querySelector(`.tab[data-tab-id="${id}"]`);
	const frame = document.querySelector(`.viewframe[data-frame-id="${id}"]`);
	if (tab) tab.remove();
	if (frame) frame.remove();

	if (activeTab === id) {
		const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
		if (newActiveTab) switchTab(newActiveTab.id);
	}
}

function normalizeInput(i) {
	let url = i.trim();
	if (!url.includes(".")) {
		url = "https://duckduckgo.com/?q=" + encodeURIComponent(url);
	} else if (!url.startsWith("http://") && !url.startsWith("https://")) {
		url = "https://" + url;
	}
	return url;
}

function onTabLoaded(tabData) {
	const tabEl = document.querySelector(`.tab[data-tab-id="${tabData.id}"]`);
	let liveUrl = tabData.url;
	let title = "";
	try {
		liveUrl = unwrapProxyUrl(tabData.iframe.contentWindow.location.href);
	} catch (e) {}
	try {
		title = tabData.iframe.contentDocument.title;
	} catch (e) {}

	if (liveUrl) tabData.url = liveUrl;
	if (!title) {
		try {
			title = new URL(tabData.url).hostname;
		} catch (e) {
			title = "Tab";
		}
	}

	if (tabEl) {
		const titleSpan = tabEl.querySelector("span");
		if (titleSpan) titleSpan.textContent = title;
		const favicon = tabEl.querySelector(`img[data-fav-id="${tabData.id}"]`);
		if (favicon && tabData.url) {
			favicon.src = `https://www.google.com/s2/favicons?domain=${tabData.url}&sz=128`;
		}
		applyObfuscation(tabEl);
	}
	if (tabData.id === activeTab && bar) {
		bar.value = tabData.url;
		applyObfuscation(bar);
	}
}

async function go(url) {
	try {
		await proxyReady;
	} catch (e) {
		return;
	}
	const tabData = tabs.find((t) => t.id === activeTab);
	if (!tabData || !tabData.iframe) return;

	if (!tabData.frame) {
		tabData.frame = scramjet.createFrame(tabData.iframe);
		tabData.iframe.addEventListener("load", () => onTabLoaded(tabData));
	}

	const tabEl = document.querySelector(`.tab[data-tab-id="${tabData.id}"]`);
	if (tabEl) {
		const title = tabEl.querySelector("span");
		if (title) title.textContent = "Loading...";
		applyObfuscation(tabEl);
	}
	if (bar) {
		bar.value = tabData.url;
		applyObfuscation(bar);
	}

	tabData.frame.go(url);
}

function nav(i) {
	if (!i || !i.trim()) return;
	const url = normalizeInput(i);
	const currentTab = tabs.find((t) => t.id === activeTab);
	if (!currentTab) return;
	currentTab.url = url;
	go(url);
}

function back() {
	const t = tabs.find((x) => x.id === activeTab);
	if (t && t.frame) t.frame.back();
}

function forward() {
	const t = tabs.find((x) => x.id === activeTab);
	if (t && t.frame) t.frame.forward();
}

function refresh() {
	const t = tabs.find((x) => x.id === activeTab);
	if (t && t.frame) t.frame.reload();
	else if (t && t.iframe && t.iframe.contentWindow) t.iframe.contentWindow.location.reload();
}

function fullscreen() {
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (frame) frame.requestFullscreen();
}

function popout() {
	const frame = document.querySelector(
		`.viewframe[data-frame-id="${activeTab}"]`,
	);
	if (frame) window.open(frame.src, "_blank");
}

bar.addEventListener("keydown", (e) => {
	if (e.key === "Enter") nav(bar.value.trim());
});

bar.addEventListener("input", () => {
	applyObfuscation(bar);
});

const BookmarkManager = {
	bmContainer: document.querySelector(".bookmarks"),
	bookmarks: JSON.parse(localStorage.getItem("singularity_bookmarks")) || [],
	normalizeBookmark(bookmark) {
		if (!bookmark) {
			return null;
		}

		if (typeof bookmark === "string") {
			return { url: bookmark, name: "" };
		}

		if (typeof bookmark.url !== "string" || !bookmark.url.trim()) {
			return null;
		}

		return {
			url: bookmark.url.trim(),
			name:
				typeof bookmark.name === "string" ? bookmark.name.trim() : "",
		};
	},
	getBookmarkLabel(bookmark) {
		if (bookmark.name) {
			return bookmark.name;
		}

		try {
			return new URL(
				bookmark.url.startsWith("http") ? bookmark.url : `https://${bookmark.url}`,
			).hostname.replace(/^www\./, "");
		} catch {
			return bookmark.url;
		}
	},
	saveBookmarks() {
		localStorage.setItem("singularity_bookmarks", JSON.stringify(this.bookmarks));
	},
	async loadBookmarks() {
		const bookmarks =
			JSON.parse(localStorage.getItem("singularity_bookmarks")) || [];
		this.bookmarks = bookmarks
			.map((bookmark) => this.normalizeBookmark(bookmark))
			.filter(Boolean);
		this.saveBookmarks();
		this.bmContainer.innerHTML = "";

		this.bookmarks.forEach((bm, index) => {
			const newElement = document.createElement("div");
			newElement.classList.add("bookmark", "obfuscate");
			newElement.innerHTML = `<img src="https://s2.googleusercontent.com/s2/favicons?domain=${bm.url}&sz=128" alt=""><span>${this.getBookmarkLabel(bm)}</span>`;
			newElement.title = `${this.getBookmarkLabel(bm)}\n${bm.url}`;
			this.bmContainer.appendChild(newElement);
			newElement.onclick = () => nav(bm.url);
			newElement.oncontextmenu = (e) => {
				e.preventDefault();
				if (confirm(`Delete bookmark: ${this.getBookmarkLabel(bm)}?\n${bm.url}`))
					this.deleteBookmark(index);
			};
			applyObfuscation(newElement);
		});

		const newButton = document.createElement("div");
		newButton.classList.add("bookmark", "obfuscate");
		newButton.innerHTML = `<i class="fas fa-plus" style="color: white;"></i><span>New Bookmark</span>`;
		this.bmContainer.appendChild(newButton);
		newButton.onclick = () => this.addBookmark();
		applyObfuscation(newButton);
	},
	async addBookmark() {
		const url = prompt("Enter the URL of the bookmark");
		if (!url) return;
		const name =
			prompt("Enter a name for this bookmark (optional)")?.trim() || "";
		this.bookmarks.push({ url: url.trim(), name });
		this.saveBookmarks();
		this.loadBookmarks();
	},
	deleteBookmark(index) {
		this.bookmarks.splice(index, 1);
		this.saveBookmarks();
		this.loadBookmarks();
	},
};

if (toggleBookmarksButton) {
	toggleBookmarksButton.addEventListener("click", toggleBookmarksBar);
}

setBookmarksCollapsed(
	localStorage.getItem("singularity_bookmarks_collapsed") === "1",
);

newTab();
BookmarkManager.loadBookmarks();

Object.assign(window, {
	newTab,
	switchTab,
	closeTab,
	nav,
	back,
	forward,
	refresh,
	fullscreen,
	popout,
	BookmarkManager,
	toggleBookmarksBar,
});

const initialUrl = new URLSearchParams(location.search).get("url");
if (initialUrl) nav(initialUrl);
