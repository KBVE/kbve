/**
 * BentoDock — Right sidebar dock for hidden bento cards + global controls.
 *
 * Subscribes to bentoStore via nanostores. Reads card metadata from
 * DOM data attributes. Shows hidden cards as restore buttons.
 */

import { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $hiddenIds, $pageKey, showCard, resetAll } from './bentoStore';

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

function LucideIcon({ name, size = 14 }: { name: string; size?: number }) {
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

// ── Component ──

interface CardMeta {
	id: string;
	title: string;
	icon: string;
}

export default function BentoDock() {
	const pageKey = useStore($pageKey);
	const hiddenIds = useStore($hiddenIds);
	const [cardMeta, setCardMeta] = useState<Map<string, CardMeta>>(new Map());

	// Build card metadata map from DOM on mount
	useEffect(() => {
		const grid = document.querySelector('[data-bento-page]');
		if (!grid) return;

		const meta = new Map<string, CardMeta>();
		grid.querySelectorAll<HTMLElement>('[data-bento-id]').forEach((el) => {
			const id = el.dataset.bentoId || '';
			meta.set(id, {
				id,
				title: el.dataset.bentoTitle || id,
				icon: el.dataset.bentoIcon || 'file-text',
			});
		});
		setCardMeta(meta);
	}, []);

	// Don't render if no bento grid on this page
	if (!pageKey || cardMeta.size === 0) return null;

	const hiddenCards = hiddenIds
		.map((id) => cardMeta.get(id))
		.filter(Boolean) as CardMeta[];

	return (
		<div
			style={{
				padding: '0.75rem',
				borderTop: '1px solid rgba(255, 255, 255, 0.06)',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					marginBottom: '0.5rem',
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						fontWeight: 600,
						color: 'var(--sl-color-gray-3, #9ca3af)',
						textTransform: 'uppercase' as const,
						letterSpacing: '0.05em',
					}}>
					Dashboard
				</span>
			</div>

			<div style={{ display: 'flex', gap: '0.375rem' }}>
				<button
					style={{
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
					}}
					onClick={() => resetAll()}
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

			{hiddenCards.length > 0 && (
				<>
					<div
						style={{
							fontSize: '0.7rem',
							fontWeight: 600,
							color: 'var(--sl-color-gray-3, #9ca3af)',
							textTransform: 'uppercase' as const,
							letterSpacing: '0.05em',
							marginTop: '0.75rem',
							marginBottom: '0.375rem',
						}}>
						Hidden ({hiddenCards.length})
					</div>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: '0.375rem',
						}}>
						{hiddenCards.map(({ id, title, icon }) => (
							<button
								key={id}
								style={{
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
									width: '100%',
									textAlign: 'left' as const,
								}}
								onClick={() => showCard(id)}
								title={`Restore "${title}" to grid`}>
								<div
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										width: '1.75rem',
										height: '1.75rem',
										borderRadius: '0.375rem',
										background: 'rgba(255, 255, 255, 0.05)',
										color: 'var(--sl-color-text-accent, #38bdf8)',
										flexShrink: 0,
									}}>
									<LucideIcon name={icon} />
								</div>
								<span
									style={{
										flex: 1,
										overflow: 'hidden',
										textOverflow: 'ellipsis',
										whiteSpace: 'nowrap' as const,
									}}>
									{title}
								</span>
								<span
									style={{
										fontSize: '0.6rem',
										color: 'var(--sl-color-text-accent, #38bdf8)',
										opacity: 0.7,
									}}>
									+
								</span>
							</button>
						))}
					</div>
				</>
			)}
		</div>
	);
}
