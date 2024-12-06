export function stringifyBigInt(obj: Record<string, unknown>): string {
	try {
		return JSON.stringify(obj, (key, value) => {
			if (typeof value === 'bigint') {
				return value.toString();
			}
			return value;
		});
	} catch (error) {
		throw new Error(
			`Failed to stringify object with BigInt values: ${error instanceof Error ? error.message : error}`,
		);
	}
}

export function safeParse<T>(jsonString: string): T | null {
	try {
		return JSON.parse(jsonString) as T;
	} catch (error) {
		throw new Error(
			`Failed to parse JSON: ${error instanceof Error ? error.message : error}`,
		);
	}
}

export function safeStringify(obj: unknown): string {
	try {
		return JSON.stringify(obj);
	} catch (error) {
		throw new Error(
			`Failed to stringify JSON: ${error instanceof Error ? error.message : error}`,
		);
	}
}

export function utf8ToString(utf8Array: Uint8Array): string {
	try {
		const decoder = new TextDecoder('utf-8');
		return decoder.decode(utf8Array);
	} catch (error) {
		throw new Error('Unable to decode UTF-8 array to string.');
	}
}

export function stringToUtf8(str: string): Uint8Array {
	try {
		const encoder = new TextEncoder();
		return encoder.encode(str);
	} catch (error) {
		throw new Error('Unable to encode string to UTF-8 array.');
	}
}

export function getNestedIFrame(iframeId = 'nested'): HTMLIFrameElement {
	try {
		const iframe = document.getElementById(
			iframeId,
		) as HTMLIFrameElement | null;
		if (iframe) {
			return iframe;
		}

		console.warn(
			`No iframe with id '${iframeId}' found. Falling back to the first iframe.`,
		);
		const firstIframe = document.getElementsByTagName('iframe')[0];
		if (!firstIframe) {
			throw new Error('No iframes found in the document.');
		}

		return firstIframe as HTMLIFrameElement;
	} catch (error) {
		console.error('Error retrieving iframe:', error);
		throw error;
	}
}

class Helper {
	private static instance: Helper;

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	private constructor() {}

	public static getInstance(): Helper {
		if (!Helper.instance) {
			Helper.instance = new Helper();
		}
		return Helper.instance;
	}

	private safeCall<T>(fn: () => T): { data?: T; error?: Error } {
		try {
			return { data: fn() };
		} catch (error) {
			return { error: this.wrapError(error) };
		}
	}

	private wrapError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}
		return new Error(
			typeof error === 'string' ? error : 'An unknown error occurred',
		);
	}

	public stringifyBigInt(obj: Record<string, unknown>): {
		data?: string;
		error?: Error;
	} {
		return this.safeCall(() => stringifyBigInt(obj));
	}

	public safeParse<T>(jsonString: string): {
		data?: T | null;
		error?: Error;
	} {
		return this.safeCall(() => safeParse<T>(jsonString));
	}

	public safeStringify(obj: unknown): { data?: string; error?: Error } {
		return this.safeCall(() => safeStringify(obj));
	}

	public utf8ToString(utf8Array: Uint8Array): {
		data?: string;
		error?: Error;
	} {
		return this.safeCall(() => utf8ToString(utf8Array));
	}

	public stringToUtf8(str: string): { data?: Uint8Array; error?: Error } {
		return this.safeCall(() => stringToUtf8(str));
	}

	public getNestedIFrame(iframeId = 'nested'): {
		data?: HTMLIFrameElement | null;
		error?: Error;
	} {
		return this.safeCall(() => getNestedIFrame(iframeId));
	}

	public sanitizeFields(
		target: any,
		fieldsToClean: Array<{ field: string; key: string }>,
	): any {
		if (!target) return target;

		for (const { field, key } of fieldsToClean) {
			if (target[field]?.[key] === '') {
				delete target[field];
			}
		}

		return target;
	}
}

export const Help = Helper.getInstance();
