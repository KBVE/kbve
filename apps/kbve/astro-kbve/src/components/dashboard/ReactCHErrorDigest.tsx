import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
	XCircle,
	Loader2,
	ChevronDown,
	ChevronUp,
	ArrowRight,
	Layers,
} from 'lucide-react';
import {
	clickhouseService,
	formatRelativeTime,
	type ErrorGroupRow,
} from './clickhouseService';

function scrollToLogExplorer() {
	document
		.getElementById('ch-log-explorer')
		?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ErrorGroupItem({ row, rank }: { row: ErrorGroupRow; rank: number }) {
	const [expanded, setExpanded] = useState(false);
	const count = parseInt(row.cnt, 10) || 0;
	const showSample = row.sample && row.sample !== row.signature;

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
					gap: 10,
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						color: 'var(--sl-color-gray-4, #6b7280)',
						fontVariantNumeric: 'tabular-nums',
						width: 18,
						textAlign: 'right',
						paddingTop: 3,
						flexShrink: 0,
					}}>
					{rank}
				</span>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 4,
						padding: '2px 8px',
						borderRadius: 4,
						fontSize: '0.8rem',
						fontWeight: 700,
						color: '#ef4444',
						background: 'rgba(239, 68, 68, 0.12)',
						border: '1px solid rgba(239, 68, 68, 0.3)',
						fontVariantNumeric: 'tabular-nums',
						flexShrink: 0,
					}}>
					<XCircle size={12} />
					{count.toLocaleString()}
				</span>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
						gap: 3,
					}}>
					<span
						onClick={() => showSample && setExpanded(!expanded)}
						style={{
							fontSize: '0.75rem',
							color: 'var(--sl-color-text, #e6edf3)',
							fontFamily: 'monospace',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: expanded ? 'pre-wrap' : 'nowrap',
							wordBreak: expanded ? 'break-all' : undefined,
							cursor: showSample ? 'pointer' : 'default',
						}}>
						{row.signature}
					</span>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							fontSize: '0.7rem',
							color: 'rgba(255, 255, 255, 0.45)',
							fontWeight: 500,
						}}>
						<span
							style={{
								color: 'var(--sl-color-accent, #06b6d4)',
							}}>
							{row.pod_namespace}
						</span>
						{row.service && <span>· {row.service}</span>}
						<span>· {formatRelativeTime(row.last_seen)}</span>
					</div>
					{expanded && showSample && (
						<pre
							style={{
								margin: '4px 0 0',
								padding: 8,
								borderRadius: 4,
								background: 'rgba(0, 0, 0, 0.3)',
								overflow: 'auto',
								maxHeight: 200,
								fontSize: '0.65rem',
								color: 'var(--sl-color-gray-3, #8b949e)',
								whiteSpace: 'pre-wrap',
								wordBreak: 'break-all',
							}}>
							{row.sample}
						</pre>
					)}
				</div>
				<button
					onClick={() => {
						clickhouseService.drillIntoErrorGroup(
							row.pod_namespace,
						);
						scrollToLogExplorer();
					}}
					title="Show matching logs"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 4,
						padding: '3px 8px',
						borderRadius: 5,
						border: '1px solid var(--sl-color-gray-5, #262626)',
						background: 'transparent',
						color: 'var(--sl-color-gray-3, #8b949e)',
						fontSize: '0.7rem',
						fontWeight: 600,
						cursor: 'pointer',
						flexShrink: 0,
						whiteSpace: 'nowrap',
					}}>
					Logs <ArrowRight size={11} />
				</button>
				{showSample && (
					<span
						onClick={() => setExpanded(!expanded)}
						style={{
							flexShrink: 0,
							color: 'var(--sl-color-gray-4)',
							cursor: 'pointer',
							paddingTop: 2,
						}}>
						{expanded ? (
							<ChevronUp size={14} />
						) : (
							<ChevronDown size={14} />
						)}
					</span>
				)}
			</div>
		</div>
	);
}

export default function ReactCHErrorDigest() {
	const authState = useStore(clickhouseService.$authState);
	const minutes = useStore(clickhouseService.$minutes);
	const errorGroups = useStore(clickhouseService.$errorGroups);
	const loading = useStore(clickhouseService.$errorGroupsLoading);
	const scope = useStore(clickhouseService.$errorScope);
	const focusTick = useStore(clickhouseService.$errorDigestFocus);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (
			authState === 'authenticated' &&
			clickhouseService.$errorGroups.get() === null
		) {
			clickhouseService.loadErrorGroups();
		}
	}, [authState, minutes]);

	useEffect(() => {
		if (focusTick > 0) {
			containerRef.current?.scrollIntoView({
				behavior: 'smooth',
				block: 'start',
			});
		}
	}, [focusTick]);

	const rows = errorGroups?.rows ?? [];
	if (!loading && rows.length === 0 && !scope) return null;

	return (
		<div
			ref={containerRef}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				padding: '0.85rem 1rem',
				borderRadius: 12,
				border: '1px solid rgba(239, 68, 68, 0.25)',
				background: 'var(--sl-color-bg-nav, #111)',
			}}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					flexWrap: 'wrap',
				}}>
				<XCircle size={15} style={{ color: '#ef4444' }} />
				<span
					style={{
						fontWeight: 700,
						fontSize: '0.95rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					Top errors
				</span>
				{scope ? (
					<button
						onClick={() => clickhouseService.setErrorScope('')}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '2px 8px',
							borderRadius: 999,
							border: '1px solid var(--sl-color-accent, #06b6d4)',
							background: 'rgba(6, 182, 212, 0.12)',
							color: 'var(--sl-color-accent, #06b6d4)',
							fontSize: '0.72rem',
							fontWeight: 600,
							cursor: 'pointer',
						}}>
						{scope}
						<span style={{ opacity: 0.7 }}>✕</span>
					</button>
				) : (
					<span
						style={{
							fontSize: '0.72rem',
							color: 'rgba(255, 255, 255, 0.45)',
							fontWeight: 500,
						}}>
						all namespaces
					</span>
				)}
				<div
					style={{
						marginLeft: 'auto',
						display: 'flex',
						alignItems: 'center',
						gap: 8,
					}}>
					<button
						onClick={() => {
							clickhouseService.setSortField('errors');
							document
								.getElementById('ch-namespace-grid')
								?.scrollIntoView({
									behavior: 'smooth',
									block: 'start',
								});
						}}
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '3px 9px',
							borderRadius: 6,
							border: '1px solid var(--sl-color-gray-5, #262626)',
							background: 'transparent',
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.72rem',
							fontWeight: 600,
							cursor: 'pointer',
						}}>
						<Layers size={12} /> Top namespaces
					</button>
					{loading && (
						<Loader2
							size={14}
							style={{
								animation: 'spin 1s linear infinite',
								color: 'rgba(255, 255, 255, 0.5)',
							}}
						/>
					)}
				</div>
			</div>

			{rows.length > 0 ? (
				<div>
					{rows.map((row, i) => (
						<ErrorGroupItem
							key={`${row.pod_namespace}-${i}`}
							row={row}
							rank={i + 1}
						/>
					))}
				</div>
			) : (
				!loading && (
					<div
						style={{
							padding: '1rem 0',
							color: 'rgba(255, 255, 255, 0.5)',
							fontSize: '0.8rem',
						}}>
						No errors in this window.
					</div>
				)
			)}
		</div>
	);
}
