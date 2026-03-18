import { useEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { useAuthBridge } from '@/components/auth';
import { grafanaService } from './grafanaService';
import { Loader2, LogIn, ShieldOff } from 'lucide-react';

const centered: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	gap: '1rem',
	minHeight: '40vh',
	textAlign: 'center',
};

export default function ReactGrafanaAuth({
	children,
}: {
	children: ReactNode;
}) {
	const state = useStore(grafanaService.$state);
	const { signInWithOAuth, loading: authLoading } = useAuthBridge();

	useEffect(() => {
		grafanaService.initAuth();
	}, []);

	if (state === 'loading') {
		return (
			<div className="not-content" style={centered}>
				<Loader2
					size={32}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
					}}>
					Loading dashboard...
				</p>
			</div>
		);
	}

	if (state === 'unauthenticated') {
		return (
			<div className="not-content" style={centered}>
				<LogIn size={48} style={{ color: 'var(--sl-color-gray-3)' }} />
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: 0,
						fontSize: '1.5rem',
					}}>
					Sign in to view dashboard
				</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
					}}>
					Authentication is required to access cluster metrics.
				</p>
				<div
					style={{
						display: 'flex',
						gap: '0.75rem',
						flexWrap: 'wrap',
						justifyContent: 'center',
						marginTop: '0.5rem',
					}}>
					{(['github', 'discord', 'twitch'] as const).map(
						(provider) => (
							<button
								key={provider}
								onClick={() => signInWithOAuth(provider)}
								disabled={authLoading}
								style={{
									padding: '0.5rem 1.25rem',
									borderRadius: '8px',
									border: '1px solid var(--sl-color-gray-5, #262626)',
									background: 'var(--sl-color-bg-nav, #111)',
									color: 'var(--sl-color-text, #e6edf3)',
									cursor: 'pointer',
									fontSize: '0.875rem',
									fontWeight: 500,
									transition: 'border-color 0.2s',
								}}>
								{provider.charAt(0).toUpperCase() +
									provider.slice(1)}
							</button>
						),
					)}
				</div>
			</div>
		);
	}

	if (state === 'forbidden') {
		return (
			<div className="not-content" style={centered}>
				<ShieldOff
					size={48}
					style={{ color: 'var(--sl-color-gray-3)' }}
				/>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: 0,
						fontSize: '1.5rem',
					}}>
					Access Restricted
				</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
					}}>
					Your account does not have permission to view the monitoring
					dashboard. Contact an administrator if you believe this is
					an error.
				</p>
			</div>
		);
	}

	return <>{children}</>;
}
