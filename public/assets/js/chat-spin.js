(function () {
	if (window.__surgeSpin) return;
	window.__surgeSpin = true;
 
	const PRIZES = [5, 10, 15, 20, 25, 30, 35, 40, 100];
	const SPIN_MS = 5000;
	const EXTRA_TURNS = 6;
	const SEG = 360 / PRIZES.length;
	const COIN_PATHS =
		'<circle cx="12" cy="12" r="10"/><path d="M10 16V9.5a1 1 0 0 1 5 0"/><path d="M8 12h4"/><path d="M8 16h7"/>';

	const RAINBOW = ["#FF0000", "#FF7F00", "#FFFF00", "#00FF00", "#00BFFF", "#0000FF", "#8B00FF", "#FF1493"];

	let wallet = { coins: 0, nextSpinAt: 0, status: "loading" };
	let spinning = false;
	let autoShown = false;

	function coinIcon(size) {
		return (
			'<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size +
			'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-pound-sterling preview-icon">' +
			COIN_PATHS + "</svg>"
		);
	}
	function isReady() {
		return Date.now() >= (wallet.nextSpinAt || 0);
	}
	function countdown(ts) {
		const ms = Math.max(0, (ts || wallet.nextSpinAt) - Date.now());
		const h = Math.floor(ms / 3600000);
		const m = Math.ceil((ms % 3600000) / 60000);
		return "Next spin in " + h + "h " + m + "m";
	}

	const style = document.createElement("style");
	style.textContent = `
		#sidebar-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
		#coin-balance {
			display: flex; align-items: center; gap: 6px;
			padding: 4px 10px; border-radius: 999px;
			background: var(--d-rail, #1e1f22); color: #f5c542;
			font-size: 13px; font-weight: 700; cursor: pointer;
		}
		#coin-balance:hover { filter: brightness(1.15); }
		#coin-balance svg { flex-shrink: 0; }
		#spin-overlay {
			position: fixed; inset: 0; z-index: 10000;
			display: flex; align-items: center; justify-content: center;
			background: rgba(0, 0, 0, 0.6);
			backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
		}
		.spin-card {
			width: 360px; max-width: 92vw; padding: 24px; border-radius: 12px;
			background: var(--d-sidebar, #2b2d31);
			box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
			color: #fff; text-align: center;
			display: flex; flex-direction: column; align-items: center; gap: 14px;
		}
		.spin-card h3 { margin: 0; font-size: 20px; font-weight: 700; }
		.spin-card p { margin: 0; font-size: 14px; color: var(--d-muted, #949ba4); }
		.spin-wheel-wrap { position: relative; width: 260px; height: 260px; margin-top: 8px; }
		.spin-wheel {
			width: 100%; height: 100%; border-radius: 50%;
			box-shadow: 0 0 0 4px #1e1f22, 0 8px 24px rgba(0, 0, 0, 0.5);
			transform: rotate(0deg);
		}
		.spin-wheel svg { width: 100%; height: 100%; display: block; }
		.spin-pointer {
			position: absolute; left: 50%; top: -12px; transform: translateX(-50%); z-index: 2;
			width: 0; height: 0;
			border-left: 11px solid transparent; border-right: 11px solid transparent;
			border-top: 20px solid #f5c542;
			filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5));
		}
		.spin-result {
			min-height: 28px; display: flex; align-items: center; justify-content: center; gap: 6px;
			font-size: 18px; color: #f5c542; opacity: 0; transition: opacity 0.3s;
		}
		.spin-result.show { opacity: 1; }
		.spin-result.err { color: #ff8a8d; font-size: 14px; }
		.spin-result b { color: #fff; }
		.spin-btn {
			width: 100%; padding: 12px 18px; border: none; border-radius: 8px;
			background: var(--d-blurple, #5865f2); color: #fff;
			font-size: 15px; font-weight: 700; cursor: pointer; transition: background 0.15s;
		}
		.spin-btn:hover:not(:disabled) { background: #4752c4; }
		.spin-btn:disabled { opacity: 0.6; cursor: default; }
		.spin-later {
			background: transparent; border: none; color: var(--d-muted, #949ba4);
			font-size: 13px; cursor: pointer; padding: 0;
		}
		.spin-later:hover:not(:disabled) { color: #fff; text-decoration: underline; }
		.spin-later:disabled { opacity: 0.4; cursor: default; }
	`;
	document.head.appendChild(style);

	function renderBalanceNum(n) {
		const el = document.getElementById("coin-balance-num");
		if (el) el.textContent = n.toLocaleString();
	}
	function updateBalance() {
		const el = document.getElementById("coin-balance-num");
		if (!el) return;
		el.textContent =
			wallet.status === "ok" ? (wallet.coins || 0).toLocaleString() : wallet.status === "error" ? "—" : "…";
		const chip = document.getElementById("coin-balance");
		if (chip) chip.title = wallet.status === "ok" ? (isReady() ? "Daily spin ready!" : countdown()) : "Coins";
	}
	function animateBalance(from, to) {
		const start = performance.now();
		const dur = 900;
		function tick(t) {
			const p = Math.min(1, (t - start) / dur);
			renderBalanceNum(Math.round(from + (to - from) * p));
			if (p < 1) requestAnimationFrame(tick);
			else updateBalance();
		}
		requestAnimationFrame(tick);
	}
	function ensureChip() {
		if (document.getElementById("coin-balance")) return true;
		const header = document.getElementById("sidebar-header");
		if (!header) return false;
		const chip = document.createElement("div");
		chip.id = "coin-balance";
		chip.title = "Coins";
		chip.innerHTML = coinIcon(16) + '<span id="coin-balance-num">…</span>';
		chip.addEventListener("click", showWheel);
		header.appendChild(chip);
		updateBalance();
		return true;
	}

	
	window.surgeCoins = {
		get: () => wallet.coins || 0,
		add() { console.warn("disabled: coins are earned from the daily spin."); return false; },
		spend() { console.warn("disabled: buy things in the Shop."); return false; },
	};


	window.addEventListener("shop-wallet", (e) => {
		wallet = Object.assign({}, wallet, e.detail);
		if (!spinning) updateBalance();
		maybeAutoShow();
	});

	function maybeAutoShow() {
		if (autoShown || wallet.status !== "ok" || !isReady()) return;
		autoShown = true;
		showWheel();
	}

	function wheelSvg() {
		const r = 100;
		let segs = "";
		let labels = "";
		PRIZES.forEach((p, i) => {
			const a1 = ((-90 + i * SEG) * Math.PI) / 180;
			const a2 = ((-90 + (i + 1) * SEG) * Math.PI) / 180;
			const x1 = (r * Math.cos(a1)).toFixed(3);
			const y1 = (r * Math.sin(a1)).toFixed(3);
			const x2 = (r * Math.cos(a2)).toFixed(3);
			const y2 = (r * Math.sin(a2)).toFixed(3);
			const large = SEG > 180 ? 1 : 0;
			segs +=
				'<path d="M0 0 L' + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 1 " + x2 + " " + y2 +
				' Z" fill="' + RAINBOW[i % RAINBOW.length] + '" stroke="#1e1f22" stroke-width="1.5"/>';
			const mid = (i + 0.5) * SEG;
			labels +=
				'<g transform="rotate(' + mid + ')">' +
				'<text x="0" y="-62" text-anchor="middle" dominant-baseline="middle" font-size="15" font-weight="800" fill="#fff" font-family="inherit">' + p + "</text>" +
				'<g transform="translate(-6.5,-86) scale(0.54)" fill="none" stroke="#ffe08a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + COIN_PATHS + "</g>" +
				"</g>";
		});
		return (
			'<svg viewBox="-104 -104 208 208" xmlns="http://www.w3.org/2000/svg">' +
			'<circle r="102" fill="#1e1f22"/>' + segs + labels +
			'<circle r="17" fill="#1e1f22" stroke="#5865f2" stroke-width="3"/>' +
			'<g transform="translate(-9,-9) scale(0.75)" fill="none" stroke="#ffe08a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + COIN_PATHS + "</g>" +
			"</svg>"
		);
	}

	function showWheel() {
		if (document.getElementById("spin-overlay")) return;
		const ov = document.createElement("div");
		ov.id = "spin-overlay";
		ov.innerHTML =
			'<div class="spin-card">' +
			"<h3>Daily Spin</h3>" +
			"<p>Spin the wheel once a day to win coins</p>" +
			'<div class="spin-wheel-wrap"><div class="spin-pointer"></div><div class="spin-wheel" id="spin-wheel">' + wheelSvg() + "</div></div>" +
			'<div id="spin-result" class="spin-result"></div>' +
			'<button id="spin-btn" class="spin-btn" type="button">Spin</button>' +
			'<button id="spin-later" class="spin-later" type="button">Later</button>' +
			"</div>";
		document.body.appendChild(ov);

		const wheel = ov.querySelector("#spin-wheel");
		const btn = ov.querySelector("#spin-btn");
		const later = ov.querySelector("#spin-later");
		const result = ov.querySelector("#spin-result");
		let done = false;

		function close() {
			if (spinning) return;
			document.removeEventListener("keydown", onKey);
			ov.remove();
		}
		function onKey(e) { if (e.key === "Escape") close(); }
		document.addEventListener("keydown", onKey);
		later.addEventListener("click", close);
		ov.addEventListener("click", (e) => { if (e.target === ov) close(); });

		function msg(html, isErr) {
			result.innerHTML = html;
			result.classList.toggle("err", !!isErr);
			result.classList.toggle("show", !!html);
		}

		if (wallet.status === "ok" && !isReady()) {
			btn.disabled = true;
			btn.textContent = countdown();
			msg("You already spun today. Come back later!", true);
		}

		btn.addEventListener("click", async () => {
			if (done) { close(); return; }
			if (spinning) return;
			if (typeof window.shopSpin !== "function") {
				msg("The shop is still loading, try again in a second.", true);
				return;
			}
			spinning = true;
			btn.disabled = true;
			later.disabled = true;
			btn.textContent = "Spinning...";
			msg("");

	
			let r;
			try {
				r = await window.shopSpin();
			} catch (err) {
				spinning = false;
				later.disabled = false;
				if (err.message === "cooldown") {
					const next = err.data && err.data.nextSpinAt;
					btn.textContent = next ? countdown(next) : "Already spun";
					msg("You already spun today. Come back later!", true);
				} else {
					btn.disabled = false;
					btn.textContent = "Spin";
					msg(err.message || "Spin failed. Try again.", true);
				}
				updateBalance();
				return;
			}

			const idx = r.prizeIndex;
			const prize = r.reward;
			const before = (r.coins || 0) - prize;
			const jitter = (Math.random() - 0.5) * SEG * 0.7;
			const target = EXTRA_TURNS * 360 + (360 - (idx + 0.5) * SEG) + jitter;

			void wheel.offsetWidth;
			wheel.style.transition = "transform " + SPIN_MS + "ms cubic-bezier(0.12, 0.67, 0.1, 1)";
			wheel.style.transform = "rotate(" + target + "deg)";

			let finished = false;
			const finish = () => {
				if (finished) return;
				finished = true;
				spinning = false;
				done = true;
				msg("You won <b>" + prize + "</b> " + coinIcon(20) + "!", false);
				animateBalance(before, r.coins || before + prize);
				later.disabled = false;
				later.style.display = "none";
				btn.disabled = false;
				btn.textContent = "Collect";
			};
			wheel.addEventListener("transitionend", finish, { once: true });
			setTimeout(finish, SPIN_MS + 400);
		});
	}

	function init() {
		if (!ensureChip()) {
			const mo = new MutationObserver(() => {
				if (ensureChip()) mo.disconnect();
			});
			mo.observe(document.documentElement, { childList: true, subtree: true });
		}
	
		if (typeof window.shopWallet === "function") {
			wallet = Object.assign({}, wallet, window.shopWallet());
			updateBalance();
			maybeAutoShow();
		}
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
	else init();
})();
