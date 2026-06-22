import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { InputRouter, getInputRouter } from '../input-router';

const InputRouterContext = createContext<InputRouter | null>(null);

export function InputProvider({
	children,
	router,
}: {
	children: ReactNode;
	router?: InputRouter;
}) {
	const value = useMemo(() => router ?? getInputRouter(), [router]);
	return (
		<InputRouterContext.Provider value={value}>
			{children}
		</InputRouterContext.Provider>
	);
}

export function useInputRouter(): InputRouter {
	const router = useContext(InputRouterContext);
	if (!router) {
		throw new Error('useInputRouter must be used within <InputProvider>');
	}
	return router;
}
