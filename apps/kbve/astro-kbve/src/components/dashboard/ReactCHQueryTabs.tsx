import React, { useState, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
	DndContext,
	closestCenter,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	sortableKeyboardCoordinates,
	horizontalListSortingStrategy,
	useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
	Plus,
	X,
	Play,
	Pause,
	RefreshCw,
	Download,
	Upload,
	Bookmark,
	GripVertical,
	Timer,
	Loader2,
	ChevronDown,
	ChevronUp,
	AlertCircle,
	XCircle,
	AlertTriangle,
	Info,
	Bug,
} from 'lucide-react';
import {
	clickhouseService,
	levelColor,
	formatTimestamp,
	type QueryTab,
	type QueryPreset,
	type LogRow,
} from './clickhouseService';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const selectStyle: React.CSSProperties = {
	padding: '4px 8px',
	borderRadius: 6,
	border: '1px solid var(--sl-color-gray-5, #262626)',
	background: 'var(--sl-color-bg, #0a0a0a)',
	color: 'var(--sl-color-text, #e6edf3)',
	fontSize: '0.75rem',
	outline: 'none',
};

const btnStyle: React.CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
	gap: 4,
	padding: '4px 8px',
	borderRadius: 4,
	border: '1px solid var(--sl-color-gray-5, #262626)',
	background: 'transparent',
	color: 'rgba(255, 255, 255, 0.7)',
	fontSize: '0.7rem',
	cursor: 'pointer',
	transition: 'all 0.15s',
};

// ---------------------------------------------------------------------------
// Log entry sub-components (shared with ReactCHLogStream)
// ---------------------------------------------------------------------------

function levelIcon(level: string) {
	switch (level) {
		case 'error':
			return <XCircle size={12} />;
		case 'warn':
			return <AlertTriangle size={12} />;
		case 'info':
			return <Info size={12} />;
		case 'debug':
			return <Bug size={12} />;
		default:
			return null;
	}
}

function LevelBadge({ level }: { level: string }) {
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px 8px',
				borderRadius: 4,
				fontSize: '0.7rem',
				fontWeight: 600,
				textTransform: 'uppercase',
				letterSpacing: '0.03em',
				color: levelColor(level),
				background: `${levelColor(level)}18`,
				border: `1px solid ${levelColor(level)}30`,
			}}>
			{levelIcon(level)}
			{level}
		</span>
	);
}

function TabLogEntry({ log, searchTerm }: { log: LogRow; searchTerm: string }) {
	const [expanded, setExpanded] = useState(false);

	const highlightMessage = (msg: string, term: string) => {
		if (!term) return msg;
		const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const parts = msg.split(new RegExp(`(${escapedTerm})`, 'gi'));
		if (parts.length === 1) return msg;
		return (
			<>
				{parts.map((part, i) =>
					part.toLowerCase() === term.toLowerCase() ? (
						<mark
							key={i}
							style={{
								background: 'rgba(6, 182, 212, 0.3)',
								color: 'inherit',
								borderRadius: 2,
								padding: '0 1px',
							}}>
							{part}
						</mark>
					) : (
						part
					),
				)}
			</>
		);
	};

	return (
		<div
			style={{
				borderBottom: '1px solid var(--sl-color-gray-6, #1a1a1a)',
				padding: '0.6rem 0',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-start',
					gap: 8,
					cursor: 'pointer',
				}}
				onClick={() => setExpanded(!expanded)}>
				<span
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontFamily: 'monospace',
						flexShrink: 0,
						paddingTop: 2,
						fontVariantNumeric: 'tabular-nums',
					}}>
					{formatTimestamp(log.timestamp)}
				</span>
				<LevelBadge level={log.level} />
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-accent, #06b6d4)',
						flexShrink: 0,
						fontWeight: 500,
					}}>
					{log.service}
				</span>
				<span
					style={{
						fontSize: '0.75rem',
						color: 'var(--sl-color-text, #e6edf3)',
						flex: 1,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
						wordBreak: expanded ? 'break-all' : undefined,
						fontFamily: 'monospace',
					}}>
					{highlightMessage(log.message, searchTerm)}
				</span>
				<span
					style={{
						flexShrink: 0,
						color: 'var(--sl-color-gray-4)',
					}}>
					{expanded ? (
						<ChevronUp size={14} />
					) : (
						<ChevronDown size={14} />
					)}
				</span>
			</div>
			{expanded && (
				<div
					style={{
						marginTop: 8,
						marginLeft: 70,
						padding: '0.5rem 0.75rem',
						borderRadius: 6,
						background: 'rgba(0, 0, 0, 0.3)',
						fontSize: '0.7rem',
						fontFamily: 'monospace',
						color: 'var(--sl-color-gray-3, #8b949e)',
						display: 'flex',
						flexDirection: 'column',
						gap: 4,
					}}>
					<div>
						<strong>Namespace:</strong> {log.pod_namespace}
					</div>
					<div>
						<strong>Pod:</strong> {log.pod_name}
					</div>
					<div>
						<strong>Timestamp:</strong> {log.timestamp}
					</div>
					{log.metadata && log.metadata !== '{}' && (
						<div style={{ marginTop: 4 }}>
							<strong>Metadata:</strong>
							<pre
								style={{
									margin: '4px 0 0',
									padding: 8,
									borderRadius: 4,
									background: 'rgba(0, 0, 0, 0.3)',
									overflow: 'auto',
									maxHeight: 200,
									fontSize: '0.65rem',
								}}>
								{JSON.stringify(
									JSON.parse(log.metadata),
									null,
									2,
								)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sortable tab button
// ---------------------------------------------------------------------------

function SortableTab({ tab, isActive }: { tab: QueryTab; isActive: boolean }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: tab.id });

	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		display: 'inline-flex',
		alignItems: 'center',
		gap: 4,
		padding: '4px 8px',
		borderRadius: '6px 6px 0 0',
		border: `1px solid ${isActive ? 'var(--sl-color-accent, #06b6d4)' : 'var(--sl-color-gray-5, #262626)'}`,
		borderBottom: isActive
			? '1px solid var(--sl-color-bg-nav, #111)'
			: '1px solid var(--sl-color-gray-5, #262626)',
		background: isActive ? 'var(--sl-color-bg-nav, #111)' : 'transparent',
		color: isActive
			? 'var(--sl-color-accent, #06b6d4)'
			: 'rgba(255, 255, 255, 0.6)',
		fontSize: '0.7rem',
		fontWeight: 500,
		cursor: 'pointer',
		opacity: isDragging ? 0.5 : 1,
		whiteSpace: 'nowrap',
		maxWidth: 200,
		position: 'relative',
		zIndex: isDragging ? 100 : isActive ? 2 : 1,
	};

	return (
		<div ref={setNodeRef} style={style}>
			<span
				{...attributes}
				{...listeners}
				style={{
					cursor: 'grab',
					display: 'inline-flex',
					color: 'rgba(255,255,255,0.3)',
				}}>
				<GripVertical size={10} />
			</span>
			<span
				onClick={() => clickhouseService.setActiveTab(tab.id)}
				style={{
					overflow: 'hidden',
					textOverflow: 'ellipsis',
					cursor: 'pointer',
				}}>
				{tab.label}
			</span>
			{tab.loading && (
				<Loader2
					size={10}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			)}
			{tab.pollIntervalSec && clickhouseService.isTabPolling(tab.id) && (
				<Timer size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
			)}
			<button
				onClick={(e) => {
					e.stopPropagation();
					clickhouseService.removeQueryTab(tab.id);
				}}
				style={{
					display: 'inline-flex',
					padding: 0,
					border: 'none',
					background: 'none',
					color: 'rgba(255,255,255,0.4)',
					cursor: 'pointer',
					flexShrink: 0,
				}}>
				<X size={10} />
			</button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Tab result panel
// ---------------------------------------------------------------------------

function TabResultPanel({ tab }: { tab: QueryTab }) {
	const [pollInput, setPollInput] = useState<string>(
		tab.pollIntervalSec?.toString() ?? '',
	);
	const isPolling = clickhouseService.isTabPolling(tab.id);

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			{/* Tab toolbar */}
			<div
				style={{
					display: 'flex',
					gap: 6,
					alignItems: 'center',
					flexWrap: 'wrap',
					padding: '0.5rem 0.75rem',
					borderBottom: '1px solid var(--sl-color-gray-6, #1a1a1a)',
				}}>
				<button
					onClick={() => clickhouseService.executeTab(tab.id)}
					disabled={tab.loading}
					style={btnStyle}>
					<RefreshCw size={11} />
					Refresh
				</button>

				{/* Poll controls */}
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}>
					<Timer
						size={11}
						style={{ color: 'rgba(255,255,255,0.5)' }}
					/>
					<input
						type="number"
						min="1"
						max="300"
						placeholder="sec"
						value={pollInput}
						onChange={(e) => setPollInput(e.target.value)}
						style={{
							...selectStyle,
							width: 48,
							textAlign: 'center',
						}}
					/>
					{isPolling ? (
						<button
							onClick={() => {
								clickhouseService.setTabPolling(tab.id, null);
								setPollInput('');
							}}
							style={{
								...btnStyle,
								color: '#ef4444',
								borderColor: 'rgba(239,68,68,0.3)',
							}}>
							<Pause size={11} />
							Stop
						</button>
					) : (
						<button
							onClick={() => {
								const sec = parseInt(pollInput, 10) || 2;
								setPollInput(sec.toString());
								clickhouseService.setTabPolling(tab.id, sec);
							}}
							style={{
								...btnStyle,
								color: '#22c55e',
								borderColor: 'rgba(34,197,94,0.3)',
							}}>
							<Play size={11} />
							Poll
						</button>
					)}
				</div>

				{/* Save as preset */}
				<button
					onClick={() => clickhouseService.saveTabAsPreset(tab.id)}
					style={{ ...btnStyle, marginLeft: 'auto' }}>
					<Bookmark size={11} />
					Save Preset
				</button>

				{/* Cache indicator */}
				{tab.cachedAt && (
					<span
						style={{
							fontSize: '0.65rem',
							color: 'rgba(255,255,255,0.4)',
							fontVariantNumeric: 'tabular-nums',
						}}>
						{new Date(tab.cachedAt).toLocaleTimeString()}
					</span>
				)}
			</div>

			{/* Results */}
			<div
				style={{
					padding: '0 0.75rem',
					maxHeight: 500,
					overflowY: 'auto',
				}}>
				{tab.loading && !tab.result ? (
					<div
						style={{
							padding: '2rem',
							textAlign: 'center',
							color: 'var(--sl-color-gray-3)',
						}}>
						<Loader2
							size={20}
							style={{ animation: 'spin 1s linear infinite' }}
						/>
					</div>
				) : tab.result && tab.result.rows.length > 0 ? (
					tab.result.rows.map((log, i) => (
						<TabLogEntry
							key={`${log.timestamp}-${i}`}
							log={log}
							searchTerm={tab.params.search ?? ''}
						/>
					))
				) : (
					<div
						style={{
							padding: '2rem',
							textAlign: 'center',
							color: 'rgba(255,255,255,0.5)',
							fontSize: '0.85rem',
						}}>
						<AlertCircle size={18} style={{ marginBottom: 8 }} />
						<div>
							{tab.result
								? 'No logs found for this query'
								: 'Query not yet executed'}
						</div>
					</div>
				)}
			</div>

			{/* Footer */}
			{tab.result && (
				<div
					style={{
						padding: '0.5rem 0.75rem',
						borderTop: '1px solid var(--sl-color-gray-6, #1a1a1a)',
						fontSize: '0.7rem',
						color: 'rgba(255,255,255,0.5)',
						display: 'flex',
						justifyContent: 'space-between',
					}}>
					<span>
						{tab.result.rows.length} of {tab.result.count} results
					</span>
					<span>
						{Object.entries(tab.params)
							.filter(
								([k, v]) => v !== undefined && k !== 'limit',
							)
							.map(([k, v]) => `${k}:${v}`)
							.join(' ')}
					</span>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Preset panel
// ---------------------------------------------------------------------------

function PresetPanel() {
	const presets = useStore(clickhouseService.$presets);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [importMsg, setImportMsg] = useState<string | null>(null);

	if (presets.length === 0) {
		return null;
	}

	const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const count = clickhouseService.importPresets(
				reader.result as string,
			);
			setImportMsg(
				count > 0
					? `Imported ${count} preset(s)`
					: 'No new presets to import',
			);
			setTimeout(() => setImportMsg(null), 3000);
		};
		reader.readAsText(file);
		e.target.value = '';
	};

	const handleExport = () => {
		const json = clickhouseService.exportPresets();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'clickhouse-presets.json';
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div
			style={{
				padding: '0.5rem 0.75rem',
				borderTop: '1px solid var(--sl-color-gray-6, #1a1a1a)',
				display: 'flex',
				flexDirection: 'column',
				gap: 6,
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
				}}>
				<Bookmark
					size={12}
					style={{ color: 'rgba(255,255,255,0.5)' }}
				/>
				<span
					style={{
						fontSize: '0.7rem',
						color: 'rgba(255,255,255,0.5)',
						fontWeight: 500,
					}}>
					Presets
				</span>
				<div
					style={{
						marginLeft: 'auto',
						display: 'flex',
						gap: 4,
					}}>
					<button onClick={handleExport} style={btnStyle}>
						<Download size={10} />
						Export
					</button>
					<button
						onClick={() => fileInputRef.current?.click()}
						style={btnStyle}>
						<Upload size={10} />
						Import
					</button>
					<input
						ref={fileInputRef}
						type="file"
						accept=".json"
						onChange={handleImport}
						style={{ display: 'none' }}
					/>
				</div>
			</div>
			{importMsg && (
				<span
					style={{
						fontSize: '0.65rem',
						color: 'var(--sl-color-accent, #06b6d4)',
					}}>
					{importMsg}
				</span>
			)}
			<div
				style={{
					display: 'flex',
					gap: 4,
					flexWrap: 'wrap',
				}}>
				{presets.map((p) => (
					<div
						key={p.id}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '2px 8px',
							borderRadius: 4,
							fontSize: '0.7rem',
							fontWeight: 500,
							color: 'var(--sl-color-accent, #06b6d4)',
							background: 'rgba(6, 182, 212, 0.08)',
							border: '1px solid rgba(6, 182, 212, 0.2)',
						}}>
						<button
							onClick={() => clickhouseService.loadPreset(p.id)}
							style={{
								padding: 0,
								border: 'none',
								background: 'none',
								color: 'inherit',
								cursor: 'pointer',
								fontSize: 'inherit',
							}}>
							{p.label}
						</button>
						{p.pollIntervalSec && (
							<Timer
								size={9}
								style={{
									color: '#22c55e',
									flexShrink: 0,
								}}
							/>
						)}
						<button
							onClick={(e) => {
								e.stopPropagation();
								clickhouseService.removePreset(p.id);
							}}
							style={{
								display: 'inline-flex',
								padding: 0,
								border: 'none',
								background: 'none',
								color: 'rgba(255,255,255,0.4)',
								cursor: 'pointer',
							}}>
							<X size={9} />
						</button>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReactCHQueryTabs() {
	const tabs = useStore(clickhouseService.$queryTabs);
	const activeTabId = useStore(clickhouseService.$activeTabId);
	const activeTab = useStore(clickhouseService.$activeTab);
	const presets = useStore(clickhouseService.$presets);

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 5 },
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const ids = tabs.map((t) => t.id);
		const oldIndex = ids.indexOf(active.id as string);
		const newIndex = ids.indexOf(over.id as string);
		if (oldIndex === -1 || newIndex === -1) return;
		const newIds = [...ids];
		newIds.splice(oldIndex, 1);
		newIds.splice(newIndex, 0, active.id as string);
		clickhouseService.reorderTabs(newIds);
	};

	if (tabs.length === 0 && presets.length === 0) {
		return (
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
					padding: '0.75rem',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 6,
					}}>
					<button
						onClick={() =>
							clickhouseService.createTabFromCurrentFilters()
						}
						style={{
							...btnStyle,
							color: 'var(--sl-color-accent, #06b6d4)',
							borderColor: 'rgba(6,182,212,0.3)',
						}}>
						<Plus size={12} />
						New Query Tab
					</button>
					<span
						style={{
							fontSize: '0.7rem',
							color: 'rgba(255,255,255,0.4)',
						}}>
						Pin current filters as a reusable query tab
					</span>
				</div>
			</div>
		);
	}

	return (
		<div
			style={{
				borderRadius: 10,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				background: 'var(--sl-color-bg-nav, #111)',
				overflow: 'hidden',
			}}>
			{/* Tab bar */}
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-end',
					gap: 0,
					padding: '0.5rem 0.5rem 0',
					borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
					overflowX: 'auto',
					overflowY: 'hidden',
				}}>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragEnd={handleDragEnd}>
					<SortableContext
						items={tabs.map((t) => t.id)}
						strategy={horizontalListSortingStrategy}>
						{tabs.map((tab) => (
							<SortableTab
								key={tab.id}
								tab={tab}
								isActive={tab.id === activeTabId}
							/>
						))}
					</SortableContext>
				</DndContext>
				<button
					onClick={() =>
						clickhouseService.createTabFromCurrentFilters()
					}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						width: 24,
						height: 24,
						borderRadius: '6px 6px 0 0',
						border: '1px solid var(--sl-color-gray-5, #262626)',
						borderBottom:
							'1px solid var(--sl-color-gray-5, #262626)',
						background: 'transparent',
						color: 'rgba(255,255,255,0.4)',
						cursor: 'pointer',
						flexShrink: 0,
						marginLeft: 2,
					}}
					title="New query from current filters">
					<Plus size={12} />
				</button>
			</div>

			{/* Active tab content */}
			{activeTab ? (
				<TabResultPanel tab={activeTab} />
			) : (
				<div
					style={{
						padding: '2rem',
						textAlign: 'center',
						color: 'rgba(255,255,255,0.4)',
						fontSize: '0.8rem',
					}}>
					Select a tab or create a new query
				</div>
			)}

			{/* Presets */}
			{presets.length > 0 && <PresetPanel />}
		</div>
	);
}
