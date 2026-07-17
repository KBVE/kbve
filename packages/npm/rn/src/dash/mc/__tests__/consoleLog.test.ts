import { describe, it, expect } from 'vitest';
import { appendLog } from '../RconConsole';

const entry = (n: number) => ({
	ts: n,
	command: 'list',
	args: [] as string[],
	ok: true,
	output: `out${n}`,
	latency_ms: 5,
});

describe('appendLog', () => {
	it('prepends newest first with increasing ids', () => {
		let log = appendLog([], entry(1));
		log = appendLog(log, entry(2));
		expect(log[0].output).toBe('out2');
		expect(log[1].output).toBe('out1');
		expect(log[0].id).not.toBe(log[1].id);
	});
	it('caps at 50 entries', () => {
		let log: ReturnType<typeof appendLog> = [];
		for (let i = 0; i < 60; i++) log = appendLog(log, entry(i));
		expect(log).toHaveLength(50);
		expect(log[0].output).toBe('out59');
	});
});
