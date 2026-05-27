import { useStore } from '@nanostores/react';
import { Loader2, Users } from 'lucide-react';
import { agentsService, type DiscordGuild } from './agentsService';
import { styles } from './dashboard-ui';

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

interface GuildPickerProps {
	title?: string;
}

export default function ReactAgentGuildPicker({
	title = 'Discord guilds you own',
}: GuildPickerProps) {
	const guilds = useStore(agentsService.$guilds);
	const loading = useStore(agentsService.$guildsLoading);
	const error = useStore(agentsService.$guildsError);
	const selectedGuildId = useStore(agentsService.$selectedGuildId);

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
				<strong>{title}</strong>
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
									onClick={() =>
										agentsService.selectGuild(g.id)
									}
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
