export function stringifyBigInt(obj: Record<string, unknown>): string {
	return JSON.stringify(obj, (key, value) => {
		if (typeof value === 'bigint') {
			return value.toString();
		}
		return value;
	});
}

export function safeParse<T>(jsonString: string): T | null {
	try {
		return JSON.parse(jsonString) as T;
	} catch (error) {
		console.error('Failed to parse JSON:', error);
		return null;
	}
}

export function safeStringify(obj: unknown): string {
	try {
		return JSON.stringify(obj);
	} catch (error) {
		console.error('Failed to stringify JSON:', error);
		return '';
	}
}

export function utf8ToString(utf8Array: Uint8Array): string {
	const decoder = new TextDecoder('utf-8');
	return decoder.decode(utf8Array);
}
