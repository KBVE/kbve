import { useEffect, useMemo, useRef, useState, type FocusEvent } from 'react';
import { useStore } from '@nanostores/react';
import {
	AlertTriangle,
	CheckCircle2,
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Loader2,
	LogIn,
	PlayCircle,
	RefreshCw,
	Shuffle,
	Webhook,
	XCircle,
} from 'lucide-react';
import { useAgents } from './context';
import type { AgentTokenRow, DiscordGuild } from '@kbve/droid';
import { styles } from '../dashboard/dashboard-ui';
import ReactAgentGuildPicker from './ReactAgentGuildPicker';

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
	const agents = useAgents();
	const authState = useStore(agents.$authState);
	const guilds = useStore(agents.$guilds);
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const tokens = useStore(agents.$tokens);

	useEffect(() => {
		void agents.initAuth();
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
						onClick={() => void agents.signInWithDiscord()}
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
						onClick={() => void agents.signInWithDiscord()}
						style={primaryBtn}>
						Re-sign-in
					</button>
				}
			/>
		);
	}

	if (!selectedGuild) {
		return (
			<div
				className="not-content"
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: '1rem',
				}}>
				<ReactAgentGuildPicker title="Pick a guild to configure GitHub for" />
				<p
					style={{
						margin: 0,
						fontSize: '0.85rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					The wizard provisions per-guild Vault rows (
					<code>github_pat:&lt;guild&gt;</code> +{' '}
					<code>github_webhook:&lt;guild&gt;</code>) that any KBVE
					agent (discordsh today, future PR-review / CI / chatops bots
					later) can consume. Guild selection is shared across the
					whole agents surface.
				</p>
			</div>
		);
	}

	return (
		<div
			className="not-content"
			style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
			<ReactAgentGuildPicker title="Configuring GitHub for" />
			<WizardBody guild={selectedGuild} tokens={tokens} />
		</div>
	);
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
				<Webhook size={20} color="#58a6ff" />
				<div>
					<div style={{ fontWeight: 600 }}>GitHub provider setup</div>
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
			<Step3Pat guildId={guild.id} existing={existingPat} />
			<Step4SmokeBackfill
				guildId={guild.id}
				ready={!!existingWebhook && !!existingPat}
			/>
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
	const agents = useAgents();
	const draftsMap = useStore(agents.$webhookDrafts);
	const savingMap = useStore(agents.$webhookSavingFor);
	const errorsMap = useStore(agents.$webhookErrors);

	const secret = draftsMap[guild.id] ?? null;
	const busy = !!savingMap[guild.id];
	const error = errorsMap[guild.id] ?? null;

	const [reveal, setReveal] = useState(false);
	const [copied, setCopied] = useState(false);

	const stored = !!existing;

	useEffect(() => {
		setReveal(false);
		setCopied(false);
	}, [guild.id]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 2500);
		return () => clearTimeout(t);
	}, [copied]);

	async function generate() {
		agents.setWebhookDraft(guild.id, genHex(32));
		setReveal(true);
		setCopied(false);
		agents.clearWebhookError(guild.id);
	}

	async function save() {
		if (!secret) return;
		const r = await agents.saveWebhookDraft(
			guild.id,
			WEBHOOK_TOKEN_NAME,
			`GitHub webhook HMAC for guild ${guild.id}`,
		);
		if (r.ok) setReveal(false);
	}

	async function copy() {
		if (!secret) return;
		const ok = await copyToClipboard(secret);
		setCopied(ok);
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
					(token <code>{existing!.token_name}</code>). To rotate, use
					the <strong>Rotate HMAC secret</strong> control in Step 2 —
					it regenerates the secret and updates GitHub + the vault in
					one step.
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
									title={
										busy
											? 'HMAC save in flight — wait for it to finish.'
											: 'Store the generated HMAC secret as github_webhook in the vault.'
									}
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
	const agents = useAgents();
	const url = agents.webhookUrlFor(guild.id);
	const allowlistMap = useStore(agents.$repoAllowlistDrafts);
	const selectedMap = useStore(agents.$webhookInstallSelected);
	const installBusyMap = useStore(agents.$webhookInstallBusyFor);
	const installResultMap = useStore(agents.$webhookInstallResults);
	const pingBusyMap = useStore(agents.$webhookPingBusyFor);
	const pingResultMap = useStore(agents.$webhookPingResults);
	const deliveriesMap = useStore(agents.$webhookDeliveries);
	const deliveriesLoadingMap = useStore(agents.$webhookDeliveriesLoading);
	const deliveriesErrorMap = useStore(agents.$webhookDeliveriesError);
	const rotateBusyMap = useStore(agents.$webhookRotateBusyFor);
	const rotateResultMap = useStore(agents.$webhookRotateResults);
	const deleteBusyMap = useStore(agents.$webhookDeleteBusyFor);

	const repos = allowlistMap[guild.id] ?? [];
	const selectedRepo = selectedMap[guild.id] ?? repos[0] ?? '';
	const installing = !!installBusyMap[guild.id];
	const installResult = installResultMap[guild.id] ?? null;
	const pinging = !!pingBusyMap[guild.id];
	const pingResult = pingResultMap[guild.id] ?? null;
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!selectedMap[guild.id] && repos.length > 0) {
			agents.setWebhookInstallSelected(guild.id, repos[0]);
		}
	}, [guild.id, repos, selectedMap]);

	useEffect(() => {
		if (!hasWebhook || !selectedRepo) return;
		void agents.verifyWebhookInstall(guild.id, selectedRepo);
	}, [guild.id, hasWebhook, selectedRepo]);

	useEffect(() => {
		if (!copied) return;
		const t = setTimeout(() => setCopied(false), 2500);
		return () => clearTimeout(t);
	}, [copied]);

	async function copy() {
		const ok = await copyToClipboard(url);
		setCopied(ok);
	}

	const [actionBlockMsg, setActionBlockMsg] = useState<string | null>(null);

	async function install() {
		if (installing) return;
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		if (!hasWebhook) {
			setActionBlockMsg(
				'Finish Step 1 first — HMAC secret must be stored.',
			);
			return;
		}
		agents.setWebhookInstallSelected(guild.id, selectedRepo);
		await agents.installWebhookForGuild(guild.id);
	}

	async function ping() {
		if (pinging) return;
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		await agents.pingWebhookForGuild(guild.id);
	}

	const deliveriesKey = `${guild.id}:${selectedRepo}`;
	const deliveries = deliveriesMap[deliveriesKey] ?? [];
	const deliveriesLoading = !!deliveriesLoadingMap[deliveriesKey];
	const deliveriesError = deliveriesErrorMap[deliveriesKey] ?? null;
	const rotating = !!rotateBusyMap[guild.id];
	const rotateResult = rotateResultMap[guild.id] ?? null;
	const deleting = !!deleteBusyMap[guild.id];
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		setConfirmDelete(false);
	}, [guild.id, selectedRepo]);

	async function refreshDeliveries() {
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		const [owner, repo] = selectedRepo.split('/');
		if (!owner || !repo) {
			setActionBlockMsg('Selected repo is malformed.');
			return;
		}
		await agents.loadWebhookDeliveries(guild.id, owner, repo, 10);
	}

	async function rotate() {
		if (rotating) return;
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		const [owner, repo] = selectedRepo.split('/');
		if (!owner || !repo) {
			setActionBlockMsg('Selected repo is malformed.');
			return;
		}
		await agents.rotateWebhookForGuild(guild.id, owner, repo);
	}

	async function deleteHook() {
		if (deleting) return;
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		const [owner, repo] = selectedRepo.split('/');
		if (!owner || !repo) {
			setActionBlockMsg('Selected repo is malformed.');
			return;
		}
		await agents.deleteWebhookForGuild(guild.id, owner, repo);
		setConfirmDelete(false);
	}

	const installedOk =
		!!installResult &&
		installResult.ok &&
		(installResult.installed || installResult.alreadyPresent);
	const step2Status: StepStatus = !hasWebhook
		? 'todo'
		: installedOk
			? 'done'
			: 'pending';

	return (
		<StepCard
			n={2}
			title="Configure the GitHub webhook"
			status={step2Status}
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

			<div
				style={{
					marginTop: '0.85rem',
					padding: '0.75rem',
					border: '1px solid var(--sl-color-gray-5, #2d2f36)',
					borderRadius: 8,
					background: 'rgba(88,166,255,0.04)',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.5rem',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.4rem',
					}}>
					<strong style={{ fontSize: '0.85rem' }}>
						Or auto-install via your PAT
					</strong>
				</div>
				<p style={{ ...mutedText, fontSize: '0.82rem' }}>
					Uses your stored GitHub PAT (Step 3 must be done first) to
					POST <code>/repos/&lt;owner&gt;/&lt;repo&gt;/hooks</code>{' '}
					with the URL and HMAC secret you just stored. Only repos in
					your allowlist are eligible.
				</p>
				{repos.length === 0 ? (
					<p style={{ ...mutedText, fontStyle: 'italic' }}>
						Add at least one repo to the allowlist below before
						auto-installing.
					</p>
				) : (
					<div
						style={{
							display: 'flex',
							alignItems: 'stretch',
							gap: '0.4rem',
							flexWrap: 'wrap',
						}}>
						<select
							value={selectedRepo}
							onChange={(e) =>
								agents.setWebhookInstallSelected(
									guild.id,
									e.target.value,
								)
							}
							disabled={installing}
							style={{
								...inputStyle,
								fontFamily:
									'var(--sl-font-mono, ui-monospace, monospace)',
								flex: 1,
								minWidth: 220,
								width: 'auto',
							}}>
							{repos.map((r) => (
								<option key={r} value={r}>
									{r}
								</option>
							))}
						</select>
						<button
							type="button"
							onClick={() => void install()}
							disabled={installing}
							title={
								installing
									? 'Install in flight — wait for the GitHub API call to return.'
									: 'POST /repos/<owner>/<repo>/hooks on GitHub using your stored PAT + HMAC.'
							}
							style={primaryBtn}>
							{installing ? (
								<Loader2 size={14} style={spinStyle} />
							) : (
								<CheckCircle2 size={14} />
							)}
							{installing
								? 'Installing…'
								: 'Install webhook on repo'}
						</button>
					</div>
				)}
				{actionBlockMsg && <p style={errText}>{actionBlockMsg}</p>}
				{!hasWebhook && repos.length > 0 && (
					<p style={{ ...mutedText, fontSize: '0.8rem' }}>
						Finish Step 1 first — the HMAC row must exist in Vault
						before gh-admin can read it.
					</p>
				)}
				{installResult && !installResult.ok && (
					<p style={errText}>{installResult.error}</p>
				)}
				{installResult && installResult.ok && (
					<div
						style={{
							padding: '0.5rem 0.75rem',
							borderRadius: 6,
							background: 'rgba(74,222,128,0.08)',
							border: '1px solid rgba(74,222,128,0.3)',
							fontSize: '0.85rem',
							lineHeight: 1.5,
						}}>
						<CheckCircle2
							size={14}
							color="#4ade80"
							style={{ verticalAlign: '-2px', marginRight: 6 }}
						/>
						{installResult.alreadyPresent
							? 'Webhook already present on this repo'
							: 'Webhook installed'}
						{installResult.hookId !== null && (
							<>
								{' · hook id '}
								<code>{installResult.hookId}</code>
							</>
						)}
					</div>
				)}
				{installResult && installResult.ok && hasWebhook && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: '0.5rem',
							flexWrap: 'wrap',
						}}>
						<button
							type="button"
							onClick={() => void ping()}
							disabled={pinging}
							style={secondaryBtn}
							title="Tells GitHub to redeliver a `ping` event to your gh-webhook URL. Server enforces 30s cooldown + 10 pings/hour per repo.">
							{pinging ? (
								<Loader2 size={14} style={spinStyle} />
							) : (
								<PlayCircle size={14} />
							)}
							{pinging ? 'Pinging…' : 'Send test ping'}
						</button>
						{pingResult && pingResult.ok && (
							<span
								style={{
									fontSize: '0.82rem',
									color: '#4ade80',
								}}>
								Ping sent · hook{' '}
								<code>{pingResult.hookId}</code>. Check Recent
								Deliveries on GitHub for the 200.
							</span>
						)}
						{pingResult && !pingResult.ok && (
							<span style={errText}>{pingResult.error}</span>
						)}
					</div>
				)}
				{installResult && installResult.ok && hasWebhook && (
					<div
						style={{
							marginTop: '0.85rem',
							padding: '0.75rem',
							border: '1px solid var(--sl-color-gray-5, #2d2f36)',
							borderRadius: 8,
							display: 'flex',
							flexDirection: 'column',
							gap: '0.5rem',
						}}>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.4rem',
							}}>
							<strong style={{ fontSize: '0.85rem' }}>
								Recent deliveries
							</strong>
							<button
								type="button"
								onClick={() => void refreshDeliveries()}
								disabled={deliveriesLoading}
								style={{
									...secondaryBtn,
									marginLeft: 'auto',
									padding: '0.25rem 0.5rem',
									fontSize: '0.78rem',
								}}>
								{deliveriesLoading ? (
									<Loader2 size={12} style={spinStyle} />
								) : (
									<RefreshCw size={12} />
								)}
								Refresh
							</button>
						</div>
						{deliveriesError && (
							<p style={errText}>{deliveriesError}</p>
						)}
						{!deliveriesError && deliveries.length === 0 && (
							<p style={{ ...mutedText, fontStyle: 'italic' }}>
								No deliveries fetched yet. Click Refresh to pull
								the latest from GitHub.
							</p>
						)}
						{deliveries.length > 0 && (
							<ul
								style={{
									margin: 0,
									padding: 0,
									listStyle: 'none',
									display: 'flex',
									flexDirection: 'column',
									gap: '0.2rem',
								}}>
								{deliveries.slice(0, 10).map((d) => {
									const ok =
										d.status_code >= 200 &&
										d.status_code < 300;
									return (
										<li
											key={d.id}
											style={{
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'space-between',
												padding: '0.3rem 0.5rem',
												borderRadius: 6,
												background: ok
													? 'rgba(74,222,128,0.06)'
													: 'rgba(239,68,68,0.06)',
												border: ok
													? '1px solid rgba(74,222,128,0.2)'
													: '1px solid rgba(239,68,68,0.25)',
												fontSize: '0.78rem',
												gap: '0.5rem',
											}}>
											<code
												style={{
													fontFamily:
														'var(--sl-font-mono, ui-monospace, monospace)',
													color: ok
														? '#4ade80'
														: '#f87171',
												}}>
												{d.status_code}
											</code>
											<span
												style={{
													fontFamily:
														'var(--sl-font-mono, ui-monospace, monospace)',
													flex: 1,
												}}>
												{d.event}
												{d.action ? `.${d.action}` : ''}
												{d.redelivery
													? ' (redeliver)'
													: ''}
											</span>
											<span
												style={{
													color: 'var(--sl-color-gray-3, #9ca0aa)',
												}}>
												{new Date(
													d.delivered_at,
												).toLocaleTimeString()}
											</span>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				)}
				{hasWebhook && selectedRepo && (
					<div
						style={{
							marginTop: '0.85rem',
							padding: '0.75rem',
							border: '1px solid rgba(239,68,68,0.25)',
							borderRadius: 8,
							display: 'flex',
							flexDirection: 'column',
							gap: '0.5rem',
						}}>
						<strong style={{ fontSize: '0.85rem' }}>
							Lifecycle
						</strong>
						<p style={{ ...mutedText, fontSize: '0.8rem' }}>
							Rotate replaces the HMAC on GitHub + vault. Old
							in-flight deliveries fail signature for a few
							seconds. Delete removes the hook from GitHub but
							leaves the vault HMAC row intact.
						</p>
						<div
							style={{
								display: 'flex',
								gap: '0.4rem',
								flexWrap: 'wrap',
							}}>
							<button
								type="button"
								onClick={() => void rotate()}
								disabled={rotating}
								title={
									rotating
										? 'Rotate in flight — wait for the GitHub PATCH + vault upsert to finish.'
										: 'Generate a new HMAC secret, PATCH GitHub’s hook config, replace the vault row. Rate-limited 60s/5 per hour.'
								}
								style={secondaryBtn}>
								{rotating ? (
									<Loader2 size={14} style={spinStyle} />
								) : (
									<RefreshCw size={14} />
								)}
								{rotating ? 'Rotating…' : 'Rotate HMAC secret'}
							</button>
							<button
								type="button"
								onClick={() => void deleteHook()}
								disabled={deleting}
								title={
									deleting
										? 'Delete in flight — wait for the GitHub DELETE to return.'
										: 'Remove the kbve hook from GitHub. Vault HMAC row stays so you can reinstall without rotating.'
								}
								style={{
									...secondaryBtn,
									color: '#f87171',
									borderColor: 'rgba(239,68,68,0.4)',
								}}>
								{deleting ? (
									<Loader2 size={14} style={spinStyle} />
								) : (
									<XCircle size={14} />
								)}
								{deleting
									? 'Deleting…'
									: confirmDelete
										? 'Confirm delete?'
										: 'Delete webhook'}
							</button>
						</div>
						{rotateResult && rotateResult.ok && (
							<span
								style={{
									fontSize: '0.82rem',
									color: '#4ade80',
								}}>
								Rotated · hook{' '}
								<code>{rotateResult.hookId}</code> updated. New
								HMAC stored in vault.
							</span>
						)}
						{rotateResult && !rotateResult.ok && (
							<span style={errText}>{rotateResult.error}</span>
						)}
					</div>
				)}
			</div>
		</StepCard>
	);
}

function Step3Pat({
	guildId,
	existing,
}: {
	guildId: string;
	existing: AgentTokenRow | null;
}) {
	const agents = useAgents();
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
		</StepCard>
	);
}

function Step4SmokeBackfill({
	guildId,
	ready,
}: {
	guildId: string;
	ready: boolean;
}) {
	const agents = useAgents();
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
				'Finish Steps 1 + 3 first — HMAC secret and PAT must be stored before the smoke can run.',
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
