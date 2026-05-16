export interface BillingErrorInfo {
	reason: string;
	needed?: number;
	hint?: string;
}

export function parseBillingError(message: string): BillingErrorInfo | null {
	if (!message.includes('402')) return null;
	const jsonStart = message.indexOf('{');
	if (jsonStart === -1) {
		return { reason: 'Insufficient credits' };
	}
	const tail = message.slice(jsonStart);
	const needMatch = tail.match(/"needed"\s*:\s*(\d+)/);
	const reasonMatch = tail.match(/"error"\s*:\s*"([^"]+)"/);
	const hintMatch = tail.match(/"hint"\s*:\s*"([^"]+)"/);
	return {
		reason: reasonMatch ? reasonMatch[1] : 'Insufficient credits',
		needed: needMatch ? parseInt(needMatch[1], 10) : undefined,
		hint: hintMatch ? hintMatch[1] : undefined,
	};
}
