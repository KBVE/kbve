import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { useStore } from '@nanostores/react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAgents } from '../context';
import { useStepCardStatus } from '../../dashboard/useStepCardStatus';
import {
	PAT_TOKEN_NAME,
	PAT_SERVICE,
	mutedText,
	errText,
	primaryBtn,
	secondaryBtn,
	inputStyle,
	spinStyle,
} from './shared';
import type { AgentTokenRow } from '@kbve/droid';

export default function Step3Pat() {
	const agents = useAgents();
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const tokens = useStore(agents.$tokens);
	const guildId = selectedGuildId ?? '';
	const existing = tokens.find((t) => t.service === PAT_SERVICE) ?? null;
	const draftsMap = useStore(agents.$patDrafts);
	const validatedMap = useStore(agents.$patValidatedFor);
	const validatingMap = useStore(agents.$patValidatingFor);
	const savingMap = useStore(agents.$patSavingFor);
	const errorsMap = useStore(agents.$patErrors);

	const validating = !!validatingMap[guildId];
	const storing = !!savingMap[guildId];
	const error = errorsMap[guildId] ?? null;
	const validated = validatedMap[guildId] ?? null;
	const draftPat = draftsMap[guildId] ?? '';

	const inputRef = useRef<HTMLInputElement | null>(null);
	const [hasInput, setHasInput] = useState<boolean>(draftPat.length > 0);

	const stored = !!existing;

	useEffect(() => {
		if (!inputRef.current) return;
		const snap = agents.$patDrafts.get()[guildId] ?? '';
		if (inputRef.current.value !== snap) inputRef.current.value = snap;
		setHasInput(snap.length > 0);
	}, [guildId]);

	function onPatBlur(_: FocusEvent<HTMLInputElement>) {
		const v = inputRef.current?.value ?? '';
		agents.setPatDraft(guildId, v);
	}

	function onPatInput() {
		const v = inputRef.current?.value ?? '';
		setHasInput(v.length > 0);
	}

	async function validate() {
		const v = inputRef.current?.value ?? '';
		agents.setPatDraft(guildId, v);
		await agents.validatePatForGuild(guildId);
	}

	async function save() {
		const v = inputRef.current?.value ?? '';
		agents.setPatDraft(guildId, v);
		const r = await agents.savePatForGuild(guildId, PAT_TOKEN_NAME);
		if (r.ok && inputRef.current) inputRef.current.value = '';
		if (r.ok) setHasInput(false);
	}

	const status = stored ? 'done' : validated ? 'pending' : 'todo';
	const anchor = useStepCardStatus(status);
	if (!guildId) return <span ref={anchor} hidden aria-hidden="true" />;
	return (
		<>
			<span ref={anchor} hidden aria-hidden="true" />
			{stored ? (
				<p style={mutedText}>
					<CheckCircle2
						size={14}
						color="#4ade80"
						style={{ verticalAlign: '-2px', marginRight: 6 }}
					/>
					Already stored as <code>{PAT_SERVICE}</code> (token{' '}
					<code>{existing!.token_name}</code>). Used by{' '}
					<code>/gh claim</code>, <code>/github board</code>, and{' '}
					<code>gh-backfill</code>.
				</p>
			) : (
				<>
					<p style={mutedText}>
						Paste a GitHub fine-grained or classic PAT with at
						minimum <code>public_repo</code> (read) or{' '}
						<code>repo</code> scope on the repos you'll mirror. We
						validate the token against GitHub's <code>/user</code>{' '}
						endpoint before storing it.
					</p>
					<input
						ref={inputRef}
						type="password"
						defaultValue={draftPat}
						onBlur={onPatBlur}
						onInput={onPatInput}
						placeholder="ghp_… or github_pat_…"
						style={{
							...inputStyle,
							fontFamily:
								'var(--sl-font-mono, ui-monospace, monospace)',
						}}
						autoComplete="off"
						spellCheck={false}
					/>
					<div
						style={{
							display: 'flex',
							gap: '0.4rem',
							flexWrap: 'wrap',
						}}>
						<button
							type="button"
							onClick={validate}
							disabled={validating}
							title={
								validating
									? 'GitHub /user lookup in flight — wait for it to return.'
									: 'Hit GitHub’s /user endpoint with the typed PAT to confirm it’s valid before storing.'
							}
							style={secondaryBtn}>
							{validating ? (
								<Loader2 size={14} style={spinStyle} />
							) : (
								<CheckCircle2 size={14} />
							)}
							{validating ? 'Validating…' : 'Validate'}
						</button>
						{validated && (
							<button
								type="button"
								onClick={save}
								disabled={storing}
								title={
									storing
										? 'PAT save in flight — wait for the vault upsert to finish.'
										: 'Store the validated PAT as `github` in the per-guild vault.'
								}
								style={primaryBtn}>
								{storing ? (
									<Loader2 size={14} style={spinStyle} />
								) : (
									<CheckCircle2 size={14} />
								)}
								{storing ? 'Saving…' : 'Save to Vault'}
							</button>
						)}
					</div>
					{validated && (
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
								<strong>Login</strong>:{' '}
								<code>{validated.login}</code>
							</div>
							<div>
								<strong>Token type</strong>:{' '}
								<code>{validated.tokenType}</code>
							</div>
							<div>
								<strong>Scopes</strong>:{' '}
								{validated.scopes.length === 0 ? (
									<em>
										(none reported — fine-grained PATs don't
										surface scopes via this header)
									</em>
								) : (
									validated.scopes.map((s) => (
										<code
											key={s}
											style={{
												marginRight: 4,
												padding: '0 0.3rem',
												borderRadius: 4,
												background:
													'rgba(255,255,255,0.06)',
											}}>
											{s}
										</code>
									))
								)}
							</div>
						</div>
					)}
					{error && <p style={errText}>{error}</p>}
				</>
			)}
		</>
	);
}
