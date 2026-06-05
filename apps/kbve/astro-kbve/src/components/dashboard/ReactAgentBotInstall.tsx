import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	AlertTriangle,
	CheckCircle2,
	ExternalLink,
	Loader2,
	RefreshCw,
} from 'lucide-react';
import { agentsService } from './agentsService';
import { styles } from './dashboard-ui';

type Status =
	| 'idle'
	| 'checking'
	| 'present'
	| 'missing'
	| 'error'
	| 'unconfigured';

export default function ReactAgentBotInstall() {
	const guilds = useStore(agentsService.$guilds);
	const selectedGuildId = useStore(agentsService.$selectedGuildId);
	const [status, setStatus] = useState<Status>('idle');
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const guild = useMemo(
		() => guilds.find((g) => g.id === selectedGuildId) ?? null,
		[guilds, selectedGuildId],
	);

	const installUrl = useMemo(
		() =>
			selectedGuildId
				? agentsService.botInstallUrl(selectedGuildId)
				: null,
		[selectedGuildId],
	);

	async function probe() {
		if (!selectedGuildId) return;
		setStatus('checking');
		setErrorMsg(null);
		const r = await agentsService.isBotMember(selectedGuildId);
		if (!r.ok) {
			if (
				r.error.includes('DISCORD_BOT_CLIENT_ID') ||
				r.error.includes('not configured')
			) {
				setStatus('unconfigured');
			} else {
				setStatus('error');
			}
			setErrorMsg(r.error);
			return;
		}
		setStatus(r.isMember ? 'present' : 'missing');
	}

	useEffect(() => {
		setStatus('idle');
		setErrorMsg(null);
		if (selectedGuildId) void probe();
	}, [selectedGuildId]);

	if (!guild) return null;

	const dot = (() => {
		if (status === 'present') {
			return <CheckCircle2 size={18} color="#4ade80" />;
		}
		if (status === 'checking' || status === 'idle') {
			return (
				<Loader2
					size={18}
					color="#94a3b8"
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			);
		}
		return <AlertTriangle size={18} color="#facc15" />;
	})();

	const heading = (() => {
		if (status === 'present') return `KBVE bot is in ${guild.name}`;
		if (status === 'missing') return `KBVE bot not in ${guild.name}`;
		if (status === 'unconfigured') return 'Bot presence check unavailable';
		if (status === 'error') return 'Bot presence check failed';
		return `Checking bot presence in ${guild.name}…`;
	})();

	const subline = (() => {
		if (status === 'present') {
			return 'Routing should work once the rest of the wizard is green.';
		}
		if (status === 'missing') {
			return 'Click install to add the KBVE bot to this guild. Discord will open the standard authorize screen.';
		}
		if (status === 'unconfigured') {
			return 'Edge fn needs DISCORD_BOT_CLIENT_ID env wired. Falls back to manual install link.';
		}
		if (status === 'error') {
			return errorMsg ?? 'Try again in a moment.';
		}
		return null;
	})();

	const showInstall =
		status === 'missing' || status === 'unconfigured' || status === 'error';

	return (
		<section style={styles.sectionBorder}>
			<div
				style={{
					padding: '0.85rem 1rem',
					display: 'flex',
					alignItems: 'center',
					gap: '0.7rem',
				}}>
				<div
					style={{
						width: 32,
						height: 32,
						borderRadius: 8,
						background:
							status === 'present'
								? 'rgba(74,222,128,0.12)'
								: 'rgba(250,204,21,0.12)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}>
					{dot}
				</div>
				<div style={{ flex: 1, minWidth: 0 }}>
					<strong>{heading}</strong>
					{subline && (
						<div
							style={{
								fontSize: '0.78rem',
								color: 'var(--sl-color-gray-3, #9ca0aa)',
								marginTop: 2,
							}}>
							{subline}
						</div>
					)}
				</div>
				<button
					type="button"
					onClick={() => void probe()}
					disabled={status === 'checking'}
					aria-label="Re-check bot presence"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.3rem',
						padding: '0.3rem 0.6rem',
						borderRadius: 6,
						border: '1px solid var(--sl-color-gray-5, #2d2f36)',
						background: 'transparent',
						color: 'var(--sl-color-white, #fff)',
						fontSize: '0.75rem',
						cursor: status === 'checking' ? 'wait' : 'pointer',
					}}>
					<RefreshCw
						size={12}
						style={
							status === 'checking'
								? { animation: 'spin 1s linear infinite' }
								: undefined
						}
					/>
					Re-check
				</button>
				{showInstall &&
					(installUrl ? (
						<a
							href={installUrl}
							target="_blank"
							rel="noopener noreferrer"
							style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: '0.35rem',
								padding: '0.35rem 0.7rem',
								borderRadius: 6,
								background: '#5865F2',
								color: '#fff',
								fontWeight: 600,
								fontSize: '0.78rem',
								textDecoration: 'none',
							}}>
							<ExternalLink size={12} />
							Install bot
						</a>
					) : (
						<span
							style={{
								fontSize: '0.72rem',
								color: '#f87171',
								padding: '0.2rem 0.4rem',
							}}
							title="Set PUBLIC_DISCORD_BOT_CLIENT_ID at build time">
							Install link unavailable (build env missing)
						</span>
					))}
			</div>
			{status === 'error' && errorMsg && (
				<div
					style={{
						padding: '0.5rem 1rem 0.85rem 1rem',
						color: '#f87171',
						fontSize: '0.75rem',
						borderTop: '1px solid var(--sl-color-gray-5, #1f2024)',
					}}>
					{errorMsg}
				</div>
			)}
		</section>
	);
}
