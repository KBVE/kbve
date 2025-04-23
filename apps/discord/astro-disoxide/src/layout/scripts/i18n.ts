export type CollectionKey = 'sidebar' | 'panel';
import { persistentAtom, persistentMap } from '@nanostores/persistent';

export const setting = persistentAtom<string>('locale', 'en');

export const i18nStore = persistentMap<Record<string, string>>(
	'i18n-cache',
	{},
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

export async function loadI18nJson() {
	try {
		const res = await fetch('/i18n/db.json');
		if (!res.ok) throw new Error('Failed to fetch db.json');
		const data: Record<string, string> = await res.json();

		for (const [key, value] of Object.entries(data)) {
			i18nStore.setKey(key, value);
		}
	} catch (e) {
		console.warn('[i18n] Failed to load translations:', e);
	}
}

export function getTranslation(lang: string, namespace: string, key: string): string | undefined {
	return i18nStore.get()[`${lang}:${namespace}:${key}`];
}

export function setTranslation(lang: string, namespace: string, key: string, value: string) {
	i18nStore.setKey(`${lang}:${namespace}:${key}`, value);
}

export function t<N extends CollectionKey>(namespace: N) {
	return {
		get(key: string): string {
			const lang = setting.get() ?? 'en';
			const fullKey = `${lang}:${namespace}:${key}`;
			return i18nStore.get()[fullKey] ?? `[${key}]`;
		},
	};
}
