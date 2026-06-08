import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type FormEvent,
} from 'react';
import { useStore } from '@nanostores/react';
import { GitBranch, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useAgents } from './context';
import { styles } from '../dashboard/dashboard-ui';

const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9._-]{1,100}$/;

export default function ReactAgentRepoAllowlist() {
	const agents = useAgents();
	const guildId = useStore(agents.$selectedGuildId);
	const guilds = useStore(agents.$guilds);
	const draftsMap = useStore(agents.$repoAllowlistDrafts);
	const savingMap = useStore(agents.$repoAllowlistSavingFor);
	const errorsMap = useStore(agents.$repoAllowlistErrors);
	const loadedMap = useStore(agents.$repoAllowlistLoadedFor);

	const [loading, setLoading] = useState(false);
	const [draftValid, setDraftValid] = useState(false);
	const [draftRaw, setDraftRaw] = useState('');
	const [blockMsg, setBlockMsg] = useState<string | null>(null);
	const draftRef = useRef<HTMLInputElement | null>(null);

	const repos = guildId ? (draftsMap[guildId] ?? []) : [];
	const saving = guildId ? !!savingMap[guildId] : false;
	const error = guildId ? (errorsMap[guildId] ?? null) : null;
	const loaded = guildId ? !!loadedMap[guildId] : false;

	const load = useCallback(
		async (force = false) => {
			if (!guildId) return;
			setLoading(true);
			await agents.ensureRepoAllowlistLoaded(guildId, force);
			setLoading(false);
		},
		[guildId],
	);

	useEffect(() => {
		if (guildId && !loaded) {
			void load();
		}
	}, [guildId, loaded, load]);

	useEffect(() => {
		if (draftRef.current) draftRef.current.value = '';
		setDraftRaw('');
		setDraftValid(false);
	}, [guildId]);

	function onDraftInput() {
		const v = draftRef.current?.value ?? '';
		setDraftRaw(v);
		setDraftValid(REPO_RE.test(v) && !repos.includes(v));
	}

	if (!guildId) {
		return (
			<section style={styles.sectionBorder}>
				<div style={{ padding: '0.85rem 1rem' }}>
					<p
						style={{
							margin: 0,
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontSize: '0.9rem',
						}}>
						Pick a guild above to manage its repo allowlist.
					</p>
				</div>
			</section>
		);
	}

	const guild = guilds.find((g) => g.id === guildId);
	const draftOk = draftValid && !saving;

	async function add(e?: FormEvent<HTMLFormElement>) {
		e?.preventDefault();
		if (!guildId || saving) return;
		setBlockMsg(null);
		const v = draftRef.current?.value?.trim() ?? '';
		if (!v) {
			setBlockMsg('Type owner/repo first.');
			draftRef.current?.focus();
			return;
		}
		if (!REPO_RE.test(v)) {
			setBlockMsg('Expected owner/repo matching GitHub name rules.');
			draftRef.current?.focus();
			return;
		}
		if (repos.includes(v)) {
			setBlockMsg(`${v} is already in the allowlist.`);
			return;
		}
		const prev = repos;
		const next = [...repos, v];
		agents.patchRepoAllowlistDraft(guildId, next);
		const r = await agents.saveRepoAllowlistDraft(guildId);
		if (r.ok) {
			if (draftRef.current) draftRef.current.value = '';
			setDraftRaw('');
			setDraftValid(false);
		} else {
			agents.patchRepoAllowlistDraft(guildId, prev);
		}
	}

	async function remove(repo: string) {
		if (!guildId || saving) return;
		const prev = repos;
		const next = repos.filter((r) => r !== repo);
		agents.patchRepoAllowlistDraft(guildId, next);
		const r = await agents.saveRepoAllowlistDraft(guildId);
		if (!r.ok) {
			agents.patchRepoAllowlistDraft(guildId, prev);
		}
	}

	return (
		<section style={styles.sectionBorder}>
			<header
				style={{
					padding: '0.85rem 1rem',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
				}}>
				<GitBranch size={18} color="#34d399" />
				<strong>Repo allowlist</strong>
				{guild && (
					<span
						style={{
							marginLeft: '0.4rem',
							fontSize: '0.75rem',
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontFamily:
								'var(--sl-font-mono, ui-monospace, monospace)',
						}}>
						{guild.id}
					</span>
				)}
				<button
					type="button"
					onClick={() => void load(true)}
					disabled={loading || saving}
					style={refreshBtn(loading || saving)}
					aria-label="Refresh">
					<RefreshCw
						size={14}
						style={loading ? spinIcon : undefined}
					/>
					Refresh
				</button>
			</header>

			<div
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.65rem',
				}}>
				<p style={muted}>
					Repos that gh-webhook will accept events for and that
					gh-backfill defaults to. Stored as{' '}
					<code>github_repos:&lt;guild&gt;</code> in Vault. Falls back
					to the edge env <code>GH_WEBHOOK_ALLOWED_REPOS</code> when
					no row is set.
				</p>

				{error && <p style={errText}>{error}</p>}

				{!loading && repos.length === 0 && (
					<p style={{ ...muted, fontStyle: 'italic' }}>
						No repos in the allowlist yet. Add at least one for this
						guild to receive webhook events.
					</p>
				)}

				{repos.length > 0 && (
					<ul
						style={{
							margin: 0,
							padding: 0,
							listStyle: 'none',
							display: 'flex',
							flexDirection: 'column',
							gap: '0.3rem',
						}}>
						{repos.map((r) => (
							<li
								key={r}
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									padding: '0.4rem 0.6rem',
									borderRadius: 6,
									border: '1px solid var(--sl-color-gray-5, #2d2f36)',
									background: 'rgba(255,255,255,0.02)',
								}}>
								<code
									style={{
										fontFamily:
											'var(--sl-font-mono, ui-monospace, monospace)',
									}}>
									{r}
								</code>
								<button
									type="button"
									onClick={() => void remove(r)}
									disabled={saving}
									title={
										saving
											? 'Allowlist save in flight — wait for it to finish.'
											: `Drop ${r} from the allowlist. Reversible — just add it back.`
									}
									style={dangerSmallBtn(saving)}
									aria-label={`Remove ${r}`}>
									<Trash2 size={12} />
									Remove
								</button>
							</li>
						))}
					</ul>
				)}

				<form
					onSubmit={(e) => void add(e)}
					autoComplete="off"
					style={{
						display: 'flex',
						gap: '0.4rem',
						alignItems: 'stretch',
					}}>
					<input
						ref={draftRef}
						type="text"
						defaultValue=""
						placeholder="owner/repo (e.g. KBVE/kbve)"
						onInput={onDraftInput}
						style={{
							...inputStyle,
							fontFamily:
								'var(--sl-font-mono, ui-monospace, monospace)',
							flex: 1,
						}}
						spellCheck={false}
						autoComplete="off"
					/>
					<button
						type="submit"
						disabled={saving}
						title={
							saving
								? 'Allowlist save in flight — wait for it to finish.'
								: 'Add the typed owner/repo to this guild’s allowlist.'
						}
						style={primaryBtn(!saving)}>
						{saving ? (
							<Loader2 size={14} style={spinIcon} />
						) : (
							<Plus size={14} />
						)}
						{saving ? 'Saving…' : 'Add'}
					</button>
				</form>
				{blockMsg && <p style={errText}>{blockMsg}</p>}
				{!blockMsg &&
					draftRaw.length > 0 &&
					!REPO_RE.test(draftRaw) && (
						<p style={errText}>
							Expected <code>owner/repo</code> matching GitHub's
							name rules.
						</p>
					)}
			</div>
		</section>
	);
}

const muted: React.CSSProperties = {
	margin: 0,
	fontSize: '0.85rem',
	color: 'var(--sl-color-gray-2, #c2c5cc)',
	lineHeight: 1.5,
};

const errText: React.CSSProperties = {
	margin: 0,
	color: '#f87171',
	fontSize: '0.82rem',
};

const inputStyle: React.CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	boxSizing: 'border-box',
};

function primaryBtn(enabled: boolean): React.CSSProperties {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.4rem',
		padding: '0.45rem 0.9rem',
		borderRadius: 8,
		border: 'none',
		background: enabled ? '#58a6ff' : 'rgba(88,166,255,0.4)',
		color: '#0d1117',
		fontWeight: 600,
		cursor: enabled ? 'pointer' : 'not-allowed',
		fontSize: '0.85rem',
	};
}

function refreshBtn(busy: boolean): React.CSSProperties {
	return {
		marginLeft: 'auto',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.35rem',
		padding: '0.3rem 0.6rem',
		borderRadius: 6,
		border: '1px solid var(--sl-color-gray-5, #2d2f36)',
		background: 'transparent',
		color: 'var(--sl-color-white, #fff)',
		cursor: busy ? 'wait' : 'pointer',
		fontSize: '0.8rem',
	};
}

function dangerSmallBtn(busy: boolean): React.CSSProperties {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.25rem',
		padding: '0.25rem 0.5rem',
		borderRadius: 6,
		border: '1px solid rgba(239,68,68,0.4)',
		background: 'transparent',
		color: '#f87171',
		cursor: busy ? 'wait' : 'pointer',
		fontSize: '0.75rem',
	};
}

const spinIcon: React.CSSProperties = {
	animation: 'spin 1s linear infinite',
};
