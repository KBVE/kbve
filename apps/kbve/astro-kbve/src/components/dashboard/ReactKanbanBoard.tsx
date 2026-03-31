import { useEffect, useState, useCallback } from 'react';
import { CircleDot, GitPullRequest } from 'lucide-react';
import {
	useKanbanSection,
	useKanbanData,
	COLUMN_COLORS,
	COLUMN_ORDER,
	type KanbanItem,
} from './useKanbanSection';
import { showItemModal } from './kanbanItemModal';

interface Props {
	sectionIndex: number;
}

function labelColor(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i++) {
		hash = label.charCodeAt(i) + ((hash << 5) - hash);
	}
	return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`;
}

const MAX_CARDS = 8;

function KanbanCard({ item, column }: { item: KanbanItem; column: string }) {
	const isIssue = item.type === 'ISSUE';
	return (
		<div
			onClick={(e) => {
				e.preventDefault();
				showItemModal({ ...item, column });
			}}
			style={{
				display: 'block',
				padding: '8px 10px',
				borderRadius: 6,
				background: 'var(--sl-color-gray-6, #1a1a1a)',
				border: '1px solid var(--sl-color-gray-5, #262626)',
				textDecoration: 'none',
				color: 'var(--sl-color-text, #e6edf3)',
				transition: 'border-color 0.15s, transform 0.15s',
				cursor: 'pointer',
			}}
			onMouseOver={(e) => {
				(e.currentTarget as HTMLElement).style.borderColor =
					'var(--sl-color-gray-4, #4b5563)';
				(e.currentTarget as HTMLElement).style.transform =
					'translateY(-1px)';
			}}
			onMouseOut={(e) => {
				(e.currentTarget as HTMLElement).style.borderColor =
					'var(--sl-color-gray-5, #262626)';
				(e.currentTarget as HTMLElement).style.transform = 'none';
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 5,
					marginBottom: 4,
				}}>
				<span
					style={{
						color: isIssue ? '#22c55e' : '#8b5cf6',
						display: 'flex',
						flexShrink: 0,
					}}>
					{isIssue ? (
						<CircleDot size={11} />
					) : (
						<GitPullRequest size={11} />
					)}
				</span>
				<span
					style={{
						fontSize: '0.65rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontWeight: 600,
					}}>
					#{item.number}
				</span>
			</div>
			<div
				style={{
					fontSize: '0.72rem',
					lineHeight: 1.35,
					overflow: 'hidden',
					display: '-webkit-box',
					WebkitLineClamp: 2,
					WebkitBoxOrient: 'vertical',
				}}>
				{item.title}
			</div>
			{item.labels.length > 0 && (
				<div
					style={{
						display: 'flex',
						gap: 3,
						flexWrap: 'wrap',
						marginTop: 5,
					}}>
					{item.labels.slice(0, 2).map((label) => (
						<span
							key={label}
							style={{
								fontSize: '0.55rem',
								padding: '0px 5px',
								borderRadius: 8,
								border: `1px solid ${labelColor(label)}`,
								color: labelColor(label),
								lineHeight: 1.6,
							}}>
							{label}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

export default function ReactKanbanBoard({ sectionIndex }: Props) {
	const active = useKanbanSection(sectionIndex);
	const [data] = useKanbanData();

	if (!active || !data) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
					color: 'var(--sl-color-gray-4)',
					fontSize: '0.85rem',
				}}>
				{!active ? '' : 'Loading board...'}
			</div>
		);
	}

	// Only show columns with items (excluding Done which is too large)
	const visibleColumns = COLUMN_ORDER.filter(
		(col) => col !== 'Done' && (data.columns[col]?.length ?? 0) > 0,
	);

	return (
		<div
			style={{
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				gap: '0.75rem',
			}}>
			<h3
				style={{
					margin: 0,
					fontSize: '0.8rem',
					fontWeight: 600,
					textTransform: 'uppercase',
					letterSpacing: '0.05em',
					color: 'var(--sl-color-gray-3, #8b949e)',
					textAlign: 'center',
				}}>
				Kanban Board
			</h3>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(${Math.min(visibleColumns.length, 6)}, 1fr)`,
					gap: '0.5rem',
					flex: 1,
					minHeight: 0,
					overflow: 'hidden',
				}}>
				{visibleColumns.slice(0, 6).map((col) => {
					const items = data.columns[col] ?? [];
					const color = COLUMN_COLORS[col] ?? '#6b7280';
					return (
						<div
							key={col}
							style={{
								display: 'flex',
								flexDirection: 'column',
								borderRadius: 8,
								border: '1px solid var(--sl-color-gray-5, #262626)',
								background: 'var(--sl-color-bg-nav, #111)',
								overflow: 'hidden',
								minHeight: 0,
							}}>
							{/* Column header */}
							<div
								style={{
									padding: '8px 10px',
									borderBottom: `2px solid ${color}`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									flexShrink: 0,
								}}>
								<span
									style={{
										fontSize: '0.75rem',
										fontWeight: 600,
										color: 'var(--sl-color-text, #e6edf3)',
									}}>
									{col}
								</span>
								<span
									style={{
										fontSize: '0.6rem',
										fontWeight: 700,
										padding: '1px 6px',
										borderRadius: 8,
										background: `${color}22`,
										color,
									}}>
									{items.length}
								</span>
							</div>
							{/* Cards */}
							<div
								style={{
									flex: 1,
									minHeight: 0,
									overflowY: 'auto',
									padding: '6px',
									display: 'flex',
									flexDirection: 'column',
									gap: '5px',
									scrollbarWidth: 'thin',
								}}>
								{items.slice(0, MAX_CARDS).map((item) => (
									<KanbanCard
										key={item.number}
										item={item}
										column={col}
									/>
								))}
								{items.length > MAX_CARDS && (
									<div
										style={{
											textAlign: 'center',
											fontSize: '0.65rem',
											color: 'var(--sl-color-gray-4, #6b7280)',
											padding: '4px',
										}}>
										+{items.length - MAX_CARDS} more
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
