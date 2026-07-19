/**
 * User Tooltip Service — shared logic for the global hover profile card.
 *
 * A single tooltip node lives in the DOM (mounted once via AstroUserTooltip).
 * `initUserTooltip` wires delegated hover/focus listeners on the document so
 * any author link (`<a href="/@username">`) across the site re-uses the same
 * tooltip: on hover it fetches `/api/v1/profile/{username}`, builds a mini
 * profile card, positions it near the trigger, and fades it in.
 *
 * The pure helpers (parse/pick/build) are unit-tested; `initUserTooltip`
 * owns the DOM wiring.
 */

export interface ProfileProvider {
	username?: string | null;
	avatar_url?: string | null;
}

export interface DiscordProvider extends ProfileProvider {
	is_guild_member?: boolean | null;
	is_boosting?: boolean | null;
	role_names?: string[] | null;
}

export interface TwitchProvider extends ProfileProvider {
	is_live?: boolean | null;
}

export interface UserProfileResponse {
	username: string;
	user_id?: string;
	discord?: DiscordProvider | null;
	github?: ProfileProvider | null;
	twitch?: TwitchProvider | null;
	connected_providers?: string[];
}

/**
 * Extract the username from a profile href. Handles relative (`/@name`) and
 * absolute (`https://kbve.com/@name/tab?x`) forms. Returns null when the href
 * is not a profile link or the username fails the `[A-Za-z0-9_-]` charset.
 */
export function parseUsernameFromHref(
	href: string | null | undefined,
): string | null {
	if (!href) return null;
	const marker = href.indexOf('/@');
	if (marker === -1) return null;
	const rest = href.slice(marker + 2);
	// Username ends at the next path/query/fragment boundary.
	const raw = rest.split(/[/?#]/, 1)[0] ?? '';
	if (!/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return null;
	return raw;
}

/** Preferred display avatar: Discord → GitHub → Twitch. */
export function pickAvatar(p: UserProfileResponse): string | null {
	return (
		p.discord?.avatar_url ||
		p.github?.avatar_url ||
		p.twitch?.avatar_url ||
		null
	);
}

/** Preferred display name: provider handle, falling back to `@username`. */
export function pickDisplayName(p: UserProfileResponse): string {
	return (
		p.discord?.username ||
		p.github?.username ||
		p.twitch?.username ||
		`@${p.username}`
	);
}

/** Ordered list of connected providers for the badge row. */
export function connectedProviders(p: UserProfileResponse): string[] {
	if (Array.isArray(p.connected_providers)) return p.connected_providers;
	const out: string[] = [];
	if (p.discord) out.push('discord');
	if (p.github) out.push('github');
	if (p.twitch) out.push('twitch');
	return out;
}

function esc(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const PROVIDER_LABELS: Record<string, string> = {
	discord: 'Discord',
	github: 'GitHub',
	twitch: 'Twitch',
	rentearth: 'RentEarth',
};

/** Build the inner HTML of the tooltip card for a resolved profile. */
export function buildTooltipHtml(p: UserProfileResponse): string {
	const avatar = pickAvatar(p);
	const name = pickDisplayName(p);
	const letter = (p.username || '?').charAt(0).toUpperCase();

	const avatarHtml = avatar
		? `<img class="kut__avatar-img" src="${esc(avatar)}" alt="" width="40" height="40" loading="lazy" />`
		: esc(letter);

	const badges = connectedProviders(p)
		.map((prov) => {
			const label = PROVIDER_LABELS[prov] ?? prov;
			const live =
				prov === 'twitch' && p.twitch?.is_live
					? ' <span class="kut__live" aria-label="Live">● Live</span>'
					: '';
			return `<span class="kut__badge kut__badge--${esc(prov)}">${esc(label)}${live}</span>`;
		})
		.join('');

	const guild = p.discord?.is_guild_member
		? `<span class="kut__badge kut__badge--guild">✓ Member</span>`
		: '';

	const badgeRow =
		badges || guild
			? `<div class="kut__badges">${badges}${guild}</div>`
			: '';

	return `
		<div class="kut__head">
			<span class="kut__avatar">${avatarHtml}</span>
			<span class="kut__names">
				<span class="kut__display">${esc(name)}</span>
				<a class="kut__handle" href="/@${esc(p.username)}">@${esc(p.username)}</a>
			</span>
		</div>
		${badgeRow}
	`;
}

export interface InitOptions {
	/** Base URL for the profile API. Defaults to same-origin. */
	apiBase?: string;
	/** id of the singleton tooltip node. */
	nodeId?: string;
	/** Hover intent delay before showing (ms). */
	openDelay?: number;
	/** Grace delay before hiding (ms). */
	closeDelay?: number;
}

const DEFAULT_NODE_ID = 'kbve-user-tooltip';

/**
 * Wire the global user tooltip. Idempotent per document — a second call is a
 * no-op once the listeners are installed.
 */
export function initUserTooltip(opts: InitOptions = {}): void {
	if (typeof document === 'undefined') return;

	const doc = document as Document & { __kbveUserTooltip?: boolean };
	if (doc.__kbveUserTooltip) return;
	doc.__kbveUserTooltip = true;

	const nodeId = opts.nodeId ?? DEFAULT_NODE_ID;
	const apiBase = opts.apiBase ?? '';
	const openDelay = opts.openDelay ?? 150;
	const closeDelay = opts.closeDelay ?? 120;

	let node = document.getElementById(nodeId);
	if (!node) {
		node = document.createElement('div');
		node.id = nodeId;
		node.className = 'kut not-content';
		node.setAttribute('role', 'tooltip');
		node.hidden = true;
		document.body.appendChild(node);
	}
	const tip = node;

	const cache = new Map<string, Promise<UserProfileResponse | null>>();
	let openTimer: number | undefined;
	let closeTimer: number | undefined;
	let activeTrigger: HTMLElement | null = null;

	async function loadProfile(
		username: string,
	): Promise<UserProfileResponse | null> {
		const key = username.toLowerCase();
		const cached = cache.get(key);
		if (cached) return cached;
		const promise = (async () => {
			try {
				const res = await fetch(
					`${apiBase}/api/v1/profile/${encodeURIComponent(username)}`,
					{ headers: { Accept: 'application/json' } },
				);
				if (res.status === 404) {
					return { username, connected_providers: [] };
				}
				if (!res.ok) return null;
				return (await res.json()) as UserProfileResponse;
			} catch {
				return null;
			}
		})();
		cache.set(key, promise);
		return promise;
	}

	function position(trigger: HTMLElement) {
		const margin = 8;
		const r = trigger.getBoundingClientRect();
		tip.style.visibility = 'hidden';
		tip.hidden = false;
		const tw = tip.offsetWidth;
		const th = tip.offsetHeight;

		let top = r.bottom + margin;
		if (top + th > window.innerHeight - margin && r.top - margin - th > 0) {
			top = r.top - margin - th;
		}
		let left = r.left;
		if (left + tw > window.innerWidth - margin) {
			left = window.innerWidth - margin - tw;
		}
		if (left < margin) left = margin;

		tip.style.top = `${Math.round(top)}px`;
		tip.style.left = `${Math.round(left)}px`;
		tip.style.visibility = '';
	}

	function hydrateAvatarFallback() {
		const el = tip.querySelector<HTMLElement>('.kut__avatar');
		if (el && !el.querySelector('img') && !el.textContent?.trim()) {
			el.textContent = '?';
		}
	}

	async function show(trigger: HTMLElement, username: string) {
		const profile = await loadProfile(username);
		if (activeTrigger !== trigger) return;
		if (!profile) return;
		tip.innerHTML = buildTooltipHtml(profile);
		hydrateAvatarFallback();
		tip.dataset.open = 'true';
		position(trigger);
	}

	function scheduleShow(trigger: HTMLElement, username: string) {
		window.clearTimeout(closeTimer);
		window.clearTimeout(openTimer);
		activeTrigger = trigger;
		openTimer = window.setTimeout(() => {
			void show(trigger, username);
		}, openDelay);
	}

	function hide() {
		window.clearTimeout(openTimer);
		activeTrigger = null;
		tip.hidden = true;
		delete tip.dataset.open;
	}

	function scheduleHide() {
		window.clearTimeout(openTimer);
		window.clearTimeout(closeTimer);
		closeTimer = window.setTimeout(hide, closeDelay);
	}

	function triggerFrom(target: EventTarget | null): {
		el: HTMLElement;
		username: string;
	} | null {
		if (!(target instanceof Element)) return null;
		const anchor = target.closest<HTMLAnchorElement>('a[href]');
		if (!anchor) return null;
		if (anchor.hasAttribute('data-no-user-tooltip')) return null;
		const username = parseUsernameFromHref(anchor.getAttribute('href'));
		if (!username) return null;
		return { el: anchor, username };
	}

	document.addEventListener('mouseover', (e) => {
		const hit = triggerFrom(e.target);
		if (!hit) return;
		scheduleShow(hit.el, hit.username);
	});

	document.addEventListener('mouseout', (e) => {
		const hit = triggerFrom(e.target);
		if (!hit) return;
		const related = e.relatedTarget;
		if (related instanceof Node && hit.el.contains(related)) return;
		scheduleHide();
	});

	document.addEventListener(
		'focusin',
		(e) => {
			const hit = triggerFrom(e.target);
			if (hit) scheduleShow(hit.el, hit.username);
		},
		true,
	);

	document.addEventListener(
		'focusout',
		(e) => {
			const hit = triggerFrom(e.target);
			if (hit) scheduleHide();
		},
		true,
	);

	window.addEventListener('scroll', hide, true);
	window.addEventListener('resize', hide);
	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') hide();
	});
}
