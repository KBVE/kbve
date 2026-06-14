import { useState } from 'react';
import { useStore } from '@nanostores/react';
import { forgejoService } from './forgejoService';
import { ActionButton, SelectField, useTabActive, uiTokens } from './forgejoUi';
import { Cpu, KeyRound, Copy, Check } from 'lucide-react';

const { textColor, subText, border, panelBg } = uiTokens;

function TokenBox({ token }: { token: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				padding: '0.6rem 0.75rem',
				borderRadius: 8,
				border,
				background: 'var(--sl-color-bg, #0d1117)',
				marginTop: '0.75rem',
			}}>
			<KeyRound size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
			<code
				style={{
					flex: 1,
					color: textColor,
					fontSize: '0.78rem',
					wordBreak: 'break-all',
				}}>
				{token}
			</code>
			<ActionButton
				size="sm"
				onClick={() => {
					navigator.clipboard?.writeText(token);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				}}>
				{copied ? <Check size={12} /> : <Copy size={12} />}
			</ActionButton>
		</div>
	);
}

export default function ReactForgejoRunners() {
	const active = useTabActive('runners');
	const repos = useStore(forgejoService.$repos);
	const orgs = useStore(forgejoService.$orgs);
	const scope = useStore(forgejoService.$runnerScope);
	const runners = useStore(forgejoService.$runners);
	const token = useStore(forgejoService.$runnerToken);
	const busy = useStore(forgejoService.$busy);

	if (!active) return null;

	const options = [
		{ value: 'instance', label: 'Instance (admin)' },
		...orgs.map((o) => ({
			value: `org:${o.username}`,
			label: `${o.username} (org)`,
		})),
		...repos.map((r) => ({ value: r.full_name, label: r.full_name })),
	];

	const isScoped = scope !== 'instance';

	return (
		<div className="not-content">
			<div
				style={{
					display: 'flex',
					gap: 12,
					alignItems: 'flex-end',
					flexWrap: 'wrap',
					marginBottom: '1.25rem',
				}}>
				<div style={{ flex: '1 1 280px', maxWidth: 420 }}>
					<SelectField
						label="Runner scope"
						value={scope}
						onChange={(v) => forgejoService.setRunnerScope(v)}
						options={options}
					/>
				</div>
				<div style={{ marginBottom: '0.75rem' }}>
					<ActionButton
						variant="primary"
						loading={busy === 'runner-token'}
						onClick={() => forgejoService.genRunnerToken()}>
						<KeyRound size={14} /> Registration token
					</ActionButton>
				</div>
			</div>

			<p style={{ color: subText, fontSize: '0.8rem', marginTop: 0 }}>
				Generate a registration token, then register a self-hosted
				runner:{' '}
				<code style={{ color: textColor }}>
					forgejo-runner register --instance &lt;url&gt; --token
					&lt;token&gt;
				</code>
			</p>

			{token && <TokenBox token={token} />}

			{isScoped && (
				<div style={{ marginTop: '1.5rem' }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 6,
							fontSize: '0.8rem',
							fontWeight: 700,
							color: textColor,
							marginBottom: '0.75rem',
						}}>
						<Cpu size={14} /> Registered runners
					</div>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 8,
						}}>
						{runners.map((r, i) => (
							<div
								key={r.id ?? i}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 8,
									padding: '0.5rem 0.7rem',
									borderRadius: 8,
									border,
									background: panelBg,
								}}>
								<span
									style={{
										width: 8,
										height: 8,
										borderRadius: '50%',
										background:
											r.status === 'online' ||
											r.status === 'idle'
												? '#22c55e'
												: '#6b7280',
										flexShrink: 0,
									}}
								/>
								<span
									style={{
										color: textColor,
										fontSize: '0.82rem',
										flex: 1,
									}}>
									{r.name ?? `runner-${r.id ?? i}`}
								</span>
								{r.status && (
									<span
										style={{
											color: subText,
											fontSize: '0.7rem',
										}}>
										{r.status}
									</span>
								)}
								{Array.isArray(r.labels) &&
									r.labels.length > 0 && (
										<span
											style={{
												color: subText,
												fontSize: '0.68rem',
											}}>
											{r.labels.join(', ')}
										</span>
									)}
							</div>
						))}
						{runners.length === 0 && (
							<span
								style={{ color: subText, fontSize: '0.8rem' }}>
								No runners registered for this scope.
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
