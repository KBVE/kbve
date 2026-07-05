import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	$bentoShipment,
	$bentoLedger,
	shipBentoWord,
	advanceBentoShipment,
	resetBentoFlow,
} from './bento';

beforeEach(() => {
	resetBentoFlow();
});

describe('Bento flow state', () => {
	it('shipBentoWord creates a shipped shipment', () => {
		const shipment = shipBentoWord('games');
		expect(shipment.word).toBe('games');
		expect(shipment.stage).toBe('shipped');
		expect($bentoShipment.get()).toEqual(shipment);
		expect($bentoLedger.get()).toEqual([shipment]);
	});

	it('shipBentoWord assigns unique incrementing ids', () => {
		const a = shipBentoWord('games');
		const b = shipBentoWord('apps');
		expect(b.id).toBeGreaterThan(a.id);
	});

	it('advanceBentoShipment updates stage and preserves word', () => {
		const shipment = shipBentoWord('games');
		const arrived = advanceBentoShipment(shipment.id, 'arrived');
		expect(arrived?.word).toBe('games');
		expect(arrived?.stage).toBe('arrived');
		expect($bentoShipment.get()?.stage).toBe('arrived');
		expect($bentoLedger.get()).toHaveLength(1);
	});

	it('advanceBentoShipment returns null for unknown id', () => {
		expect(advanceBentoShipment(999, 'arrived')).toBeNull();
	});

	it('advanceBentoShipment returns null when stage unchanged', () => {
		const shipment = shipBentoWord('games');
		expect(advanceBentoShipment(shipment.id, 'shipped')).toBeNull();
	});

	it('listeners see each lifecycle transition', () => {
		const handler = vi.fn();
		const unsub = $bentoShipment.listen(handler);

		const shipment = shipBentoWord('games');
		advanceBentoShipment(shipment.id, 'arrived');
		advanceBentoShipment(shipment.id, 'delivered');

		expect(handler).toHaveBeenCalledTimes(3);
		expect(handler.mock.calls.map(([s]) => s.stage)).toEqual([
			'shipped',
			'arrived',
			'delivered',
		]);
		unsub();
	});

	it('ledger caps at 24 shipments', () => {
		for (let i = 0; i < 30; i++) shipBentoWord(`word-${i}`);
		expect($bentoLedger.get()).toHaveLength(24);
		expect($bentoLedger.get()[23].word).toBe('word-29');
	});

	it('resetBentoFlow clears state', () => {
		shipBentoWord('games');
		resetBentoFlow();
		expect($bentoShipment.get()).toBeNull();
		expect($bentoLedger.get()).toEqual([]);
	});
});
