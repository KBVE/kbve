export interface ErrorEvent {
	project: string;
	platform?: string;
	release?: string;
	environment?: string;
	error_type?: string;
	message: string;
	stack?: string;
	url?: string;
	user_id?: string;
	session_id?: string;
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
