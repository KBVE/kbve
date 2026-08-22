import { describe, it, expect } from 'vitest';
import {
	mapWowNodes,
	tickTone,
	tickLabel,
	TICK_WARN_MS,
	TICK_CRIT_MS,
} from '../wowMetrics';

const row = (pod: string, value: number) => ({ metric: { pod, namespace: 'tocloud9' }, value });

const vectors = {
	connections: [
		row('tocloud9-worldserver-abc-1', 42),
		row('tocloud9-gateway-xyz-0', 7),
	],
	mean: [row('tocloud9-worldserver-abc-1', 8)],
	median: [row('tocloud9-worldserver-abc-1', 7)],
	p95: [row('tocloud9-worldserver-abc-1', 12.4)],
	p99: [row('tocloud9-worldserver-abc-1', 31)],
	max: [row('tocloud9-worldserver-abc-1', 210)],
	up: [
		row('tocloud9-worldserver-abc-1', 1),
		row('tocloud9-gateway-xyz-0', 1),
	],
};

describe('mapWowNodes', () => {
	it('derives role from the pod name prefix', () => {
		const items = mapWowNodes(vectors);
		expect(items.map((i) => i.role)).toEqual(['gateway', 'worldserver']);
	});

	it('joins every metric onto its pod', () => {
		const ws = mapWowNodes(vectors).find((i) => i.role === 'worldserver')!;
		expect(ws).toMatchObject({
			id: 'tocloud9-worldserver-abc-1',
			connections: 42,
			tickMean: 8,
			tickMedian: 7,
			tickP95: 12.4,
			tickP99: 31,
			tickMax: 210,
			up: true,
		});
	});

	it('missing metrics become null, not zero', () => {
		const gw = mapWowNodes(vectors).find((i) => i.role === 'gateway')!;
		expect(gw.tickMean).toBeNull();
		expect(gw.tickMedian).toBeNull();
		expect(gw.tickP95).toBeNull();
		expect(gw.tickP99).toBeNull();
		expect(gw.tickMax).toBeNull();
		expect(gw.connections).toBe(7);
	});

	it('a pod present only in up{} still yields a row that is down-aware', () => {
		const items = mapWowNodes({
			connections: [],
			p95: [],
			p99: [],
			max: [],
			up: [row('tocloud9-worldserver-dead-9', 0)],
		});
		expect(items).toHaveLength(1);
		expect(items[0].up).toBe(false);
		expect(items[0].connections).toBeNull();
	});

	it('unknown pod prefixes sort last as unknown', () => {
		const items = mapWowNodes({
			connections: [row('some-other-pod', 1)],
			p95: [],
			p99: [],
			max: [],
			up: [],
		});
		expect(items[0].role).toBe('unknown');
	});

	it('tolerates the mean/median vectors being absent entirely', () => {
		const items = mapWowNodes({
			connections: [row('tocloud9-worldserver-abc-1', 1)],
			p95: [],
			p99: [],
			max: [],
			up: [],
		});
		expect(items[0].tickMean).toBeNull();
		expect(items[0].tickMedian).toBeNull();
	});

	it('handles an entirely empty response', () => {
		expect(
			mapWowNodes({ connections: [], p95: [], p99: [], max: [], up: [] }),
		).toEqual([]);
	});

	it('drops NaN samples', () => {
		const items = mapWowNodes({
			connections: [{ metric: { pod: 'tocloud9-gateway-a-0' }, value: NaN }],
			p95: [],
			p99: [],
			max: [],
			up: [row('tocloud9-gateway-a-0', 1)],
		});
		expect(items[0].connections).toBeNull();
	});
});

describe('tick thresholds', () => {
	it('selects tone by the p95 bands', () => {
		expect(tickTone(null)).toBe('neutral');
		expect(tickTone(0)).toBe('success');
		expect(tickTone(TICK_WARN_MS - 1)).toBe('success');
		expect(tickTone(TICK_WARN_MS)).toBe('warning');
		expect(tickTone(TICK_CRIT_MS - 1)).toBe('warning');
		expect(tickTone(TICK_CRIT_MS)).toBe('danger');
		expect(tickTone(9000)).toBe('danger');
	});
	it('labels match the tones', () => {
		expect(tickLabel(null)).toBe('no tick data');
		expect(tickLabel(10)).toBe('healthy');
		expect(tickLabel(80)).toBe('lagging');
		expect(tickLabel(400)).toBe('critical');
	});
});
