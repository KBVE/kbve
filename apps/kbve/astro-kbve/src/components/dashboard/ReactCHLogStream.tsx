import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import {
	Loader2,
	AlertCircle,
	ChevronDown,
	ChevronUp,
	XCircle,
	AlertTriangle,
	Info,
	Bug,
} from 'lucide-react';
import {
	clickhouseService,
	levelColor,
	formatTimestamp,
	type LogRow,
} from './clickhouseService';

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

function LogEntry({
	log,
	searchHighlight,
}: {
	log: LogRow;
	searchHighlight: string;
}) {
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
					{highlightMessage(log.message, searchHighlight)}
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

export default function ReactCHLogStream() {
	const logsLoading = useStore(clickhouseService.$logsLoading);
	const logs = useStore(clickhouseService.$logs);
	const debouncedSearch = useStore(clickhouseService.$debouncedSearch);
	const levelFilter = useStore(clickhouseService.$levelFilter);
	const namespaceFilter = useStore(clickhouseService.$namespaceFilter);
	const serviceFilter = useStore(clickhouseService.$serviceFilter);
	const authState = useStore(clickhouseService.$authState);

	// Reload logs when filters or debounced search change
	useEffect(() => {
		if (authState === 'authenticated') {
			clickhouseService.loadLogs();
		}
	}, [
		authState,
		levelFilter,
		namespaceFilter,
		serviceFilter,
		debouncedSearch,
	]);

	return (
		<>
			{/* Log entries */}
			<div
				style={{
					padding: '0 1rem',
					maxHeight: 600,
					overflowY: 'auto',
				}}>
				{logsLoading ? (
					<div
						style={{
							padding: '2rem',
							textAlign: 'center',
							color: 'var(--sl-color-gray-3)',
						}}>
						<Loader2
							size={20}
							style={{
								animation: 'spin 1s linear infinite',
							}}
						/>
					</div>
				) : logs && logs.rows.length > 0 ? (
					logs.rows.map((log, i) => (
						<LogEntry
							key={`${log.timestamp}-${i}`}
							log={log}
							searchHighlight={debouncedSearch}
						/>
					))
				) : (
					<div
						style={{
							padding: '2rem',
							textAlign: 'center',
							color: 'rgba(255, 255, 255, 0.5)',
							fontSize: '0.85rem',
						}}>
						<AlertCircle size={18} style={{ marginBottom: 8 }} />
						<div>No logs found matching filters</div>
					</div>
				)}
			</div>

			{/* Footer */}
			{logs && (
				<div
					style={{
						padding: '0.5rem 1rem',
						borderTop: '1px solid var(--sl-color-gray-6, #1a1a1a)',
						fontSize: '0.75rem',
						color: 'rgba(255, 255, 255, 0.6)',
						display: 'flex',
						justifyContent: 'space-between',
						fontWeight: 500,
					}}>
					<span>
						Showing {logs.rows.length} of {logs.count} results
					</span>
					<span>Source: observability.logs_distributed</span>
				</div>
			)}
		</>
	);
}
