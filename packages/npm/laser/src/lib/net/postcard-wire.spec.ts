import { describe, it, expect } from 'vitest';
import type { ClientMessage } from './protocol';
import {
	decodeProjectile,
	decodeServerEvent,
	encodeClientMessage,
} from './postcard-wire';

const hex = (b: Uint8Array) =>
	Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');

const fromHex = (s: string) =>
	Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));

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

describe('postcard ServerEvent decoder', () => {
	// Same hex the Rust fixture (proto.rs server_event_fixtures) asserts.
	it('decodes the Rust Welcome fixture', () => {
		const ev = decodeServerEvent(
			fromHex('01160f03eeff830601010b77797665726e5f666972650100'),
		);
		expect('Welcome' in ev).toBe(true);
		if ('Welcome' in ev) {
			expect(ev.Welcome.protocol).toBe(15);
			expect(ev.Welcome.your_slot).toBe(3);
			expect(ev.Welcome.seed).toBe(0xc0ffee);
			expect(ev.Welcome.registry).toEqual([
				{ kind: 1, ref: 'wyvern_fire', cat: 1 },
			]);
		}
	});

	it('decodes the Rust Snapshot fixture field-for-field', () => {
		const ev = decodeServerEvent(
			fromHex(
				'040109640109010207ffff030a050881c002bf01180d033c5006010103050100',
			),
		);
		expect('Snapshot' in ev).toBe(true);
		if ('Snapshot' in ev) {
			const s = ev.Snapshot;
			expect(s.tick).toBe(9);
			expect(s.server_time_ms).toBe(100);
			expect(s.players).toEqual([]);
			expect(s.keyframe).toBe(true);
			expect(s.entities).toHaveLength(1);
			expect(s.entities[0]).toEqual({
				eid: 2,
				kind: 7,
				owner: 65535,
				tile: { x: 5, y: -3 },
				facing: 'Down',
				sub: 0x81,
				qx: 160,
				qy: -96,
				qvx: 12,
				qvy: -7,
				input_ack: 0,
				hp: 30,
				max_hp: 40,
				destroyed: false,
				z: -1,
				effects: [{ kind: 'Burn', remaining: 5 }],
			});
		}
	});
});

describe('postcard Ephemeral payload decoder', () => {
	// Same hex the Rust fixture (proto.rs projectile_event_fixture_is_stable)
	// asserts — raw postcard, no COBS framing on the inner payload.
	it('decodes the Rust ProjectileEvent fixture', () => {
		const payload = Array.from(fromHex('020a050e04056172726f7701'));
		expect(decodeProjectile(payload)).toEqual({
			attacker: 2,
			from: { x: 5, y: -3 },
			to: { x: 7, y: 2 },
			kind: 'arrow',
			hit: true,
		});
	});
});
