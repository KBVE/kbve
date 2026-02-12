import { createContext, useContext, type ReactNode } from 'react';
import { useDroid, type DroidState } from '../hooks/useDroid';

const DroidContext = createContext<DroidState | null>(null);

export function useDroidContext(): DroidState {
	const ctx = useContext(DroidContext);
	if (!ctx) {
		throw new Error('useDroidContext must be used within a <DroidProvider>');
	}
	return ctx;
}

export function DroidProvider({ children }: { children: ReactNode }) {
	const state = useDroid();

	return (
		<DroidContext.Provider value={state}>
			{children}
		</DroidContext.Provider>
	);
}
