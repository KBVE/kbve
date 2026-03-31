import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, GitPullRequest, CircleDot, ExternalLink } from 'lucide-react';
import { openTooltip, closeTooltip } from '@kbve/droid';
import { showItemModal } from './kanbanItemModal';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KanbanItem {
	type: 'ISSUE' | 'PULL_REQUEST';
	number: number;
	title: string;
	state: string;
	url: string;
	assignees: string[];
	labels: string[];
	matrix: string | null;
	date: string;
	milestone: string | null;
}

interface KanbanData {
	generated_at: string;
	project: { title: string; url: string; total_items: number };
	summary: Record<string, number>;
	columns: Record<string, KanbanItem[]>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COLUMN_COLORS: Record<string, string> = {
	Theory: '#8b5cf6',
	AI: '#06b6d4',
	Todo: '#3b82f6',
	Backlog: '#6366f1',
	Error: '#ef4444',
	Support: '#f59e0b',
	Staging: '#f97316',
	Review: '#eab308',
	Done: '#22c55e',
};

const COLUMN_ORDER = [
	'Theory',
	'AI',
	'Todo',
	'Backlog',
	'Error',
	'Support',
	'Staging',
	'Review',
	'Done',
];

const DONE_DISPLAY_LIMIT = 25;

// ---------------------------------------------------------------------------
// Label color hashing
// ---------------------------------------------------------------------------

function labelColor(label: string): string {
	let hash = 0;
	for (let i = 0; i < label.length; i++) {
		hash = label.charCodeAt(i) + ((hash << 5) - hash);
	}
	return `hsl(${Math.abs(hash) % 360}, 55%, 55%)`;
}

// ---------------------------------------------------------------------------
// Persistent tooltip hook (single DOM element, content updated via ref)
// ---------------------------------------------------------------------------

function useKanbanTooltip() {
	const tipRef = useRef<HTMLDivElement>(null);

	const show = useCallback((item: KanbanItem, e: React.MouseEvent) => {
		const tip = tipRef.current;
		if (!tip) return;

		const titleEl = tip.querySelector<HTMLDivElement>(
			'[data-kb-tip-title]',
		);
		const metaEl = tip.querySelector<HTMLDivElement>('[data-kb-tip-meta]');
		const labelsEl = tip.querySelector<HTMLDivElement>(
			'[data-kb-tip-labels]',
		);
		const assigneesEl = tip.querySelector<HTMLDivElement>(
			'[data-kb-tip-assignees]',
		);

		if (titleEl) titleEl.textContent = item.title;
		if (metaEl) {
			const typeStr = item.type === 'ISSUE' ? 'Issue' : 'Pull Request';
			metaEl.textContent = `#${item.number} · ${typeStr} · ${item.state} · ${item.date || 'No date'}`;
		}
		if (labelsEl) {
			labelsEl.textContent =
				item.labels.length > 0 ? item.labels.join(', ') : '';
			labelsEl.style.display = item.labels.length > 0 ? 'block' : 'none';
		}
		if (assigneesEl) {
			assigneesEl.textContent =
				item.assignees.length > 0
					? `Assignees: ${item.assignees.join(', ')}`
					: '';
			assigneesEl.style.display =
				item.assignees.length > 0 ? 'block' : 'none';
		}

		const container = tip.parentElement;
		if (container) {
			const rect = container.getBoundingClientRect();
			tip.style.left = `${e.clientX - rect.left}px`;
			tip.style.top = `${e.clientY - rect.top}px`;
		}
		tip.style.opacity = '1';
		tip.style.visibility = 'visible';

		openTooltip(`kb-item-${item.number}`);
	}, []);

	const move = useCallback((e: React.MouseEvent) => {
		const tip = tipRef.current;
		const container = tip?.parentElement;
		if (!tip || !container) return;
		const rect = container.getBoundingClientRect();
		tip.style.left = `${e.clientX - rect.left}px`;
		tip.style.top = `${e.clientY - rect.top}px`;
	}, []);

	const hide = useCallback((itemNumber: number) => {
		const tip = tipRef.current;
		if (tip) {
			tip.style.opacity = '0';
			tip.style.visibility = 'hidden';
		}
		closeTooltip(`kb-item-${itemNumber}`);
	}, []);

	return { tipRef, show, move, hide };
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

function ItemRow({
	item,
	column,
	onMouseEnter,
	onMouseMove,
	onMouseLeave,
}: {
	item: KanbanItem;
	column: string;
	onMouseEnter: (item: KanbanItem, e: React.MouseEvent) => void;
	onMouseMove: (e: React.MouseEvent) => void;
	onMouseLeave: (num: number) => void;
}) {
	const isIssue = item.type === 'ISSUE';

	return (
		<a
			href={item.url}
			target="_blank"
			rel="noopener noreferrer"
			data-astro-prefetch
			onClick={(e) => {
				// Left click = modal, ctrl/meta/middle = normal link behavior
				if (!e.ctrlKey && !e.metaKey && e.button === 0) {
					e.preventDefault();
					showItemModal({ ...item, column });
				}
			}}
			onMouseEnter={(e) => onMouseEnter(item, e)}
			onMouseMove={onMouseMove}
			onMouseLeave={() => onMouseLeave(item.number)}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '0.75rem',
				padding: '10px 14px',
				borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				textDecoration: 'none',
				color: 'var(--sl-color-text, #e6edf3)',
				transition: 'background 0.15s',
				cursor: 'pointer',
			}}
			onMouseOver={(e) => {
				(e.currentTarget as HTMLElement).style.background =
					'rgba(255,255,255,0.03)';
			}}
			onMouseOut={(e) => {
				(e.currentTarget as HTMLElement).style.background =
					'transparent';
			}}>
			<span
				style={{
					flexShrink: 0,
					color: isIssue ? '#22c55e' : '#8b5cf6',
					display: 'flex',
				}}>
				{isIssue ? (
					<CircleDot size={14} />
				) : (
					<GitPullRequest size={14} />
				)}
			</span>
			<span
				style={{
					flexShrink: 0,
					fontSize: '0.8rem',
					fontWeight: 600,
					color: 'var(--sl-color-gray-3, #8b949e)',
					fontVariantNumeric: 'tabular-nums',
					minWidth: 45,
				}}>
				#{item.number}
			</span>
			<span
				style={{
					flex: 1,
					fontSize: '0.8rem',
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					whiteSpace: 'nowrap',
					minWidth: 0,
				}}>
				{item.title}
			</span>
			<span
				style={{
					display: 'flex',
					gap: 4,
					flexShrink: 0,
					flexWrap: 'wrap',
					justifyContent: 'flex-end',
					maxWidth: 180,
				}}>
				{item.labels.slice(0, 3).map((label) => (
					<span
						key={label}
						style={{
							fontSize: '0.6rem',
							padding: '1px 6px',
							borderRadius: 10,
							border: `1px solid ${labelColor(label)}`,
							color: labelColor(label),
							whiteSpace: 'nowrap',
							lineHeight: 1.5,
						}}>
						{label}
					</span>
				))}
			</span>
			{item.date && (
				<span
					style={{
						flexShrink: 0,
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontVariantNumeric: 'tabular-nums',
						minWidth: 68,
						textAlign: 'right',
					}}>
					{item.date}
				</span>
			)}
			<ExternalLink
				size={11}
				style={{
					flexShrink: 0,
					color: 'var(--sl-color-gray-4, #6b7280)',
				}}
			/>
		</a>
	);
}

// ---------------------------------------------------------------------------
// Main — interactive tabbed item browser
// ---------------------------------------------------------------------------

export default function ReactKanbanBrowser() {
	const [data, setData] = useState<KanbanData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState('Theory');
	const { tipRef, show, move, hide } = useKanbanTooltip();

	useEffect(() => {
		let cancelled = false;
		fetch('/data/nx/nx-kanban.json', { signal: AbortSignal.timeout(10000) })
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			})
			.then((d: KanbanData) => {
				if (!cancelled) {
					setData(d);
					const first = COLUMN_ORDER.find(
						(c) => c !== 'Done' && (d.columns[c]?.length ?? 0) > 0,
					);
					if (first) setActiveTab(first);
				}
			})
			.catch((e) => {
				if (!cancelled) setError(e.message);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (error) {
		return (
			<div
				style={{
					padding: 24,
					fontSize: '0.85rem',
					color: 'var(--sl-color-gray-4)',
				}}>
				Failed to load kanban items
			</div>
		);
	}

	if (!data) {
		return (
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					minHeight: 200,
					gap: 8,
					color: 'var(--sl-color-gray-3, #8b949e)',
				}}>
				<Loader2
					size={18}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
				<span style={{ fontSize: '0.85rem' }}>Loading items...</span>
			</div>
		);
	}

	const summary = data.summary;
	const activeItems = data.columns[activeTab] ?? [];
	const isDone = activeTab === 'Done';
	const displayItems = isDone
		? activeItems.slice(0, DONE_DISPLAY_LIMIT)
		: activeItems;

	return (
		<div style={{ position: 'relative' }}>
			<div
				style={{
					borderRadius: 12,
					border: '1px solid var(--sl-color-gray-5, #262626)',
					background: 'var(--sl-color-bg-nav, #111)',
					overflow: 'hidden',
				}}>
				{/* Tab strip */}
				<div
					style={{
						display: 'flex',
						borderBottom:
							'1px solid var(--sl-color-gray-5, #262626)',
						overflowX: 'auto',
						scrollbarWidth: 'none',
					}}>
					{COLUMN_ORDER.map((col) => {
						const count = summary[col] ?? 0;
						const isActive = col === activeTab;
						const color = COLUMN_COLORS[col] ?? '#6b7280';
						return (
							<button
								key={col}
								onClick={() => setActiveTab(col)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 6,
									padding: '12px 16px',
									background: 'transparent',
									border: 'none',
									borderBottom: isActive
										? `2px solid ${color}`
										: '2px solid transparent',
									color: isActive
										? 'var(--sl-color-text, #e6edf3)'
										: 'var(--sl-color-gray-3, #8b949e)',
									fontSize: '0.8rem',
									fontWeight: isActive ? 600 : 400,
									cursor: 'pointer',
									whiteSpace: 'nowrap',
									transition:
										'color 0.15s, border-color 0.15s',
									flexShrink: 0,
								}}>
								{col}
								<span
									style={{
										fontSize: '0.65rem',
										padding: '1px 6px',
										borderRadius: 10,
										background: isActive
											? `${color}22`
											: 'var(--sl-color-gray-5, #262626)',
										color: isActive
											? color
											: 'var(--sl-color-gray-4, #6b7280)',
										fontWeight: 600,
										fontVariantNumeric: 'tabular-nums',
									}}>
									{count}
								</span>
							</button>
						);
					})}
				</div>

				{/* Item list */}
				<div style={{ minHeight: 200 }}>
					{displayItems.length === 0 ? (
						<div
							style={{
								padding: 32,
								textAlign: 'center',
								fontSize: '0.85rem',
								color: 'var(--sl-color-gray-4, #6b7280)',
							}}>
							No items in {activeTab}
						</div>
					) : (
						<>
							{displayItems.map((item) => (
								<ItemRow
									key={item.number}
									item={item}
									column={activeTab}
									onMouseEnter={show}
									onMouseMove={move}
									onMouseLeave={hide}
								/>
							))}
							{isDone &&
								activeItems.length > DONE_DISPLAY_LIMIT && (
									<div
										style={{
											padding: '12px 14px',
											textAlign: 'center',
											fontSize: '0.75rem',
											color: 'var(--sl-color-gray-4, #6b7280)',
											borderTop:
												'1px solid var(--sl-color-gray-5, #262626)',
										}}>
										Showing {DONE_DISPLAY_LIMIT} of{' '}
										{activeItems.length} completed items
									</div>
								)}
						</>
					)}
				</div>
			</div>

			{/* Persistent tooltip — single element, content updated via ref */}
			<div
				ref={tipRef}
				role="tooltip"
				aria-hidden="true"
				style={{
					position: 'absolute',
					transform: 'translate(-50%, -100%) translateY(-14px)',
					pointerEvents: 'none',
					zIndex: 10,
					background: 'var(--sl-color-gray-6, #1a1a1a)',
					border: '1px solid var(--sl-color-gray-5, #262626)',
					borderRadius: 8,
					padding: '8px 12px',
					maxWidth: 360,
					boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
					opacity: 0,
					visibility: 'hidden',
					transition: 'opacity 0.1s ease',
					top: 0,
					left: 0,
				}}>
				<div
					data-kb-tip-title
					style={{
						fontSize: '0.8rem',
						fontWeight: 600,
						color: 'var(--sl-color-white, #e6edf3)',
						lineHeight: 1.3,
						marginBottom: 4,
						wordBreak: 'break-word',
					}}
				/>
				<div
					data-kb-tip-meta
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-3, #8b949e)',
						lineHeight: 1.3,
						marginBottom: 2,
					}}
				/>
				<div
					data-kb-tip-labels
					style={{
						fontSize: '0.65rem',
						color: 'var(--sl-color-accent, #06b6d4)',
						lineHeight: 1.4,
					}}
				/>
				<div
					data-kb-tip-assignees
					style={{
						fontSize: '0.65rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						lineHeight: 1.4,
						marginTop: 2,
					}}
				/>
			</div>
		</div>
	);
}
