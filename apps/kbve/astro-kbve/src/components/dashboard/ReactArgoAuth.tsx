import { useEffect, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { argoService } from './argoService';
import { Loader2, LogIn, ShieldOff } from 'lucide-react';

const fullCenter: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	minHeight: '40vh',
	textAlign: 'center',
};

export default function ReactArgoAuth({ children }: { children: ReactNode }) {
	const authState = useStore(argoService.$authState);

	useEffect(() => {
		argoService.initAuth();
	}, []);

	if (authState === 'loading') {
		return (
			<div className="not-content" style={fullCenter}>
				<Loader2
					size={28}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						marginTop: 12,
					}}>
					Authenticating...
				</p>
			</div>
		);
	}

	if (authState === 'unauthenticated') {
		return (
			<div className="not-content" style={fullCenter}>
				<div
					style={{
						width: 56,
						height: 56,
						borderRadius: 14,
						background: 'rgba(139, 92, 246, 0.1)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						marginBottom: '0.5rem',
					}}>
					<LogIn size={24} style={{ color: '#8b5cf6' }} />
				</div>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: '0.5rem 0 0.25rem',
						fontSize: '1.25rem',
						fontWeight: 600,
					}}>
					Sign In Required
				</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
						fontSize: '0.85rem',
					}}>
					Authentication is required to access the ArgoCD dashboard.
				</p>
			</div>
		);
	}

	if (authState === 'forbidden') {
		return (
			<div className="not-content" style={fullCenter}>
				<div
					style={{
						width: 56,
						height: 56,
						borderRadius: 14,
						background: 'rgba(239, 68, 68, 0.1)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						marginBottom: '0.5rem',
					}}>
					<ShieldOff size={24} style={{ color: '#ef4444' }} />
				</div>
				<h2
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						margin: '0.5rem 0 0.25rem',
						fontSize: '1.25rem',
						fontWeight: 600,
					}}>
					Access Restricted
				</h2>
				<p
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						margin: 0,
						fontSize: '0.85rem',
					}}>
					You do not have permission to view this dashboard.
				</p>
			</div>
		);
	}

	return <>{children}</>;
}
