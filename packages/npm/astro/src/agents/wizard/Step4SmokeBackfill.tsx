import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { CheckCircle2, ExternalLink, Loader2, PlayCircle } from 'lucide-react';
import { useAgents } from '../context';
import { useStepCardStatus } from '../../dashboard/useStepCardStatus';
import {
	GITHUB_OWNER_RE,
	GITHUB_REPO_RE,
	WEBHOOK_SERVICE,
	PAT_SERVICE,
	mutedText,
	errText,
	primaryBtn,
	inputStyle,
	spinStyle,
} from './shared';

export default function Step4SmokeBackfill() {
	const agents = useAgents();
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const tokens = useStore(agents.$tokens);
	const guildId = selectedGuildId ?? '';
	const ready =
		!!tokens.find((t) => t.service === WEBHOOK_SERVICE) &&
		!!tokens.find((t) => t.service === PAT_SERVICE);
	const draftsMap = useStore(agents.$backfillDrafts);
	const busyMap = useStore(agents.$backfillBusyFor);
	const resultsMap = useStore(agents.$backfillResults);

	const draft = draftsMap[guildId] ?? { owner: '', repo: '' };
	const busy = !!busyMap[guildId];
	const result = resultsMap[guildId] ?? null;

	const ownerRef = useRef<HTMLInputElement | null>(null);
	const repoRef = useRef<HTMLInputElement | null>(null);
	const [draftValid, setDraftValid] = useState<boolean>(
		GITHUB_OWNER_RE.test(draft.owner) && GITHUB_REPO_RE.test(draft.repo),
	);

	useEffect(() => {
		const snap = agents.$backfillDrafts.get()[guildId] ?? {
			owner: '',
			repo: '',
		};
		if (ownerRef.current && ownerRef.current.value !== snap.owner) {
			ownerRef.current.value = snap.owner;
		}
		if (repoRef.current && repoRef.current.value !== snap.repo) {
			repoRef.current.value = snap.repo;
		}
		setDraftValid(
			GITHUB_OWNER_RE.test(snap.owner) && GITHUB_REPO_RE.test(snap.repo),
		);
	}, [guildId]);

	function refreshValid() {
		const o = ownerRef.current?.value ?? '';
		const r = repoRef.current?.value ?? '';
		setDraftValid(GITHUB_OWNER_RE.test(o) && GITHUB_REPO_RE.test(r));
	}

	function commitOwner() {
		agents.patchBackfillDraft(guildId, {
			owner: ownerRef.current?.value ?? '',
		});
		refreshValid();
	}

	function commitRepo() {
		agents.patchBackfillDraft(guildId, {
			repo: repoRef.current?.value ?? '',
		});
		refreshValid();
	}

	const canRun = ready && draftValid && !busy;
	const [runBlockMsg, setRunBlockMsg] = useState<string | null>(null);

	async function run() {
		if (busy) return;
		const o = ownerRef.current?.value.trim() ?? '';
		const r = repoRef.current?.value.trim() ?? '';
		setRunBlockMsg(null);
		if (!ready) {
			setRunBlockMsg(
				'Finish Steps 1 + 2 first — HMAC secret and PAT must be stored before the smoke can run.',
			);
			return;
		}
		if (!GITHUB_OWNER_RE.test(o) || !GITHUB_REPO_RE.test(r)) {
			setRunBlockMsg('Enter a valid owner + repo (alphanumerics, ._-).');
			if (!GITHUB_OWNER_RE.test(o)) ownerRef.current?.focus();
			else repoRef.current?.focus();
			return;
		}
		agents.patchBackfillDraft(guildId, { owner: o, repo: r });
		await agents.runBackfillForGuild(guildId);
	}

	const status = result?.ok ? 'done' : ready ? 'pending' : 'todo';
	const anchor = useStepCardStatus(status, !ready);
	if (!guildId) return <span ref={anchor} hidden aria-hidden="true" />;
	return (
		<>
			<span ref={anchor} hidden aria-hidden="true" />
			<p style={mutedText}>
				Calls <code>gh-backfill</code> against the repo you'll mirror
				with <code>state=open</code> and <code>max_pages=1</code>.
				Verifies the PAT, the per-guild Vault lookup, and the{' '}
				<code>gh.upsert_issue</code> RPC end to end.
			</p>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: '0.4rem',
				}}>
				<input
					ref={ownerRef}
					placeholder="owner (e.g. KBVE)"
					defaultValue={draft.owner}
					onBlur={commitOwner}
					onInput={refreshValid}
					style={inputStyle}
					spellCheck={false}
					autoComplete="off"
				/>
				<input
					ref={repoRef}
					placeholder="repo (e.g. kbve)"
					defaultValue={draft.repo}
					onBlur={commitRepo}
					onInput={refreshValid}
					style={inputStyle}
					spellCheck={false}
					autoComplete="off"
				/>
			</div>
			<button
				type="button"
				onClick={run}
				disabled={busy}
				title={
					busy
						? 'Smoke run in flight — wait for gh-backfill to finish.'
						: 'Calls gh-backfill against the typed owner/repo with state=open + max_pages=1. Server rate-limits 15s cooldown / 20 per hour per guild.'
				}
				style={primaryBtn}>
				{busy ? (
					<Loader2 size={14} style={spinStyle} />
				) : (
					<PlayCircle size={14} />
				)}
				{busy ? 'Running…' : 'Run smoke test'}
			</button>
			{runBlockMsg && <p style={errText}>{runBlockMsg}</p>}
			{result && !result.ok && <p style={errText}>{result.error}</p>}
			{result && result.ok && (
				<div
					style={{
						padding: '0.5rem 0.75rem',
						borderRadius: 6,
						background: 'rgba(74,222,128,0.08)',
						border: '1px solid rgba(74,222,128,0.3)',
						fontSize: '0.85rem',
						lineHeight: 1.5,
					}}>
					<div>
						<CheckCircle2
							size={14}
							color="#4ade80"
							style={{ verticalAlign: '-2px', marginRight: 6 }}
						/>
						Upserted <strong>{result.upserted}</strong> issue rows
						across <strong>{result.pages}</strong> page(s).
					</div>
					{typeof result.rateLimitRemaining === 'number' && (
						<div
							style={{
								color: 'var(--sl-color-gray-3, #9ca0aa)',
							}}>
							GitHub API rate limit remaining:{' '}
							{result.rateLimitRemaining}
						</div>
					)}
					<div style={{ marginTop: '0.35rem' }}>
						<a
							href={`https://github.com/${draft.owner}/${draft.repo}/settings/hooks`}
							target="_blank"
							rel="noopener">
							<ExternalLink
								size={12}
								style={{ verticalAlign: '-2px' }}
							/>{' '}
							Open repo webhook settings
						</a>
					</div>
				</div>
			)}
		</>
	);
}
