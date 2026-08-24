export function parseRedisKeys(raw: string): string[] {
	return raw
		.split('\n')
		.map((line) =>
			line
				.replace(/^\s*\d+\)\s*/, '')
				.replace(/^"|"$/g, '')
				.trim(),
		)
		.filter(Boolean);
}
