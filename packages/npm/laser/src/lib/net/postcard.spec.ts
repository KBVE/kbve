import { describe, it, expect } from 'vitest';
import {
	PostcardWriter,
	PostcardReader,
	cobsEncode,
	cobsDecode,
} from './postcard';

const hex = (b: Uint8Array) =>
	Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join(' ');

describe('postcard varint', () => {
	it('matches LEB128 reference encodings', () => {
		const cases: [number, number[]][] = [
			[0, [0x00]],
			[127, [0x7f]],
			[128, [0x80, 0x01]],
			[300, [0xac, 0x02]],
			[16384, [0x80, 0x80, 0x01]],
		];
		for (const [n, bytes] of cases) {
			const w = new PostcardWriter();
			w.varU32(n);
			expect(hex(w.bytes())).toBe(hex(Uint8Array.from(bytes)));
		}
	});

	it('round-trips unsigned + signed (zigzag)', () => {
		const w = new PostcardWriter();
		const us = [0, 1, 127, 128, 65535, 4294967295];
		const ss = [0, -1, 1, -2, 2, -2147483648, 2147483647];
		for (const u of us) w.varU32(u);
		for (const s of ss) w.varI32(s);
		const r = new PostcardReader(w.bytes());
		for (const u of us) expect(r.varU32()).toBe(u);
		for (const s of ss) expect(r.varI32()).toBe(s);
	});

	it('zigzag maps small signeds to the reference unsigneds', () => {
		// -1->1, 1->2, -2->3, 2->4 — pin the encoding, not just the round-trip.
		const w = new PostcardWriter();
		w.varI32(-1);
		w.varI32(1);
		w.varI32(-2);
		w.varI32(2);
		expect(hex(w.bytes())).toBe(
			hex(Uint8Array.from([0x01, 0x02, 0x03, 0x04])),
		);
	});

	it('round-trips u64 / i64 via BigInt (world seed)', () => {
		const w = new PostcardWriter();
		w.varU64(0xc0ffeen);
		w.varU64(0xffffffffffffffffn);
		w.varI64(-123456789012345n);
		const r = new PostcardReader(w.bytes());
		expect(r.varU64()).toBe(0xc0ffeen);
		expect(r.varU64()).toBe(0xffffffffffffffffn);
		expect(r.varI64()).toBe(-123456789012345n);
	});
});

describe('postcard scalars + string', () => {
	it('round-trips bytes, bools, and utf8 strings', () => {
		const w = new PostcardWriter();
		w.u8(0xfe);
		w.i8(-5);
		w.bool(true);
		w.bool(false);
		w.string('h0lybyte ✦');
		const r = new PostcardReader(w.bytes());
		expect(r.u8()).toBe(0xfe);
		expect(r.i8()).toBe(-5);
		expect(r.bool()).toBe(true);
		expect(r.bool()).toBe(false);
		expect(r.string()).toBe('h0lybyte ✦');
	});
});

describe('cobs framing', () => {
	it('matches the reference vector', () => {
		const input = Uint8Array.from([0x11, 0x22, 0x00, 0x33]);
		const enc = cobsEncode(input);
		expect(hex(enc)).toBe(
			hex(Uint8Array.from([0x03, 0x11, 0x22, 0x02, 0x33, 0x00])),
		);
		expect(hex(cobsDecode(enc))).toBe(hex(input));
	});

	it('round-trips buffers with runs of zeros and long non-zero runs', () => {
		const samples = [
			Uint8Array.from([]),
			Uint8Array.from([0]),
			Uint8Array.from([0, 0, 0]),
			Uint8Array.from(Array.from({ length: 600 }, (_, i) => (i % 7) + 1)),
			Uint8Array.from(
				Array.from({ length: 300 }, (_, i) =>
					i % 3 === 0 ? 0 : i & 0xff,
				),
			),
		];
		for (const s of samples) {
			expect(hex(cobsDecode(cobsEncode(s)))).toBe(hex(s));
		}
	});
});
