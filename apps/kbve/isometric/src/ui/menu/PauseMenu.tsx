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
					<h3 className="text-sm font-semibold mb-2">
						General Settings
					</h3>
					<div className="text-[13px] text-white/60">
						Game settings will be added here.
					</div>
				</div>
			);
		case 'audio':
			return (
				<div className="space-y-3">
					<h3 className="text-sm font-semibold mb-2">
						Audio Settings
					</h3>
					<div className="text-[13px] text-white/60">
						Volume controls will be added here.
					</div>
				</div>
			);
		case 'video':
			return (
				<div className="space-y-3">
					<h3 className="text-sm font-semibold mb-2">
						Video Settings
					</h3>
					<div className="text-[13px] text-white/60">
						Resolution and display options will be added here.
					</div>
				</div>
			);
		case 'controls':
			return (
				<div className="space-y-3">
					<h3 className="text-sm font-semibold mb-2">Controls</h3>
					<div className="text-[13px] text-white/60 space-y-1">
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
		<div className="fixed inset-0 bg-overlay backdrop-blur-[8px] flex items-center justify-center pointer-events-auto">
			<div className="bg-glass backdrop-blur-[4px] rounded-panel border border-glass-border shadow-glass w-full max-w-lg mx-4 animate-modal-in">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
					<h2 className="text-sm font-semibold">Settings</h2>
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="text-white/50 hover:text-white text-lg leading-none cursor-pointer">
						&times;
					</button>
				</div>

				{/* Body: sidebar + content */}
				<div className="flex min-h-[240px]">
					{/* Sidebar */}
					<div className="w-32 border-r border-glass-border p-2 flex flex-col gap-1">
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
									text-left text-[13px] px-3 py-1.5 rounded-slot cursor-pointer transition-colors
									${activeCategory === key ? 'bg-glass-light text-white' : 'text-white/60 hover:text-white hover:bg-glass-hover'}
								`}>
								{label}
							</button>
						))}
					</div>

					{/* Content */}
					<div className="flex-1 p-4">
						<SettingsContent category={activeCategory} />
					</div>
				</div>

				{/* Footer */}
				<div className="flex justify-end px-4 py-3 border-t border-glass-border">
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="px-4 py-1.5 text-[13px] bg-glass-light border border-glass-border rounded-slot hover:bg-glass-hover cursor-pointer transition-colors">
						Resume
					</button>
				</div>
			</div>
		</div>,
		getPortalRoot('menu-root'),
	);
}
