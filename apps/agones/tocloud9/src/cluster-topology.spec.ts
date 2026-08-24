import { describe, expect, it } from 'vitest';
import {
	assignedMapCount,
	isRoutableAddress,
	mapOwnerConflicts,
} from './cluster-topology';

describe('isRoutableAddress', () => {
	it('accepts a pod style host:port', () => {
		expect(isRoutableAddress('10.42.0.7:8085')).toBe(true);
	});

	it('rejects loopback, which nothing else in the cluster could reach', () => {
		expect(isRoutableAddress('127.0.0.1:8085')).toBe(false);
	});

	it('rejects a missing port or a missing value', () => {
		expect(isRoutableAddress('10.42.0.7')).toBe(false);
		expect(isRoutableAddress(undefined)).toBe(false);
	});
});

describe('mapOwnerConflicts', () => {
	const shardA = { AssignedMapsToHandle: [0, 1] };
	const shardB = { AssignedMapsToHandle: [530, 571] };

	it('is empty when every map has exactly one owner', () => {
		expect(mapOwnerConflicts({ 'ws:a': shardA, 'ws:b': shardB })).toEqual(
			[],
		);
	});

	it('reports a map two worldservers both claim', () => {
		expect(
			mapOwnerConflicts({
				'ws:a': shardA,
				'ws:b': { AssignedMapsToHandle: [1, 530] },
			}),
		).toEqual([{ map: 1, owners: ['ws:a', 'ws:b'] }]);
	});

	it('tolerates a worldserver holding no maps yet', () => {
		expect(mapOwnerConflicts({ 'ws:a': shardA, 'ws:b': {} })).toEqual([]);
	});
});

describe('assignedMapCount', () => {
	it('counts distinct maps across worldservers', () => {
		expect(
			assignedMapCount({
				'ws:a': { AssignedMapsToHandle: [0, 1] },
				'ws:b': { AssignedMapsToHandle: [1, 530] },
			}),
		).toBe(3);
	});

	it('is zero before anything registers', () => {
		expect(assignedMapCount({})).toBe(0);
	});
});
