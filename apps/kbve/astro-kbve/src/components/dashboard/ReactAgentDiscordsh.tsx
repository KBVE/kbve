import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	Loader2,
	LogIn,
	RefreshCw,
	AlertTriangle,
	Users,
	KeyRound,
	Plus,
	Trash2,
	Power,
} from 'lucide-react';
import {
	agentsService,
	type AgentTokenRow,
	type DiscordGuild,
} from './agentsService';
import { styles } from './dashboard-ui';
import { AddTokenModal, DeleteTokenModal } from './ReactAgentTokenModals';

const DISCORD_CDN = 'https://cdn.discordapp.com';

function guildIconUrl(guild: DiscordGuild): string | null {
	if (!guild.icon) return null;
	return `${DISCORD_CDN}/icons/${guild.id}/${guild.icon}.png?size=64`;
}

function initials(name: string): string {
	return name
		.split(/\s+/)
		.map((s) => s[0])
		.filter(Boolean)
		.slice(0, 2)
		.join('')
		.toUpperCase();
}

function formatDate(iso: string): string {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

function maskService(svc: string): { label: string; color: string } {
	if (svc === 'github') return { label: 'github · PAT', color: '#58a6ff' };
	if (svc === 'github_webhook')
		return { label: 'github · webhook', color: '#a78bfa' };
	if (svc === 'github_repos')
		return { label: 'github · repo list', color: '#34d399' };
	if (svc === 'irc') return { label: 'irc', color: '#fb7185' };
	return { label: svc, color: '#94a3b8' };
}

export default function ReactAgentDiscordsh() {
	const authState = useStore(agentsService.$authState);
	const guilds = useStore(agentsService.$guilds);
	const guildsLoading = useStore(agentsService.$guildsLoading);
	const guildsError = useStore(agentsService.$guildsError);
	const selectedGuildId = useStore(agentsService.$selectedGuildId);
	const tokens = useStore(agentsService.$tokens);
	const tokensLoading = useStore(agentsService.$tokensLoading);
	const tokensError = useStore(agentsService.$tokensError);

	useEffect(() => {
		void agentsService.initAuth();
	}, []);

	const selectedGuild = useMemo(
		() => guilds.find((g) => g.id === selectedGuildId) ?? null,
		[guilds, selectedGuildId],
	);

	if (authState === 'loading') {
		return (
			<div className="not-content" style={styles.fullCenter}>
				<Loader2
					size={28}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #58a6ff)',
					}}
				/>
				<p
					style={{
						marginTop: '0.75rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					Loading session…
				</p>
			</div>
		);
	}

	if (authState === 'unauthenticated') {
		return (
			<div className="not-content" style={styles.fullCenter}>
				<div style={styles.iconBadge('#58a6ff')}>
					<LogIn size={28} color="#58a6ff" />
				</div>
				<h2 style={{ margin: '0.5rem 0' }}>Sign in required</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #9ca0aa)',
						maxWidth: 480,
					}}>
					Manage your discordsh integration by signing in with
					Discord. We use your Discord identity to verify which guilds
					you own before showing or editing their stored tokens.
				</p>
				<button
					type="button"
					onClick={() => void agentsService.signInWithDiscord()}
					style={{
						marginTop: '1rem',
						padding: '0.55rem 1.1rem',
						borderRadius: 8,
						border: 'none',
						background: '#5865F2',
						color: '#fff',
						fontWeight: 600,
						cursor: 'pointer',
					}}>
					Sign in with Discord
				</button>
			</div>
		);
	}

	if (authState === 'discord_reauth_required') {
		return (
			<div className="not-content" style={styles.fullCenter}>
				<div style={styles.iconBadge('#facc15')}>
					<AlertTriangle size={28} color="#facc15" />
				</div>
				<h2 style={{ margin: '0.5rem 0' }}>Discord session expired</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #9ca0aa)',
						maxWidth: 480,
					}}>
					Your Discord access token has expired or was not captured by
					the last sign-in. Re-sign-in to grant the agents dashboard a
					fresh provider token (used only to verify guild ownership;
					never stored).
				</p>
				<button
					type="button"
					onClick={() => void agentsService.signInWithDiscord()}
					style={{
						marginTop: '1rem',
						padding: '0.55rem 1.1rem',
						borderRadius: 8,
						border: 'none',
						background: '#5865F2',
						color: '#fff',
						fontWeight: 600,
						cursor: 'pointer',
					}}>
					Re-sign-in with Discord
				</button>
			</div>
		);
	}

	return (
		<div
			className="not-content"
			style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
			<GuildPicker
				guilds={guilds}
				loading={guildsLoading}
				error={guildsError}
				selectedGuildId={selectedGuildId}
				onSelect={(id) => agentsService.selectGuild(id)}
			/>

			{selectedGuild ? (
				<TokenList
					guild={selectedGuild}
					tokens={tokens}
					loading={tokensLoading}
					error={tokensError}
					onRefresh={() => void agentsService.refreshSelectedGuild()}
				/>
			) : (
				<EmptyGuildPrompt guildCount={guilds.length} />
			)}
		</div>
	);
}

interface GuildPickerProps {
	guilds: DiscordGuild[];
	loading: boolean;
	error: string | null;
	selectedGuildId: string | null;
	onSelect: (id: string) => void;
}

function GuildPicker({
	guilds,
	loading,
	error,
	selectedGuildId,
	onSelect,
}: GuildPickerProps) {
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
				<Users size={18} color="#58a6ff" />
				<strong>Discord guilds you own</strong>
				{loading && (
					<Loader2
						size={14}
						style={{
							animation: 'spin 1s linear infinite',
							marginLeft: '0.5rem',
						}}
					/>
				)}
			</header>

			<div style={{ padding: '0.85rem 1rem' }}>
				{error && (
					<p
						style={{
							color: '#f87171',
							fontSize: '0.85rem',
							margin: 0,
						}}>
						{error}
					</p>
				)}
				{!error && !loading && guilds.length === 0 && (
					<p
						style={{
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontSize: '0.9rem',
							margin: 0,
						}}>
						You don't own any Discord guilds. Only guild owners can
						manage bot integration tokens.
					</p>
				)}
				{guilds.length > 0 && (
					<div
						style={{
							display: 'grid',
							gridTemplateColumns:
								'repeat(auto-fill, minmax(220px, 1fr))',
							gap: '0.6rem',
						}}>
						{guilds.map((g) => {
							const iconUrl = guildIconUrl(g);
							const active = selectedGuildId === g.id;
							return (
								<button
									key={g.id}
									type="button"
									onClick={() => onSelect(g.id)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '0.65rem',
										padding: '0.6rem 0.75rem',
										borderRadius: 10,
										border: `1px solid ${active ? '#58a6ff' : 'var(--sl-color-gray-5, #2d2f36)'}`,
										background: active
											? 'rgba(88,166,255,0.08)'
											: 'transparent',
										color: 'var(--sl-color-white, #fff)',
										cursor: 'pointer',
										textAlign: 'left',
										transition:
											'border-color 0.15s ease, background 0.15s ease',
									}}>
									{iconUrl ? (
										<img
											src={iconUrl}
											alt=""
											width={36}
											height={36}
											style={{
												borderRadius: 8,
												flexShrink: 0,
											}}
										/>
									) : (
										<div
											aria-hidden
											style={{
												width: 36,
												height: 36,
												borderRadius: 8,
												background: '#374151',
												color: '#e5e7eb',
												display: 'flex',
												alignItems: 'center',
												justifyContent: 'center',
												fontWeight: 700,
												fontSize: '0.8rem',
												flexShrink: 0,
											}}>
											{initials(g.name)}
										</div>
									)}
									<div style={{ minWidth: 0 }}>
										<div
											style={{
												fontWeight: 600,
												overflow: 'hidden',
												textOverflow: 'ellipsis',
												whiteSpace: 'nowrap',
											}}>
											{g.name}
										</div>
										<div
											style={{
												fontSize: '0.7rem',
												color: 'var(--sl-color-gray-3, #9ca0aa)',
												fontFamily:
													'var(--sl-font-mono, ui-monospace, monospace)',
											}}>
											{g.id}
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>
		</section>
	);
}

interface TokenListProps {
	guild: DiscordGuild;
	tokens: AgentTokenRow[];
	loading: boolean;
	error: string | null;
	onRefresh: () => void;
}

function TokenList({
	guild,
	tokens,
	loading,
	error,
	onRefresh,
}: TokenListProps) {
	const [addOpen, setAddOpen] = useState(false);
	const [pendingDelete, setPendingDelete] = useState<AgentTokenRow | null>(
		null,
	);
	const [togglingId, setTogglingId] = useState<string | null>(null);

	async function handleToggle(t: AgentTokenRow) {
		setTogglingId(t.token_id);
		await agentsService.toggleToken(t.token_id, !t.is_active);
		setTogglingId(null);
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
				<KeyRound size={18} color="#a78bfa" />
				<strong>Tokens for {guild.name}</strong>
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
				<button
					type="button"
					onClick={() => setAddOpen(true)}
					style={{
						marginLeft: 'auto',
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
						padding: '0.3rem 0.7rem',
						borderRadius: 6,
						border: 'none',
						background: '#58a6ff',
						color: '#0d1117',
						cursor: 'pointer',
						fontSize: '0.8rem',
						fontWeight: 600,
					}}
					aria-label="Add token">
					<Plus size={14} />
					Add token
				</button>
				<button
					type="button"
					onClick={onRefresh}
					disabled={loading}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.35rem',
						padding: '0.3rem 0.6rem',
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #2d2f36)',
						background: 'transparent',
						color: 'var(--sl-color-white, #fff)',
						cursor: loading ? 'wait' : 'pointer',
						fontSize: '0.8rem',
					}}
					aria-label="Refresh tokens">
					<RefreshCw
						size={14}
						style={
							loading
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
					Refresh
				</button>
			</header>

			<div style={{ padding: '0.85rem 1rem' }}>
				{error && (
					<p
						style={{
							color: '#f87171',
							fontSize: '0.85rem',
							margin: 0,
						}}>
						{error}
					</p>
				)}
				{!error && loading && tokens.length === 0 && (
					<p
						style={{
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontSize: '0.85rem',
							margin: 0,
						}}>
						Loading tokens…
					</p>
				)}
				{!error && !loading && tokens.length === 0 && (
					<p
						style={{
							color: 'var(--sl-color-gray-3, #9ca0aa)',
							fontSize: '0.9rem',
							margin: 0,
						}}>
						No tokens registered for this guild yet.
					</p>
				)}
				{tokens.length > 0 && (
					<div style={{ overflowX: 'auto' }}>
						<table
							style={{
								width: '100%',
								borderCollapse: 'collapse',
								fontSize: '0.85rem',
							}}>
							<thead>
								<tr
									style={{
										textAlign: 'left',
										color: 'var(--sl-color-gray-3, #9ca0aa)',
									}}>
									<th style={{ padding: '0.4rem 0.5rem' }}>
										Name
									</th>
									<th style={{ padding: '0.4rem 0.5rem' }}>
										Service
									</th>
									<th style={{ padding: '0.4rem 0.5rem' }}>
										Description
									</th>
									<th style={{ padding: '0.4rem 0.5rem' }}>
										Active
									</th>
									<th style={{ padding: '0.4rem 0.5rem' }}>
										Created
									</th>
									<th
										style={{
											padding: '0.4rem 0.5rem',
											textAlign: 'right',
										}}>
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{tokens.map((t) => {
									const svc = maskService(t.service);
									return (
										<tr
											key={t.token_id}
											style={{
												borderTop:
													'1px solid var(--sl-color-gray-5, #262626)',
											}}>
											<td style={{ padding: '0.5rem' }}>
												<code
													style={{
														fontFamily:
															'var(--sl-font-mono, ui-monospace, monospace)',
													}}>
													{t.token_name}
												</code>
											</td>
											<td style={{ padding: '0.5rem' }}>
												<span
													style={{
														fontSize: '0.75rem',
														padding:
															'0.15rem 0.5rem',
														borderRadius: 6,
														background: `${svc.color}22`,
														color: svc.color,
													}}>
													{svc.label}
												</span>
											</td>
											<td
												style={{
													padding: '0.5rem',
													color: 'var(--sl-color-gray-2, #c2c5cc)',
												}}>
												{t.description || '—'}
											</td>
											<td style={{ padding: '0.5rem' }}>
												{t.is_active ? (
													<span
														style={{
															color: '#4ade80',
														}}>
														● active
													</span>
												) : (
													<span
														style={{
															color: '#94a3b8',
														}}>
														○ disabled
													</span>
												)}
											</td>
											<td
												style={{
													padding: '0.5rem',
													color: 'var(--sl-color-gray-3, #9ca0aa)',
													fontFamily:
														'var(--sl-font-mono, ui-monospace, monospace)',
													fontSize: '0.78rem',
												}}>
												{formatDate(t.created_at)}
											</td>
											<td
												style={{
													padding: '0.5rem',
													textAlign: 'right',
													whiteSpace: 'nowrap',
												}}>
												<button
													type="button"
													onClick={() =>
														handleToggle(t)
													}
													disabled={
														togglingId ===
														t.token_id
													}
													aria-label={
														t.is_active
															? 'Disable token'
															: 'Enable token'
													}
													title={
														t.is_active
															? 'Disable token'
															: 'Enable token'
													}
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														gap: '0.25rem',
														padding:
															'0.25rem 0.5rem',
														borderRadius: 6,
														border: '1px solid var(--sl-color-gray-5, #2d2f36)',
														background:
															'transparent',
														color: t.is_active
															? '#fbbf24'
															: '#4ade80',
														cursor:
															togglingId ===
															t.token_id
																? 'wait'
																: 'pointer',
														fontSize: '0.75rem',
														marginRight: '0.35rem',
													}}>
													{togglingId ===
													t.token_id ? (
														<Loader2
															size={12}
															style={{
																animation:
																	'spin 1s linear infinite',
															}}
														/>
													) : (
														<Power size={12} />
													)}
													{t.is_active
														? 'Disable'
														: 'Enable'}
												</button>
												<button
													type="button"
													onClick={() =>
														setPendingDelete(t)
													}
													aria-label="Delete token"
													title="Delete token"
													style={{
														display: 'inline-flex',
														alignItems: 'center',
														gap: '0.25rem',
														padding:
															'0.25rem 0.5rem',
														borderRadius: 6,
														border: '1px solid rgba(239,68,68,0.4)',
														background:
															'transparent',
														color: '#f87171',
														cursor: 'pointer',
														fontSize: '0.75rem',
													}}>
													<Trash2 size={12} />
													Delete
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				)}
				<p
					style={{
						marginTop: '0.85rem',
						fontSize: '0.78rem',
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					Token values are written to Supabase Vault encrypted and
					never returned by the dashboard. Use Disable to
					soft-deactivate a token without removing it.
				</p>
			</div>

			{addOpen && <AddTokenModal onClose={() => setAddOpen(false)} />}
			{pendingDelete && (
				<DeleteTokenModal
					token={pendingDelete}
					onClose={() => setPendingDelete(null)}
				/>
			)}
		</section>
	);
}

function EmptyGuildPrompt({ guildCount }: { guildCount: number }) {
	if (guildCount === 0) return null;
	return (
		<section style={styles.sectionBorder}>
			<div style={{ padding: '1rem' }}>
				<p
					style={{
						margin: 0,
						color: 'var(--sl-color-gray-3, #9ca0aa)',
					}}>
					Pick a guild above to view its registered bot tokens.
				</p>
			</div>
		</section>
	);
}
