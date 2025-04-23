import {
	type CollectionEntry,
	getEntry,
	type CollectionKey,
} from 'astro:content';

import {
	createI18n as baseCreateI18n,
	localeFrom,
	formatter,
	browser,
} from '@nanostores/i18n';
import { persistentAtom, persistentMap } from '@nanostores/persistent';
import { computed } from 'nanostores';

export const setting = persistentAtom<string>('locale', 'en');

export const i18nStore = persistentMap<Record<string, string>>(
	'i18n-cache',
	{},
	{
		encode: JSON.stringify,
		decode: JSON.parse,
	},
);

export function getTranslation(
	lang: string,
	namespace: string,
	key: string,
): string | undefined {
	return i18nStore.get()[`${lang}:${namespace}:${key}`];
}

export function setTranslation(
	lang: string,
	namespace: string,
	key: string,
	value: string,
) {
	i18nStore.setKey(`${lang}:${namespace}:${key}`, value);
}

export function createNamespaceGetter<T extends Record<string, string>>(
	namespace: string,
) {
	return (key: keyof T, lang?: string): string | undefined => {
		const currentLang = lang ?? setting.get() ?? 'en';
		return getTranslation(currentLang, namespace, key as string);
	};
}

export function createNamespaceSetter<T extends Record<string, string>>(
	namespace: string,
) {
	return (key: keyof T, value: string, lang?: string): void => {
		const currentLang = lang ?? setting.get() ?? 'en';
		setTranslation(currentLang, namespace, key as string, value);
	};
}

export function t<N extends CollectionKey>(namespace: N) {
	type Schema = CollectionEntry<N>['data'];

	return {
		get<K extends keyof Schema>(key: K): string {
			const lang = setting.get() ?? 'en';
			const fullKey = `${lang}:${namespace}:${key as string}`;
			return i18nStore.get()[fullKey] ?? `[${key as string}]`;
		},
	};
}
