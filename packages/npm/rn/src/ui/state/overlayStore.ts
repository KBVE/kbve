import type { ReactNode } from 'react';
import { createUiStore, useStore } from './store';
import type { MenuSectionModel } from '../models';

export type OverlayDescriptor =
	| {
			type: 'confirm';
			title: string;
			message: string;
			confirmLabel?: string;
			cancelLabel?: string;
			destructive?: boolean;
			onConfirm: () => void;
	  }
	| { type: 'menu'; title?: string; sections: readonly MenuSectionModel[] }
	| { type: 'sheet'; content: ReactNode };

interface OverlayState {
	active: OverlayDescriptor | null;
}

const store = createUiStore<OverlayState>({ active: null });

export const overlayStore = {
	subscribe: store.subscribe,
	show: (descriptor: OverlayDescriptor) => store.set({ active: descriptor }),
	hide: () => store.set({ active: null }),
};

export function useActiveOverlay(): OverlayDescriptor | null {
	return useStore(store, (state) => state.active);
}
