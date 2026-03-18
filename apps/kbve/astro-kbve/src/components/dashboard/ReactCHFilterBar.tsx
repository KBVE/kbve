import { useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { Filter, Search, X } from 'lucide-react';
import { clickhouseService } from './clickhouseService';

function FilterChip({
	label,
	onRemove,
}: {
	label: string;
	onRemove: () => void;
}) {
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
				color: 'var(--sl-color-accent, #06b6d4)',
				background: 'rgba(6, 182, 212, 0.12)',
				border: '1px solid rgba(6, 182, 212, 0.25)',
			}}>
			{label}
			<button
				onClick={(e) => {
					e.stopPropagation();
					onRemove();
				}}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					padding: 0,
					border: 'none',
					background: 'none',
					color: 'var(--sl-color-accent, #06b6d4)',
					cursor: 'pointer',
					opacity: 0.7,
				}}>
				<X size={10} />
			</button>
		</span>
	);
}

const selectStyle: React.CSSProperties = {
	padding: '4px 8px',
	borderRadius: 6,
	border: '1px solid var(--sl-color-gray-5, #262626)',
	background: 'var(--sl-color-bg, #0a0a0a)',
	color: 'var(--sl-color-text, #e6edf3)',
	fontSize: '0.75rem',
	outline: 'none',
};

export default function ReactCHFilterBar() {
	const levelFilter = useStore(clickhouseService.$levelFilter);
	const namespaceFilter = useStore(clickhouseService.$namespaceFilter);
	const serviceFilter = useStore(clickhouseService.$serviceFilter);
	const searchText = useStore(clickhouseService.$searchText);
	const hasActiveFilters = useStore(clickhouseService.$hasActiveFilters);
	const allNamespaces = useStore(clickhouseService.$allNamespaces);
	const allServices = useStore(clickhouseService.$allServices);

	const searchInputRef = useRef<HTMLInputElement>(null);

	// Global keyboard shortcut: / to focus search
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (
				e.key === '/' &&
				!e.ctrlKey &&
				!e.metaKey &&
				document.activeElement?.tagName !== 'INPUT' &&
				document.activeElement?.tagName !== 'TEXTAREA' &&
				document.activeElement?.tagName !== 'SELECT'
			) {
				e.preventDefault();
				searchInputRef.current?.focus();
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, []);

	return (
		<div
			style={{
				padding: '0.75rem 1rem',
				borderBottom: '1px solid var(--sl-color-gray-5, #262626)',
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				position: 'sticky',
				top: 0,
				zIndex: 10,
				background: 'var(--sl-color-bg-nav, #111)',
			}}>
			<div
				style={{
					display: 'flex',
					gap: 8,
					flexWrap: 'wrap',
					alignItems: 'center',
				}}>
				<Filter
					size={14}
					style={{ color: 'rgba(255, 255, 255, 0.6)' }}
				/>
				<select
					value={levelFilter}
					onChange={(e) =>
						clickhouseService.setLevelFilter(e.target.value)
					}
					style={selectStyle}>
					<option value="">All levels</option>
					<option value="error">Error</option>
					<option value="warn">Warn</option>
					<option value="info">Info</option>
					<option value="debug">Debug</option>
				</select>
				<select
					value={namespaceFilter}
					onChange={(e) =>
						clickhouseService.setNamespaceFilter(e.target.value)
					}
					style={selectStyle}>
					<option value="">All namespaces</option>
					{allNamespaces.map((ns) => (
						<option key={ns} value={ns}>
							{ns}
						</option>
					))}
				</select>
				<select
					value={serviceFilter}
					onChange={(e) =>
						clickhouseService.setServiceFilter(e.target.value)
					}
					style={selectStyle}>
					<option value="">All services</option>
					{allServices.map((svc) => (
						<option key={svc} value={svc}>
							{svc}
						</option>
					))}
				</select>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 4,
						flex: 1,
						minWidth: 150,
					}}>
					<Search
						size={14}
						style={{ color: 'rgba(255, 255, 255, 0.5)' }}
					/>
					<input
						ref={searchInputRef}
						type="text"
						placeholder="Search logs... (press / to focus)"
						value={searchText}
						autoCorrect="off"
						autoCapitalize="off"
						spellCheck={false}
						onChange={(e) =>
							clickhouseService.setSearchText(e.target.value)
						}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								clickhouseService.applySearchImmediate();
							}
							if (e.key === 'Escape') {
								clickhouseService.clearSearch();
								searchInputRef.current?.blur();
							}
						}}
						style={{
							...selectStyle,
							flex: 1,
							minWidth: 0,
						}}
					/>
				</div>
				{hasActiveFilters && (
					<button
						onClick={() => clickhouseService.clearFilters()}
						style={{
							padding: '4px 8px',
							borderRadius: 4,
							border: '1px solid var(--sl-color-gray-5)',
							background: 'transparent',
							color: 'rgba(255, 255, 255, 0.7)',
							fontSize: '0.7rem',
							cursor: 'pointer',
						}}>
						Clear
					</button>
				)}
			</div>
			{hasActiveFilters && (
				<div
					style={{
						display: 'flex',
						gap: 6,
						flexWrap: 'wrap',
					}}>
					{levelFilter && (
						<FilterChip
							label={`level:${levelFilter}`}
							onRemove={() =>
								clickhouseService.setLevelFilter('')
							}
						/>
					)}
					{namespaceFilter && (
						<FilterChip
							label={`namespace:${namespaceFilter}`}
							onRemove={() =>
								clickhouseService.setNamespaceFilter('')
							}
						/>
					)}
					{serviceFilter && (
						<FilterChip
							label={`service:${serviceFilter}`}
							onRemove={() =>
								clickhouseService.setServiceFilter('')
							}
						/>
					)}
					{searchText && (
						<FilterChip
							label={`text:"${searchText}"`}
							onRemove={() => clickhouseService.clearSearch()}
						/>
					)}
				</div>
			)}
		</div>
	);
}
