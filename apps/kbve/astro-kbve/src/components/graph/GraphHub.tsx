import { useEffect, useMemo, useRef, useState } from 'react';
import GraphNeighborhood from './GraphNeighborhood';

type EntityKind = 'project' | 'dir' | 'doc';

interface DocRef {
	slug: string;
	title: string;
}

interface GraphEntity {
	id: string;
	kind: EntityKind;
	name: string;
	root?: string;
	type?: 'app' | 'lib' | 'e2e';
	nx?: { deps: string[]; dependents: string[] };
	graphify?: { dirId: string; label: string };
	docs?: DocRef[];
}

type Scope = 'all' | 'nx' | 'graphify' | 'site';

const NX_URL = '/dashboard/graph/';
const GRAPHIFY_URL = '/dashboard/graph-explorer/';

const scopeMatch = (e: GraphEntity, s: Scope): boolean => {
	if (s === 'all') return true;
	if (s === 'nx') return !!e.nx;
	if (s === 'graphify') return !!e.graphify;
	return !!(e.docs && e.docs.length) || e.kind === 'doc';
};

/** Cheap relevance: exact > prefix > substring over name/root/dir/doc titles. */
function score(e: GraphEntity, q: string): number {
	if (!q) return e.kind === 'project' ? 2 : 1;
	const name = e.name.toLowerCase();
	if (name === q) return 100;
	if (name.startsWith(q)) return 80;
	if (name.includes(q)) return 60;
	if (e.root?.toLowerCase().includes(q)) return 40;
	if (e.graphify?.label.toLowerCase().includes(q)) return 30;
	if (e.docs?.some((d) => d.title.toLowerCase().includes(q))) return 20;
	return 0;
}

export default function GraphHub() {
	const [entities, setEntities] = useState<GraphEntity[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState('');
	const [scope, setScope] = useState<Scope>('all');
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		let alive = true;
		fetch('/api/graph/index.json')
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((data: { entities: GraphEntity[] }) => {
				if (!alive) return;
				setEntities(data.entities ?? []);
				setLoading(false);
			})
			.catch((e: unknown) => {
				if (!alive) return;
				setError(e instanceof Error ? e.message : 'load failed');
				setLoading(false);
			});
		return () => {
			alive = false;
		};
	}, []);

	const byId = useMemo(() => {
		const m = new Map<string, GraphEntity>();
		for (const e of entities) m.set(e.id, e);
		return m;
	}, [entities]);

	const results = useMemo(() => {
		const q = query.trim().toLowerCase();
		return entities
			.filter((e) => scopeMatch(e, scope))
			.map((e) => ({ e, s: score(e, q) }))
			.filter((r) => r.s > 0)
			.sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
			.slice(0, 50)
			.map((r) => r.e);
	}, [entities, query, scope]);

	const selected = selectedId ? byId.get(selectedId) : undefined;

	const recenter = (name: string) => {
		if (byId.has(name)) setSelectedId(name);
	};

	return (
		<div className="ghub" data-graph-hub>
			<div className="ghub__controls">
				<input
					ref={inputRef}
					type="text"
					className="ghub__search"
					placeholder="Search projects, directories, docs…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					autoComplete="off"
					spellCheck={false}
				/>
				<div className="ghub__scopes" role="tablist">
					{(['all', 'nx', 'graphify', 'site'] as Scope[]).map((s) => (
						<button
							key={s}
							type="button"
							role="tab"
							aria-selected={scope === s}
							className={scope === s ? 'is-active' : ''}
							onClick={() => setScope(s)}>
							{s === 'all'
								? 'All'
								: s === 'nx'
									? 'NX'
									: s === 'graphify'
										? 'Graphify'
										: 'Site'}
						</button>
					))}
				</div>
			</div>

			{loading && <div className="ghub__msg">Loading graph index…</div>}
			{error && (
				<div className="ghub__msg ghub__msg--err">
					Failed to load: {error}
				</div>
			)}

			{!loading && !error && (
				<div className="ghub__body">
					<ul className="ghub__list">
						{results.map((e) => (
							<li key={e.id}>
								<button
									type="button"
									className={
										selectedId === e.id ? 'is-active' : ''
									}
									onClick={() => setSelectedId(e.id)}>
									<span
										className={`ghub__kind ghub__kind--${e.kind}`}>
										{e.type ?? e.kind}
									</span>
									<span className="ghub__name">{e.name}</span>
									<span className="ghub__facets">
										{e.nx && <i title="NX">◆</i>}
										{e.graphify && (
											<i title="Graphify">◈</i>
										)}
										{e.docs?.length && (
											<i title="Docs">▤</i>
										)}
									</span>
								</button>
							</li>
						))}
						{!results.length && (
							<li className="ghub__empty">
								No matches{query ? ` for “${query}”` : ''}.
							</li>
						)}
					</ul>

					<div className="ghub__detail">
						{!selected && (
							<div className="ghub__hint">
								Select an entry to see its NX dependencies,
								Graphify code area, and linked docs.
							</div>
						)}
						{selected && (
							<article className="ghub__card">
								<header>
									<span
										className={`ghub__kind ghub__kind--${selected.kind}`}>
										{selected.type ?? selected.kind}
									</span>
									<h2>{selected.name}</h2>
									{selected.root && (
										<code>{selected.root}</code>
									)}
								</header>

								{selected.nx && (
									<section>
										<h3>
											NX · {selected.nx.deps.length} deps
											· {selected.nx.dependents.length}{' '}
											dependents
										</h3>
										<GraphNeighborhood
											center={selected.name}
											deps={selected.nx.deps}
											dependents={selected.nx.dependents}
											onSelect={recenter}
										/>
										<a className="ghub__link" href={NX_URL}>
											Open in NX graph →
										</a>
									</section>
								)}

								{selected.graphify && (
									<section>
										<h3>
											Graphify · {selected.graphify.label}
										</h3>
										<a
											className="ghub__link"
											href={GRAPHIFY_URL}>
											Open in Graphify explorer →
										</a>
									</section>
								)}

								{selected.docs?.length ? (
									<section>
										<h3>Docs · {selected.docs.length}</h3>
										<ul className="ghub__docs">
											{selected.docs.map((d) => (
												<li key={d.slug}>
													<a href={`/${d.slug}/`}>
														{d.title}
													</a>
												</li>
											))}
										</ul>
									</section>
								) : null}
							</article>
						)}
					</div>
				</div>
			)}
			<style>{hubStyles}</style>
		</div>
	);
}

const hubStyles = `
	.ghub { --acc:#a78bfa; --acc2:#38bdf8; color:#e2e8f0; }
	.ghub__controls { display:flex; flex-wrap:wrap; gap:10px; margin-bottom:14px; }
	.ghub__search {
		flex:1 1 260px; padding:10px 14px; border-radius:10px;
		border:1px solid rgba(148,163,184,0.28); background:rgba(12,18,30,0.7);
		color:#e2e8f0; font-size:0.9rem;
	}
	.ghub__search:focus { outline:none; border-color:var(--acc2); }
	.ghub__scopes { display:flex; gap:4px; }
	.ghub__scopes button {
		padding:8px 14px; border-radius:8px; border:1px solid rgba(148,163,184,0.25);
		background:rgba(12,18,30,0.7); color:#cbd5e1; font-size:0.8rem; cursor:pointer;
	}
	.ghub__scopes button.is-active { border-color:var(--acc); color:#e9d5ff; }
	.ghub__msg { padding:24px; text-align:center; color:#94a3b8; }
	.ghub__msg--err { color:#f87171; }
	.ghub__body { display:grid; grid-template-columns:minmax(0,1fr); gap:16px; }
	@media (min-width:900px){ .ghub__body { grid-template-columns:19rem minmax(0,1fr); } }
	.ghub__list { list-style:none; margin:0; padding:0; max-height:70vh; overflow-y:auto;
		border:1px solid var(--bento-hairline,rgba(148,163,184,0.18)); border-radius:12px; }
	.ghub__list li { margin:0; }
	.ghub__list button {
		display:flex; align-items:center; gap:8px; width:100%; text-align:left;
		padding:9px 12px; border:0; background:none; color:#cbd5e1; cursor:pointer;
		border-bottom:1px solid rgba(148,163,184,0.08); font-size:0.82rem;
	}
	.ghub__list button:hover { background:rgba(56,189,248,0.08); }
	.ghub__list button.is-active { background:rgba(167,139,250,0.14); color:#fff; }
	.ghub__kind {
		flex:none; font-size:0.6rem; text-transform:uppercase; letter-spacing:0.04em;
		padding:1px 6px; border-radius:4px; color:#0a0e16; background:#64748b;
	}
	.ghub__kind--project { background:#38bdf8; }
	.ghub__kind--dir { background:#f59e0b; }
	.ghub__kind--doc { background:#a3e635; }
	.ghub__name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.ghub__facets { flex:none; display:inline-flex; gap:4px; color:#64748b; font-style:normal; }
	.ghub__empty, .ghub__hint { padding:16px; color:#64748b; font-size:0.82rem; }
	.ghub__detail { min-width:0; }
	.ghub__card header { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px; }
	.ghub__card h2 { margin:0; font-size:1.2rem; }
	.ghub__card header code { font-size:0.72rem; color:#94a3b8; }
	.ghub__card section {
		padding:12px 0; border-top:1px solid rgba(148,163,184,0.12);
	}
	.ghub__card h3 { margin:0 0 8px; font-size:0.82rem; color:#94a3b8; font-weight:600; }
	.ghub__link { display:inline-block; margin-top:8px; color:var(--acc2); font-size:0.8rem; text-decoration:none; }
	.ghub__link:hover { text-decoration:underline; }
	.ghub__docs { margin:0; padding-left:18px; font-size:0.82rem; }
	.ghub__docs a { color:#cbd5e1; }
`;
