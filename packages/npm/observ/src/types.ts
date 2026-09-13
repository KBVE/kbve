import type { ErrorEvent } from './generated/telemetry-schema';

export type { ErrorEvent, ErrorBatch } from './generated/telemetry-schema';

export interface CaptureInput {
	message: string;
	stack?: string;
	error_type?: string;
	url?: string;
	handled?: boolean;
	extra?: Record<string, unknown>;
}

export interface ObservConfig {
	/// The errors ingest URL. The perf and product endpoints default to its
	/// siblings (.../ingest/perf, .../ingest/events); override only if they do
	/// not live under the same prefix.
	endpoint: string;
	perfEndpoint?: string;
	eventsEndpoint?: string;
	project: string;
	release?: string;
	environment?: string;
	platform?: string;
	sessionId?: string;
	getUserId?: () => string | undefined;
	maxBatch?: number;
	flushIntervalMs?: number;
	sampleRate?: number;
	maxBreadcrumbs?: number;
	captureConsole?: boolean;
	captureClicks?: boolean;
	captureFetch?: boolean;
	/// Collect Web Vitals (LCP/INP/CLS/FCP/TTFB). Off by default: it installs
	/// PerformanceObservers, which a caller that only wants error reporting
	/// should not pay for.
	captureVitals?: boolean;
	beforeSend?: (event: ErrorEvent) => ErrorEvent | null;
}
