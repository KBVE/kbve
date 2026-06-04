import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import {
	DOMAIN_RE,
	fillTemplate,
	normalizeDomain,
	type WebmasterTool,
} from './toolsCatalog';

export {
	CATEGORIES,
	DOMAIN_RE,
	TOOLS,
	TOOLS_BY_CATEGORY,
	TOOLS_POPULAR,
	fillTemplate,
	normalizeDomain,
} from './toolsCatalog';
export type { CategoryMeta, ToolCategory, WebmasterTool } from './toolsCatalog';

const HISTORY_KEY = 'kbve:webmaster:history';
const HISTORY_LIMIT = 5;

function decodeHistory(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x): x is string => typeof x === 'string');
	} catch {
		return [];
	}
}

class WebmasterService {
	public readonly $domain = atom<string>('');
	public readonly $history = persistentAtom<string[]>(HISTORY_KEY, [], {
		encode: JSON.stringify,
		decode: decodeHistory,
	});

	public readonly $normalized = computed([this.$domain], (raw) =>
		normalizeDomain(raw),
	);

	public readonly $isValid = computed(
		[this.$normalized],
		(d) => d.length > 0 && DOMAIN_RE.test(d),
	);

	public readonly $encoded = computed([this.$normalized], (d) =>
		encodeURIComponent(d),
	);

	public readonly $encodedHttps = computed([this.$normalized], (d) =>
		encodeURIComponent(`https://${d}/`),
	);

	public setDomain(value: string): void {
		this.$domain.set(value);
	}

	public commitHistory(): void {
		if (!this.$isValid.get()) return;
		const d = this.$normalized.get();
		const cur = this.$history.get();
		const next = [d, ...cur.filter((x) => x !== d)].slice(0, HISTORY_LIMIT);
		this.$history.set(next);
	}

	public removeFromHistory(domain: string): void {
		this.$history.set(this.$history.get().filter((d) => d !== domain));
	}

	public clearHistory(): void {
		this.$history.set([]);
	}

	public buildUrl(tool: WebmasterTool): string | null {
		if (!this.$isValid.get()) return null;
		return fillTemplate(
			tool.urlTemplate,
			this.$normalized.get(),
			this.$encoded.get(),
			this.$encodedHttps.get(),
		);
	}

	/**
	 * Hydrates static [data-webmaster-tool] anchors. Subscribes once to the
	 * domain atom and mutates DOM attributes directly on change — no React diff.
	 * Returns an unsubscribe fn for cleanup on island unmount.
	 */
	public bindToolButtons(root: ParentNode = document): () => void {
		if (typeof window === 'undefined') return () => {};
		const buttons = Array.from(
			root.querySelectorAll<HTMLAnchorElement>('[data-webmaster-tool]'),
		);
		if (buttons.length === 0) return () => {};

		const apply = () => {
			const valid = this.$isValid.get();
			const d = this.$normalized.get();
			const enc = this.$encoded.get();
			const ench = this.$encodedHttps.get();
			for (const el of buttons) {
				const tpl = el.dataset.urlTpl ?? '';
				if (!tpl) continue;
				if (valid) {
					el.setAttribute('href', fillTemplate(tpl, d, enc, ench));
					el.removeAttribute('aria-disabled');
					el.removeAttribute('tabindex');
					el.dataset.disabled = 'false';
				} else {
					el.removeAttribute('href');
					el.setAttribute('aria-disabled', 'true');
					el.setAttribute('tabindex', '-1');
					el.dataset.disabled = 'true';
				}
			}
		};

		// nanostores fires the listener synchronously on subscribe with the
		// current value, so initial paint is covered without a manual call.
		return this.$domain.subscribe(apply);
	}
}

export const webmasterService = new WebmasterService();
