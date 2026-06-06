import { useCallback, useEffect, useRef, useState } from 'react';

type McServerStatus = {
	server: string;
	online: number;
	max: number;
	reachable: boolean;
};

type McPlayerList = {
	online: number;
	max: number;
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
	const [error, setError] = useState<string | null>(null);
	const mountedRef = useRef(false);
	const abortRef = useRef<AbortController | null>(null);

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
		try {
			const [statusRes, lotsRes] = await Promise.all([
				fetch('/api/v1/mc/players', { signal: ctrl.signal }).then(
					(r) => (r.ok ? r.json() : null),
				),
				fetch(
					`/api/v1/mc/lots/viewport?${new URLSearchParams({
						world,
						min_chunk_x: String(minChunk),
						max_chunk_x: String(maxChunk),
						min_chunk_z: String(minChunk),
						max_chunk_z: String(maxChunk),
						limit: '1024',
					})}`,
					{ signal: ctrl.signal },
				).then((r) => (r.ok ? r.json() : null)),
			]);
			if (ctrl.signal.aborted || !mountedRef.current) return;
			if (statusRes) setStatus(statusRes);
			if (Array.isArray(lotsRes)) setDbLots(lotsRes);
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') return;
			if (!mountedRef.current) return;
			setError(
				e instanceof Error ? e.message : 'failed to load live data',
			);
		} finally {
			if (abortRef.current === ctrl) abortRef.current = null;
		}
	}, [cancel, world, minChunk, maxChunk]);

	useEffect(() => {
		mountedRef.current = true;
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
		};
	}, [refresh, cancel]);

	// Project DB lots into the parent SVG's grid using the data-* attrs.
	useEffect(() => {
		const wrap = document.querySelector<HTMLDivElement>('[data-world]');
		const liveLayer = wrap?.querySelector<SVGGElement>(
			'[data-mcworld-live-lots]',
		);
		if (!wrap || !liveLayer || !dbLots) return;
		const svg = wrap.querySelector<SVGSVGElement>('.mcworld__svg');
		if (!svg) return;
		const vb = svg.viewBox.baseVal;
		const SIZE = vb.width;
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

	const total = status?.online ?? 0;
	const max = status?.max ?? 0;

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
			{error && <p className="mcworldlive__error">{error}</p>}
		</aside>
	);
}

export default MCWorldMapLive;
