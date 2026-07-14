import {
	BreadcrumbTrail,
	instrumentConsole,
	instrumentDom,
	instrumentFetch,
} from './breadcrumbs';
import type { CaptureInput, ErrorEvent, ObservConfig } from './types';

const NOISE = [
	'ResizeObserver loop limit exceeded',
	'ResizeObserver loop completed with undelivered notifications',
	'Script error.',
];

function randomId(): string {
	const c = globalThis.crypto as Crypto | undefined;
	if (c?.randomUUID) return c.randomUUID();
	if (c?.getRandomValues) {
		const bytes = c.getRandomValues(new Uint8Array(16));
		return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
			'',
		);
	}
	return `anon-${Date.now().toString(36)}`;
}

function isNoise(message: string): boolean {
	return NOISE.some((n) => message.includes(n));
}

function errorType(err: unknown): string {
	if (err instanceof Error) return err.name || 'Error';
	return typeof err;
}

export class Observer {
	private cfg: Required<
		Pick<ObservConfig, 'maxBatch' | 'flushIntervalMs' | 'sampleRate'>
	> &
		ObservConfig;
	private queue: ErrorEvent[] = [];
	private timer: ReturnType<typeof setInterval> | null = null;
	private session: string;
	private installed = false;
	private trail: BreadcrumbTrail;

	constructor(config: ObservConfig) {
		this.cfg = {
			maxBatch: 20,
			flushIntervalMs: 5000,
			sampleRate: 1,
			...config,
		};
		this.session = config.sessionId ?? randomId();
		this.trail = new BreadcrumbTrail(config.maxBreadcrumbs ?? 20);
	}

	/// Record a manual breadcrumb; surfaces in `extra.breadcrumbs` on the next capture.
	breadcrumb(message: string, data?: Record<string, unknown>): void {
		this.trail.add('custom', message, data);
	}

	private startTimer(): void {
		this.timer = setInterval(
			() => this.flush(false),
			this.cfg.flushIntervalMs,
		);
	}

	/// React Native / non-DOM install: global handlers + flush timer, no window.
	installNative(): this {
		if (this.installed) return this;
		this.installed = true;
		if (this.cfg.captureConsole) instrumentConsole(this.trail);
		if (this.cfg.captureFetch ?? true) instrumentFetch(this.trail);

		const g = globalThis as {
			ErrorUtils?: {
				getGlobalHandler?: () => ((e: unknown, fatal?: boolean) => void) | undefined;
				setGlobalHandler?: (h: (e: unknown, fatal?: boolean) => void) => void;
			};
		};
		const eu = g.ErrorUtils;
		if (eu?.setGlobalHandler) {
			const prev = eu.getGlobalHandler?.();
			eu.setGlobalHandler((err: unknown, fatal?: boolean) => {
				this.capture({
					message: err instanceof Error ? err.message : String(err),
					stack: err instanceof Error ? err.stack : undefined,
					error_type: errorType(err),
					handled: false,
					extra: { fatal: fatal ?? false },
				});
				this.flush(true);
				prev?.(err, fatal);
			});
		}
		this.startTimer();
		return this;
	}

	install(): this {
		if (this.installed || typeof window === 'undefined') return this;
		this.installed = true;
		if (this.cfg.captureConsole) instrumentConsole(this.trail);
		if (this.cfg.captureClicks ?? true) instrumentDom(this.trail);
		if (this.cfg.captureFetch ?? true) instrumentFetch(this.trail);

		window.addEventListener('error', (e: ErrorEvent_) => {
			const err = e.error;
			this.capture({
				message: e.message || String(err) || 'unknown error',
				stack: err instanceof Error ? err.stack : undefined,
				error_type: errorType(err),
				url:
					typeof location !== 'undefined' ? location.href : undefined,
				handled: false,
			});
		});

		window.addEventListener(
			'unhandledrejection',
			(e: PromiseRejectionEvent) => {
				const reason = e.reason;
				this.capture({
					message:
						reason instanceof Error
							? reason.message
							: String(reason),
					stack: reason instanceof Error ? reason.stack : undefined,
					error_type:
						reason instanceof Error
							? reason.name
							: 'UnhandledRejection',
					url:
						typeof location !== 'undefined'
							? location.href
							: undefined,
					handled: false,
				});
			},
		);

		const flushNow = () => this.flush(true);
		window.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'hidden') flushNow();
		});
		window.addEventListener('pagehide', flushNow);

		this.startTimer();
		return this;
	}

	stop(): void {
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.flush(true);
	}

	captureException(err: unknown, extra?: Record<string, unknown>): void {
		this.capture({
			message: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
			error_type: errorType(err),
			url: typeof location !== 'undefined' ? location.href : undefined,
			handled: true,
			extra,
		});
	}

	private capture(input: CaptureInput): void {
		if (this.cfg.sampleRate < 1 && Math.random() > this.cfg.sampleRate)
			return;
		if (!input.message || isNoise(input.message)) return;

		const crumbs = this.trail.snapshot();
		const extra =
			crumbs.length > 0
				? { ...input.extra, breadcrumbs: crumbs }
				: input.extra;

		let event: ErrorEvent = {
			project: this.cfg.project,
			platform: this.cfg.platform ?? 'web',
			release: this.cfg.release ?? '',
			environment: this.cfg.environment ?? '',
			error_type: input.error_type ?? '',
			message: input.message,
			stack: input.stack ?? '',
			url: input.url ?? '',
			user_id: this.cfg.getUserId?.() ?? '',
			session_id: this.session,
			handled: input.handled ?? false,
			extra,
		};

		if (this.cfg.beforeSend) {
			const out = this.cfg.beforeSend(event);
			if (!out) return;
			event = out;
		}

		this.queue.push(event);
		if (this.queue.length >= this.cfg.maxBatch) this.flush(false);
	}

	flush(useBeacon: boolean): void {
		if (this.queue.length === 0) return;
		const events = this.queue.splice(0, this.queue.length);
		const body = JSON.stringify({ events });

		if (
			useBeacon &&
			typeof navigator !== 'undefined' &&
			navigator.sendBeacon
		) {
			const blob = new Blob([body], { type: 'application/json' });
			if (navigator.sendBeacon(this.cfg.endpoint, blob)) return;
		}

		void fetch(this.cfg.endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			keepalive: true,
			credentials: 'omit',
		}).catch(() => undefined);
	}
}

type ErrorEvent_ = Event & { message: string; error?: unknown };
