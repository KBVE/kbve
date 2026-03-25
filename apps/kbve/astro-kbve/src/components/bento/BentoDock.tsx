/**
 * BentoDock — Right sidebar panel showing hidden bento cards.
 *
 * Subscribes to bentoStore and renders hidden cards as clickable
 * icon pills. Click to restore a card to the grid.
 *
 * Mounted as a separate React island inside PageSidebar.astro.
 */

import { useStore } from '@nanostores/react';
import {
	$hiddenCardIds,
	$editMode,
	$bentoLayout,
	showCard,
	resetLayout,
	toggleEditMode,
} from './bentoStore';

// ── Lucide icon paths ──

const ICON_PATHS: Record<string, string[]> = {
	'trending-up': ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7 22 7 22 13'],
	bitcoin: [
		'M11.767 19.089c4.924.868 6.14-6.025 1.216-6.894m-1.216 6.894L5.86 18.047m5.908 1.042-.347 1.97m1.563-8.864c4.924.869 6.14-6.025 1.215-6.893m-1.215 6.893-6.914-1.218m6.914 1.218-.346 1.966m.693-3.932L14.228 2m-8.02 16.047-1.85-5.52.002-.002c-.484-1.441.084-3.3 1.236-4.044l.003-.002c.965-.622 2.043-.467 2.992-.07m5.636 1.748L5.248 7.96m8.98 1.582 1.696-1.218m-8.742 9.09L5.554 5.57',
	],
	pickaxe: [
		'M14.531 12.469 6.619 20.38a1 1 0 1 1-3-3l7.912-7.912',
		'M15.686 4.314A12.5 12.5 0 0 0 5.461 2.958 1 1 0 0 0 5.58 4.71a22 22 0 0 1 6.318 3.393',
		'M17.7 3.7a1 1 0 0 0-1.4 0l-4.6 4.6a1 1 0 0 0 0 1.4l2.6 2.6a1 1 0 0 0 1.4 0l4.6-4.6a1 1 0 0 0 0-1.4z',
		'M19.686 8.314a12.5 12.5 0 0 1 1.356 10.225 1 1 0 0 1-1.751-.119 22 22 0 0 0-3.393-6.318',
	],
	wallet: [
		'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
		'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
	],
	zap: [
		'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
	],
	landmark: [
		'M3 22h18',
		'M6 18v-7',
		'M10 18v-7',
		'M14 18v-7',
		'M18 18v-7',
		'M12 2 20 7 4 7z',
	],
	'bar-chart-3': ['M3 3v18h18', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
	hourglass: [
		'M5 22h14',
		'M5 2h14',
		'M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22',
		'M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2',
	],
	'file-text': [
		'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z',
		'M14 2v4a2 2 0 0 0 2 2h4',
		'M10 9H8',
		'M16 13H8',
		'M16 17H8',
	],
};

function LucideIcon({ name, size = 16 }: { name: string; size?: number }) {
	const paths = ICON_PATHS[name];
	if (!paths) return null;
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round">
			{paths.map((d, i) => (
				<path key={i} d={d} />
			))}
		</svg>
	);
}

// ── Styles ──

const styles = {
	container: {
		padding: '0.75rem',
		borderTop: '1px solid rgba(255, 255, 255, 0.06)',
	} as React.CSSProperties,
	header: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: '0.5rem',
	} as React.CSSProperties,
	label: {
		fontSize: '0.7rem',
		fontWeight: 600,
		color: 'var(--sl-color-gray-3, #9ca3af)',
		textTransform: 'uppercase' as const,
		letterSpacing: '0.05em',
	} as React.CSSProperties,
	controls: {
		display: 'flex',
		gap: '0.375rem',
	} as React.CSSProperties,
	controlBtn: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		gap: '0.375rem',
		flex: 1,
		fontSize: '0.7rem',
		fontWeight: 500,
		padding: '0.375rem 0.5rem',
		borderRadius: '0.5rem',
		border: '1px solid rgba(255, 255, 255, 0.1)',
		background: 'rgba(255, 255, 255, 0.04)',
		color: 'var(--sl-color-gray-2, #d1d5db)',
		cursor: 'pointer',
		transition: 'all 0.15s',
	} as React.CSSProperties,
	controlBtnActive: {
		background: 'rgba(56, 189, 248, 0.1)',
		borderColor: 'rgba(56, 189, 248, 0.3)',
		color: '#38bdf8',
	} as React.CSSProperties,
	list: {
		display: 'flex',
		flexDirection: 'column' as const,
		gap: '0.375rem',
	} as React.CSSProperties,
	item: {
		display: 'flex',
		alignItems: 'center',
		gap: '0.5rem',
		padding: '0.5rem 0.625rem',
		borderRadius: '0.5rem',
		border: '1px solid rgba(255, 255, 255, 0.06)',
		background: 'rgba(255, 255, 255, 0.03)',
		color: 'var(--sl-color-gray-2, #d1d5db)',
		fontSize: '0.75rem',
		cursor: 'pointer',
		transition: 'all 0.15s',
		width: '100%',
		textAlign: 'left' as const,
	} as React.CSSProperties,
	iconWrap: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '1.75rem',
		height: '1.75rem',
		borderRadius: '0.375rem',
		background: 'rgba(255, 255, 255, 0.05)',
		color: 'var(--sl-color-text-accent, #38bdf8)',
		flexShrink: 0,
	} as React.CSSProperties,
	itemTitle: {
		flex: 1,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap' as const,
	} as React.CSSProperties,
	restoreLabel: {
		fontSize: '0.6rem',
		color: 'var(--sl-color-text-accent, #38bdf8)',
		opacity: 0.7,
	} as React.CSSProperties,
	empty: {
		fontSize: '0.7rem',
		color: 'var(--sl-color-gray-3, #6b7280)',
		textAlign: 'center' as const,
		padding: '0.75rem 0',
		opacity: 0.6,
	} as React.CSSProperties,
};

export default function BentoDock() {
	const hiddenIds = useStore($hiddenCardIds);
	const editMode = useStore($editMode);
	const layout = useStore($bentoLayout);

	// Only render if there's a bento grid on this page
	if (layout.length === 0) return null;

	// Read card metadata from DOM (same source as ReactBentoGrid)
	const getCardMeta = (id: string) => {
		const el = document.querySelector(`[data-bento-id="${id}"]`);
		if (!el) return { title: id, icon: 'file-text' };
		try {
			const meta = JSON.parse(
				(el as HTMLElement).dataset.bentoMeta || '{}',
			);
			return { title: meta.title || id, icon: meta.icon || 'file-text' };
		} catch {
			return { title: id, icon: 'file-text' };
		}
	};

	return (
		<div style={styles.container}>
			{/* Header */}
			<div style={styles.header}>
				<span style={styles.label}>Dashboard</span>
			</div>

			{/* Global controls */}
			<div style={styles.controls}>
				<button
					style={{
						...styles.controlBtn,
						...(editMode ? styles.controlBtnActive : {}),
					}}
					onClick={toggleEditMode}
					title={
						editMode
							? 'Unlocked — click to lock all cards'
							: 'Locked — click to allow card editing'
					}>
					{editMode ? (
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round">
							<rect
								width="18"
								height="11"
								x="3"
								y="11"
								rx="2"
								ry="2"
							/>
							<path d="M7 11V7a5 5 0 0 1 9.9-1" />
						</svg>
					) : (
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round">
							<rect
								width="18"
								height="11"
								x="3"
								y="11"
								rx="2"
								ry="2"
							/>
							<path d="M7 11V7a5 5 0 0 1 10 0v4" />
						</svg>
					)}
					<span>{editMode ? 'Unlocked' : 'Locked'}</span>
				</button>

				<button
					style={styles.controlBtn}
					onClick={() => resetLayout()}
					title="Reset to default layout">
					<svg
						width="13"
						height="13"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round">
						<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
						<path d="M3 3v5h5" />
					</svg>
					<span>Reset</span>
				</button>
			</div>

			{/* Hidden cards */}
			{hiddenIds.length > 0 && (
				<>
					<div
						style={{
							...styles.label,
							marginTop: '0.75rem',
							marginBottom: '0.375rem',
						}}>
						Hidden ({hiddenIds.length})
					</div>
					<div style={styles.list}>
						{hiddenIds.map((id) => {
							const { title, icon } = getCardMeta(id);
							return (
								<button
									key={id}
									style={styles.item}
									onClick={() => showCard(id)}
									onMouseEnter={(e) => {
										e.currentTarget.style.background =
											'rgba(56, 189, 248, 0.06)';
										e.currentTarget.style.borderColor =
											'rgba(56, 189, 248, 0.2)';
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.background =
											'rgba(255, 255, 255, 0.03)';
										e.currentTarget.style.borderColor =
											'rgba(255, 255, 255, 0.06)';
									}}
									title={`Restore "${title}" to grid`}>
									<div style={styles.iconWrap}>
										<LucideIcon name={icon} size={14} />
									</div>
									<span style={styles.itemTitle}>
										{title}
									</span>
									<span style={styles.restoreLabel}>+</span>
								</button>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
