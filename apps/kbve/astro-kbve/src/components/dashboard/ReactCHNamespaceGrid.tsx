import { useStore } from '@nanostores/react';
import { ArrowUpDown, XCircle, AlertTriangle, Info, Bug } from 'lucide-react';
import {
	clickhouseService,
	levelColor,
	type NamespaceSummary,
	type SortField,
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

function SeverityButton({
	id,
	count,
	level,
	isActive,
	ns,
}: {
	id: string;
	count: number;
	level: string;
	isActive: boolean;
	ns: string;
}) {
	if (count === 0) return null;
	const color = levelColor(level);
	return (
		<button
			id={id}
			onClick={(e) => {
				e.stopPropagation();
				clickhouseService.handleSeverityClick(ns, level);
			}}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 4,
				padding: '2px 8px',
				borderRadius: 4,
				fontSize: '0.75rem',
				fontWeight: 600,
				fontVariantNumeric: 'tabular-nums',
				color: color,
				background: isActive ? `${color}25` : 'transparent',
				border: `1px solid ${isActive ? `${color}60` : 'transparent'}`,
				cursor: 'pointer',
				transition: 'all 0.15s',
			}}>
			{levelIcon(level)}
			{count}{' '}
			{level === 'warn'
				? 'warns'
				: level === 'info'
					? 'info'
					: level === 'debug'
						? 'debug'
						: 'errors'}
		</button>
	);
}

function NamespaceCard({
	summary,
	activeLevel,
	activeNamespace,
}: {
	summary: NamespaceSummary;
	activeLevel: string;
	activeNamespace: string;
}) {
	const hasIssues = summary.errors > 0 || summary.warns > 0;
	const isCardActive = activeNamespace === summary.namespace;
	const errorIntensity = Math.min(summary.errors / 50, 1);
	const borderColor = hasIssues
		? `rgba(239, 68, 68, ${0.15 + errorIntensity * 0.35})`
		: 'var(--sl-color-gray-5, #262626)';

	return (
		<div
			onClick={() =>
				clickhouseService.handleNamespaceClick(summary.namespace)
			}
			style={{
				display: 'flex',
				flexDirection: 'column',
				gap: 10,
				padding: '1rem',
				borderRadius: 10,
				border: `1px solid ${isCardActive ? 'var(--sl-color-accent, #06b6d4)' : borderColor}`,
				background: 'var(--sl-color-bg-nav, #111)',
				cursor: 'pointer',
				textAlign: 'left',
				transition: 'border-color 0.2s, box-shadow 0.2s',
				width: '100%',
			}}>
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					gap: 2,
				}}>
				<span
					style={{
						fontWeight: 600,
						fontSize: '1rem',
						color: 'var(--sl-color-text, #e6edf3)',
					}}>
					{summary.namespace}
				</span>
				<span
					style={{
						fontSize: '0.8rem',
						color: 'rgba(255, 255, 255, 0.5)',
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 500,
					}}>
					{summary.total.toLocaleString()} logs
				</span>
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
				<SeverityButton
					id={`${summary.namespace}-error`}
					count={summary.errors}
					level="error"
					isActive={isCardActive && activeLevel === 'error'}
					ns={summary.namespace}
				/>
				<SeverityButton
					id={`${summary.namespace}-warn`}
					count={summary.warns}
					level="warn"
					isActive={isCardActive && activeLevel === 'warn'}
					ns={summary.namespace}
				/>
				<SeverityButton
					id={`${summary.namespace}-info`}
					count={summary.infos}
					level="info"
					isActive={isCardActive && activeLevel === 'info'}
					ns={summary.namespace}
				/>
				<SeverityButton
					id={`${summary.namespace}-debug`}
					count={summary.debugs}
					level="debug"
					isActive={isCardActive && activeLevel === 'debug'}
					ns={summary.namespace}
				/>
			</div>
		</div>
	);
}

const sortOptions: { label: string; value: SortField }[] = [
	{ label: 'Total', value: 'total' },
	{ label: 'Errors', value: 'errors' },
	{ label: 'Warnings', value: 'warns' },
	{ label: 'Name', value: 'namespace' },
];

export default function ReactCHNamespaceGrid() {
	const statsLoading = useStore(clickhouseService.$statsLoading);
	const sortedNamespaces = useStore(clickhouseService.$sortedNamespaces);
	const sortField = useStore(clickhouseService.$sortField);
	const levelFilter = useStore(clickhouseService.$levelFilter);
	const namespaceFilter = useStore(clickhouseService.$namespaceFilter);

	if (statsLoading || sortedNamespaces.length === 0) return null;

	return (
		<>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
				}}>
				<ArrowUpDown
					size={13}
					style={{ color: 'rgba(255, 255, 255, 0.5)' }}
				/>
				<span
					style={{
						fontSize: '0.75rem',
						color: 'rgba(255, 255, 255, 0.5)',
						fontWeight: 500,
					}}>
					Sort:
				</span>
				{sortOptions.map((opt) => (
					<button
						key={opt.value}
						onClick={() =>
							clickhouseService.setSortField(opt.value)
						}
						style={{
							padding: '2px 8px',
							borderRadius: 4,
							border: `1px solid ${sortField === opt.value ? 'var(--sl-color-accent, #06b6d4)' : 'var(--sl-color-gray-5, #262626)'}`,
							background:
								sortField === opt.value
									? 'rgba(6, 182, 212, 0.12)'
									: 'transparent',
							color:
								sortField === opt.value
									? 'var(--sl-color-accent, #06b6d4)'
									: 'rgba(255, 255, 255, 0.5)',
							fontSize: '0.7rem',
							fontWeight: 500,
							cursor: 'pointer',
							transition: 'all 0.15s',
						}}>
						{opt.label}
					</button>
				))}
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns:
						'repeat(auto-fill, minmax(260px, 1fr))',
					gap: '0.75rem',
				}}>
				{sortedNamespaces.map((ns) => (
					<NamespaceCard
						key={ns.namespace}
						summary={ns}
						activeLevel={levelFilter}
						activeNamespace={namespaceFilter}
					/>
				))}
			</div>
		</>
	);
}
