import {
	BreadcrumbTrail,
	instrumentConsole,
	instrumentDom,
	instrumentFetch,
} from './breadcrumbs';
import { collectVitals, siblingEndpoint, type Vital } from './vitals';
import type { CaptureInput, ErrorEvent, ObservConfig } from './types';

interface PerfEvent {
	project: string;
	platform: string;
	release: string;
	environment: string;
	metric: string;
	value: number;
	rating: string;
	navigation_type: string;
	url: string;
	user_id: string;
	session_id: string;
	extra?: Record<string, unknown>;
}

interface ProductEvent {
	project: string;
	platform: string;
	release: string;
	environment: string;
	name: string;
	url: string;
	user_id: string;
	session_id: string;
	extra?: Record<string, unknown>;
}

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
	// One queue per lens, matching the ingest: the routes take different shapes
	// and a mixed batch would be rejected wholesale by whichever it was posted to.
	private perfQueue: PerfEvent[] = [];
	private productQueue: ProductEvent[] = [];
	private stopVitals: (() => void) | null = null;
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

	/// The routing fields every lens shares.
	private common() {
		return {
			project: this.cfg.project,
			platform: this.cfg.platform ?? 'web',
			release: this.cfg.release ?? '',
			environment: this.cfg.environment ?? '',
			url: typeof location !== 'undefined' ? location.href : '',
			user_id: this.cfg.getUserId?.() ?? '',
			session_id: this.session,
		};
	}

	/// Record a named product event. Sampling applies, so a funnel measured this
	/// way is measured on the same population the errors are.
	trackEvent(name: string, extra?: Record<string, unknown>): void {
		if (!name) return;
		if (this.cfg.sampleRate < 1 && Math.random() > this.cfg.sampleRate) return;
		this.productQueue.push({ ...this.common(), name, extra });
		if (this.productQueue.length >= this.cfg.maxBatch) this.flush(false);
	}

	private trackVital(v: Vital): void {
		this.perfQueue.push({
			...this.common(),
			metric: v.metric,
			value: v.value,
			rating: v.rating,
			navigation_type: v.navigation_type ?? '',
		});
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

		if (this.cfg.captureVitals) {
			this.stopVitals = collectVitals((v) => this.trackVital(v));
		}

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
		// Before the flush, not after: finalizing the vitals is what puts the
		// last LCP/CLS/INP on the queue this flush is meant to drain.
		this.stopVitals?.();
		this.stopVitals = null;
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
		this.send(this.cfg.endpoint, this.queue.splice(0), useBeacon);
		this.send(
			this.cfg.perfEndpoint ?? siblingEndpoint(this.cfg.endpoint, 'perf'),
			this.perfQueue.splice(0),
			useBeacon,
		);
		this.send(
			this.cfg.eventsEndpoint ?? siblingEndpoint(this.cfg.endpoint, 'events'),
			this.productQueue.splice(0),
			useBeacon,
		);
	}

	private send(endpoint: string, events: unknown[], useBeacon: boolean): void {
		if (events.length === 0) return;
		const body = JSON.stringify({ events });

		if (
			useBeacon &&
			typeof navigator !== 'undefined' &&
			navigator.sendBeacon
		) {
			const blob = new Blob([body], { type: 'application/json' });
			if (navigator.sendBeacon(endpoint, blob)) return;
		}

		void fetch(endpoint, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			keepalive: true,
			credentials: 'omit',
		}).catch(() => undefined);
	}
}

type ErrorEvent_ = Event & { message: string; error?: unknown };
