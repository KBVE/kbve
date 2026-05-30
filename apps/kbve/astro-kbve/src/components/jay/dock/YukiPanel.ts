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

export async function mountYukiPanel(host: HTMLElement): Promise<void> {
	if (host.dataset.kbveYukiPanelMounted === 'true') return;
	host.dataset.kbveYukiPanelMounted = 'true';
	host.innerHTML = '';

	const wrap = document.createElement('div');
	wrap.className = 'yuki-panel';

	const log = document.createElement('div');
	log.className = 'yuki-panel__log';
	log.setAttribute('role', 'log');
	log.setAttribute('aria-live', 'polite');
	wrap.appendChild(log);

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

	const input = form.querySelector<HTMLInputElement>('.yuki-panel__input');
	form.addEventListener('submit', (ev) => {
		ev.preventDefault();
		const value = input?.value.trim();
		if (!value || !input) return;
		input.value = '';
		const user: ChatEntry = { role: 'user', text: value, ts: Date.now() };
		history.push(user);
		log.appendChild(renderMessage(user));
		// Phase A: deterministic placeholder reply. Phase B will replace
		// this with a real backend round-trip.
		const yuki: ChatEntry = {
			role: 'yuki',
			text:
				"I've logged your question. The Yuki backend isn't online " +
				'in this preview, but it will be soon — appreciate the patience.',
			ts: Date.now(),
		};
		history.push(yuki);
		log.appendChild(renderMessage(yuki));
		writeHistory(history);
		log.scrollTop = log.scrollHeight;
	});

	if (!document.getElementById('kbve-yuki-panel-css')) {
		const css = document.createElement('style');
		css.id = 'kbve-yuki-panel-css';
		css.textContent = `
			.yuki-panel { display: grid; grid-template-rows: 1fr auto; gap: 0.5rem; height: 100%; }
			.yuki-panel__log { display: grid; gap: 0.5rem; align-content: start; overflow-y: auto; padding-right: 0.25rem; }
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
