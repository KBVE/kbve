import { describe, expect, it } from 'vitest';
import { parseRedisKeys } from './redis-output';

describe('parseRedisKeys', () => {
	it('strips the index and quotes redis-cli --no-raw adds', () => {
		expect(parseRedisKeys('1) "ws:617017446"\n2) "ws:3339987501"')).toEqual(
			['ws:617017446', 'ws:3339987501'],
		);
	});

	it('returns nothing for an empty reply', () => {
		expect(parseRedisKeys('')).toEqual([]);
		expect(parseRedisKeys('\n\n')).toEqual([]);
	});

	it('handles double digit indexes', () => {
		expect(parseRedisKeys('10) "gw:1"\n11) "gw:2"')).toEqual([
			'gw:1',
			'gw:2',
		]);
	});

	it('leaves already raw output alone', () => {
		expect(parseRedisKeys('ws:1\nws:2')).toEqual(['ws:1', 'ws:2']);
	});
});
