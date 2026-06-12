import type { ReactNode, CSSProperties } from 'react';
import { styles } from '../../dashboard/dashboard-ui';

export const GITHUB_OWNER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}$/;
export const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export const WEBHOOK_TOKEN_NAME = 'github-webhook-hmac';
export const WEBHOOK_SERVICE = 'github_webhook';
export const PAT_TOKEN_NAME = 'github-pat';
export const PAT_SERVICE = 'github';

export function genHex(bytes = 32): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

export const spinStyle: CSSProperties = {
	animation: 'spin 1s linear infinite',
	color: 'var(--sl-color-accent, #58a6ff)',
};

export const mutedText: CSSProperties = {
	margin: 0,
	fontSize: '0.88rem',
	color: 'var(--sl-color-gray-2, #c2c5cc)',
	lineHeight: 1.55,
};

export const errText: CSSProperties = {
	margin: 0,
	color: '#f87171',
	fontSize: '0.85rem',
};

export const inputStyle: CSSProperties = {
	background: 'rgba(255,255,255,0.04)',
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	borderRadius: 6,
	color: 'var(--sl-color-white, #fff)',
	padding: '0.5rem 0.65rem',
	fontSize: '0.9rem',
	width: '100%',
	boxSizing: 'border-box',
};

export const primaryBtn: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.4rem',
	padding: '0.45rem 0.9rem',
	borderRadius: 8,
	border: 'none',
	background: '#58a6ff',
	color: '#0d1117',
	fontWeight: 600,
	cursor: 'pointer',
};

export const secondaryBtn: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.4rem',
	padding: '0.45rem 0.9rem',
	borderRadius: 8,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
};

export const iconBtn: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.25rem',
	padding: '0.35rem 0.55rem',
	borderRadius: 6,
	border: '1px solid var(--sl-color-gray-5, #2d2f36)',
	background: 'transparent',
	color: 'var(--sl-color-white, #fff)',
	cursor: 'pointer',
	fontSize: '0.78rem',
};

export function CenterMsg({
	icon,
	msg,
	cta,
}: {
	icon: ReactNode;
	msg: string;
	cta?: ReactNode;
}) {
	return (
		<div className="not-content" style={styles.fullCenter}>
			<div style={styles.iconBadge('#58a6ff')}>{icon}</div>
			<p
				style={{
					color: 'var(--sl-color-gray-3, #9ca0aa)',
					maxWidth: 480,
					margin: '0.5rem 0',
				}}>
				{msg}
			</p>
			{cta && <div style={{ marginTop: '0.5rem' }}>{cta}</div>}
		</div>
	);
}
