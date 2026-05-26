import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	AlertTriangle,
	CheckCircle2,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Github,
	Loader2,
	LogIn,
	PlayCircle,
	Shuffle,
} from 'lucide-react';
import {
	agentsService,
	type AgentTokenRow,
	type DiscordGuild,
} from './agentsService';
import { styles } from './dashboard-ui';

const GITHUB_OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

const WEBHOOK_TOKEN_NAME = 'github-webhook-hmac';
const WEBHOOK_SERVICE = 'github_webhook';
const PAT_TOKEN_NAME = 'github-pat';
const PAT_SERVICE = 'github';

function genHex(bytes = 32): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export default function ReactAgentGithubWizard() {
	const authState = useStore(agentsService.$authState);
	const guilds = useStore(agentsService.$guilds);
	const selectedGuildId = useStore(agentsService.$selectedGuildId);
	const tokens = useStore(agentsService.$tokens);

	useEffect(() => {
		void agentsService.initAuth();
	}, []);

	const selectedGuild = useMemo<DiscordGuild | null>(
		() => guilds.find((g) => g.id === selectedGuildId) ?? null,
		[guilds, selectedGuildId],
	);

	if (authState === 'loading') {
		return (
			<CenterMsg
				icon={<Loader2 size={28} style={spinStyle} />}
				msg="Loading session…"
			/>
		);
	}
	if (authState === 'unauthenticated') {
		return (
			<CenterMsg
				icon={<LogIn size={28} color="#58a6ff" />}
				msg="Sign in with Discord to access the wizard."
				cta={
					<button
						type="button"
						onClick={() => void agentsService.signInWithDiscord()}
						style={primaryBtn}>
						Sign in with Discord
					</button>
				}
			/>
		);
	}
	if (authState === 'discord_reauth_required') {
		return (
			<CenterMsg
				icon={<AlertTriangle size={28} color="#facc15" />}
				msg="Discord session expired. Re-sign-in to continue."
				cta={
					<button
						type="button"
						onClick={() => void agentsService.signInWithDiscord()}
						style={primaryBtn}>
						Re-sign-in
					</button>
				}
			/>
		);
	}

	if (!selectedGuild) {
		return (
			<section style={styles.sectionBorder}>
				<div style={{ padding: '1rem' }}>
					<p
						style={{
							margin: 0,
							color: 'var(--sl-color-gray-3, #9ca0aa)',
						}}>
						Pick a guild on the{' '}
						<a href="/dashboard/agents/discordsh/">
							discordsh page
						</a>{' '}
						first. The wizard provisions Vault rows for that guild.
					</p>
				</div>
			</section>
		);
	}

	return <WizardBody guild={selectedGuild} tokens={tokens} />;
}

interface WizardBodyProps {
	guild: DiscordGuild;
	tokens: AgentTokenRow[];
}

function WizardBody({ guild, tokens }: WizardBodyProps) {
	const existingWebhook = useMemo(
		() => tokens.find((t) => t.service === WEBHOOK_SERVICE) ?? null,
		[tokens],
	);
	const existingPat = useMemo(
		() => tokens.find((t) => t.service === PAT_SERVICE) ?? null,
		[tokens],
	);

	return (
		<div
			className="not-content"
			style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.6rem',
					padding: '0.75rem 1rem',
					border: '1px solid var(--sl-color-gray-5, #2d2f36)',
					borderRadius: 12,
					background: 'rgba(88,166,255,0.06)',
				}}>
				<Github size={20} color="#58a6ff" />
				<div>
					<div style={{ fontWeight: 600 }}>
						discordsh · GitHub setup
					</div>
					<div
						style={{
							fontSize: '0.78rem',
							color: 'var(--sl-color-gray-3, #9ca0aa)',
						}}>
						Guild: {guild.name}
						{' · '}
						<code
							style={{
								fontFamily:
									'var(--sl-font-mono, ui-monospace, monospace)',
							}}>
							{guild.id}
						</code>
					</div>
				</div>
			</header>

			<Step1Webhook guild={guild} existing={existingWebhook} />
			<Step2WebhookConfig guild={guild} hasWebhook={!!existingWebhook} />
			<Step3Pat existing={existingPat} />
			<Step4SmokeBackfill ready={!!existingWebhook && !!existingPat} />
		</div>
	);
}

function Step1Webhook({
	guild,
	existing,
}: {
	guild: DiscordGuild;
	existing: AgentTokenRow | null;
}) {
	const [secret, setSecret] = useState<string | null>(null);
	const [reveal, setReveal] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	const stored = !!existing;

	async function generate() {
		setSecret(genHex(32));
		setReveal(true);
		setCopied(false);
		setError(null);
	}

	async function save() {
		if (!secret) return;
		setBusy(true);
		setError(null);
		const r = await agentsService.addToken({
			tokenName: WEBHOOK_TOKEN_NAME,
			service: WEBHOOK_SERVICE,
			tokenValue: secret,
			description: `GitHub webhook HMAC for guild ${guild.id}`,
		});
		setBusy(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		setSecret(null);
		setReveal(false);
	}

	async function copy() {
		if (!secret) return;
		const ok = await copyToClipboard(secret);
		setCopied(ok);
		if (ok) setTimeout(() => setCopied(false), 2500);
	}

	return (
		<StepCard
			n={1}
			title="HMAC webhook secret"
			status={stored ? 'done' : secret ? 'pending' : 'todo'}>
			{stored ? (
				<p style={mutedText}>
					<CheckCircle2
						size={14}
						color="#4ade80"
						style={{ verticalAlign: '-2px', marginRight: 6 }}
					/>
					Already stored as{' '}
					<code>
						{WEBHOOK_SERVICE}:{guild.id}
					</code>{' '}
					(token <code>{existing!.token_name}</code>). To rotate,
					delete the existing row from{' '}
					<a href="/dashboard/agents/discordsh/">discordsh page</a>{' '}
					and run this wizard again.
				</p>
			) : (
				<>
					<p style={mutedText}>
						Generate a random ≥32-char HMAC secret. The same value
						goes into the GitHub webhook config in Step 2.
					</p>
					{!secret && (
						<button
							type="button"
							onClick={generate}
							style={primaryBtn}>
							<Shuffle size={14} />
							Generate 32-byte hex secret
						</button>
					)}
					{secret && (
						<>
							<div
								style={{
									display: 'flex',
									alignItems: 'stretch',
									gap: '0.4rem',
								}}>
								<input
									readOnly
									type={reveal ? 'text' : 'password'}
									value={secret}
									style={{
										...inputStyle,
										fontFamily:
											'var(--sl-font-mono, ui-monospace, monospace)',
										flex: 1,
									}}
								/>
								<button
									type="button"
									onClick={() => setReveal((r) => !r)}
									style={iconBtn}
									aria-label={reveal ? 'Hide' : 'Reveal'}>
									{reveal ? (
										<EyeOff size={14} />
									) : (
										<Eye size={14} />
									)}
								</button>
								<button
									type="button"
									onClick={copy}
									style={iconBtn}
									aria-label="Copy">
									<Copy size={14} />
									{copied ? ' Copied' : ''}
								</button>
							</div>
							<div
								style={{
									display: 'flex',
									gap: '0.4rem',
									flexWrap: 'wrap',
								}}>
								<button
									type="button"
									onClick={generate}
									style={secondaryBtn}>
									<Shuffle size={14} />
									Regenerate
								</button>
								<button
									type="button"
									onClick={save}
									disabled={busy}
									style={primaryBtn}>
									{busy ? (
										<Loader2 size={14} style={spinStyle} />
									) : (
										<CheckCircle2 size={14} />
									)}
									{busy ? 'Saving…' : 'Save to Vault'}
								</button>
							</div>
						</>
					)}
					{error && <p style={errText}>{error}</p>}
				</>
			)}
		</StepCard>
	);
}

function Step2WebhookConfig({
	guild,
	hasWebhook,
}: {
	guild: DiscordGuild;
	hasWebhook: boolean;
}) {
	const url = agentsService.webhookUrlFor(guild.id);
	const [copied, setCopied] = useState(false);

	async function copy() {
		const ok = await copyToClipboard(url);
		setCopied(ok);
		if (ok) setTimeout(() => setCopied(false), 2500);
	}

	return (
		<StepCard
			n={2}
			title="Configure the GitHub webhook"
			status={hasWebhook ? 'pending' : 'todo'}
			disabled={!hasWebhook}>
			<p style={mutedText}>
				Copy the per-guild webhook URL, then create a new webhook on the
				GitHub repository you want to mirror. Use the HMAC secret from
				Step 1 as the webhook Secret field.
			</p>
			<div
				style={{
					display: 'flex',
					alignItems: 'stretch',
					gap: '0.4rem',
				}}>
				<input
					readOnly
					value={url}
					style={{
						...inputStyle,
						fontFamily:
							'var(--sl-font-mono, ui-monospace, monospace)',
						flex: 1,
					}}
				/>
				<button
					type="button"
					onClick={copy}
					style={iconBtn}
					aria-label="Copy URL">
					<Copy size={14} />
					{copied ? ' Copied' : ''}
				</button>
			</div>
			<ol
				style={{
					margin: '0.6rem 0 0 1.1rem',
					padding: 0,
					color: 'var(--sl-color-gray-2, #c2c5cc)',
					fontSize: '0.88rem',
					lineHeight: 1.6,
				}}>
				<li>
					Open your repo on GitHub → Settings → Webhooks →{' '}
					<em>Add webhook</em>.
				</li>
				<li>
					<strong>Payload URL</strong>: paste the URL above.
				</li>
				<li>
					<strong>Content type</strong>: <code>application/json</code>
				</li>
				<li>
					<strong>Secret</strong>: paste the value you generated in
					Step 1.
				</li>
				<li>
					<strong>SSL verification</strong>: enable.
				</li>
				<li>
					<strong>Which events</strong>: select{' '}
					<em>Let me select individual events</em> and tick Issues,
					Issue comments, Pull requests, Pull request reviews, Pull
					request review comments. Leave everything else unticked.
				</li>
				<li>
					Click <em>Add webhook</em>. GitHub will fire a{' '}
					<code>ping</code> immediately; the function should respond
					200 in under a second.
				</li>
			</ol>
		</StepCard>
	);
}

function Step3Pat({ existing }: { existing: AgentTokenRow | null }) {
	const [pat, setPat] = useState('');
	const [validating, setValidating] = useState(false);
	const [storing, setStoring] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [validated, setValidated] = useState<{
		login: string;
		scopes: string[];
		tokenType: string;
	} | null>(null);

	const stored = !!existing;

	async function validate() {
		setValidating(true);
		setError(null);
		setValidated(null);
		const r = await agentsService.validateGithubPat(pat);
		setValidating(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		setValidated({
			login: r.login,
			scopes: r.scopes,
			tokenType: r.tokenType,
		});
	}

	async function save() {
		setStoring(true);
		setError(null);
		const r = await agentsService.addToken({
			tokenName: PAT_TOKEN_NAME,
			service: PAT_SERVICE,
			tokenValue: pat,
			description: validated
				? `GitHub PAT for ${validated.login}`
				: 'GitHub PAT',
		});
		setStoring(false);
		if (!r.ok) {
			setError(r.error);
			return;
		}
		setPat('');
		setValidated(null);
	}

	return (
		<StepCard
			n={3}
			title="GitHub PAT (for issue + comment reads)"
			status={stored ? 'done' : validated ? 'pending' : 'todo'}>
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
						type="password"
						value={pat}
						onChange={(e) => setPat(e.target.value)}
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
							disabled={!pat || validating}
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
		</StepCard>
	);
}

function Step4SmokeBackfill({ ready }: { ready: boolean }) {
	const [owner, setOwner] = useState('');
	const [repo, setRepo] = useState('');
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<
		| {
				ok: true;
				upserted: number;
				pages: number;
				rateLimitRemaining: number | null;
		  }
		| { ok: false; error: string }
		| null
	>(null);

	const ownerOk = GITHUB_OWNER_RE.test(owner);
	const repoOk = GITHUB_REPO_RE.test(repo);
	const canRun = ready && ownerOk && repoOk && !busy;

	async function run() {
		if (!canRun) return;
		setBusy(true);
		setResult(null);
		const r = await agentsService.runBackfill({
			owner,
			repo,
			state: 'open',
			maxPages: 1,
			perPage: 30,
		});
		setBusy(false);
		setResult(r);
	}

	return (
		<StepCard
			n={4}
			title="Smoke-test the backfill"
			status={result?.ok ? 'done' : ready ? 'pending' : 'todo'}
			disabled={!ready}>
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
					placeholder="owner (e.g. KBVE)"
					value={owner}
					onChange={(e) => setOwner(e.target.value)}
					disabled={!ready}
					style={inputStyle}
					spellCheck={false}
				/>
				<input
					placeholder="repo (e.g. kbve)"
					value={repo}
					onChange={(e) => setRepo(e.target.value)}
					disabled={!ready}
					style={inputStyle}
					spellCheck={false}
				/>
			</div>
			<button
				type="button"
				onClick={run}
				disabled={!canRun}
				style={primaryBtn}>
				{busy ? (
					<Loader2 size={14} style={spinStyle} />
				) : (
					<PlayCircle size={14} />
				)}
				{busy ? 'Running…' : 'Run smoke test'}
			</button>
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
							href={`https://github.com/${owner}/${repo}/settings/hooks`}
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
		</StepCard>
	);
}

type StepStatus = 'todo' | 'pending' | 'done';

function StepCard({
	n,
	title,
	status,
	disabled,
	children,
}: {
	n: number;
	title: string;
	status: StepStatus;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	const palette = {
		todo: { bg: 'rgba(148,163,184,0.12)', fg: '#94a3b8' },
		pending: { bg: 'rgba(251,191,36,0.12)', fg: '#fbbf24' },
		done: { bg: 'rgba(74,222,128,0.12)', fg: '#4ade80' },
	}[status];

	return (
		<section
			style={{
				...styles.sectionBorder,
				opacity: disabled ? 0.65 : 1,
			}}>
			<header
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.6rem',
					padding: '0.7rem 1rem',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				}}>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 26,
						height: 26,
						borderRadius: 999,
						background: palette.bg,
						color: palette.fg,
						fontSize: '0.78rem',
						fontWeight: 700,
					}}>
					{n}
				</span>
				<strong style={{ flex: 1 }}>{title}</strong>
				<span
					style={{
						fontSize: '0.72rem',
						padding: '0.15rem 0.5rem',
						borderRadius: 999,
						background: palette.bg,
						color: palette.fg,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						fontWeight: 600,
					}}>
					{status}
				</span>
			</header>
			<div
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.6rem',
				}}>
				{children}
			</div>
		</section>
	);
}

function CenterMsg({
	icon,
	msg,
	cta,
}: {
	icon: React.ReactNode;
	msg: string;
	cta?: React.ReactNode;
}) {
	return (
		<div className="not-content" style={styles.fullCenter}>
			<div style={styles.iconBadge('#58a6ff')}>{icon}</div>
			<p
				style={{
					color: 'var(--sl-color-gray-3, #9ca0aa)',
					maxWidth: 480,
					margin: '0.5rem 0',
				}}>
				{msg}
			</p>
			{cta && <div style={{ marginTop: '0.5rem' }}>{cta}</div>}
		</div>
	);
}

const spinStyle: React.CSSProperties = {
	animation: 'spin 1s linear infinite',
	color: 'var(--sl-color-accent, #58a6ff)',
};

const mutedText: React.CSSProperties = {
	margin: 0,
	fontSize: '0.88rem',
	color: 'var(--sl-color-gray-2, #c2c5cc)',
	lineHeight: 1.55,
};

const errText: React.CSSProperties = {
	margin: 0,
	color: '#f87171',
	fontSize: '0.85rem',
};

const inputStyle: React.CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	width: '100%',
	boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.4rem',
	padding: '0.45rem 0.9rem',
	borderRadius: 8,
	border: 'none',
	background: '#58a6ff',
	color: '#0d1117',
	fontWeight: 600,
	cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.4rem',
	padding: '0.45rem 0.9rem',
	borderRadius: 8,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
};

const iconBtn: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.25rem',
	padding: '0.35rem 0.55rem',
	borderRadius: 6,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
	fontSize: '0.78rem',
};
