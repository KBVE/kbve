import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Clock,
	Loader2,
	RefreshCw,
	RotateCcw,
} from 'lucide-react';
import { agentsService } from './agentsService';
import { styles } from './dashboard-ui';

const REFRESH_INTERVAL_MS = 30_000;

export default function ReactAgentEventQueue() {
	const guildId = useStore(agentsService.$selectedGuildId);
	const guilds = useStore(agentsService.$guilds);
	const statsMap = useStore(agentsService.$eventStats);
	const statsLoadingMap = useStore(agentsService.$eventStatsLoading);
	const failedMap = useStore(agentsService.$failedEvents);
	const failedLoadingMap = useStore(agentsService.$failedEventsLoading);
	const requeueBusyMap = useStore(agentsService.$eventRequeueBusyFor);

	const [autoRefresh, setAutoRefresh] = useState(true);

	const stats = guildId ? statsMap[guildId] : undefined;
	const statsLoading = guildId ? !!statsLoadingMap[guildId] : false;
	const failed = guildId ? (failedMap[guildId] ?? []) : [];
	const failedLoading = guildId ? !!failedLoadingMap[guildId] : false;
	const guild = useMemo(
		() => guilds.find((g) => g.id === guildId),
		[guilds, guildId],
	);

	useEffect(() => {
		if (!guildId) return;
		void agentsService.loadEventStats(guildId);
		void agentsService.loadFailedEvents(guildId, 10);
	}, [guildId]);

	useEffect(() => {
		if (!guildId || !autoRefresh) return;
		const id = setInterval(() => {
			void agentsService.loadEventStats(guildId);
			if ((failedMap[guildId] ?? []).length > 0) {
				void agentsService.loadFailedEvents(guildId, 10);
			}
		}, REFRESH_INTERVAL_MS);
		return () => clearInterval(id);
	}, [guildId, autoRefresh, failedMap]);

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
						Pick a guild above to see GitHub → Discord event queue
						status.
					</p>
				</div>
			</section>
		);
	}

	async function refresh() {
		if (!guildId) return;
		void agentsService.loadEventStats(guildId);
		void agentsService.loadFailedEvents(guildId, 10);
	}

	async function requeue(eventId: number) {
		if (!guildId) return;
		await agentsService.requeueEvent(guildId, eventId);
	}

	const pending = stats?.pending_count ?? 0;
	const inFlight = stats?.in_flight_count ?? 0;
	const delivered = stats?.delivered_count ?? 0;
	const failedCount = stats?.failed_count ?? 0;
	const queueDepth = pending + inFlight;

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
				<Activity size={18} color="#58a6ff" />
				<strong>Event queue</strong>
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
				<label
					style={{
						marginLeft: 'auto',
						fontSize: '0.78rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.3rem',
					}}>
					<input
						type="checkbox"
						checked={autoRefresh}
						onChange={(e) => setAutoRefresh(e.target.checked)}
					/>
					Auto refresh 30s
				</label>
				<button
					type="button"
					onClick={() => void refresh()}
					disabled={statsLoading || failedLoading}
					style={refreshBtn(statsLoading || failedLoading)}
					aria-label="Refresh">
					<RefreshCw
						size={14}
						style={statsLoading ? spinIcon : undefined}
					/>
					Refresh
				</button>
			</header>

			<div
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					flexDirection: 'column',
					gap: '0.85rem',
				}}>
				<div
					style={{
						display: 'grid',
						gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
						gap: '0.5rem',
					}}>
					<StatCard
						label="Queue depth"
						value={queueDepth}
						hint={`${pending} pending + ${inFlight} in-flight`}
						tone={queueDepth > 50 ? 'warn' : 'ok'}
					/>
					<StatCard
						label="Delivered"
						value={delivered}
						hint={
							stats?.last_delivered_at
								? `Last ${new Date(
										stats.last_delivered_at,
									).toLocaleString()}`
								: 'No deliveries yet'
						}
						tone="ok"
					/>
					<StatCard
						label="Failed"
						value={failedCount}
						hint="At max attempts — needs requeue"
						tone={failedCount > 0 ? 'fail' : 'ok'}
					/>
					<StatCard
						label="Oldest pending"
						value={
							stats?.oldest_pending_at
								? relativeTime(stats.oldest_pending_at)
								: '—'
						}
						hint={
							stats?.oldest_pending_at
								? new Date(
										stats.oldest_pending_at,
									).toLocaleString()
								: 'No backlog'
						}
						tone={
							stats?.oldest_pending_at
								? ageSeconds(stats.oldest_pending_at) > 10 * 60
									? 'warn'
									: 'ok'
								: 'ok'
						}
					/>
				</div>

				{failedCount > 0 && (
					<div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: '0.4rem',
								marginBottom: '0.4rem',
							}}>
							<AlertTriangle size={14} color="#facc15" />
							<strong style={{ fontSize: '0.85rem' }}>
								Failed events
							</strong>
						</div>
						<ul
							style={{
								margin: 0,
								padding: 0,
								listStyle: 'none',
								display: 'flex',
								flexDirection: 'column',
								gap: '0.3rem',
							}}>
							{failed.map((ev) => {
								const busy =
									!!requeueBusyMap[`${guildId}:${ev.id}`];
								return (
									<li
										key={ev.id}
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											padding: '0.4rem 0.6rem',
											borderRadius: 6,
											border: '1px solid rgba(239,68,68,0.3)',
											background: 'rgba(239,68,68,0.06)',
											gap: '0.5rem',
										}}>
										<div
											style={{
												display: 'flex',
												flexDirection: 'column',
												gap: '0.15rem',
												minWidth: 0,
												flex: 1,
											}}>
											<code
												style={{
													fontFamily:
														'var(--sl-font-mono, ui-monospace, monospace)',
													fontSize: '0.8rem',
												}}>
												{ev.owner}/{ev.repo}#{ev.number}{' '}
												<span
													style={{
														color: 'var(--sl-color-gray-3, #9ca0aa)',
													}}>
													· {ev.event_type}
												</span>
											</code>
											{ev.last_error && (
												<span
													style={{
														fontSize: '0.75rem',
														color: '#f87171',
														overflow: 'hidden',
														textOverflow:
															'ellipsis',
														whiteSpace: 'nowrap',
													}}
													title={ev.last_error}>
													{ev.last_error}
												</span>
											)}
											<span
												style={{
													fontSize: '0.72rem',
													color: 'var(--sl-color-gray-3, #9ca0aa)',
												}}>
												<Clock
													size={10}
													style={{
														verticalAlign: '-1px',
														marginRight: 3,
													}}
												/>
												{new Date(
													ev.updated_at,
												).toLocaleString()}{' '}
												· attempts{' '}
												{ev.delivery_attempts}
											</span>
										</div>
										<button
											type="button"
											onClick={() => void requeue(ev.id)}
											disabled={busy}
											style={requeueBtn(busy)}>
											{busy ? (
												<Loader2
													size={12}
													style={spinIcon}
												/>
											) : (
												<RotateCcw size={12} />
											)}
											{busy ? 'Requeuing…' : 'Requeue'}
										</button>
									</li>
								);
							})}
						</ul>
					</div>
				)}

				{failedCount === 0 && delivered > 0 && (
					<p
						style={{
							margin: 0,
							color: '#4ade80',
							fontSize: '0.82rem',
							display: 'inline-flex',
							alignItems: 'center',
							gap: '0.3rem',
						}}>
						<CheckCircle2 size={14} />
						All recent deliveries succeeded.
					</p>
				)}
			</div>
		</section>
	);
}

function ageSeconds(iso: string): number {
	return (Date.now() - new Date(iso).getTime()) / 1000;
}

function relativeTime(iso: string): string {
	const s = ageSeconds(iso);
	if (s < 60) return `${Math.floor(s)}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}

function StatCard({
	label,
	value,
	hint,
	tone,
}: {
	label: string;
	value: number | string;
	hint: string;
	tone: 'ok' | 'warn' | 'fail';
}) {
	const palette = {
		ok: { bg: 'rgba(255,255,255,0.03)', fg: 'var(--sl-color-white, #fff)' },
		warn: { bg: 'rgba(251,191,36,0.08)', fg: '#fbbf24' },
		fail: { bg: 'rgba(239,68,68,0.08)', fg: '#f87171' },
	}[tone];
	return (
		<div
			style={{
				padding: '0.6rem 0.7rem',
				borderRadius: 8,
				border: '1px solid var(--sl-color-gray-5, #2d2f36)',
				background: palette.bg,
				display: 'flex',
				flexDirection: 'column',
				gap: '0.15rem',
			}}>
			<span
				style={{
					fontSize: '0.7rem',
					color: 'var(--sl-color-gray-3, #9ca0aa)',
					textTransform: 'uppercase',
					letterSpacing: '0.04em',
				}}>
				{label}
			</span>
			<span
				style={{
					fontSize: '1.15rem',
					fontWeight: 700,
					color: palette.fg,
					fontFamily: 'var(--sl-font-mono, ui-monospace, monospace)',
				}}>
				{value}
			</span>
			<span
				style={{
					fontSize: '0.72rem',
					color: 'var(--sl-color-gray-3, #9ca0aa)',
				}}>
				{hint}
			</span>
		</div>
	);
}

const spinIcon: React.CSSProperties = {
	animation: 'spin 1s linear infinite',
};

function refreshBtn(busy: boolean): React.CSSProperties {
	return {
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

function requeueBtn(busy: boolean): React.CSSProperties {
	return {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '0.3rem',
		padding: '0.3rem 0.55rem',
		borderRadius: 6,
		border: '1px solid rgba(88,166,255,0.4)',
		background: 'transparent',
		color: '#58a6ff',
		cursor: busy ? 'wait' : 'pointer',
		fontSize: '0.78rem',
	};
}
