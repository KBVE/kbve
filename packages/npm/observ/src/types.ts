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
	endpoint: string;
	project: string;
	release?: string;
	environment?: string;
	platform?: string;
	sessionId?: string;
	getUserId?: () => string | undefined;
	maxBatch?: number;
	flushIntervalMs?: number;
	sampleRate?: number;
	beforeSend?: (event: ErrorEvent) => ErrorEvent | null;
}
