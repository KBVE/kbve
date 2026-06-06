import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@kbve/astro';
import { MCLotStates } from '../../../../../../../packages/data/codegen/generated/mc_lot-schema';
import {
	MCLotApiError,
	listMyActive,
	listMyTransitional,
	listSchematics,
	listVacant,
	listViewport,
	purchase,
	queueBuild,
	queueDemolish,
	type MCOwnedLot,
	type MCSchematic,
	type MCVacantLot,
	type MCViewportLot,
} from './api';

type Tab = 'vacant' | 'active' | 'transitional' | 'map' | 'schematics';

const TABS: Array<{ key: Tab; label: string }> = [
	{ key: 'vacant', label: 'Vacant' },
	{ key: 'active', label: 'My lots' },
	{ key: 'transitional', label: 'In progress' },
	{ key: 'map', label: 'Map' },
	{ key: 'schematics', label: 'Schematics' },
];

const DEFAULT_WORLD = 'minecraft:overworld';

function lotStateLabel(state: number): string {
	return MCLotStates[state] ?? `state:${state}`;
}

function fmtChunks(min: number, max: number): string {
	if (min === max) return `${min}`;
	return `${min}..${max}`;
}

function fmtPrice(credits: number, khash: number): string {
	const parts: string[] = [];
	if (credits > 0) parts.push(`${credits.toLocaleString()} credits`);
	if (khash > 0) parts.push(`${khash.toLocaleString()} khash`);
	return parts.length === 0 ? 'free' : parts.join(' + ');
}

function newIdempotencyKey(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type ActionState = {
	lot_id: string;
	kind: 'purchase' | 'build' | 'demolish';
} | null;

export function MCLotsShell() {
	const { ready, authenticated } = useSession();
	const [tab, setTab] = useState<Tab>('vacant');
	const [worldInput, setWorldInput] = useState<string>(DEFAULT_WORLD);
	const [world, setWorld] = useState<string>(DEFAULT_WORLD);
	const [vacant, setVacant] = useState<MCVacantLot[] | null>(null);
	const [myActive, setMyActive] = useState<MCOwnedLot[] | null>(null);
	const [myTrans, setMyTrans] = useState<MCOwnedLot[] | null>(null);
	const [schematics, setSchematics] = useState<MCSchematic[] | null>(null);
	const [viewport, setViewport] = useState<MCViewportLot[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [busyLot, setBusyLot] = useState<ActionState>(null);
	const [pickerLot, setPickerLot] = useState<MCOwnedLot | null>(null);

	const abortRef = useRef<AbortController | null>(null);
	const worldRef = useRef(world);
	const mountedRef = useRef(false);

	useEffect(() => {
		worldRef.current = world;
	}, [world]);

	const cancelInFlight = useCallback(() => {
		if (abortRef.current) {
			abortRef.current.abort();
			abortRef.current = null;
		}
	}, []);

	const refresh = useCallback(
		async (which: Tab) => {
			cancelInFlight();
			const ctrl = new AbortController();
			abortRef.current = ctrl;
			setLoading(true);
			setError(null);
			const currentWorld = worldRef.current;
			try {
				if (which === 'vacant') {
					const rows = await listVacant(
						{ world: currentWorld, limit: 64 },
						{ signal: ctrl.signal },
					);
					if (ctrl.signal.aborted || !mountedRef.current) return;
					setVacant(rows);
				} else if (which === 'active') {
					const rows = await listMyActive(
						{ world: currentWorld, limit: 64 },
						{ signal: ctrl.signal },
					);
					if (ctrl.signal.aborted || !mountedRef.current) return;
					setMyActive(rows);
				} else if (which === 'transitional') {
					const rows = await listMyTransitional(
						{ world: currentWorld, limit: 64 },
						{ signal: ctrl.signal },
					);
					if (ctrl.signal.aborted || !mountedRef.current) return;
					setMyTrans(rows);
				} else if (which === 'map') {
					const rows = await listViewport(
						{
							world: currentWorld,
							min_chunk_x: -16,
							max_chunk_x: 16,
							min_chunk_z: -16,
							max_chunk_z: 16,
							limit: 1024,
						},
						{ signal: ctrl.signal },
					);
					if (ctrl.signal.aborted || !mountedRef.current) return;
					setViewport(rows);
				} else {
					const rows = await listSchematics(undefined, {
						signal: ctrl.signal,
					});
					if (ctrl.signal.aborted || !mountedRef.current) return;
					setSchematics(rows);
				}
			} catch (e) {
				if ((e as Error)?.name === 'AbortError') return;
				if (!mountedRef.current) return;
				setError(
					e instanceof MCLotApiError ? e.message : 'failed to load',
				);
			} finally {
				if (!ctrl.signal.aborted && mountedRef.current) {
					setLoading(false);
				}
				if (abortRef.current === ctrl) abortRef.current = null;
			}
		},
		[cancelInFlight],
	);

	useEffect(() => {
		if (worldInput === world) return;
		const t = window.setTimeout(() => setWorld(worldInput), 350);
		return () => window.clearTimeout(t);
	}, [worldInput, world]);

	useEffect(() => {
		if (!ready) return;
		if (tab !== 'schematics' && !authenticated) return;
		void refresh(tab);
		return () => cancelInFlight();
	}, [ready, authenticated, tab, world, refresh, cancelInFlight]);

	useEffect(() => {
		mountedRef.current = true;
		document
			.querySelectorAll('[data-mclots-skeleton]')
			.forEach((el) => el.remove());
		const teardown = () => cancelInFlight();
		const onHidden = () => {
			if (document.visibilityState === 'hidden') cancelInFlight();
		};
		document.addEventListener('astro:before-swap', teardown);
		document.addEventListener('astro:before-preparation', teardown);
		document.addEventListener('visibilitychange', onHidden);
		window.addEventListener('pagehide', teardown);
		return () => {
			mountedRef.current = false;
			document.removeEventListener('astro:before-swap', teardown);
			document.removeEventListener('astro:before-preparation', teardown);
			document.removeEventListener('visibilitychange', onHidden);
			window.removeEventListener('pagehide', teardown);
			cancelInFlight();
		};
	}, [cancelInFlight]);

	// Lazily load the catalog when the build picker opens — saves a round
	// trip on the marketplace tab for users who never queue a build.
	useEffect(() => {
		if (!pickerLot || schematics !== null) return;
		let cancelled = false;
		(async () => {
			try {
				const rows = await listSchematics();
				if (cancelled || !mountedRef.current) return;
				setSchematics(rows);
			} catch (e) {
				if (cancelled || !mountedRef.current) return;
				setError(
					e instanceof MCLotApiError
						? e.message
						: 'failed to load catalog',
				);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [pickerLot, schematics]);

	const onPurchase = useCallback(
		async (lot: MCVacantLot) => {
			setBusyLot({ lot_id: lot.lot_id, kind: 'purchase' });
			setError(null);
			setNotice(null);
			try {
				await purchase({
					lot_id: lot.lot_id,
					idempotency_key: newIdempotencyKey(),
				});
				if (!mountedRef.current) return;
				setNotice(`Purchased ${lot.lot_id}.`);
				void refresh('vacant');
			} catch (e) {
				if (!mountedRef.current) return;
				setError(
					e instanceof MCLotApiError ? e.message : 'purchase failed',
				);
			} finally {
				if (mountedRef.current) setBusyLot(null);
			}
		},
		[refresh],
	);

	const onQueueBuild = useCallback(
		async (lot: MCOwnedLot, schematic_id: string) => {
			setBusyLot({ lot_id: lot.lot_id, kind: 'build' });
			setError(null);
			setNotice(null);
			try {
				await queueBuild({
					lot_id: lot.lot_id,
					schematic_id,
					idempotency_key: newIdempotencyKey(),
				});
				if (!mountedRef.current) return;
				setNotice(`Build queued on ${lot.lot_id}.`);
				setPickerLot(null);
				void refresh('active');
			} catch (e) {
				if (!mountedRef.current) return;
				setError(
					e instanceof MCLotApiError
						? e.message
						: 'queue build failed',
				);
			} finally {
				if (mountedRef.current) setBusyLot(null);
			}
		},
		[refresh],
	);

	const onQueueDemolish = useCallback(
		async (lot: MCOwnedLot) => {
			if (
				!window.confirm(
					`Demolish ${lot.lot_id}? The build will be torn down.`,
				)
			) {
				return;
			}
			setBusyLot({ lot_id: lot.lot_id, kind: 'demolish' });
			setError(null);
			setNotice(null);
			try {
				await queueDemolish({
					lot_id: lot.lot_id,
					idempotency_key: newIdempotencyKey(),
				});
				if (!mountedRef.current) return;
				setNotice(`Demolish queued on ${lot.lot_id}.`);
				void refresh('active');
			} catch (e) {
				if (!mountedRef.current) return;
				setError(
					e instanceof MCLotApiError
						? e.message
						: 'queue demolish failed',
				);
			} finally {
				if (mountedRef.current) setBusyLot(null);
			}
		},
		[refresh],
	);

	const requiresAuth = tab !== 'schematics';

	if (!ready) {
		return <div className="kbve-mclots__status">Loading session…</div>;
	}
	if (requiresAuth && !authenticated) {
		return (
			<div className="kbve-mclots__status kbve-mclots__status--auth">
				Sign in to view your lots.
			</div>
		);
	}

	return (
		<div className="kbve-mclots">
			<div className="kbve-mclots__bar">
				<div className="kbve-mclots__tabs" role="tablist">
					{TABS.map((t) => (
						<button
							key={t.key}
							role="tab"
							aria-selected={tab === t.key}
							className={
								'kbve-mclots__tab' +
								(tab === t.key
									? ' kbve-mclots__tab--active'
									: '')
							}
							onClick={() => setTab(t.key)}>
							{t.label}
						</button>
					))}
				</div>
				<label className="kbve-mclots__world">
					<span>World</span>
					<input
						type="text"
						value={worldInput}
						onChange={(e) => setWorldInput(e.target.value)}
						spellCheck={false}
					/>
				</label>
				<button
					type="button"
					className="kbve-mclots__refresh"
					onClick={() => void refresh(tab)}
					disabled={loading}>
					{loading ? 'Loading…' : 'Refresh'}
				</button>
			</div>

			{error && <div className="kbve-mclots__error">{error}</div>}
			{notice && <div className="kbve-mclots__notice">{notice}</div>}

			{tab === 'vacant' && (
				<VacantTable
					rows={vacant}
					loading={loading}
					busyLot={busyLot}
					onBuy={onPurchase}
				/>
			)}
			{tab === 'active' && (
				<OwnedTable
					rows={myActive}
					loading={loading}
					busyLot={busyLot}
					onBuild={(lot) => setPickerLot(lot)}
					onDemolish={onQueueDemolish}
				/>
			)}
			{tab === 'transitional' && (
				<OwnedTable
					rows={myTrans}
					loading={loading}
					busyLot={busyLot}
					readOnly
				/>
			)}
			{tab === 'map' && <ViewportMap rows={viewport} loading={loading} />}
			{tab === 'schematics' && (
				<SchematicTable rows={schematics} loading={loading} />
			)}

			{pickerLot && (
				<SchematicPicker
					lot={pickerLot}
					rows={schematics}
					busy={busyLot?.kind === 'build'}
					onClose={() => setPickerLot(null)}
					onPick={onQueueBuild}
				/>
			)}
		</div>
	);
}

function VacantTable({
	rows,
	loading,
	busyLot,
	onBuy,
}: {
	rows: MCVacantLot[] | null;
	loading: boolean;
	busyLot: ActionState;
	onBuy: (lot: MCVacantLot) => void;
}) {
	const empty = rows !== null && rows.length === 0;
	const sorted = useMemo(
		() =>
			(rows ?? []).slice().sort((a, b) => a.chunk_x_min - b.chunk_x_min),
		[rows],
	);
	if (rows === null && loading) {
		return <div className="kbve-mclots__status">Loading lots…</div>;
	}
	if (empty) {
		return <div className="kbve-mclots__status">No vacant lots.</div>;
	}
	return (
		<table className="kbve-mclots__table">
			<thead>
				<tr>
					<th>Lot</th>
					<th>Chunks (x)</th>
					<th>Chunks (z)</th>
					<th>Area</th>
					<th>Anchor Y</th>
					<th>Price</th>
					<th />
				</tr>
			</thead>
			<tbody>
				{sorted.map((r) => {
					const busy =
						busyLot?.lot_id === r.lot_id &&
						busyLot.kind === 'purchase';
					return (
						<tr key={r.lot_id}>
							<td>
								<code>{r.lot_id}</code>
							</td>
							<td>{fmtChunks(r.chunk_x_min, r.chunk_x_max)}</td>
							<td>{fmtChunks(r.chunk_z_min, r.chunk_z_max)}</td>
							<td>{r.chunk_area}</td>
							<td>{r.anchor_y}</td>
							<td>{fmtPrice(r.price_credits, r.price_khash)}</td>
							<td>
								<button
									type="button"
									className="kbve-mclots__action"
									disabled={busy}
									onClick={() => onBuy(r)}>
									{busy ? 'Buying…' : 'Buy'}
								</button>
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function OwnedTable({
	rows,
	loading,
	busyLot,
	onBuild,
	onDemolish,
	readOnly,
}: {
	rows: MCOwnedLot[] | null;
	loading: boolean;
	busyLot: ActionState;
	onBuild?: (lot: MCOwnedLot) => void;
	onDemolish?: (lot: MCOwnedLot) => void;
	readOnly?: boolean;
}) {
	const empty = rows !== null && rows.length === 0;
	if (rows === null && loading) {
		return <div className="kbve-mclots__status">Loading lots…</div>;
	}
	if (empty) {
		return <div className="kbve-mclots__status">No lots.</div>;
	}
	return (
		<table className="kbve-mclots__table">
			<thead>
				<tr>
					<th>Lot</th>
					<th>State</th>
					<th>Schematic</th>
					<th>Chunks (x)</th>
					<th>Chunks (z)</th>
					<th>Area</th>
					<th>Anchor Y</th>
					{!readOnly && <th />}
				</tr>
			</thead>
			<tbody>
				{(rows ?? []).map((r) => {
					const busy = busyLot?.lot_id === r.lot_id;
					return (
						<tr key={r.lot_id}>
							<td>
								<code>{r.lot_id}</code>
							</td>
							<td>
								<span
									className={`kbve-mclots__state kbve-mclots__state--${lotStateLabel(r.state)}`}>
									{lotStateLabel(r.state)}
								</span>
							</td>
							<td>{r.current_schematic_id ?? '—'}</td>
							<td>{fmtChunks(r.chunk_x_min, r.chunk_x_max)}</td>
							<td>{fmtChunks(r.chunk_z_min, r.chunk_z_max)}</td>
							<td>{r.chunk_area}</td>
							<td>{r.anchor_y}</td>
							{!readOnly && (
								<td className="kbve-mclots__row-actions">
									{r.state === 1 && onBuild && (
										<button
											type="button"
											className="kbve-mclots__action"
											disabled={busy}
											onClick={() => onBuild(r)}>
											{busy && busyLot?.kind === 'build'
												? 'Queueing…'
												: 'Build'}
										</button>
									)}
									{r.state === 2 && onDemolish && (
										<button
											type="button"
											className="kbve-mclots__action kbve-mclots__action--danger"
											disabled={busy}
											onClick={() => onDemolish(r)}>
											{busy &&
											busyLot?.kind === 'demolish'
												? 'Queueing…'
												: 'Demolish'}
										</button>
									)}
								</td>
							)}
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}

function SchematicTable({
	rows,
	loading,
}: {
	rows: MCSchematic[] | null;
	loading: boolean;
}) {
	const empty = rows !== null && rows.length === 0;
	if (rows === null && loading) {
		return <div className="kbve-mclots__status">Loading catalog…</div>;
	}
	if (empty) {
		return <div className="kbve-mclots__status">No schematics.</div>;
	}
	return (
		<table className="kbve-mclots__table">
			<thead>
				<tr>
					<th>ID</th>
					<th>Name</th>
					<th>Category</th>
					<th>Tier</th>
					<th>Dimensions</th>
					<th>Price</th>
				</tr>
			</thead>
			<tbody>
				{(rows ?? []).map((s) => (
					<tr key={s.schematic_id}>
						<td>
							<code>{s.schematic_id}</code>
						</td>
						<td>{s.name}</td>
						<td>{s.category}</td>
						<td>{s.tier}</td>
						<td>
							{s.dims_x}×{s.dims_y}×{s.dims_z}
						</td>
						<td>{fmtPrice(s.price_credits, s.price_khash)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function SchematicPicker({
	lot,
	rows,
	busy,
	onPick,
	onClose,
}: {
	lot: MCOwnedLot;
	rows: MCSchematic[] | null;
	busy: boolean;
	onPick: (lot: MCOwnedLot, schematic_id: string) => void;
	onClose: () => void;
}) {
	return (
		<div
			className="kbve-mclots__modal"
			role="dialog"
			aria-modal="true"
			onClick={onClose}>
			<div
				className="kbve-mclots__modal-body"
				onClick={(e) => e.stopPropagation()}>
				<header className="kbve-mclots__modal-head">
					<h2>Build on {lot.lot_id}</h2>
					<button
						type="button"
						className="kbve-mclots__modal-close"
						onClick={onClose}
						aria-label="Close">
						×
					</button>
				</header>
				{rows === null ? (
					<div className="kbve-mclots__status">Loading catalog…</div>
				) : rows.length === 0 ? (
					<div className="kbve-mclots__status">
						No schematics available.
					</div>
				) : (
					<ul className="kbve-mclots__picker">
						{rows.map((s) => (
							<li key={s.schematic_id}>
								<button
									type="button"
									className="kbve-mclots__picker-row"
									disabled={busy}
									onClick={() => onPick(lot, s.schematic_id)}>
									<span className="kbve-mclots__picker-name">
										{s.name}
									</span>
									<span className="kbve-mclots__picker-meta">
										{s.category} · tier {s.tier} ·{' '}
										{s.dims_x}×{s.dims_y}×{s.dims_z} ·{' '}
										{fmtPrice(
											s.price_credits,
											s.price_khash,
										)}
									</span>
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

function ViewportMap({
	rows,
	loading,
}: {
	rows: MCViewportLot[] | null;
	loading: boolean;
}) {
	if (rows === null && loading) {
		return <div className="kbve-mclots__status">Loading map…</div>;
	}
	if (rows === null) {
		return <div className="kbve-mclots__status">No data.</div>;
	}
	if (rows.length === 0) {
		return (
			<div className="kbve-mclots__status">
				No lots in the visible viewport.
			</div>
		);
	}

	// Static window: same bounds the shell requests. Keeps the SVG
	// coordinate system stable across refreshes so a refresh feels like
	// data changing, not the map snapping.
	const MIN = -16;
	const MAX = 16;
	const SPAN = MAX - MIN; // 32 chunks
	const SIZE = 480;
	const scale = SIZE / SPAN;

	const colorFor = (lot: MCViewportLot) => {
		if (lot.is_owned_by_me) return 'rgba(80, 180, 255, 0.85)';
		if (!lot.is_owned) return 'rgba(120, 200, 120, 0.65)';
		if (lot.state === 3) return 'rgba(255, 165, 0, 0.75)';
		if (lot.state === 4) return 'rgba(255, 100, 100, 0.75)';
		return 'rgba(200, 200, 200, 0.55)';
	};

	return (
		<div className="kbve-mclots__map">
			<div className="kbve-mclots__map-legend">
				<span>
					<i style={{ background: 'rgba(120, 200, 120, 0.65)' }} />
					Vacant
				</span>
				<span>
					<i style={{ background: 'rgba(80, 180, 255, 0.85)' }} />
					Mine
				</span>
				<span>
					<i style={{ background: 'rgba(200, 200, 200, 0.55)' }} />
					Other
				</span>
				<span>
					<i style={{ background: 'rgba(255, 165, 0, 0.75)' }} />
					Building
				</span>
				<span>
					<i style={{ background: 'rgba(255, 100, 100, 0.75)' }} />
					Demolishing
				</span>
			</div>
			<svg
				viewBox={`0 0 ${SIZE} ${SIZE}`}
				className="kbve-mclots__map-svg"
				role="img"
				aria-label={`Lot viewport, ${rows.length} lots`}>
				<rect x="0" y="0" width={SIZE} height={SIZE} fill="#0c0f14" />
				{Array.from({ length: SPAN + 1 }, (_, i) => i).map((i) => (
					<g
						key={`grid-${i}`}
						stroke="#1c2230"
						strokeWidth={i % 4 === 0 ? 1 : 0.4}>
						<line x1={i * scale} y1={0} x2={i * scale} y2={SIZE} />
						<line x1={0} y1={i * scale} x2={SIZE} y2={i * scale} />
					</g>
				))}
				{rows.map((lot) => {
					const w = (lot.chunk_x_max - lot.chunk_x_min + 1) * scale;
					const h = (lot.chunk_z_max - lot.chunk_z_min + 1) * scale;
					const x = (lot.chunk_x_min - MIN) * scale;
					const y = (lot.chunk_z_min - MIN) * scale;
					return (
						<g key={lot.lot_id}>
							<rect
								x={x}
								y={y}
								width={w}
								height={h}
								fill={colorFor(lot)}
								stroke="#101218"
								strokeWidth={1}>
								<title>
									{lot.lot_id} · {lotStateLabel(lot.state)}
								</title>
							</rect>
						</g>
					);
				})}
			</svg>
			<p className="kbve-mclots__map-caption">
				Showing {rows.length} lot{rows.length === 1 ? '' : 's'} in
				chunks ({MIN}, {MIN}) – ({MAX - 1}, {MAX - 1}).
			</p>
		</div>
	);
}

export default MCLotsShell;
