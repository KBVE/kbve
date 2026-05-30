/**
 * Yuki panel — the heavy chunk lazy-imported by `yuki-dock.ts` the
 * first time a user opens the dock.
 *
 * Phase A (this file): minimal vanilla chat scaffold so the dock
 * shows something useful when expanded — a sticky input row + a
 * scroll buffer for messages — without dragging React + Three.js
 * into the initial bundle.
 *
 * Phase B (follow-up PR): swap this for a React mount of the existing
 * `ReactJayYuki` (or a lighter variant) wired to a real assistant
 * backend. The mount API is intentionally a single
 * `mountYukiPanel(host)` function so the swap is one-line.
 */

const HISTORY_KEY = 'kbve:yuki-dock:history';
const MAX_HISTORY = 24;

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
		/* ignore quota */
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
		/* ignore */
	}
}

interface YukiVRMRuntime {
	speak(audio: HTMLAudioElement | MediaStream): void;
	stopSpeaking(): void;
	destroy(): void;
}

// Web Speech API is widely supported in browsers but TypeScript's lib
// only narrows it loosely; cast through unknown to keep the call site
// readable without pulling in dom-speechrecognition types.
type SpeakFn = (text: string) => HTMLAudioElement | null;

/**
 * Pipe SpeechSynthesis output through a MediaStream so the VRM
 * lipsync analyser has a sample-able source. Browser support for
 * `mediaStream` on `SpeechSynthesisUtterance` is patchy, so we fall
 * back to plain `speak` without lipsync when unavailable — the VRM
 * still talks visually via the deterministic idle loop, just without
 * mouth movement on this turn.
 */
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
			/* ignore */
		}
		return null;
	};
}

export async function mountYukiPanel(host: HTMLElement): Promise<void> {
	if (host.dataset.kbveYukiPanelMounted === 'true') return;
	host.dataset.kbveYukiPanelMounted = 'true';
	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 'yuki-panel';
	wrap.dataset.avatarMode = readAvatarMode();

	// 3D avatar stage. Hidden when mode === 'text'. Canvas mount is
	// populated by the lazy-loaded `YukiVRM` module on demand.
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

	// Mode toggle (text-only / 3D Yuki). Lives above the input so it's
	// always reachable. Off by default — flips lazy-load the VRM.
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

	// ── 3D avatar lifecycle ────────────────────────────────────────────
	let vrmRuntime: YukiVRMRuntime | null = null;
	let vrmLoading = false;
	const ensureVRM = async (): Promise<void> => {
		if (vrmRuntime || vrmLoading) return;
		vrmLoading = true;
		stage.dataset.state = 'loading';
		stage.innerHTML =
			'<div class="yuki-panel__stage-skeleton">Loading Yuki…</div>';
		try {
			const mod = await import('./YukiVRM');
			vrmRuntime = await mod.mountYukiVRM({ host: stage });
			stage.dataset.state = 'ready';
		} catch (err) {
			console.warn('[yuki-panel] VRM load failed', err);
			stage.innerHTML =
				'<div class="yuki-panel__stage-error">Avatar failed to load.</div>';
			stage.dataset.state = 'error';
		} finally {
			vrmLoading = false;
		}
	};
	const tearDownVRM = (): void => {
		try {
			vrmRuntime?.destroy();
		} catch {
			/* ignore */
		}
		vrmRuntime = null;
		stage.innerHTML = '';
		stage.removeAttribute('data-state');
	};
	if (readAvatarMode() === '3d') void ensureVRM();

	const modeInput = toggle.querySelector<HTMLInputElement>(
		'[data-kbve-yuki-mode]',
	);
	modeInput?.addEventListener('change', () => {
		const next: AvatarMode = modeInput.checked ? '3d' : 'text';
		writeAvatarMode(next);
		wrap.dataset.avatarMode = next;
		if (next === '3d') {
			void ensureVRM();
		} else {
			tearDownVRM();
		}
	});

	// ── Chat submit ────────────────────────────────────────────────────
	const speak = makeSpeaker();
	const input = form.querySelector<HTMLInputElement>('.yuki-panel__input');
	form.addEventListener('submit', (ev) => {
		ev.preventDefault();
		const value = input?.value.trim();
		if (!value || !input) return;
		input.value = '';
		const user: ChatEntry = { role: 'user', text: value, ts: Date.now() };
		history.push(user);
		log.appendChild(renderMessage(user));
		// Phase B keeps the deterministic echo until the backend RPC
		// lands. The next PR replaces the body of this block with an
		// SSE stream to `/api/v1/yuki/chat`. The reply still flows
		// through `speak()` so the VRM lipsync hook stays wired.
		const reply =
			"I've logged your question. The Yuki backend isn't online " +
			'in this preview, but I will pass it along.';
		const yuki: ChatEntry = {
			role: 'yuki',
			text: reply,
			ts: Date.now(),
		};
		history.push(yuki);
		log.appendChild(renderMessage(yuki));
		writeHistory(history);
		log.scrollTop = log.scrollHeight;
		speak(reply);
	});

	if (!document.getElementById('kbve-yuki-panel-css')) {
		const css = document.createElement('style');
		css.id = 'kbve-yuki-panel-css';
		css.textContent = `
			.yuki-panel { display: grid; grid-template-rows: auto 1fr auto auto; gap: 0.5rem; height: 100%; }
			.yuki-panel[data-avatar-mode='text'] .yuki-panel__stage { display: none; }
			.yuki-panel__stage { height: 180px; border-radius: 12px; overflow: hidden; background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.08); position: relative; }
			.yuki-panel__stage-skeleton, .yuki-panel__stage-error { position: absolute; inset: 0; display: grid; place-items: center; font-size: 0.78rem; color: rgba(255,255,255,0.5); }
			.yuki-panel__stage-error { color: #f87171; }
			.yuki-panel__log { display: grid; gap: 0.5rem; align-content: start; overflow-y: auto; padding-right: 0.25rem; }
			.yuki-panel__mode { display: flex; justify-content: flex-end; }
			.yuki-panel__mode-label { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.72rem; color: rgba(255,255,255,0.55); cursor: pointer; user-select: none; }
			.yuki-panel__mode-input { accent-color: rgb(6,182,212); }
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
		`;
		document.head.appendChild(css);
	}
}
