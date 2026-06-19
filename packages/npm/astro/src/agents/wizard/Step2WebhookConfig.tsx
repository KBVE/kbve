import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	CheckCircle2,
	Copy,
	Loader2,
	PlayCircle,
	RefreshCw,
	XCircle,
} from 'lucide-react';
import { useAgents } from '../context';
import {
	useStepCardStatus,
	type StepStatus,
} from '../../dashboard/useStepCardStatus';
import {
	WEBHOOK_SERVICE,
	copyToClipboard,
	mutedText,
	errText,
	primaryBtn,
	secondaryBtn,
	iconBtn,
	inputStyle,
	spinStyle,
} from './shared';

export default function Step2WebhookConfig() {
	const agents = useAgents();
	const guilds = useStore(agents.$guilds);
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const tokens = useStore(agents.$tokens);
	const guildId = selectedGuildId ?? '';
	const guild = guilds.find((g) => g.id === selectedGuildId) ?? null;
	const hasWebhook = !!tokens.find((t) => t.service === WEBHOOK_SERVICE);
	const url = agents.webhookUrlFor(guildId);
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

	const repos = allowlistMap[guildId] ?? [];
	const selectedRepo = selectedMap[guildId] ?? repos[0] ?? '';
	const installing = !!installBusyMap[guildId];
	const installResult = installResultMap[guildId] ?? null;
	const pinging = !!pingBusyMap[guildId];
	const pingResult = pingResultMap[guildId] ?? null;
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!selectedMap[guildId] && repos.length > 0) {
			agents.setWebhookInstallSelected(guildId, repos[0]);
		}
	}, [guildId, repos, selectedMap]);

	useEffect(() => {
		if (!hasWebhook || !selectedRepo) return;
		void agents.verifyWebhookInstall(guildId, selectedRepo);
	}, [guildId, hasWebhook, selectedRepo]);

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
		agents.setWebhookInstallSelected(guildId, selectedRepo);
		await agents.installWebhookForGuild(guildId);
	}

	async function ping() {
		if (pinging) return;
		setActionBlockMsg(null);
		if (!selectedRepo) {
			setActionBlockMsg('Pick a repo from the dropdown first.');
			return;
		}
		await agents.pingWebhookForGuild(guildId);
	}

	const deliveriesKey = `${guildId}:${selectedRepo}`;
	const deliveries = deliveriesMap[deliveriesKey] ?? [];
	const deliveriesLoading = !!deliveriesLoadingMap[deliveriesKey];
	const deliveriesError = deliveriesErrorMap[deliveriesKey] ?? null;
	const rotating = !!rotateBusyMap[guildId];
	const rotateResult = rotateResultMap[guildId] ?? null;
	const deleting = !!deleteBusyMap[guildId];
	const [confirmDelete, setConfirmDelete] = useState(false);

	useEffect(() => {
		setConfirmDelete(false);
	}, [guildId, selectedRepo]);

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
		await agents.loadWebhookDeliveries(guildId, owner, repo, 10);
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
		await agents.rotateWebhookForGuild(guildId, owner, repo);
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
		await agents.deleteWebhookForGuild(guildId, owner, repo);
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

	const anchor = useStepCardStatus(step2Status, !hasWebhook);
	if (!guild) return <span ref={anchor} hidden aria-hidden="true" />;
	return (
		<>
			<span ref={anchor} hidden aria-hidden="true" />
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
					Uses your stored GitHub PAT (Step 2 must be done first) to
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
									guildId,
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
		</>
	);
}
