import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactIsoArpgApp from '../game/ReactIsoArpgApp';
import { setArpgAssetBase, setArpgChatUrl } from '../game/config';
import { setSupabaseUrl } from '../lib/supa';

/**
 * Embed entry for the ARPG. Exposes two mounts on the IIFE global:
 *   mount(opts)    — boots with auth supplied as input (jwt + username); the
 *                    Discord Activity (./discord.tsx) runs OAuth, gets a session
 *                    from axum-kbve, then calls this — skipping the gate + prompt.
 *   mountApp(opts) — boots with no session; ReactIsoArpgApp runs its own gate
 *                    (used by the kbve.com/arcade/arpg astro page).
 *
 * Build targets (vite --mode embed | discord, see web/vite.config.ts):
 *   embed   -> astro public/arpg/arpg-embed.js   (window.ArpgEmbed)
 *   discord -> astro public/discord/arpg/arpg.js (Discord Activity)
 */
export interface ArpgEmbedOptions {
	el: HTMLElement | string;
	jwt: string;
	username: string;
	/** Game server WebSocket. Defaults to wss://arpg.kbve.com/ws (config). */
	gameWs?: string;
	/** Realm chat WebSocket. Discord Activity passes the proxied URL. */
	chatWs?: string;
	/** Supabase base URL. Discord Activity passes the proxied URL. */
	supabaseUrl?: string;
	height?: string;
}

interface MountedInstance {
	root: Root;
	host: HTMLElement;
}

const DEFAULT_HEIGHT = '100vh';
const instances = new WeakMap<HTMLElement, MountedInstance>();

function resolveEl(el: HTMLElement | string): HTMLElement | null {
	if (typeof el === 'string') {
		return document.querySelector<HTMLElement>(el);
	}
	return el instanceof HTMLElement ? el : null;
}

export function mount(opts: ArpgEmbedOptions): void {
	const target = resolveEl(opts.el);
	if (!target) {
		console.error('[ARPG] mount target not found:', opts.el);
		return;
	}
	if (instances.has(target)) {
		console.warn('[ARPG] already mounted; unmount first');
		return;
	}
	if (!opts.jwt || !opts.username) {
		console.error('[ARPG] mount requires jwt + username');
		return;
	}

	if (opts.chatWs) setArpgChatUrl(opts.chatWs);
	if (opts.supabaseUrl) setSupabaseUrl(opts.supabaseUrl);

	target.style.display = 'block';
	target.style.height = opts.height ?? DEFAULT_HEIGHT;
	target.style.width = '100%';

	// The game canvas needs a stable container id; ReactIsoArpgApp mounts Phaser
	// into '#iso-arpg-inner'.
	const wrapper = document.createElement('div');
	wrapper.id = 'iso-arpg-inner';
	wrapper.style.position = 'relative';
	wrapper.style.width = '100%';
	wrapper.style.height = '100%';
	target.appendChild(wrapper);

	const root = createRoot(wrapper);
	root.render(
		<StrictMode>
			<ReactIsoArpgApp
				embedSession={{
					jwt: opts.jwt,
					username: opts.username,
					wsUrl: opts.gameWs,
				}}
			/>
		</StrictMode>,
	);

	instances.set(target, { root, host: target });
}

/**
 * Mount the game with no supplied session — ReactIsoArpgApp runs its own gate
 * (Supabase sign-in / offline name prompt) and resolves the JWT itself via
 * buildNetConfig. Used by the kbve.com/arcade/arpg astro page, which has a live
 * *.kbve.com Supabase session in the browser.
 */
export function mountApp(opts: {
	el: HTMLElement | string;
	/** Origin serving the game art, e.g. 'https://arpg.kbve.com'. */
	assetBase?: string;
	height?: string;
}): void {
	const target = resolveEl(opts.el);
	if (!target) {
		console.error('[ARPG] mountApp target not found:', opts.el);
		return;
	}
	if (instances.has(target)) {
		console.warn('[ARPG] already mounted; unmount first');
		return;
	}

	if (opts.assetBase !== undefined) setArpgAssetBase(opts.assetBase);

	target.style.display = 'block';
	target.style.height = opts.height ?? DEFAULT_HEIGHT;
	target.style.width = '100%';

	const wrapper = document.createElement('div');
	wrapper.id = 'iso-arpg-inner';
	wrapper.style.position = 'relative';
	wrapper.style.width = '100%';
	wrapper.style.height = '100%';
	target.appendChild(wrapper);

	const root = createRoot(wrapper);
	root.render(
		<StrictMode>
			<ReactIsoArpgApp />
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
