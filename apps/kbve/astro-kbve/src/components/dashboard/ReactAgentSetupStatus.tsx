import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	CheckCircle2,
	Circle,
	Loader2,
	RefreshCw,
	XCircle,
} from 'lucide-react';
import {
	agentsService,
	type DiscordshConfig,
	type DiscordGuild,
} from './agentsService';
import { styles } from './dashboard-ui';

const PAT_SERVICE = 'github';
const WEBHOOK_SERVICE = 'github_webhook';

type StepStatus = 'ok' | 'missing' | 'partial' | 'pending';

interface StepRow {
	id: string;
	label: string;
	status: StepStatus;
	detail: string;
	cta?: { label: string; href: string };
}

function statusIcon(status: StepStatus) {
	if (status === 'ok') {
		return <CheckCircle2 size={18} color="#4ade80" aria-label="complete" />;
	}
	if (status === 'partial') {
		return <Circle size={18} color="#facc15" aria-label="partial" />;
	}
	if (status === 'pending') {
		return (
			<Loader2
				size={18}
				color="#94a3b8"
				style={{ animation: 'spin 1s linear infinite' }}
				aria-label="checking"
			/>
		);
	}
	return <XCircle size={18} color="#f87171" aria-label="missing" />;
}

function statusLabel(status: StepStatus): string {
	if (status === 'ok') return 'Ready';
	if (status === 'partial') return 'Partial';
	if (status === 'pending') return 'Checking…';
	return 'Missing';
}

function statusColor(status: StepStatus): string {
	if (status === 'ok') return '#4ade80';
	if (status === 'partial') return '#facc15';
	if (status === 'pending') return '#94a3b8';
	return '#f87171';
}

export default function ReactAgentSetupStatus() {
	const guilds = useStore(agentsService.$guilds);
	const selectedGuildId = useStore(agentsService.$selectedGuildId);
	const tokens = useStore(agentsService.$tokens);
	const tokensLoading = useStore(agentsService.$tokensLoading);

	const [config, setConfig] = useState<DiscordshConfig | null>(null);
	const [repoCount, setRepoCount] = useState<number | null>(null);
	const [probeLoading, setProbeLoading] = useState(false);
	const [probeError, setProbeError] = useState<string | null>(null);

	const guild = useMemo<DiscordGuild | null>(
		() => guilds.find((g) => g.id === selectedGuildId) ?? null,
		[guilds, selectedGuildId],
	);

	async function probe() {
		if (!selectedGuildId) return;
		setProbeLoading(true);
		setProbeError(null);
		const [cfg, repos] = await Promise.all([
			agentsService.getBotConfig(),
			agentsService.getRepoAllowlist(),
		]);
		if (!cfg.ok) {
			setProbeError(cfg.error);
		} else {
			setConfig(cfg.config);
		}
		if (repos.ok) {
			setRepoCount(repos.repos.length);
		} else {
			setRepoCount(null);
		}
		setProbeLoading(false);
	}

	useEffect(() => {
		setConfig(null);
		setRepoCount(null);
		if (selectedGuildId) void probe();
	}, [selectedGuildId]);

	if (!guild) return null;

	const hasPat = tokens.some((t) => t.service === PAT_SERVICE && t.is_active);
	const hasWebhook = tokens.some(
		(t) => t.service === WEBHOOK_SERVICE && t.is_active,
	);

	const patStatus: StepStatus = tokensLoading
		? 'pending'
		: hasPat && hasWebhook
			? 'ok'
			: hasPat || hasWebhook
				? 'partial'
				: 'missing';

	const reposStatus: StepStatus = probeLoading
		? 'pending'
		: (repoCount ?? 0) > 0
			? 'ok'
			: 'missing';

	const forumId = config?.forum_channel_id?.trim();
	const forumIdValid = !!forumId && /^\d{17,20}$/.test(forumId);
	const forumStatus: StepStatus = probeLoading
		? 'pending'
		: forumIdValid
			? 'ok'
			: 'missing';

	const activeStatus: StepStatus = probeLoading
		? 'pending'
		: config?.active === true
			? 'ok'
			: 'missing';

	const allReady =
		patStatus === 'ok' &&
		reposStatus === 'ok' &&
		forumStatus === 'ok' &&
		activeStatus === 'ok';

	const rows: StepRow[] = [
		{
			id: 'github',
			label: '1. GitHub provider',
			status: patStatus,
			detail:
				patStatus === 'ok'
					? `PAT + webhook secret stored (${tokens.filter((t) => t.service === PAT_SERVICE || t.service === WEBHOOK_SERVICE).length} rows)`
					: patStatus === 'partial'
						? `Missing ${hasPat ? 'webhook secret' : 'PAT'} — finish the GitHub provider wizard`
						: 'Run the GitHub provider wizard (generates webhook secret + PAT)',
			cta: {
				label: 'Open GitHub wizard',
				href: '/dashboard/agents/github/',
			},
		},
		{
			id: 'repos',
			label: '2. Repo allowlist',
			status: reposStatus,
			detail:
				reposStatus === 'ok'
					? `${repoCount} repo${repoCount === 1 ? '' : 's'} routed for ${guild.name}`
					: 'Add at least one "owner/repo" entry below',
		},
		{
			id: 'forum',
			label: '3. Forum channel',
			status: forumStatus,
			detail: forumIdValid
				? `Channel ${forumId} ready to receive issue threads`
				: forumId
					? 'forum_channel_id must be a Discord snowflake (17-20 digits)'
					: 'Set forum_channel_id in the bot config below (right-click a forum channel → Copy Channel ID)',
		},
		{
			id: 'active',
			label: '4. Integration active',
			status: activeStatus,
			detail:
				activeStatus === 'ok'
					? 'Worker will route events for this guild on next refresh (≤ 5 min)'
					: 'Flip the "active" toggle in the bot config — required even after channels are set',
		},
	];

	return (
		<section style={styles.sectionBorder}>
			<header
				style={{
					padding: '0.85rem 1rem',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
					display: 'flex',
					alignItems: 'center',
					gap: '0.6rem',
				}}>
				<div
					style={{
						width: 32,
						height: 32,
						borderRadius: 8,
						background: allReady
							? 'rgba(74,222,128,0.12)'
							: 'rgba(250,204,21,0.12)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}>
					{allReady ? (
						<CheckCircle2 size={18} color="#4ade80" />
					) : (
						<Circle size={18} color="#facc15" />
					)}
				</div>
				<div style={{ flex: 1 }}>
					<strong>Integration status — {guild.name}</strong>
					<div
						style={{
							fontSize: '0.78rem',
							color: 'var(--sl-color-gray-3, #9ca0aa)',
						}}>
						{allReady
							? 'Routed: GitHub events for the allowlisted repos will open new forum threads.'
							: 'Finish each step below — the bot worker only routes events when all four are green.'}
					</div>
				</div>
				<button
					type="button"
					onClick={() => void probe()}
					disabled={probeLoading}
					aria-label="Re-probe status"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
						padding: '0.3rem 0.6rem',
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #2d2f36)',
						background: 'transparent',
						color: 'var(--sl-color-white, #fff)',
						cursor: probeLoading ? 'wait' : 'pointer',
						fontSize: '0.78rem',
					}}>
					<RefreshCw
						size={12}
						style={
							probeLoading
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
					Refresh
				</button>
			</header>

			<div style={{ padding: '0.5rem 0' }}>
				{probeError && (
					<p
						style={{
							margin: '0.5rem 1rem',
							padding: '0.5rem 0.7rem',
							borderRadius: 6,
							background: 'rgba(248,113,113,0.1)',
							color: '#f87171',
							fontSize: '0.78rem',
						}}>
						Probe error: {probeError}
					</p>
				)}
				<ul
					style={{
						listStyle: 'none',
						margin: 0,
						padding: 0,
					}}>
					{rows.map((r, i) => (
						<li
							key={r.id}
							style={{
								display: 'flex',
								alignItems: 'flex-start',
								gap: '0.7rem',
								padding: '0.7rem 1rem',
								borderTop:
									i === 0
										? 'none'
										: '1px solid var(--sl-color-gray-5, #1f2024)',
							}}>
							<div style={{ paddingTop: 2 }}>
								{statusIcon(r.status)}
							</div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div
									style={{
										display: 'flex',
										gap: '0.5rem',
										alignItems: 'center',
										marginBottom: 2,
									}}>
									<span
										style={{
											fontWeight: 600,
											fontSize: '0.88rem',
										}}>
										{r.label}
									</span>
									<span
										style={{
											fontSize: '0.7rem',
											padding: '0.05rem 0.45rem',
											borderRadius: 999,
											background: `${statusColor(r.status)}1f`,
											color: statusColor(r.status),
										}}>
										{statusLabel(r.status)}
									</span>
								</div>
								<div
									style={{
										fontSize: '0.78rem',
										color: 'var(--sl-color-gray-3, #9ca0aa)',
									}}>
									{r.detail}
								</div>
							</div>
							{r.cta && r.status !== 'ok' && (
								<a
									href={r.cta.href}
									style={{
										fontSize: '0.78rem',
										padding: '0.3rem 0.6rem',
										borderRadius: 6,
										border: '1px solid var(--sl-color-gray-5, #2d2f36)',
										background: 'transparent',
										color: 'var(--sl-color-accent, #58a6ff)',
										textDecoration: 'none',
										whiteSpace: 'nowrap',
									}}>
									{r.cta.label}
								</a>
							)}
						</li>
					))}
				</ul>
			</div>
		</section>
	);
}
