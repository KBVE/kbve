import { useCallback, useEffect, useRef, useState } from 'react';

type McServerStatus = {
	server: string;
	online: number;
	max: number;
	reachable: boolean;
};

type McPosition = {
	x: number;
	y: number;
	z: number;
	dimension: string;
};

type McPlayer = {
	name: string;
	server: string;
	position?: McPosition;
};

type McPlayerList = {
	online: number;
	max: number;
	players: McPlayer[];
	servers: McServerStatus[];
};

type Lot = {
	lot_id: string;
	chunk_x_min: number;
	chunk_x_max: number;
	chunk_z_min: number;
	chunk_z_max: number;
	is_owned: boolean;
	is_owned_by_me: boolean;
	state: number;
};

const STATE_FILL = ['vacant', 'owned', 'built', 'under_build', 'demolishing'];
const STATE_HEX = [
	'rgba(134, 239, 172, 0.55)',
	'rgba(125, 211, 252, 0.55)',
	'rgba(165, 180, 252, 0.55)',
	'rgba(252, 211, 77, 0.55)',
	'rgba(252, 165, 165, 0.55)',
];

interface Props {
	world: string;
	minChunk: number;
	maxChunk: number;
}

export function MCWorldMapLive({ world, minChunk, maxChunk }: Props) {
	const [status, setStatus] = useState<McPlayerList | null>(null);
	const [dbLots, setDbLots] = useState<Lot[] | null>(null);
	// Track player + lot fetch failures independently so a flaky RCON
	// bridge doesn't blank the DB lot overlay (and vice versa).
	const [statusError, setStatusError] = useState<string | null>(null);
	const [lotsError, setLotsError] = useState<string | null>(null);
	const mountedRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const liveLayerRef = useRef<SVGGElement | null>(null);
	const playerLayerRef = useRef<SVGGElement | null>(null);
	const svgRef = useRef<SVGSVGElement | null>(null);

	const cancel = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
	}, []);

	const refresh = useCallback(async () => {
		cancel();
		const ctrl = new AbortController();
		abortRef.current = ctrl;

		const errMessage = (e: unknown, fallback: string): string =>
			e instanceof Error ? e.message : fallback;

		const isAbort = (e: unknown): boolean =>
			(e as Error | undefined)?.name === 'AbortError';

		const statusPromise = fetch('/api/v1/mc/players', {
			signal: ctrl.signal,
		})
			.then((r) =>
				r.ok
					? (r.json() as Promise<McPlayerList>)
					: Promise.reject(new Error(`HTTP ${r.status}`)),
			)
			.then((res) => {
				if (ctrl.signal.aborted || !mountedRef.current) return;
				setStatus(res);
				setStatusError(null);
			})
			.catch((e) => {
				if (isAbort(e) || !mountedRef.current) return;
				setStatusError(errMessage(e, 'failed to load player status'));
			});

		const lotsPromise = fetch(
			`/api/v1/mc/lots/viewport?${new URLSearchParams({
				world,
				min_chunk_x: String(minChunk),
				max_chunk_x: String(maxChunk),
				min_chunk_z: String(minChunk),
				max_chunk_z: String(maxChunk),
				limit: '1024',
			})}`,
			{ signal: ctrl.signal },
		)
			.then((r) =>
				r.ok
					? (r.json() as Promise<Lot[]>)
					: Promise.reject(new Error(`HTTP ${r.status}`)),
			)
			.then((res) => {
				if (ctrl.signal.aborted || !mountedRef.current) return;
				if (Array.isArray(res)) {
					setDbLots(res);
					setLotsError(null);
				}
			})
			.catch((e) => {
				if (isAbort(e) || !mountedRef.current) return;
				setLotsError(errMessage(e, 'failed to load lot overlay'));
			});

		try {
			await Promise.all([statusPromise, lotsPromise]);
		} finally {
			if (abortRef.current === ctrl) abortRef.current = null;
		}
	}, [cancel, world, minChunk, maxChunk]);

	useEffect(() => {
		mountedRef.current = true;
		// Bind DOM handles ONCE per mount. ClientRouter swap-back rebuilds
		// the DOM, so the next mount picks up fresh references.
		const wrap = document.querySelector<HTMLDivElement>(
			`[data-world="${world}"]`,
		);
		svgRef.current =
			wrap?.querySelector<SVGSVGElement>('.mcworld__svg') ?? null;
		liveLayerRef.current =
			wrap?.querySelector<SVGGElement>('[data-mcworld-live-lots]') ??
			null;
		playerLayerRef.current =
			wrap?.querySelector<SVGGElement>('[data-mcworld-live-players]') ??
			null;

		document
			.querySelectorAll('[data-mcworld-live-skeleton]')
			.forEach((el) => el.remove());

		void refresh();
		const interval = window.setInterval(() => void refresh(), 30_000);

		const teardown = () => {
			cancel();
			window.clearInterval(interval);
		};
		const onHidden = () => {
			if (document.visibilityState === 'hidden') cancel();
			else if (document.visibilityState === 'visible') void refresh();
		};
		document.addEventListener('astro:before-swap', teardown);
		document.addEventListener('astro:before-preparation', teardown);
		document.addEventListener('visibilitychange', onHidden);
		window.addEventListener('pagehide', teardown);
		return () => {
			mountedRef.current = false;
			window.clearInterval(interval);
			document.removeEventListener('astro:before-swap', teardown);
			document.removeEventListener('astro:before-preparation', teardown);
			document.removeEventListener('visibilitychange', onHidden);
			window.removeEventListener('pagehide', teardown);
			cancel();
			// Drop any injected rects so a clean React unmount doesn't leak
			// nodes into the Astro-owned SVG. ClientRouter swap-away tears
			// the whole DOM anyway, but this covers the React-only path.
			if (liveLayerRef.current) {
				liveLayerRef.current.replaceChildren();
			}
			if (playerLayerRef.current) {
				playerLayerRef.current.replaceChildren();
			}
			liveLayerRef.current = null;
			playerLayerRef.current = null;
			svgRef.current = null;
		};
	}, [refresh, cancel, world]);

	// Project DB lots into the cached SVG group. No DOM walk per update.
	useEffect(() => {
		const liveLayer = liveLayerRef.current;
		const svg = svgRef.current;
		if (!liveLayer || !svg || !dbLots) return;
		const SIZE = svg.viewBox.baseVal.width;
		const span = maxChunk - minChunk + 1;
		const cell = SIZE / span;
		liveLayer.replaceChildren();

		for (const lot of dbLots) {
			const x = (lot.chunk_x_min - minChunk) * cell;
			const y = (lot.chunk_z_min - minChunk) * cell;
			const w = (lot.chunk_x_max - lot.chunk_x_min + 1) * cell;
			const h = (lot.chunk_z_max - lot.chunk_z_min + 1) * cell;
			const fill = lot.is_owned_by_me
				? 'rgba(96, 165, 250, 0.85)'
				: (STATE_HEX[lot.state] ?? 'rgba(203, 213, 225, 0.55)');
			const rect = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'rect',
			);
			rect.setAttribute('x', String(x));
			rect.setAttribute('y', String(y));
			rect.setAttribute('width', String(w));
			rect.setAttribute('height', String(h));
			rect.setAttribute('fill', fill);
			rect.setAttribute('stroke', '#0a0d12');
			rect.setAttribute('stroke-width', '0.6');
			const t = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			t.textContent = `${lot.lot_id} (live · ${STATE_FILL[lot.state] ?? lot.state})`;
			rect.appendChild(t);
			liveLayer.appendChild(rect);
		}
	}, [dbLots, minChunk, maxChunk]);

	// Project live player positions into the dedicated SVG layer. Block
	// coords / 16 = chunk coords; players outside the visible window are
	// dropped so the dot stays inside the panel.
	useEffect(() => {
		const layer = playerLayerRef.current;
		const svg = svgRef.current;
		if (!layer || !svg) return;
		const SIZE = svg.viewBox.baseVal.width;
		const span = maxChunk - minChunk + 1;
		const cell = SIZE / span;
		layer.replaceChildren();

		const players = (status?.players ?? []).filter(
			(p) => p.position && p.position.dimension === world,
		);

		for (const p of players) {
			const pos = p.position!;
			const cx = (pos.x / 16 - minChunk) * cell;
			const cz = (pos.z / 16 - minChunk) * cell;
			if (cx < 0 || cx > SIZE || cz < 0 || cz > SIZE) continue;

			const g = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'g',
			);
			const halo = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'circle',
			);
			halo.setAttribute('cx', String(cx));
			halo.setAttribute('cy', String(cz));
			halo.setAttribute('r', '8');
			halo.setAttribute('fill', 'rgba(74, 222, 128, 0.18)');
			halo.setAttribute('stroke', 'rgba(74, 222, 128, 0.55)');
			halo.setAttribute('stroke-width', '0.8');

			const dot = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'circle',
			);
			dot.setAttribute('cx', String(cx));
			dot.setAttribute('cy', String(cz));
			dot.setAttribute('r', '3.5');
			dot.setAttribute('fill', '#4ade80');
			dot.setAttribute('stroke', '#0a0d12');
			dot.setAttribute('stroke-width', '1');

			const title = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'title',
			);
			title.textContent = `${p.name} · ${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)} · ${pos.dimension}`;
			dot.appendChild(title);

			g.appendChild(halo);
			g.appendChild(dot);
			layer.appendChild(g);
		}
	}, [status, world, minChunk, maxChunk]);

	const total = status?.online ?? 0;
	const max = status?.max ?? 0;
	const visiblePlayers = (status?.players ?? []).filter(
		(p) => p.position && p.position.dimension === world,
	).length;

	return (
		<aside className="mcworldlive">
			<div className="mcworldlive__row">
				<span className="mcworldlive__dot mcworldlive__dot--live" />
				<strong>{total}</strong>
				<span> / {max} online</span>
				<button
					type="button"
					className="mcworldlive__refresh"
					onClick={() => void refresh()}>
					Refresh
				</button>
			</div>
			{status && status.servers.length > 0 && (
				<ul className="mcworldlive__servers">
					{status.servers.map((s) => (
						<li key={s.server}>
							<span
								className={
									s.reachable
										? 'mcworldlive__dot mcworldlive__dot--ok'
										: 'mcworldlive__dot mcworldlive__dot--bad'
								}
							/>
							<code>{s.server}</code> {s.online} / {s.max}
						</li>
					))}
				</ul>
			)}
			{dbLots !== null && (
				<p className="mcworldlive__hint">
					Live DB overlay: {dbLots.length} lot
					{dbLots.length === 1 ? '' : 's'} from
					<code> /api/v1/mc/lots/viewport</code>. Refreshes every 30
					s; lots you own render in deep blue.
				</p>
			)}
			{status && (
				<p className="mcworldlive__hint">
					Live positions: {visiblePlayers} player
					{visiblePlayers === 1 ? '' : 's'} in <code>{world}</code>{' '}
					from RCON. Off-map players are dropped from the overlay.
				</p>
			)}
			{statusError && (
				<p className="mcworldlive__error">
					Player status unavailable: {statusError}
				</p>
			)}
			{lotsError && (
				<p className="mcworldlive__error">
					Lot overlay unavailable: {lotsError}
				</p>
			)}
		</aside>
	);
}

export default MCWorldMapLive;
