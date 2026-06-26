// Minimal postcard (v1) codec + COBS framing, mirroring the Rust `postcard`
// crate simgrid uses (`to_allocvec_cobs` / `from_bytes_cobs`). Only the subset
// the game wire needs: the protocol quantizes every position to an integer, so
// there are NO floats on the wire — just varints (LEB128), zigzag for signed,
// single bytes for u8/i8/bool, length-prefixed strings + seqs, an Option tag, an
// enum discriminant varint, and structs as fields-in-order. All wrapped in COBS.
//
// Postcard is positional (non-self-describing): the reader walks fields in the
// exact declared order with the exact types, so this MUST stay in lockstep with
// proto.rs. The parity fixtures guard that.

export class PostcardWriter {
	private buf: number[] = [];

	u8(v: number): void {
		this.buf.push(v & 0xff);
	}
	i8(v: number): void {
		this.buf.push(v & 0xff);
	}
	bool(v: boolean): void {
		this.buf.push(v ? 1 : 0);
	}

	/** Unsigned LEB128 varint (u16/u32/usize). */
	varU32(v: number): void {
		let n = v >>> 0;
		while (n >= 0x80) {
			this.buf.push((n & 0x7f) | 0x80);
			n >>>= 7;
		}
		this.buf.push(n);
	}
	/** Unsigned LEB128 varint for u64 (e.g. world seed). */
	varU64(v: bigint): void {
		let n = BigInt.asUintN(64, v);
		while (n >= 0x80n) {
			this.buf.push(Number((n & 0x7fn) | 0x80n));
			n >>= 7n;
		}
		this.buf.push(Number(n));
	}
	/** Zigzag + varint (i16/i32). */
	varI32(v: number): void {
		this.varU32((((v << 1) ^ (v >> 31)) >>> 0) as number);
	}
	varI64(v: bigint): void {
		this.varU64(BigInt.asUintN(64, (v << 1n) ^ (v >> 63n)));
	}

	u16(v: number): void {
		this.varU32(v & 0xffff);
	}
	u32(v: number): void {
		this.varU32(v);
	}
	i16(v: number): void {
		this.varI32(v);
	}
	i32(v: number): void {
		this.varI32(v);
	}

	string(s: string): void {
		const bytes = new TextEncoder().encode(s);
		this.varU32(bytes.length);
		for (const b of bytes) this.buf.push(b);
	}
	/** Length prefix for a Vec/seq. */
	seqLen(n: number): void {
		this.varU32(n);
	}
	/** Option tag: 0 = None, 1 = Some (value follows). */
	option(present: boolean): void {
		this.buf.push(present ? 1 : 0);
	}
	/** Enum discriminant (variant index). */
	variant(idx: number): void {
		this.varU32(idx);
	}

	bytes(): Uint8Array {
		return Uint8Array.from(this.buf);
	}
}

export class PostcardReader {
	private off = 0;
	constructor(private data: Uint8Array) {}

	private next(): number {
		return this.data[this.off++];
	}

	u8(): number {
		return this.next();
	}
	i8(): number {
		const b = this.next();
		return b < 0x80 ? b : b - 0x100;
	}
	bool(): boolean {
		return this.next() !== 0;
	}

	varU32(): number {
		let result = 0;
		let shift = 0;
		let b: number;
		do {
			b = this.next();
			result |= (b & 0x7f) << shift;
			shift += 7;
		} while (b & 0x80);
		return result >>> 0;
	}
	varU64(): bigint {
		let result = 0n;
		let shift = 0n;
		let b: number;
		do {
			b = this.next();
			result |= BigInt(b & 0x7f) << shift;
			shift += 7n;
		} while (b & 0x80);
		return result;
	}
	varI32(): number {
		const u = this.varU32();
		return (u >>> 1) ^ -(u & 1);
	}
	varI64(): bigint {
		const u = this.varU64();
		return (u >> 1n) ^ -(u & 1n);
	}

	u16(): number {
		return this.varU32();
	}
	u32(): number {
		return this.varU32();
	}
	i16(): number {
		return this.varI32();
	}
	i32(): number {
		return this.varI32();
	}

	string(): string {
		const len = this.varU32();
		const slice = this.data.subarray(this.off, this.off + len);
		this.off += len;
		return new TextDecoder().decode(slice);
	}
	seqLen(): number {
		return this.varU32();
	}
	option(): boolean {
		return this.next() !== 0;
	}
	variant(): number {
		return this.varU32();
	}

	remaining(): number {
		return this.data.length - this.off;
	}
}

/**
 * COBS-encode a buffer, appending the trailing 0x00 delimiter — matches
 * postcard's `to_allocvec_cobs`. The output contains no interior zero bytes.
 */
export function cobsEncode(input: Uint8Array): Uint8Array {
	const out: number[] = [];
	let codeIdx = out.length;
	out.push(0); // placeholder for the run-length code
	let code = 1;
	for (const b of input) {
		if (b === 0) {
			out[codeIdx] = code;
			codeIdx = out.length;
			out.push(0);
			code = 1;
		} else {
			out.push(b);
			code += 1;
			if (code === 0xff) {
				out[codeIdx] = code;
				codeIdx = out.length;
				out.push(0);
				code = 1;
			}
		}
	}
	out[codeIdx] = code;
	out.push(0); // frame delimiter
	return Uint8Array.from(out);
}

/** COBS-decode a frame (with or without the trailing 0x00 delimiter). */
export function cobsDecode(input: Uint8Array): Uint8Array {
	const out: number[] = [];
	let i = 0;
	while (i < input.length) {
		const code = input[i++];
		if (code === 0) break; // delimiter
		for (let j = 1; j < code && i < input.length; j++) out.push(input[i++]);
		if (code !== 0xff && i < input.length && input[i] !== 0) out.push(0);
	}
	return Uint8Array.from(out);
}
