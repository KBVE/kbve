import {
	createContext,
	useContext,
	useMemo,
	useSyncExternalStore,
	type ReactNode,
} from 'react';
import { I18nStore, laserI18n, type I18nVars } from './store';

const I18nContext = createContext<I18nStore>(laserI18n);

export function I18nProvider({
	store = laserI18n,
	children,
}: {
	store?: I18nStore;
	children: ReactNode;
}) {
	return (
		<I18nContext.Provider value={store}>{children}</I18nContext.Provider>
	);
}

export interface UseTranslation {
	t: (key: string, vars?: I18nVars) => string;
	locale: string;
	setLocale: (locale: string) => void;
	store: I18nStore;
}

export function useTranslation(): UseTranslation {
	const store = useContext(I18nContext);
	const locale = useSyncExternalStore(
		(cb) => store.subscribe(cb),
		() => store.getLocale(),
		() => store.getLocale(),
	);
	return useMemo(
		() => ({
			t: (key: string, vars?: I18nVars) => store.t(key, vars),
			locale,
			setLocale: (l: string) => store.setLocale(l),
			store,
		}),
		[store, locale],
	);
}
