import en from './en.json';

type Dict = { [key: string]: string | Dict };

type TOptions = { defaultValue?: string } & Record<string, unknown>;

function lookup(key: string): string | undefined {
	let node: string | Dict | undefined = en as Dict;
	for (const part of key.split('.')) {
		if (typeof node !== 'object' || node === undefined) return undefined;
		node = node[part];
	}
	return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars: Record<string, unknown>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
		vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`,
	);
}

export function t(
	key: string,
	defaultValueOrOptions?: string | TOptions,
	maybeOptions?: TOptions,
): string {
	const opts: TOptions | undefined =
		typeof defaultValueOrOptions === 'string'
			? { defaultValue: defaultValueOrOptions, ...maybeOptions }
			: defaultValueOrOptions;
	const raw = lookup(key) ?? opts?.defaultValue ?? key;
	return opts ? interpolate(raw, opts) : raw;
}

export function useTranslation() {
	return { t, i18n: { language: 'en' } };
}
