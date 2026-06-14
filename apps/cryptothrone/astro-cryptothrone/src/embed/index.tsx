import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import GameWindow from '../components/game/GameWindow';
import { setCtNetConfig } from '../lib/net-config';
import embedCss from '../styles/global.css?inline';

/**
 * Standalone embed entry. Boots the full cryptothrone game into a shadow root
 * on any page, with auth supplied as input (jwt + username) instead of the
 * Astro/Supabase gate. Build target: `build-embed` -> public/embed/embed.js.
 *
 *   <div data-cryptothrone data-jwt="..." data-username="..."></div>
 *   <script src="https://cryptothrone.com/embed/embed.js" defer></script>
 */
export interface CryptothroneOptions {
	el: HTMLElement | string;
	jwt: string;
	username: string;
	/** Game server WebSocket. Defaults to wss://game.cryptothrone.com/ws. */
	gameWs?: string;
	height?: string;
}

interface MountedInstance {
	root: Root;
	host: HTMLElement;
}

const DEFAULT_GAME_WS = 'wss://game.cryptothrone.com/ws';
const DEFAULT_HEIGHT = '600px';

const instances = new WeakMap<HTMLElement, MountedInstance>();

function resolveEl(el: HTMLElement | string): HTMLElement | null {
	if (typeof el === 'string') {
		return document.querySelector<HTMLElement>(el);
	}
	return el instanceof HTMLElement ? el : null;
}

export function mount(opts: CryptothroneOptions): void {
	const target = resolveEl(opts.el);
	if (!target) {
		console.error('[Cryptothrone] mount target not found:', opts.el);
		return;
	}
	if (instances.has(target)) {
		console.warn('[Cryptothrone] already mounted; unmount first');
		return;
	}
	if (!opts.jwt || !opts.username) {
		console.error('[Cryptothrone] mount requires jwt + username');
		return;
	}

	setCtNetConfig({
		jwt: opts.jwt,
		username: opts.username,
		wsUrl: opts.gameWs ?? DEFAULT_GAME_WS,
	});

	target.style.display = 'block';
	target.style.height = opts.height ?? DEFAULT_HEIGHT;
	target.style.width = '100%';

	const shadow = target.attachShadow({ mode: 'open' });

	const styleEl = document.createElement('style');
	styleEl.textContent = embedCss;
	shadow.appendChild(styleEl);

	const wrapper = document.createElement('div');
	wrapper.style.width = '100%';
	wrapper.style.height = '100%';
	shadow.appendChild(wrapper);

	const root = createRoot(wrapper);
	root.render(
		<StrictMode>
			<GameWindow username={opts.username} />
		</StrictMode>,
	);

	instances.set(target, { root, host: target });
}

export function unmount(el: HTMLElement | string): void {
	const target = resolveEl(el);
	if (!target) return;
	const inst = instances.get(target);
	if (!inst) return;
	try {
		inst.root.unmount();
	} finally {
		instances.delete(target);
		while (target.firstChild) target.removeChild(target.firstChild);
	}
}

function autoMount(): void {
	const targets = document.querySelectorAll<HTMLElement>(
		'[data-cryptothrone], [id^="cryptothrone"]',
	);
	for (const el of Array.from(targets)) {
		if (instances.has(el)) continue;
		const jwt = el.dataset.jwt;
		const username = el.dataset.username;
		if (!jwt || !username) continue;
		mount({
			el,
			jwt,
			username,
			gameWs: el.dataset.gameWs,
			height: el.dataset.height,
		});
	}
}

if (typeof document !== 'undefined') {
	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', autoMount, {
			once: true,
		});
	} else {
		autoMount();
	}
}

const api = { mount, unmount, version: '0.1.0' as const };

if (typeof window !== 'undefined') {
	(window as unknown as { Cryptothrone: typeof api }).Cryptothrone = api;
}

export default api;
