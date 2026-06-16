import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { mergeTheme, tokens } from './theme';
import type { ThemeOverride, Tokens } from './theme';

const ThemeContext = createContext<Tokens>(tokens);

export interface ThemeProviderProps {
	theme?: ThemeOverride;
	children: ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
	const value = useMemo(() => mergeTheme(theme), [theme]);
	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme(): Tokens {
	return useContext(ThemeContext);
}
