export interface Breadcrumb {
	t: number;
	kind: 'console' | 'click' | 'nav' | 'fetch' | 'custom';
	message: string;
	data?: Record<string, unknown>;
}

export class BreadcrumbTrail {
	private buf: Breadcrumb[] = [];
	private readonly max: number;
	private readonly clock: () => number;

	constructor(max = 20, clock: () => number = () => Date.now()) {
		this.max = Math.max(1, max);
		this.clock = clock;
	}

	add(kind: Breadcrumb['kind'], message: string, data?: Record<string, unknown>): void {
		if (!message) return;
		this.buf.push({ t: this.clock(), kind, message: message.slice(0, 256), data });
		if (this.buf.length > this.max) this.buf.shift();
	}

	snapshot(): Breadcrumb[] {
		return this.buf.slice();
	}
}

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error';

export function instrumentConsole(
	trail: BreadcrumbTrail,
	levels: ConsoleLevel[] = ['warn', 'error'],
): void {
	const c = globalThis.console as unknown as
		| Record<string, (...a: unknown[]) => void>
		| undefined;
	if (!c) return;
	for (const level of levels) {
		const original = c[level];
		if (typeof original !== 'function') continue;
		c[level] = (...args: unknown[]) => {
			trail.add('console', `${level}: ${args.map(stringifyArg).join(' ')}`);
			original.apply(c, args);
		};
	}
}

export function instrumentDom(trail: BreadcrumbTrail): void {
	if (typeof document === 'undefined' || !document.addEventListener) return;
	document.addEventListener(
		'click',
		(e) => {
			const el = e.target as Element | null;
			if (!el || !el.tagName) return;
			trail.add('click', selector(el));
		},
		true,
	);
}

export function instrumentFetch(trail: BreadcrumbTrail): void {
	const g = globalThis as { fetch?: typeof fetch };
	const original = g.fetch;
	if (typeof original !== 'function') return;
	g.fetch = (...args: Parameters<typeof fetch>) => {
		const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url ?? '';
		const method = (args[1]?.method ?? 'GET').toUpperCase();
		return original(...args).then(
			(res) => {
				trail.add('fetch', `${method} ${stripUrl(url)} → ${res.status}`);
				return res;
			},
			(err: unknown) => {
				trail.add('fetch', `${method} ${stripUrl(url)} → failed`);
				throw err;
			},
		);
	};
}

function stringifyArg(a: unknown): string {
	if (typeof a === 'string') return a;
	if (a instanceof Error) return a.message;
	try {
		return JSON.stringify(a) ?? String(a);
	} catch {
		return String(a);
	}
}

function selector(el: Element): string {
	const tag = el.tagName.toLowerCase();
	const id = el.id ? `#${el.id}` : '';
	const cls =
		typeof el.className === 'string' && el.className
			? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
			: '';
	return `${tag}${id}${cls}`;
}

function stripUrl(url: string): string {
	const i = url.indexOf('?');
	return i === -1 ? url : url.slice(0, i);
}
