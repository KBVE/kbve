import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '../shared/portal';
import { MenuStateContext, MenuDispatchContext } from './menu-context';
import type { SettingsCategory } from './menu-types';

const CATEGORIES: { key: SettingsCategory; label: string }[] = [
	{ key: 'general', label: 'General' },
	{ key: 'audio', label: 'Audio' },
	{ key: 'video', label: 'Video' },
	{ key: 'controls', label: 'Controls' },
];

function SettingsContent({ category }: { category: SettingsCategory }) {
	switch (category) {
		case 'general':
			return (
				<div className="space-y-3">
					<h3 className="text-[9px] mb-2">General Settings</h3>
					<div className="text-[8px] text-text-muted">
						Game settings will be added here.
					</div>
				</div>
			);
		case 'audio':
			return (
				<div className="space-y-3">
					<h3 className="text-[9px] mb-2">Audio Settings</h3>
					<div className="text-[8px] text-text-muted">
						Volume controls will be added here.
					</div>
				</div>
			);
		case 'video':
			return (
				<div className="space-y-3">
					<h3 className="text-[9px] mb-2">Video Settings</h3>
					<div className="text-[8px] text-text-muted">
						Resolution and display options will be added here.
					</div>
				</div>
			);
		case 'controls':
			return (
				<div className="space-y-3">
					<h3 className="text-[9px] mb-2">Controls</h3>
					<div className="text-[8px] text-text-muted space-y-1">
						<div>W / A / S / D — Move</div>
						<div>Space — Jump</div>
						<div>Escape — Toggle Menu</div>
					</div>
				</div>
			);
	}
}

export function PauseMenu() {
	const { isOpen, activeCategory } = useContext(MenuStateContext);
	const dispatch = useContext(MenuDispatchContext);

	if (!isOpen) return null;

	return createPortal(
		<div className="fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto">
			<div className="bg-panel border-2 border-panel-border shadow-panel w-full max-w-lg mx-4 animate-modal-in">
				{/* Header */}
				<div className="flex items-center justify-between px-3 py-2 border-b-2 border-panel-border bg-panel-inner">
					<h2 className="text-[10px]">Settings</h2>
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="text-text-muted hover:text-text text-[10px] leading-none cursor-pointer">
						&#x2715;
					</button>
				</div>

				{/* Body: sidebar + content */}
				<div className="flex min-h-[240px]">
					{/* Sidebar */}
					<div className="w-32 border-r-2 border-panel-border p-2 flex flex-col gap-1 bg-panel-inner">
						{CATEGORIES.map(({ key, label }) => (
							<button
								key={key}
								onClick={() =>
									dispatch({
										type: 'SET_CATEGORY',
										category: key,
									})
								}
								className={`
									text-left text-[8px] px-3 py-1.5 cursor-pointer transition-colors
									${activeCategory === key ? 'bg-btn text-text' : 'text-text-muted hover:text-text hover:bg-btn/30'}
								`}>
								{label}
							</button>
						))}
					</div>

					{/* Content */}
					<div className="flex-1 p-4 bg-panel-inner">
						<SettingsContent category={activeCategory} />
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end px-3 py-2 border-t-2 border-panel-border bg-panel-inner">
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="px-4 py-1.5 text-[8px] bg-btn border border-btn-border hover:bg-btn-hover cursor-pointer transition-colors text-text">
						Resume
					</button>
				</div>
			</div>
		</div>,
		getPortalRoot('menu-root'),
	);
}
