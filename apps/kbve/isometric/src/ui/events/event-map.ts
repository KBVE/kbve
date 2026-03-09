import type { ReactNode } from 'react';

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error' | 'loot';

export type InteractableKind =
	| 'tree'
	| 'crate'
	| 'crystal'
	| 'pillar'
	| 'sphere';

export type GameEventMap = {
	// Toast events
	'toast:show': {
		message: string;
		severity: ToastSeverity;
		duration?: number;
	};
	'toast:dismiss': { id: string };
	'toast:clear': void;

	// Modal events
	'modal:open': {
		id?: string;
		title: string;
		content: ReactNode;
		onClose?: () => void;
	};
	'modal:close': void;

	// Menu events
	'menu:toggle': void;
	'menu:open': void;
	'menu:close': void;

	// Game state events (from Tauri IPC bridge)
	'game:damage': { amount: number; source: string };
	'game:heal': { amount: number };
	'game:item-pickup': { name: string; quantity: number };
	'game:achievement': { title: string; description: string };
	'game:death': void;

	// Object selection (from Bevy game via snapshot polling)
	'game:object-selected': {
		kind: InteractableKind;
		position: [number, number, number];
		entity_id: number;
	};

	// Settings
	'settings:changed': { key: string; value: unknown };
};
