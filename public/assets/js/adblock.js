(function () {
	if (window.__adblock) return;

	const STORAGE_KEY = "singularity_adBlock";

	const AD_HOSTS = [
		"doubleclick.net", "googlesyndication.com", "googleadservices.com",
		"google-analytics.com", "googletagmanager.com", "googletagservices.com",
		"adservice.google.", "pagead2.googlesyndication.com", "pagead.", "gstatic.com/ads",
		"adnxs.com", "adsrvr.org", "adform.net", "adroll.com", "amazon-adsystem.com",
		"taboola.com", "outbrain.com", "criteo.com", "criteo.net",
		"pubmatic.com", "rubiconproject.com", "openx.net", "casalemedia.com",
		"moatads.com", "scorecardresearch.com", "quantserve.com", "bluekai.com",
		"popads.net", "popcash.net", "propellerads.com", "adsterra.com",
		"exoclick.com", "juicyads.com", "trafficjunky.com", "mgid.com",
		"revcontent.com", "yllix.com", "clickadu.com", "hilltopads.net",
		"adcash.com", "bidvertiser.com", "media.net",
		"unityads.unity3d.com", "applovin.com", "applvn.com", "adcolony.com",
		"chartboost.com", "vungle.com", "ironsrc.com", "ironsource.com",
		"tapjoy.com", "admob.com", "mopub.com", "inmobi.com", "startapp.com",
		"appodeal.com", "fyber.com", "smaato.net", "yandex.ru/ads", "imasdk.googleapis.com",
	];

	const AD_SELECTORS = [
		'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
		'iframe[src*="googleads"]', 'iframe[src*="adnxs"]',
		'iframe[src*="taboola"]', 'iframe[src*="outbrain"]', 'iframe[src*="amazon-adsystem"]',
		'iframe[id^="google_ads"]', 'iframe[id*="_ads_iframe"]', 'iframe[name*="google_ads"]',
		"ins.adsbygoogle", ".adsbygoogle",
		'[id^="div-gpt-ad"]', '[id*="google_ads_iframe"]',
		".ad-container", ".ad-banner", ".ad-slot", ".ad-wrapper", ".advert", ".advertisement",
		'[class*="sponsored-"]', '[id*="taboola"]', '[id*="outbrain"]',
		'script[src*="adsbygoogle"]', 'script[src*="doubleclick"]', 'script[src*="googlesyndication"]',
	];

	function readEnabled() {
		try {
			return (localStorage.getItem(STORAGE_KEY) ?? "yes") !== "no";
		} catch (e) {
			return true;
		}
	}

	const state = { enabled: readEnabled() };
	const observers = new Set();

	function isAdUrl(url) {
		try {
			const s = String(url);
			return AD_HOSTS.some((host) => s.includes(host));
		} catch (e) {
			return false;
		}
	}

	function stubSdks(win) {
		try {
			win.adsbygoogle = { push() {} };
			win.googletag = win.googletag || {};
			win.googletag.cmd = {
				push(fn) {
					try { fn(); } catch (e) {}
				},
			};
			win.googletag.pubads = () => ({ refresh() {}, enableSingleRequest() {} });
		} catch (e) {}
	}

	function sweep(doc) {
		AD_SELECTORS.forEach((sel) => {
			doc.querySelectorAll(sel).forEach((el) => el.remove());
		});
	}

	function hookFrame(frame) {
		if (frame.__adblockHooked) return;
		frame.__adblockHooked = true;
		const attempt = () => {
			try {
				const w = frame.contentWindow;
				if (w && w.document) install(w);
			} catch (e) {

			}
		};
		frame.addEventListener("load", attempt);
		attempt();
	}

	function hookFramesIn(node) {
		if (node.tagName === "IFRAME") hookFrame(node);
		if (node.querySelectorAll) node.querySelectorAll("iframe").forEach(hookFrame);
	}

	function startObserver(win) {
		let doc;
		try {
			doc = win.document;
		} catch (e) {
			return;
		}
		if (!doc || !doc.documentElement || doc.__adblockObserving) return;
		doc.__adblockObserving = true;

		const observer = new win.MutationObserver((mutations) => {
			for (const m of mutations) {
				m.addedNodes.forEach((node) => {
					if (node.nodeType !== 1) return;
					let removed = false;
					for (const sel of AD_SELECTORS) {
						if (node.matches && node.matches(sel)) {
							node.remove();
							removed = true;
							break;
						}
						if (node.querySelectorAll) node.querySelectorAll(sel).forEach((el) => el.remove());
					}
					if (!removed) hookFramesIn(node);
				});
			}
		});
		observer.observe(doc.documentElement, { childList: true, subtree: true });
		observers.add({ observer, doc });
		sweep(doc);
	}

	function stopObservers() {
		observers.forEach(({ observer, doc }) => {
			observer.disconnect();
			doc.__adblockObserving = false;
		});
		observers.clear();
	}

	function install(win) {
		if (win.__adblockInstalled) return;
		win.__adblockInstalled = true;

		try {
			const nativeFetch = win.fetch.bind(win);
			win.fetch = function (input, init) {
				const url = typeof input === "string" ? input : input && (input.url || input.href);
				if (state.enabled && isAdUrl(url)) {
					return Promise.resolve(new win.Response("{}", { status: 200, statusText: "Blocked by ad blocker" }));
				}
				return nativeFetch(input, init);
			};

			const xhr = win.XMLHttpRequest.prototype;
			const nativeOpen = xhr.open;
			const nativeSend = xhr.send;
			const nativeSetHeader = xhr.setRequestHeader;
			xhr.open = function (method, url, ...rest) {
				this.__adBlocked = !!(state.enabled && isAdUrl(url));
				if (this.__adBlocked) return;
				return nativeOpen.call(this, method, url, ...rest);
			};
			xhr.setRequestHeader = function (...args) {
				if (this.__adBlocked) return;
				return nativeSetHeader.apply(this, args);
			};
			xhr.send = function (...args) {
				if (this.__adBlocked) {
					const self = this;
					setTimeout(() => {
						Object.defineProperty(self, "readyState", { value: 4, configurable: true });
						Object.defineProperty(self, "status", { value: 200, configurable: true });
						Object.defineProperty(self, "responseText", { value: "{}", configurable: true });
						Object.defineProperty(self, "response", { value: "{}", configurable: true });
						self.dispatchEvent(new win.Event("readystatechange"));
						self.dispatchEvent(new win.Event("load"));
						self.dispatchEvent(new win.Event("loadend"));
					}, 0);
					return;
				}
				return nativeSend.apply(this, args);
			};

			if (win.navigator.sendBeacon) {
				const nativeBeacon = win.navigator.sendBeacon.bind(win.navigator);
				win.navigator.sendBeacon = function (url, data) {
					if (state.enabled && isAdUrl(url)) return true;
					return nativeBeacon(url, data);
				};
			}

			["HTMLScriptElement", "HTMLIFrameElement", "HTMLImageElement"].forEach((name) => {
				const proto = win[name] && win[name].prototype;
				if (!proto) return;
				const desc = Object.getOwnPropertyDescriptor(proto, "src");
				if (!desc || !desc.set) return;
				Object.defineProperty(proto, "src", {
					configurable: true,
					enumerable: desc.enumerable,
					get: desc.get,
					set(value) {
						if (state.enabled && isAdUrl(value)) return;
						desc.set.call(this, value);
					},
				});
			});

			const nativeSetAttribute = win.Element.prototype.setAttribute;
			win.Element.prototype.setAttribute = function (name, value) {
				if (
					state.enabled &&
					String(name).toLowerCase() === "src" &&
					/^(SCRIPT|IFRAME|IMG)$/.test(this.tagName) &&
					isAdUrl(value)
				) {
					return;
				}
				return nativeSetAttribute.call(this, name, value);
			};

			const nativeWindowOpen = win.open.bind(win);
			win.open = function (url, ...rest) {
				if (state.enabled && isAdUrl(url)) return null;
				return nativeWindowOpen(url, ...rest);
			};
		} catch (e) {}

		if (state.enabled) {
			stubSdks(win);
			startObserver(win);
		}
	}

	function forEachWindow(fn) {
		fn(window);
		document.querySelectorAll("iframe").forEach((f) => {
			try {
				if (f.contentWindow && f.contentWindow.document) fn(f.contentWindow);
			} catch (e) {}
		});
	}

	window.__adblock = {
		isEnabled: () => state.enabled,
		protect(win) {
			try {
				if (win && win.document) install(win);
			} catch (e) {}
		},
		setEnabled(value) {
			state.enabled = !!value;
			try {
				localStorage.setItem(STORAGE_KEY, state.enabled ? "yes" : "no");
			} catch (e) {}
			if (state.enabled) {
				forEachWindow((w) => {
					install(w);
					stubSdks(w);
					startObserver(w);
				});
			} else {
				stopObservers();
			}
		},
	};

	install(window);
})();
