import type { DiscordSDK } from '@discord/embedded-app-sdk';
import { laserEvents } from '@kbve/laser';

/**
 * Discord rich presence for the isolated Activity path. Subscribes to the
 * laser event bus (the same bus the React HUD reads) and pushes meaningful
 * game-state changes — zone, party size, combat — to the player's Discord
 * profile via `setActivity`. Lives outside React because discord.tsx owns the
 * DiscordSDK instance; the game mounts into a shadow root and never sees it.
 *
 * Requires the `rpc.activities.write` OAuth scope on `authorize`.
 */

const DEFAULT_ZONE = 'Cloud City';
/** Keep the in-combat badge up this long after the last combat event so it
 * doesn't flicker off between swings. */
const COMBAT_LINGER_MS = 8_000;
/** Discord rate-limits setActivity (~5 updates / 20s). Coalesce bursts to one
 * update per window, leading + trailing. */
const THROTTLE_MS = 4_000;

/** Max party size for the `[current, max]` badge. Mirrors the game server
 * roster capacity; env-overridable so it tracks the deployed cap without a
 * code change. */
function resolvePartyMax(): number {
	const env = import.meta.env.PUBLIC_CT_PARTY_MAX as string | undefined;
	const n = env ? Number.parseInt(env, 10) : Number.NaN;
	return Number.isFinite(n) && n > 0 ? n : 64;
}

/** Large presence art. Defaults to a Rich Presence asset key (`cryptothrone`)
 * uploaded in the Discord developer portal — no URL mapping needed. An external
 * image URL also works (CSP exempts presence assets) via the env override. */
function resolvePresenceImage(): string {
	const env = import.meta.env.PUBLIC_CT_PRESENCE_IMAGE as string | undefined;
	return env && env.length > 0 ? env : 'cryptothrone';
}

interface PresenceState {
	zone: string;
	party: number;
	inCombat: boolean;
}

/** Start pushing rich presence. Returns a stop() that unsubscribes, cancels
 * pending updates, and clears the presence. */
export function startPresence(sdk: DiscordSDK): () => void {
	const partyMax = resolvePartyMax();
	const largeImage = resolvePresenceImage();
	const startTs = Date.now();

	const presence: PresenceState = {
		zone: DEFAULT_ZONE,
		party: 1,
		inCombat: false,
	};

	let dirty = false;
	let throttle = 0;
	let combatTimer = 0;
	let lastSent = 0;
	let stopped = false;

	function build() {
		const current = Math.max(1, presence.party);
		return {
			type: 0,
			details: presence.inCombat
				? `In combat — ${presence.zone}`
				: `Exploring ${presence.zone}`,
			// `state` only renders alongside `party`, so always send both.
			state:
				current > 1 ? `In a party of ${current}` : 'Adventuring solo',
			party: {
				id: 'cryptothrone-realm',
				size: [current, Math.max(current, partyMax)],
			},
			assets: { large_image: largeImage, large_text: 'CryptoThrone' },
			timestamps: { start: startTs },
		};
	}

	function flush() {
		dirty = false;
		lastSent = Date.now();
		void sdk.commands.setActivity({ activity: build() }).catch((err) => {
			console.warn('[Cryptothrone/Discord] setActivity failed', err);
		});
	}

	function schedule() {
		if (stopped) return;
		dirty = true;
		if (throttle) return;
		const elapsed = Date.now() - lastSent;
		if (elapsed >= THROTTLE_MS) {
			flush();
			return;
		}
		throttle = window.setTimeout(() => {
			throttle = 0;
			if (dirty) flush();
		}, THROTTLE_MS - elapsed);
	}

	const unsubs: (() => void)[] = [
		laserEvents.on('net:status', (data) => {
			// First presence push once the game is live in the world.
			if ((data as { status?: string }).status === 'ready') schedule();
		}),
		laserEvents.on('zone:enter', (data) => {
			const name = (data as { name?: string }).name;
			if (name && name !== presence.zone) {
				presence.zone = name;
				schedule();
			}
		}),
		laserEvents.on('players:sync', (data) => {
			const players = (data as { players?: unknown[] }).players ?? [];
			const next = Math.max(1, players.length);
			if (next !== presence.party) {
				presence.party = next;
				schedule();
			}
		}),
		laserEvents.on('combat:event', () => {
			if (!presence.inCombat) {
				presence.inCombat = true;
				schedule();
			}
			window.clearTimeout(combatTimer);
			combatTimer = window.setTimeout(() => {
				presence.inCombat = false;
				schedule();
			}, COMBAT_LINGER_MS);
		}),
	];

	// Show presence immediately on entry; net:status 'ready' refreshes it.
	schedule();

	return () => {
		stopped = true;
		unsubs.forEach((fn) => fn());
		window.clearTimeout(throttle);
		window.clearTimeout(combatTimer);
		void sdk.commands.setActivity({ activity: null }).catch(() => {});
	};
}
