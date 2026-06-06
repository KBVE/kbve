import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@kbve/astro';
import { MCLotStates } from '../../../../../../../packages/data/codegen/generated/mc_lot-schema';
import {
	MCLotApiError,
	listMyActive,
	listMyTransitional,
	listSchematics,
	listVacant,
	type MCOwnedLot,
	type MCSchematic,
	type MCVacantLot,
} from './api';

type Tab = 'vacant' | 'active' | 'transitional' | 'schematics';

const TABS: Array<{ key: Tab; label: string }> = [
	{ key: 'vacant', label: 'Vacant' },
	{ key: 'active', label: 'My lots' },
	{ key: 'transitional', label: 'In progress' },
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

export function MCLotsShell() {
	const { ready, authenticated } = useSession();
	const [tab, setTab] = useState<Tab>('vacant');
	const [worldInput, setWorldInput] = useState<string>(DEFAULT_WORLD);
	const [world, setWorld] = useState<string>(DEFAULT_WORLD);
	const [vacant, setVacant] = useState<MCVacantLot[] | null>(null);
	const [myActive, setMyActive] = useState<MCOwnedLot[] | null>(null);
	const [myTrans, setMyTrans] = useState<MCOwnedLot[] | null>(null);
	const [schematics, setSchematics] = useState<MCSchematic[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

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

	// Debounce worldInput → world so each keystroke doesn't kick off a fetch.
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

	// Astro ClientRouter swaps don't always unmount React islands. Hook the
	// swap + page-lifecycle events so in-flight fetches die even when the
	// component cleanup hasn't run. mountedRef gates every late setState so
	// a settle that wins the race after teardown is a no-op.
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

			{tab === 'vacant' && (
				<VacantTable rows={vacant} loading={loading} />
			)}
			{tab === 'active' && (
				<OwnedTable rows={myActive} loading={loading} />
			)}
			{tab === 'transitional' && (
				<OwnedTable rows={myTrans} loading={loading} />
			)}
			{tab === 'schematics' && (
				<SchematicTable rows={schematics} loading={loading} />
			)}
		</div>
	);
}

function VacantTable({
	rows,
	loading,
}: {
	rows: MCVacantLot[] | null;
	loading: boolean;
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
				</tr>
			</thead>
			<tbody>
				{sorted.map((r) => (
					<tr key={r.lot_id}>
						<td>
							<code>{r.lot_id}</code>
						</td>
						<td>{fmtChunks(r.chunk_x_min, r.chunk_x_max)}</td>
						<td>{fmtChunks(r.chunk_z_min, r.chunk_z_max)}</td>
						<td>{r.chunk_area}</td>
						<td>{r.anchor_y}</td>
						<td>{fmtPrice(r.price_credits, r.price_khash)}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function OwnedTable({
	rows,
	loading,
}: {
	rows: MCOwnedLot[] | null;
	loading: boolean;
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
				</tr>
			</thead>
			<tbody>
				{(rows ?? []).map((r) => (
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
					</tr>
				))}
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

export default MCLotsShell;
