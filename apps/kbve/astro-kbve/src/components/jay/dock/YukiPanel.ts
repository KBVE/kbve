const HISTORY_KEY = 'kbve:yuki-dock:history';
const FLOAT_KEY = 'kbve:yuki-dock:float-mode';
const FLOAT_POS_KEY = 'kbve:yuki-dock:float-pos';
const GREETED_KEY = 'kbve:yuki-dock:greeted';
const MAX_HISTORY = 24;

const GREETING =
	"Hi! I'm Yuki — your KBVE concierge. Tap the chat or just say hello.";
const CLICK_GREET = 'Hi there! Need a hand finding something?';

type Role = 'user' | 'yuki';
interface ChatEntry {
	role: Role;
	text: string;
	ts: number;
}

function readHistory(): ChatEntry[] {
	try {
		const raw = localStorage.getItem(HISTORY_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed
			.slice(-MAX_HISTORY)
			.filter(
				(e): e is ChatEntry =>
					e &&
					typeof e === 'object' &&
					typeof e.text === 'string' &&
					(e.role === 'user' || e.role === 'yuki') &&
					typeof e.ts === 'number',
			);
	} catch {
		return [];
	}
}

function writeHistory(history: ChatEntry[]): void {
	try {
		localStorage.setItem(
			HISTORY_KEY,
			JSON.stringify(history.slice(-MAX_HISTORY)),
		);
	} catch {
		void 0;
	}
}

const WELCOME: ChatEntry = {
	role: 'yuki',
	text:
		"Hi! I'm Yuki — your KBVE concierge. The full assistant backend " +
		'is still warming up; for now I can point you at docs and recent ' +
		'releases. Drop a question and I will log it.',
	ts: Date.now(),
};

function renderMessage(entry: ChatEntry): HTMLElement {
	const row = document.createElement('div');
	row.className = `yuki-msg yuki-msg--${entry.role}`;
	const bubble = document.createElement('div');
	bubble.className = 'yuki-msg__bubble';
	bubble.textContent = entry.text;
	row.appendChild(bubble);
	return row;
}

const AVATAR_MODE_KEY = 'kbve:yuki-dock:avatar-mode';
type AvatarMode = 'text' | '3d';

function readAvatarMode(): AvatarMode {
	try {
		return localStorage.getItem(AVATAR_MODE_KEY) === '3d' ? '3d' : 'text';
	} catch {
		return 'text';
	}
}
function writeAvatarMode(mode: AvatarMode): void {
	try {
		localStorage.setItem(AVATAR_MODE_KEY, mode);
	} catch {
		void 0;
	}
}

function readFloat(): boolean {
	try {
		return localStorage.getItem(FLOAT_KEY) === '1';
	} catch {
		return false;
	}
}
function writeFloat(on: boolean): void {
	try {
		localStorage.setItem(FLOAT_KEY, on ? '1' : '0');
	} catch {
		void 0;
	}
}

function readGreeted(): boolean {
	try {
		return localStorage.getItem(GREETED_KEY) === '1';
	} catch {
		return false;
	}
}
function writeGreeted(): void {
	try {
		localStorage.setItem(GREETED_KEY, '1');
	} catch {
		void 0;
	}
}

interface FloatPos {
	x: number;
	y: number;
}
function readFloatPos(): FloatPos | null {
	try {
		const raw = localStorage.getItem(FLOAT_POS_KEY);
		if (!raw) return null;
		const p = JSON.parse(raw);
		if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
		return p;
	} catch {
		return null;
	}
}
function writeFloatPos(pos: FloatPos): void {
	try {
		localStorage.setItem(FLOAT_POS_KEY, JSON.stringify(pos));
	} catch {
		void 0;
	}
}

interface YukiVRMRuntime {
	setState(state: string): void;
	speak(audio: HTMLAudioElement | MediaStream): void;
	stopSpeaking(): void;
	pointAt(x: number, y: number): void;
	setActive(active: boolean): void;
	destroy(): void;
}

type SpeakFn = (text: string) => HTMLAudioElement | null;

function makeSpeaker(): SpeakFn {
	return (text: string) => {
		try {
			const synth = window.speechSynthesis;
			if (!synth) return null;
			synth.cancel();
			const utter = new SpeechSynthesisUtterance(text);
			utter.rate = 1.0;
			utter.pitch = 1.15;
			synth.speak(utter);
		} catch {
			void 0;
		}
		return null;
	};
}

const FLOAT_LAYER_ID = 'kbve-yuki-float-layer';
const FLOAT_HOST_ID = 'kbve-yuki-float-host';

function ensureFloatLayer(): HTMLElement {
	let layer = document.getElementById(FLOAT_LAYER_ID);
	if (layer) return layer;
	layer = document.createElement('div');
	layer.id = FLOAT_LAYER_ID;
	layer.setAttribute('transition:persist', 'kbve-yuki-float');
	layer.dataset.astroTransitionPersist = 'kbve-yuki-float';
	const pos = readFloatPos() ?? {
		x: Math.max(24, window.innerWidth - 220),
		y: Math.max(24, window.innerHeight - 320),
	};
	layer.style.cssText = `
		position: fixed;
		left: ${pos.x}px;
		top: ${pos.y}px;
		width: 196px;
		height: 260px;
		z-index: 60;
		pointer-events: auto;
		display: none;
		filter: drop-shadow(0 8px 24px rgba(0,0,0,0.35));
	`;
	const handle = document.createElement('div');
	handle.id = 'kbve-yuki-float-drag';
	handle.style.cssText =
		'position:absolute;inset:0 0 auto 0;height:18px;cursor:grab;user-select:none;';
	const close = document.createElement('button');
	close.id = 'kbve-yuki-float-close';
	close.type = 'button';
	close.setAttribute('aria-label', 'Return Yuki to dock');
	close.textContent = '×';
	close.style.cssText = `
		position:absolute;top:4px;right:6px;width:22px;height:22px;
		display:grid;place-items:center;border-radius:999px;
		background:rgba(15,23,42,0.65);color:rgba(255,255,255,0.9);
		border:1px solid rgba(255,255,255,0.15);font-size:14px;
		line-height:1;cursor:pointer;z-index:2;
	`;
	const stage = document.createElement('div');
	stage.id = FLOAT_HOST_ID;
	stage.style.cssText = 'position:absolute;inset:0;cursor:pointer;';
	layer.appendChild(stage);
	layer.appendChild(handle);
	layer.appendChild(close);
	document.body.appendChild(layer);
	return layer;
}

function clampFloatPos(x: number, y: number): FloatPos {
	const w = 196;
	const h = 260;
	const nx = Math.min(Math.max(8, x), window.innerWidth - w - 8);
	const ny = Math.min(Math.max(8, y), window.innerHeight - h - 8);
	return { x: nx, y: ny };
}

function bindFloatDrag(layer: HTMLElement): void {
	if (layer.dataset.dragBound === '1') return;
	layer.dataset.dragBound = '1';
	const handle = layer.querySelector<HTMLElement>('#kbve-yuki-float-drag');
	if (!handle) return;
	let dragging = false;
	let offX = 0;
	let offY = 0;
	const onMove = (ev: PointerEvent) => {
		if (!dragging) return;
		const pos = clampFloatPos(ev.clientX - offX, ev.clientY - offY);
		layer.style.left = `${pos.x}px`;
		layer.style.top = `${pos.y}px`;
	};
	const onUp = (ev: PointerEvent) => {
		if (!dragging) return;
		dragging = false;
		handle.style.cursor = 'grab';
		(ev.target as Element).releasePointerCapture?.(ev.pointerId);
		const rect = layer.getBoundingClientRect();
		writeFloatPos({ x: rect.left, y: rect.top });
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
	};
	handle.addEventListener('pointerdown', (ev) => {
		dragging = true;
		const rect = layer.getBoundingClientRect();
		offX = ev.clientX - rect.left;
		offY = ev.clientY - rect.top;
		handle.style.cursor = 'grabbing';
		(ev.target as Element).setPointerCapture?.(ev.pointerId);
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp);
	});
}

export async function mountYukiPanel(host: HTMLElement): Promise<void> {
	if (host.dataset.kbveYukiPanelMounted === 'true') return;
	host.dataset.kbveYukiPanelMounted = 'true';
	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 'yuki-panel';
	wrap.dataset.avatarMode = readAvatarMode();
	wrap.dataset.floatMode = readFloat() ? '1' : '0';

	const stage = document.createElement('div');
	stage.className = 'yuki-panel__stage';
	stage.dataset.kbveYukiStage = '';
	stage.setAttribute('aria-label', 'Yuki avatar');
	wrap.appendChild(stage);

	const log = document.createElement('div');
	log.className = 'yuki-panel__log';
	log.setAttribute('role', 'log');
	log.setAttribute('aria-live', 'polite');
	wrap.appendChild(log);

	const toggle = document.createElement('div');
	toggle.className = 'yuki-panel__mode';
	toggle.innerHTML = `
		<label class="yuki-panel__mode-label">
			<input
				type="checkbox"
				class="yuki-panel__mode-input"
				data-kbve-yuki-mode
				${readAvatarMode() === '3d' ? 'checked' : ''} />
			<span>Show 3D Yuki</span>
		</label>
		<button
			type="button"
			class="yuki-panel__float-btn"
			data-kbve-yuki-float
			aria-pressed="${readFloat() ? 'true' : 'false'}">
			${readFloat() ? 'Dock' : 'Float'}
		</button>
	`;
	wrap.appendChild(toggle);

	const form = document.createElement('form');
	form.className = 'yuki-panel__form';
	form.innerHTML = `
		<input
			type="text"
			class="yuki-panel__input"
			name="prompt"
			autocomplete="off"
			placeholder="Ask Yuki…"
			aria-label="Ask Yuki"
			maxlength="500" />
		<button type="submit" class="yuki-panel__send" aria-label="Send">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
				stroke="currentColor" stroke-width="2" stroke-linecap="round"
				stroke-linejoin="round" aria-hidden="true">
				<line x1="22" y1="2" x2="11" y2="13"></line>
				<polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
			</svg>
		</button>
	`;
	wrap.appendChild(form);
	host.appendChild(wrap);

	let history = readHistory();
	if (history.length === 0) {
		history = [WELCOME];
		writeHistory(history);
	}
	for (const entry of history) {
		log.appendChild(renderMessage(entry));
	}
	log.scrollTop = log.scrollHeight;

	const speak = makeSpeaker();

	let vrmRuntime: YukiVRMRuntime | null = null;
	let vrmLoading = false;
	let vrmHost: HTMLElement = stage;
	let vrmTransparent = false;
	let wanderRaf = 0;
	let wanderLastMove = performance.now();
	let pageMoveBound = false;

	const fireFirstGreet = (): void => {
		if (!vrmRuntime) return;
		if (readGreeted()) return;
		writeGreeted();
		vrmRuntime.setState('wave');
		speak(GREETING);
	};

	const clickGreet = (): void => {
		if (!vrmRuntime) return;
		vrmRuntime.setState('wave');
		speak(CLICK_GREET);
	};

	const ensureVRM = async (
		hostEl: HTMLElement,
		transparent: boolean,
	): Promise<void> => {
		if (vrmLoading) return;
		if (vrmRuntime && vrmHost === hostEl && vrmTransparent === transparent)
			return;
		if (vrmRuntime) {
			try {
				vrmRuntime.destroy();
			} catch {
				void 0;
			}
			vrmRuntime = null;
		}
		vrmLoading = true;
		hostEl.dataset.state = 'loading';
		hostEl.innerHTML =
			'<div class="yuki-panel__stage-skeleton">Loading Yuki…</div>';
		try {
			const mod = await import('./YukiVRM');
			vrmRuntime = (await mod.mountYukiVRM({
				host: hostEl,
				transparent,
			})) as unknown as YukiVRMRuntime;
			vrmHost = hostEl;
			vrmTransparent = transparent;
			hostEl.dataset.state = 'ready';
			setTimeout(fireFirstGreet, 600);
		} catch (err) {
			console.warn('[yuki-panel] VRM load failed', err);
			hostEl.innerHTML =
				'<div class="yuki-panel__stage-error">Avatar failed to load.</div>';
			hostEl.dataset.state = 'error';
		} finally {
			vrmLoading = false;
		}
	};

	const tearDownVRM = (): void => {
		try {
			vrmRuntime?.destroy();
		} catch {
			void 0;
		}
		vrmRuntime = null;
		stage.innerHTML = '';
		stage.removeAttribute('data-state');
		const floatLayer = document.getElementById(FLOAT_LAYER_ID);
		if (floatLayer) {
			const fh = floatLayer.querySelector<HTMLElement>(
				`#${FLOAT_HOST_ID}`,
			);
			if (fh) {
				fh.innerHTML = '';
				fh.removeAttribute('data-state');
			}
		}
	};

	const onPageMove = (ev: PointerEvent): void => {
		if (!readFloat()) return;
		const layer = document.getElementById(FLOAT_LAYER_ID);
		if (!layer) return;
		const fh = layer.querySelector<HTMLElement>(`#${FLOAT_HOST_ID}`);
		if (!fh) return;
		const rect = fh.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const dx = ev.clientX - cx;
		const dy = ev.clientY - cy;
		const maxR = Math.max(window.innerWidth, window.innerHeight) / 2;
		const fx = Math.max(-1.4, Math.min(1.4, dx / maxR));
		const fy = Math.max(-1.4, Math.min(1.4, dy / maxR));
		const px = rect.left + rect.width / 2 + (fx * rect.width) / 2;
		const py = rect.top + rect.height / 2 + (fy * rect.height) / 2;
		vrmRuntime?.pointAt(px, py);
		wanderLastMove = performance.now();
	};

	const bindPageMove = (): void => {
		if (pageMoveBound) return;
		pageMoveBound = true;
		window.addEventListener('pointermove', onPageMove);
	};
	const unbindPageMove = (): void => {
		if (!pageMoveBound) return;
		pageMoveBound = false;
		window.removeEventListener('pointermove', onPageMove);
	};

	const wanderTick = (): void => {
		wanderRaf = requestAnimationFrame(wanderTick);
		if (!readFloat() || !vrmRuntime) return;
		const idleMs = performance.now() - wanderLastMove;
		if (idleMs < 8000) return;
		const layer = document.getElementById(FLOAT_LAYER_ID);
		if (!layer || layer.style.display === 'none') return;
		const fh = layer.querySelector<HTMLElement>(`#${FLOAT_HOST_ID}`);
		if (!fh) return;
		const rect = fh.getBoundingClientRect();
		const t = performance.now() / 2200;
		const px = rect.left + rect.width / 2 + Math.cos(t) * rect.width * 0.3;
		const py =
			rect.top + rect.height / 2 + Math.sin(t * 1.3) * rect.height * 0.2;
		vrmRuntime.pointAt(px, py);
	};
	wanderRaf = requestAnimationFrame(wanderTick);

	const dock = document.getElementById('kbve-yuki-dock');
	const evaluateActive = (): void => {
		if (!vrmRuntime) return;
		const expanded = dock?.dataset.state === 'expanded';
		const floating = readFloat();
		vrmRuntime.setActive(expanded || floating);
	};

	const applyFloat = (on: boolean): void => {
		wrap.dataset.floatMode = on ? '1' : '0';
		const btn = toggle.querySelector<HTMLButtonElement>(
			'[data-kbve-yuki-float]',
		);
		if (btn) {
			btn.textContent = on ? 'Dock' : 'Float';
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		}
		const layer = ensureFloatLayer();
		bindFloatDrag(layer);
		const floatStage = layer.querySelector<HTMLElement>(
			`#${FLOAT_HOST_ID}`,
		);
		if (!floatStage) return;
		if (on && readAvatarMode() === '3d') {
			layer.style.display = 'block';
			stage.innerHTML = '';
			stage.removeAttribute('data-state');
			void ensureVRM(floatStage, true);
			bindPageMove();
		} else {
			layer.style.display = 'none';
			unbindPageMove();
			if (readAvatarMode() === '3d') {
				const fh = layer.querySelector<HTMLElement>(
					`#${FLOAT_HOST_ID}`,
				);
				if (fh) fh.innerHTML = '';
				void ensureVRM(stage, false);
			} else {
				tearDownVRM();
			}
		}
		evaluateActive();
	};

	if (readAvatarMode() === '3d') {
		applyFloat(readFloat());
	}

	const layer = ensureFloatLayer();
	bindFloatDrag(layer);
	const closeBtn = layer.querySelector<HTMLButtonElement>(
		'#kbve-yuki-float-close',
	);
	closeBtn?.addEventListener('click', () => {
		writeFloat(false);
		applyFloat(false);
	});

	const floatStage = layer.querySelector<HTMLElement>(`#${FLOAT_HOST_ID}`);
	floatStage?.addEventListener('click', (ev) => {
		const target = ev.target as HTMLElement | null;
		if (target?.id === 'kbve-yuki-float-close') return;
		clickGreet();
	});
	stage.addEventListener('click', clickGreet);

	const modeInput = toggle.querySelector<HTMLInputElement>(
		'[data-kbve-yuki-mode]',
	);
	modeInput?.addEventListener('change', () => {
		const next: AvatarMode = modeInput.checked ? '3d' : 'text';
		writeAvatarMode(next);
		wrap.dataset.avatarMode = next;
		if (next === '3d') {
			applyFloat(readFloat());
		} else {
			writeFloat(false);
			applyFloat(false);
			tearDownVRM();
		}
	});

	const floatBtn = toggle.querySelector<HTMLButtonElement>(
		'[data-kbve-yuki-float]',
	);
	floatBtn?.addEventListener('click', () => {
		if (readAvatarMode() !== '3d') {
			writeAvatarMode('3d');
			wrap.dataset.avatarMode = '3d';
			if (modeInput) modeInput.checked = true;
		}
		const next = !readFloat();
		writeFloat(next);
		applyFloat(next);
	});

	const input = form.querySelector<HTMLInputElement>('.yuki-panel__input');
	input?.addEventListener('focus', () => {
		if (!input || !vrmRuntime) return;
		const rect = input.getBoundingClientRect();
		vrmRuntime.pointAt(
			rect.left + rect.width / 2,
			rect.top + rect.height / 2,
		);
	});

	let activeStream: EventSource | null = null;

	form.addEventListener('submit', (ev) => {
		ev.preventDefault();
		const value = input?.value.trim();
		if (!value || !input) return;
		input.value = '';

		const user: ChatEntry = { role: 'user', text: value, ts: Date.now() };
		history.push(user);
		log.appendChild(renderMessage(user));
		log.scrollTop = log.scrollHeight;

		vrmRuntime?.setState('nod');

		const yuki: ChatEntry = { role: 'yuki', text: '', ts: Date.now() };
		history.push(yuki);
		const yukiRow = renderMessage(yuki);
		const yukiBubble =
			yukiRow.querySelector<HTMLElement>('.yuki-msg__bubble');
		log.appendChild(yukiRow);
		log.scrollTop = log.scrollHeight;

		activeStream?.close();
		const url = `/api/v1/yuki/chat?q=${encodeURIComponent(value)}`;
		const es = new EventSource(url);
		activeStream = es;

		let assembled = '';
		const append = (text: string): void => {
			assembled += (assembled ? ' ' : '') + text;
			yuki.text = assembled;
			if (yukiBubble) yukiBubble.textContent = assembled;
			log.scrollTop = log.scrollHeight;
		};

		es.onmessage = (msg) => {
			if (msg.data) append(msg.data);
		};
		es.addEventListener('done', () => {
			es.close();
			activeStream = null;
			writeHistory(history);
			if (assembled) {
				speak(assembled);
				vrmRuntime?.setState('happy');
				setTimeout(() => vrmRuntime?.setState('idle'), 2200);
			}
		});
		es.onerror = () => {
			es.close();
			activeStream = null;
			if (!assembled) {
				const fallback =
					"I couldn't reach my backend just now — try again in a sec.";
				yuki.text = fallback;
				if (yukiBubble) yukiBubble.textContent = fallback;
				vrmRuntime?.setState('shake');
			}
			writeHistory(history);
		};
	});

	if (dock) {
		const dockObserver = new MutationObserver(evaluateActive);
		dockObserver.observe(dock, {
			attributes: true,
			attributeFilter: ['data-state'],
		});
	}

	const onSwap = (): void => {
		cancelAnimationFrame(wanderRaf);
		unbindPageMove();
	};
	document.addEventListener('astro:before-swap', onSwap, { once: true });

	if (!document.getElementById('kbve-yuki-panel-css')) {
		const css = document.createElement('style');
		css.id = 'kbve-yuki-panel-css';
		css.textContent = `
			.yuki-panel { display: grid; grid-template-rows: auto 1fr auto auto; gap: 0.5rem; height: 100%; }
			.yuki-panel[data-avatar-mode='text'] .yuki-panel__stage { display: none; }
			.yuki-panel[data-float-mode='1'] .yuki-panel__stage { display: none; }
			.yuki-panel__stage { height: 180px; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); position: relative; cursor: pointer; }
			.yuki-panel__stage-skeleton, .yuki-panel__stage-error { position: absolute; inset: 0; display: grid; place-items: center; font-size: 0.78rem; color: rgba(255,255,255,0.5); }
			.yuki-panel__stage-error { color: #f87171; }
			.yuki-panel__log { display: grid; gap: 0.5rem; align-content: start; overflow-y: auto; padding-right: 0.25rem; }
			.yuki-panel__mode { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
			.yuki-panel__mode-label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: rgba(255,255,255,0.55); cursor: pointer; user-select: none; }
			.yuki-panel__mode-input { accent-color: rgb(6,182,212); }
			.yuki-panel__float-btn { font-size: 0.7rem; padding: 0.25rem 0.55rem; border-radius: 8px; background: rgba(6,182,212,0.16); border: 1px solid rgba(6,182,212,0.4); color: rgba(255,255,255,0.85); cursor: pointer; }
			.yuki-panel__float-btn:hover { background: rgba(6,182,212,0.28); }
			.yuki-panel__float-btn[aria-pressed='true'] { background: rgba(244,114,182,0.18); border-color: rgba(244,114,182,0.5); }
			.yuki-msg { display: flex; }
			.yuki-msg--user { justify-content: flex-end; }
			.yuki-msg__bubble { max-width: 80%; padding: 0.55rem 0.75rem; border-radius: 12px; font-size: 0.85rem; line-height: 1.4; word-wrap: break-word; }
			.yuki-msg--user .yuki-msg__bubble { background: rgba(6,182,212,0.18); border: 1px solid rgba(6,182,212,0.4); color: rgba(255,255,255,0.95); }
			.yuki-msg--yuki .yuki-msg__bubble { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); }
			.yuki-panel__form { display: grid; grid-template-columns: 1fr auto; gap: 0.4rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); }
			.yuki-panel__input { padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.95); font-size: 0.85rem; font-family: inherit; }
			.yuki-panel__input:focus { outline: 2px solid rgba(6,182,212,0.6); outline-offset: -1px; }
			.yuki-panel__send { display: grid; place-items: center; width: 36px; background: rgba(6,182,212,0.6); border: none; border-radius: 10px; color: white; cursor: pointer; }
			.yuki-panel__send:hover { background: rgba(6,182,212,0.85); }
			#${FLOAT_LAYER_ID} { transition: filter 0.2s ease; }
			#${FLOAT_LAYER_ID}:hover { filter: drop-shadow(0 12px 32px rgba(244,114,182,0.45)); }
		`;
		document.head.appendChild(css);
	}
}
