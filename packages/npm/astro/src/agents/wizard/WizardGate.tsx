import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { AlertTriangle, LogIn, Loader2, Webhook } from 'lucide-react';
import { useAgents } from '../context';
import ReactAgentGuildPicker from '../ReactAgentGuildPicker';
import { CenterMsg, primaryBtn, spinStyle } from './shared';

export default function WizardGate() {
	const agents = useAgents();
	const authState = useStore(agents.$authState);
	const guilds = useStore(agents.$guilds);
	const selectedGuildId = useStore(agents.$selectedGuildId);
	const anchorRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		void agents.initAuth();
	}, []);

	const guild = guilds.find((g) => g.id === selectedGuildId) ?? null;
	const ready = authState === 'authenticated' && !!guild;

	useEffect(() => {
		const root = anchorRef.current?.closest('[data-wizard-root]');
		const steps = root?.querySelector(
			'[data-wizard-steps]',
		) as HTMLElement | null;
		if (steps) steps.hidden = !ready;
	}, [ready]);

	return (
		<>
			<span ref={anchorRef} hidden aria-hidden="true" />
			{authState === 'loading' && (
				<CenterMsg
					icon={<Loader2 size={28} style={spinStyle} />}
					msg="Loading session…"
				/>
			)}
			{authState === 'unauthenticated' && (
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
			)}
			{authState === 'discord_reauth_required' && (
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
			)}
			{authState === 'authenticated' &&
				(!guild ? (
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
							The wizard provisions per-guild Vault rows that any
							KBVE agent (discordsh today, future PR-review / CI /
							chatops bots later) can consume. Guild selection is
							shared across the whole agents surface.
						</p>
					</div>
				) : (
					<div
						className="not-content"
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: '1rem',
						}}>
						<ReactAgentGuildPicker title="Configuring GitHub for" />
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
								<div style={{ fontWeight: 600 }}>
									GitHub provider setup
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
					</div>
				))}
		</>
	);
}
