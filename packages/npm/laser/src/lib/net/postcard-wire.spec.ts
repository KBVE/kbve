import { describe, it, expect } from 'vitest';
import type { ClientMessage } from './protocol';
import { encodeClientMessage } from './postcard-wire';

const hex = (b: Uint8Array) =>
	Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');

describe('postcard ClientMessage encoder', () => {
	// Same message + expected bytes as the Rust fixture in proto.rs
	// (client_message_fixture_is_stable). Cross-language parity lock.
	it('encodes a Frame to the Rust postcard fixture', () => {
		const msg: ClientMessage = {
			Frame: {
				client_tick: 7,
				inputs: [
					{ Move: { seq: 3, mx: 127, my: -1, run: true } },
					{ Fell: { tile: { x: 5, y: -3 } } },
					'Leave',
				],
			},
		};
		expect(hex(encodeClientMessage(msg))).toBe(
			'0d01070301037fff01180a050d00',
		);
	});

	it('encodes JoinMatch (interior zero byte exercises COBS restuffing)', () => {
		const msg: ClientMessage = {
			JoinMatch: { protocol: 15, jwt: 'tok', kbve_username: 'h0ly' },
		};
		// postcard: 00(variant) 0f(proto) 03 746f6b("tok") 04 68306c79("h0ly").
		// The leading 0x00 splits the COBS run: 01 | 0b <11 bytes> | 00.
		expect(hex(encodeClientMessage(msg))).toBe(
			'010b0f03746f6b0468306c7900',
		);
	});
});
