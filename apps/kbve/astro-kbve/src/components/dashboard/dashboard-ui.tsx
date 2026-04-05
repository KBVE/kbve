/**
 * dashboard-ui.tsx — shared dashboard primitives.
 *
 * Reusable components for auth gates, buttons, badges, and layout
 * that are duplicated across 6+ dashboard pages. Each component uses
 * useRef where possible to avoid unnecessary re-renders.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import type { ReadableAtom } from 'nanostores';
import {
	Loader2,
	LogIn,
	ShieldOff,
	RefreshCw,
	ChevronRight,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Shared styles (constants, not JSX — no vDOM cost)
// ---------------------------------------------------------------------------

export const styles = {
	fullCenter: {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		minHeight: '40vh',
		textAlign: 'center',
	} as React.CSSProperties,

	iconBadge: (color: string) =>
		({
			width: 56,
			height: 56,
			borderRadius: 14,
			background: `${color}18`,
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			marginBottom: '0.5rem',
		}) as React.CSSProperties,

	sectionBorder: {
		border: '1px solid var(--sl-color-gray-5, #262626)',
		borderRadius: 12,
		background: 'var(--sl-color-bg-nav, #111)',
		overflow: 'hidden' as const,
	},
};

// ---------------------------------------------------------------------------
// AuthGate — generic auth wrapper for all dashboard pages
// ---------------------------------------------------------------------------

type AuthState = 'loading' | 'authenticated' | 'unauthenticated' | 'forbidden';

interface AuthGateProps {
	$authState: ReadableAtom<AuthState>;
	initAuth: () => void;
	serviceName: string;
	children: ReactNode;
}

/**
 * Wraps dashboard content with auth checks. Renders loading, sign-in,
 * or forbidden states without the child vDOM tree ever mounting.
 */
export function AuthGate({
	$authState,
	initAuth,
	serviceName,
	children,
}: AuthGateProps) {
	const authState = useStore($authState);

	useEffect(() => {
		initAuth();
	}, [initAuth]);

	if (authState === 'loading') {
		return (
			<div className="not-content" style={styles.fullCenter}>
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
			<div className="not-content" style={styles.fullCenter}>
				<div style={styles.iconBadge('#8b5cf6')}>
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
					Authentication is required to access the {serviceName}.
				</p>
			</div>
		);
	}

	if (authState === 'forbidden') {
		return (
			<div className="not-content" style={styles.fullCenter}>
				<div style={styles.iconBadge('#ef4444')}>
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

// ---------------------------------------------------------------------------
// RefreshButton — shared refresh control for all headers
// ---------------------------------------------------------------------------

interface RefreshButtonProps {
	onClick: () => void;
	loading?: boolean;
	label?: string;
}

export function RefreshButton({
	onClick,
	loading = false,
	label = 'Refresh',
}: RefreshButtonProps) {
	return (
		<button
			onClick={onClick}
			disabled={loading}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 6,
				padding: '0.4rem 0.8rem',
				borderRadius: 8,
				border: '1px solid var(--sl-color-gray-5, #30363d)',
				background: 'var(--sl-color-gray-6, #161b22)',
				color: 'var(--sl-color-text, #e6edf3)',
				cursor: loading ? 'not-allowed' : 'pointer',
				opacity: loading ? 0.6 : 1,
				fontSize: '0.8rem',
				fontWeight: 500,
				transition: 'opacity 0.15s',
			}}>
			<RefreshCw
				size={14}
				style={
					loading
						? { animation: 'spin 1s linear infinite' }
						: undefined
				}
			/>
			{label}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Section — collapsible container using useRef for direct DOM manipulation
// ---------------------------------------------------------------------------

interface SectionProps {
	id: string;
	title: string;
	accentColor?: string;
	defaultOpen?: boolean;
	badge?: string;
	children: ReactNode;
}

const STORAGE_PREFIX = 'dash-section-';

/**
 * Collapsible section that uses useRef to toggle visibility directly
 * on the DOM node — no state change, no re-render of children.
 * Persists open/closed to localStorage.
 */
export function Section({
	id,
	title,
	accentColor = '#8b5cf6',
	defaultOpen = true,
	badge,
	children,
}: SectionProps) {
	const contentRef = useRef<HTMLDivElement>(null);
	const chevronRef = useRef<SVGSVGElement>(null);
	const key = STORAGE_PREFIX + id;

	// Restore saved state on mount — direct DOM, no React state
	useEffect(() => {
		const saved = localStorage.getItem(key);
		const isOpen = saved !== null ? saved === '1' : defaultOpen;
		if (contentRef.current) {
			contentRef.current.style.display = isOpen ? '' : 'none';
		}
		if (chevronRef.current) {
			chevronRef.current.style.transform = isOpen
				? 'rotate(90deg)'
				: 'rotate(0deg)';
		}
	}, [key, defaultOpen]);

	const toggle = () => {
		const el = contentRef.current;
		const chev = chevronRef.current;
		if (!el) return;
		const opening = el.style.display === 'none';
		el.style.display = opening ? '' : 'none';
		if (chev) {
			chev.style.transform = opening ? 'rotate(90deg)' : 'rotate(0deg)';
		}
		localStorage.setItem(key, opening ? '1' : '0');
	};

	return (
		<div style={styles.sectionBorder}>
			<div
				onClick={toggle}
				role="button"
				tabIndex={0}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') toggle();
				}}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: '0.5rem',
					padding: '0.75rem 1rem',
					cursor: 'pointer',
					userSelect: 'none',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				}}>
				<ChevronRight
					ref={chevronRef}
					size={16}
					style={{
						color: 'var(--sl-color-gray-3, #8b949e)',
						transition: 'transform 0.15s ease',
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						fontWeight: 600,
						fontSize: '0.95rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					{title}
				</span>
				{badge && (
					<span
						style={{
							fontSize: '0.7rem',
							fontWeight: 600,
							padding: '2px 8px',
							borderRadius: 10,
							background: `${accentColor}22`,
							color: accentColor,
						}}>
						{badge}
					</span>
				)}
			</div>
			<div ref={contentRef} style={{ padding: '1rem' }}>
				{children}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// CachedBadge — small "cached" indicator for data freshness
// ---------------------------------------------------------------------------

export function CachedBadge({ visible }: { visible: boolean }) {
	if (!visible) return null;
	return (
		<span
			style={{
				marginLeft: '0.75rem',
				padding: '2px 8px',
				borderRadius: 4,
				background: 'var(--sl-color-gray-6, #1c1c1c)',
				color: 'var(--sl-color-gray-3, #8b949e)',
				fontSize: '0.7rem',
				fontWeight: 500,
				textTransform: 'uppercase' as const,
				letterSpacing: '0.05em',
			}}>
			cached
		</span>
	);
}
