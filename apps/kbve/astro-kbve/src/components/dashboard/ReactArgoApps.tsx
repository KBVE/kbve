import React from 'react';
import { useStore } from '@nanostores/react';
import { argoService } from './argoService';
import ReactArgoCards from './ReactArgoCards';
import ReactArgoAppTable from './ReactArgoAppTable';
import { LayoutGrid, List } from 'lucide-react';

function ViewToggle({ mode }: { mode: 'grid' | 'table' }) {
	const opt = (m: 'grid' | 'table', label: string, icon: React.ReactNode) => (
		<button
			type="button"
			onClick={() => argoService.setViewMode(m)}
			aria-pressed={mode === m}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 5,
				padding: '4px 10px',
				fontSize: '0.75rem',
				fontWeight: 600,
				border: 'none',
				cursor: 'pointer',
				background:
					mode === m ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
				color:
					mode === m ? '#c4b5fd' : 'var(--sl-color-gray-3, #8b949e)',
			}}>
			{icon}
			{label}
		</button>
	);
	return (
		<div
			style={{
				display: 'inline-flex',
				borderRadius: 6,
				border: '1px solid var(--sl-color-gray-5, #262626)',
				overflow: 'hidden',
			}}>
			{opt('grid', 'Cards', <LayoutGrid size={13} />)}
			{opt('table', 'Table', <List size={13} />)}
		</div>
	);
}

export default function ReactArgoApps() {
	const mode = useStore(argoService.$viewMode);
	const applications = useStore(argoService.$applications);

	return (
		<>
			{applications.length > 0 && (
				<div
					style={{
						display: 'flex',
						justifyContent: 'flex-end',
						marginBottom: '0.75rem',
					}}>
					<ViewToggle mode={mode} />
				</div>
			)}
			{mode === 'grid' ? <ReactArgoCards /> : <ReactArgoAppTable />}
		</>
	);
}
