import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { Loader2, LogIn, ShieldOff } from 'lucide-react';
import { clickhouseService } from './clickhouseService';

export default function ReactCHAuth({
	children,
}: {
	children: React.ReactNode;
}) {
	const authState = useStore(clickhouseService.$authState);

	useEffect(() => {
		clickhouseService.initAuth();
	}, []);

	if (authState === 'loading') {
		return (
			<div className="not-content" style={centeredStyle}>
				<Loader2
					size={28}
					style={{
						animation: 'spin 1s linear infinite',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}
				/>
				<p style={subtextStyle}>Authenticating...</p>
			</div>
		);
	}

	if (authState === 'unauthenticated') {
		return (
			<div className="not-content" style={centeredStyle}>
				<div style={iconWrapperStyle}>
					<LogIn
						size={24}
						style={{ color: 'var(--sl-color-accent, #06b6d4)' }}
					/>
				</div>
				<h2 style={titleStyle}>Sign In Required</h2>
				<p style={msgStyle}>
					Authentication is required to access the ClickHouse logs
					dashboard.
				</p>
			</div>
		);
	}

	if (authState === 'forbidden') {
		return (
			<div className="not-content" style={centeredStyle}>
				<div style={iconWrapperStyle}>
					<ShieldOff size={24} style={{ color: '#f59e0b' }} />
				</div>
				<h2 style={titleStyle}>Access Restricted</h2>
				<p style={msgStyle}>
					You do not have permission to access the ClickHouse
					dashboard. Contact an administrator for access.
				</p>
			</div>
		);
	}

	return <>{children}</>;
}

const centeredStyle: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	justifyContent: 'center',
	gap: 0,
	minHeight: '40vh',
	textAlign: 'center',
};

const iconWrapperStyle: React.CSSProperties = {
	width: 56,
	height: 56,
	borderRadius: 14,
	background: 'rgba(245, 158, 11, 0.1)',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	marginBottom: '0.5rem',
};

const subtextStyle: React.CSSProperties = {
	color: 'var(--sl-color-gray-3)',
	margin: '0.75rem 0 0',
	fontSize: '0.9rem',
};

const titleStyle: React.CSSProperties = {
	color: 'var(--sl-color-text, #e6edf3)',
	margin: '0.5rem 0 0.25rem',
	fontSize: '1.25rem',
	fontWeight: 600,
};

const msgStyle: React.CSSProperties = {
	color: 'rgba(255, 255, 255, 0.6)',
	margin: 0,
	fontSize: '0.85rem',
};
