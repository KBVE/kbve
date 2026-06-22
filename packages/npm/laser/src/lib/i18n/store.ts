export type LocaleMessages = Record<string, string>;

export type I18nVars = Record<string, string | number>;

export interface I18nOptions {
	locale?: string;
	fallbackLocale?: string;
	messages?: Record<string, LocaleMessages>;
}

type Listener = () => void;

const VAR_PATTERN = /\{(\w+)\}/g;

function interpolate(template: string, vars?: I18nVars): string {
	if (!vars) return template;
	return template.replace(VAR_PATTERN, (whole, key: string) => {
		const v = vars[key];
		return v === undefined ? whole : String(v);
	});
}

export class I18nStore {
	private locale: string;
	private fallback: string;
	private bundles = new Map<string, LocaleMessages>();
	private listeners = new Set<Listener>();

	constructor(opts: I18nOptions = {}) {
		this.locale = opts.locale ?? 'en';
		this.fallback = opts.fallbackLocale ?? 'en';
		if (opts.messages) {
			for (const [loc, msgs] of Object.entries(opts.messages)) {
				this.bundles.set(loc, { ...msgs });
			}
		}
	}

	getLocale(): string {
		return this.locale;
	}

	setLocale(locale: string): void {
		if (locale === this.locale) return;
		this.locale = locale;
		this.emit();
	}

	getLocales(): string[] {
		return [...this.bundles.keys()];
	}

	add(locale: string, messages: LocaleMessages): void {
		const existing = this.bundles.get(locale);
		this.bundles.set(
			locale,
			existing ? { ...existing, ...messages } : { ...messages },
		);
		this.emit();
	}

	has(key: string, locale = this.locale): boolean {
		return (
			this.bundles.get(locale)?.[key] !== undefined ||
			this.bundles.get(this.fallback)?.[key] !== undefined
		);
	}

	t(key: string, vars?: I18nVars): string {
		const fromLocale = this.bundles.get(this.locale)?.[key];
		if (fromLocale !== undefined) return interpolate(fromLocale, vars);
		const fromFallback = this.bundles.get(this.fallback)?.[key];
		if (fromFallback !== undefined) return interpolate(fromFallback, vars);
		return key;
	}

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private emit(): void {
		this.listeners.forEach((l) => l());
	}
}

export const laserI18n = new I18nStore();
