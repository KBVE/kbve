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

export interface DroidProviderProps {
	children: ReactNode;
	workerURLs?: Record<string, string>;
}

export function DroidProvider({ children, workerURLs }: DroidProviderProps) {
	const state = useDroid(workerURLs);

	return (
		<DroidContext.Provider value={state}>
			{children}
		</DroidContext.Provider>
	);
}
