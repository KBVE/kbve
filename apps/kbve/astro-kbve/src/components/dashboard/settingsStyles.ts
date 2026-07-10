/**
 * @deprecated Cleaned up 2026-07 — /dashboard/account now renders the unified
 * RN AccountScreen from @kbve/rn (web + mobile, one component). This legacy
 * account surface is no longer mounted anywhere. Do not extend it; port any
 * remaining pieces (wallet / market / referral) into @kbve/rn, then delete.
 */
import type { CSSProperties } from 'react';

export const statsGridStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
	gap: '0.75rem',
	marginBottom: '0.75rem',
};

export const statBoxStyle: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '0.25rem',
	padding: '0.5rem 0.75rem',
	borderRadius: '0.5rem',
	background: 'var(--sl-color-bg)',
};

export const statLabelStyle: CSSProperties = {
	fontSize: '0.7rem',
	textTransform: 'uppercase',
	letterSpacing: '0.05em',
	color: 'var(--sl-color-gray-3)',
};

export const statValueStyle: CSSProperties = {
	fontSize: '1rem',
	fontWeight: 600,
	color: 'var(--sl-color-white)',
};

export const progressBarBgStyle: CSSProperties = {
	height: 6,
	borderRadius: 3,
	background: 'var(--sl-color-gray-5)',
	overflow: 'hidden',
};

export const progressBarFillStyle: CSSProperties = {
	height: '100%',
	borderRadius: 3,
	transition: 'width 0.3s',
};

export const dangerButtonStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.35rem',
	padding: '0.5rem 1rem',
	borderRadius: '0.5rem',
	border: '1px solid #ef4444',
	background: 'transparent',
	color: '#ef4444',
	fontSize: '0.8rem',
	fontWeight: 500,
	cursor: 'pointer',
};

export const secondaryButtonStyle: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: '0.35rem',
	padding: '0.5rem 1rem',
	borderRadius: '0.5rem',
	border: '1px solid var(--sl-color-gray-4)',
	background: 'transparent',
	color: 'var(--sl-color-gray-2)',
	fontSize: '0.8rem',
	fontWeight: 500,
	cursor: 'pointer',
};

export const successMsgStyle: CSSProperties = {
	marginTop: '0.75rem',
	padding: '0.5rem 0.75rem',
	borderRadius: '0.5rem',
	background: '#22c55e15',
	color: '#22c55e',
	fontSize: '0.8rem',
};

export const checkListStyle: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: '0.5rem',
	marginBottom: '1rem',
};

export const checkRowStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: '20px 1fr auto',
	gap: '0.5rem',
	alignItems: 'center',
	padding: '0.4rem 0.5rem',
	borderRadius: '0.375rem',
	background: 'var(--sl-color-bg)',
	fontSize: '0.85rem',
};

export const checkLabelStyle: CSSProperties = {
	color: 'var(--sl-color-white)',
	fontWeight: 500,
};

export const checkStatusStyle: CSSProperties = {
	fontSize: '0.75rem',
	color: 'var(--sl-color-gray-3)',
};

export const checkDetailStyle: CSSProperties = {
	gridColumn: '2 / -1',
	fontSize: '0.7rem',
	color: 'var(--sl-color-gray-4)',
	marginTop: '-0.25rem',
};

export const infoGridStyle: CSSProperties = {
	display: 'grid',
	gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
	gap: '0.5rem',
};

export const infoRowStyle: CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	padding: '0.4rem 0.75rem',
	borderRadius: '0.375rem',
	background: 'var(--sl-color-bg)',
	fontSize: '0.85rem',
};

export const infoLabelStyle: CSSProperties = {
	color: 'var(--sl-color-gray-3)',
	fontSize: '0.8rem',
};

export const infoValueStyle: CSSProperties = {
	color: 'var(--sl-color-white)',
	fontWeight: 500,
	fontSize: '0.8rem',
	textAlign: 'right',
	maxWidth: '60%',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

export function setCardBadge(anchor: HTMLElement | null, text: string | null) {
	const root = anchor?.closest('[data-settingscard-root]');
	const badge = root?.querySelector(
		'[data-slot="badge"]',
	) as HTMLElement | null;
	if (!badge) return;
	if (text) {
		badge.textContent = text;
		badge.hidden = false;
	} else {
		badge.hidden = true;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
