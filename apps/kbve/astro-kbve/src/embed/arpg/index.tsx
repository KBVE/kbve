import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ReactIsoArpgApp from '../../arcade/isometric-arpg/ReactIsoArpgApp';

/**
 * Standalone embed entry for the ARPG. Boots the game with auth supplied as
 * input (jwt + username) instead of the Astro/Supabase gate + name prompt — the
 * Discord Activity (src/embed/arpg/discord.tsx) runs the OAuth handshake, gets a
 * session from axum-kbve, then calls mount() with it.
 *
 * Build target: vite.arpg-discord.config -> public/discord/arpg/arpg.js
 */
export interface ArpgEmbedOptions {
	el: HTMLElement | string;
	jwt: string;
	username: string;
	/** Game server WebSocket. Defaults to wss://arpg.kbve.com/ws (config). */
	gameWs?: string;
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
