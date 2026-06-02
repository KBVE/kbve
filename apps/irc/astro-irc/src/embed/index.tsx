import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EmbedChat } from './EmbedChat';
import { EMBED_CSS } from './styles';
import { resolveToken } from './auth';
import { connect, disconnect } from './transport';
import { resetState } from './state';

export interface KbveChatOptions {
	el: HTMLElement | string;
	channel?: string;
	ws?: string;
	theme?: 'dark' | 'light';
	height?: string;
	token?: string;
	signinUrl?: string;
}

interface MountedInstance {
	root: Root;
	host: HTMLElement;
	shadow: ShadowRoot;
	wrapper: HTMLDivElement;
}

const DEFAULT_WS = 'wss://chat.kbve.com/ws';
const DEFAULT_CHANNEL = '#general';
const DEFAULT_HEIGHT = '480px';

const instances = new WeakMap<HTMLElement, MountedInstance>();

function resolveEl(el: HTMLElement | string): HTMLElement | null {
	if (typeof el === 'string') {
		const found = document.querySelector<HTMLElement>(el);
		return found;
	}
	return el instanceof HTMLElement ? el : null;
}

export function mount(opts: KbveChatOptions): void {
	const target = resolveEl(opts.el);
	if (!target) {
		console.error('[KbveChat] mount target not found:', opts.el);
		return;
	}
	if (instances.has(target)) {
		console.warn(
			'[KbveChat] already mounted on this element; unmount first',
		);
		return;
	}

	const channel = opts.channel ?? DEFAULT_CHANNEL;
	const wsUrl = opts.ws ?? DEFAULT_WS;
	const theme = opts.theme ?? 'dark';
	const height = opts.height ?? DEFAULT_HEIGHT;
	const token = resolveToken(opts.token);

	target.style.display = 'block';
	target.style.height = height;
	target.style.width = '100%';

	const shadow = target.attachShadow({ mode: 'open' });
	shadow.host.setAttribute('data-theme', theme);

	const styleEl = document.createElement('style');
	styleEl.textContent = EMBED_CSS;
	shadow.appendChild(styleEl);

	const wrapper = document.createElement('div');
	wrapper.style.width = '100%';
	wrapper.style.height = '100%';
	shadow.appendChild(wrapper);

	const root = createRoot(wrapper);
	root.render(
		<StrictMode>
			<EmbedChat signinUrl={opts.signinUrl} />
		</StrictMode>,
	);

	instances.set(target, { root, host: target, shadow, wrapper });

	void connect(wsUrl, token, channel);
}

export function unmount(el: HTMLElement | string): void {
	const target = resolveEl(el);
	if (!target) return;
	const inst = instances.get(target);
	if (!inst) return;
	try {
		disconnect();
		inst.root.unmount();
	} finally {
		instances.delete(target);
		resetState();
		// Detaching the shadow root is unsupported; clearing children is the
		// closest we get. The host element is left in place for the page.
		while (target.firstChild) target.removeChild(target.firstChild);
	}
}

function autoMount(): void {
	const targets = document.querySelectorAll<HTMLElement>(
		'[data-kbve-chat], [id^="kbve-chat"]',
	);
	for (const el of Array.from(targets)) {
		if (instances.has(el)) continue;
		mount({
			el,
			channel: el.dataset.channel,
			ws: el.dataset.ws,
			theme: (el.dataset.theme as 'dark' | 'light') ?? undefined,
			height: el.dataset.height,
			token: el.dataset.token,
			signinUrl: el.dataset.signinUrl,
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

// Expose API surface for programmatic callers.
const api = { mount, unmount, version: '0.1.0' as const };

if (typeof window !== 'undefined') {
	(window as any).KbveChat = api;
}

export default api;
