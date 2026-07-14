// SharedArrayBuffer-backed ECS store + query, gated feature beside bitecs. Entity
// membership (alive + per-component present bitsets) lives INSIDE the buffer, so a
// query runs identically on any thread that maps the same buffer — the worker owns
// all structural writes, the main thread reads transforms/queries zero-copy. Works
// on a plain ArrayBuffer too (single-thread fallback), so callers gate purely on
// which buffer they hand in. Framework-free: no three/react/rapier here.

export type FieldType = 'f32' | 'i32' | 'u32' | 'u8' | 'i16' | 'u16';

export type Schema = Record<string, Record<string, FieldType>>;

type TypedArray =
	| Float32Array
	| Int32Array
	| Uint32Array
	| Uint8Array
	| Int16Array
	| Uint16Array;

type Stores<S extends Schema> = {
	[C in keyof S]: { [F in keyof S[C]]: TypedArray };
};

type Masks<S extends Schema> = { [C in keyof S]: Uint32Array };

// Header slots (Int32). MAGIC + CAP validate a re-attached buffer; GEN is the
// seqlock (even = stable, odd = write in progress) for tear-free reads.
const H_MAGIC = 0;
const H_CAP = 1;
const H_ALIVE = 2;
const H_TICK = 3;
const H_GEN = 4;
const H_RUNNING = 5;
const H_READY = 6;
const HEADER_I32 = 16;
const HEADER_BYTES = HEADER_I32 * 4;
const MAGIC = 0x5342_4543; // 'SBEC'

const BYTES: Record<FieldType, number> = {
	f32: 4,
	i32: 4,
	u32: 4,
	u8: 1,
	i16: 2,
	u16: 2,
};

function ctor(
	t: FieldType,
): new (b: ArrayBufferLike, o: number, n: number) => TypedArray {
	switch (t) {
		case 'f32':
			return Float32Array;
		case 'i32':
			return Int32Array;
		case 'u32':
			return Uint32Array;
		case 'u8':
			return Uint8Array;
		case 'i16':
			return Int16Array;
		case 'u16':
			return Uint16Array;
	}
}

interface FieldPlan {
	comp: string;
	field: string;
	type: FieldType;
	byteOffset: number;
}

interface Layout {
	cap: number;
	words: number;
	comps: string[];
	aliveByteOffset: number;
	maskByteOffset: number;
	fields: FieldPlan[];
	bytes: number;
}

function align(n: number, a: number): number {
	return (n + a - 1) & ~(a - 1);
}

// Deterministic layout: header, alive bitset, per-component mask block, then each
// field's SoA region 4B-aligned. Component + field order come from the schema's
// own key order, so every thread that imports the same schema literal agrees.
function plan(schema: Schema, cap: number): Layout {
	const comps = Object.keys(schema);
	const words = Math.ceil(cap / 32);
	let off = HEADER_BYTES;
	const aliveByteOffset = off;
	off += words * 4;
	const maskByteOffset = off;
	off += words * 4 * comps.length;
	const fields: FieldPlan[] = [];
	for (const comp of comps) {
		for (const field of Object.keys(schema[comp])) {
			const type = schema[comp][field];
			off = align(off, 4);
			fields.push({ comp, field, type, byteOffset: off });
			off += BYTES[type] * cap;
		}
	}
	return {
		cap,
		words,
		comps,
		aliveByteOffset,
		maskByteOffset,
		fields,
		bytes: align(off, 8),
	};
}

// Byte size a buffer must be to hold this schema at this capacity. Callers size a
// SharedArrayBuffer (or ArrayBuffer) with it before createSabWorld.
export function sabBytes(schema: Schema, cap: number): number {
	return plan(schema, cap).bytes;
}

function testBit(bits: Uint32Array, i: number): boolean {
	return (bits[i >>> 5] & (1 << (i & 31))) !== 0;
}
function setBit(bits: Uint32Array, i: number): void {
	bits[i >>> 5] |= 1 << (i & 31);
}
function clearBit(bits: Uint32Array, i: number): void {
	bits[i >>> 5] &= ~(1 << (i & 31));
}

export interface SabWorld<S extends Schema> {
	readonly buffer: ArrayBufferLike;
	readonly cap: number;
	readonly header: Int32Array;
	readonly alive: Uint32Array;
	readonly stores: Stores<S>;
	readonly mask: Masks<S>;
	spawn(): number;
	despawn(eid: number): void;
	add(eid: number, comp: keyof S): void;
	remove(eid: number, comp: keyof S): void;
	has(eid: number, comp: keyof S): boolean;
	isAlive(eid: number): boolean;
	clear(): void;
	query(comps: (keyof S)[]): number[];
	each(comps: (keyof S)[], fn: (eid: number) => void): void;
	count(): number;
	beginWrite(): void;
	endWrite(): void;
	gen(): number;
	tick(): number;
	step(): number;
}

// Map (or create) an ECS world over `buffer`. First caller with a zeroed buffer
// stamps the header; later attachers (e.g. the worker on the same SharedArrayBuffer)
// validate MAGIC/CAP and reuse it. Views are constructed once; reads/writes go
// straight to the backing memory.
export function createSabWorld<S extends Schema>(
	buffer: ArrayBufferLike,
	schema: S,
	cap: number,
): SabWorld<S> {
	const L = plan(schema, cap);
	if (buffer.byteLength < L.bytes) {
		throw new Error(
			`sab world: buffer ${buffer.byteLength}B < required ${L.bytes}B`,
		);
	}

	const header = new Int32Array(buffer, 0, HEADER_I32);
	const fresh = Atomics.load(header, H_MAGIC) !== MAGIC;
	if (fresh) {
		Atomics.store(header, H_MAGIC, MAGIC);
		Atomics.store(header, H_CAP, cap);
	} else if (Atomics.load(header, H_CAP) !== cap) {
		throw new Error(
			`sab world: cap mismatch (buffer ${Atomics.load(header, H_CAP)} vs ${cap})`,
		);
	}

	const alive = new Uint32Array(buffer, L.aliveByteOffset, L.words);
	const mask = {} as Masks<S>;
	L.comps.forEach((comp, i) => {
		mask[comp as keyof S] = new Uint32Array(
			buffer,
			L.maskByteOffset + i * L.words * 4,
			L.words,
		);
	});

	const stores = {} as Stores<S>;
	for (const comp of L.comps) (stores as Record<string, unknown>)[comp] = {};
	for (const f of L.fields) {
		const C = ctor(f.type);
		(stores[f.comp as keyof S] as Record<string, TypedArray>)[f.field] =
			new C(buffer, f.byteOffset, cap);
	}

	const maskArr = L.comps.map((c) => mask[c as keyof S]);
	const words = L.words;

	function findFree(): number {
		for (let w = 0; w < words; w++) {
			const v = alive[w];
			if (v === 0xffffffff) continue;
			for (let b = 0; b < 32; b++) {
				if ((v & (1 << b)) === 0) {
					const eid = w * 32 + b;
					return eid < cap ? eid : -1;
				}
			}
		}
		return -1;
	}

	return {
		buffer,
		cap,
		header,
		alive,
		stores,
		mask,

		spawn(): number {
			const eid = findFree();
			if (eid < 0) return -1;
			setBit(alive, eid);
			for (const m of maskArr) clearBit(m, eid);
			header[H_ALIVE]++;
			return eid;
		},

		despawn(eid: number): void {
			if (!testBit(alive, eid)) return;
			clearBit(alive, eid);
			for (const m of maskArr) clearBit(m, eid);
			header[H_ALIVE]--;
		},

		add(eid: number, comp: keyof S): void {
			setBit(mask[comp], eid);
		},
		remove(eid: number, comp: keyof S): void {
			clearBit(mask[comp], eid);
		},
		has(eid: number, comp: keyof S): boolean {
			return testBit(mask[comp], eid);
		},
		isAlive(eid: number): boolean {
			return testBit(alive, eid);
		},

		// Wipe all membership (entities + component bits) and reset the tick, keeping
		// the buffer + MAGIC/CAP. Component data is left as-is; spawn() overwrites it.
		clear(): void {
			alive.fill(0);
			for (const m of maskArr) m.fill(0);
			header[H_ALIVE] = 0;
			Atomics.store(header, H_TICK, 0);
		},

		// Walk alive words, AND every requested component mask, yield surviving eids.
		query(comps: (keyof S)[]): number[] {
			const out: number[] = [];
			const ms = comps.map((c) => mask[c]);
			for (let w = 0; w < words; w++) {
				let bits = alive[w];
				for (const m of ms) bits &= m[w];
				while (bits !== 0) {
					const b = 31 - Math.clz32(bits & -bits);
					out.push(w * 32 + b);
					bits &= bits - 1;
				}
			}
			return out;
		},

		each(comps: (keyof S)[], fn: (eid: number) => void): void {
			const ms = comps.map((c) => mask[c]);
			for (let w = 0; w < words; w++) {
				let bits = alive[w];
				for (const m of ms) bits &= m[w];
				while (bits !== 0) {
					const b = 31 - Math.clz32(bits & -bits);
					fn(w * 32 + b);
					bits &= bits - 1;
				}
			}
		},

		count(): number {
			return header[H_ALIVE];
		},

		// Seqlock: odd gen = write in progress. Readers can snapshot gen(), read,
		// then re-read gen() and retry if it changed or is odd.
		beginWrite(): void {
			Atomics.add(header, H_GEN, 1);
		},
		endWrite(): void {
			Atomics.add(header, H_GEN, 1);
		},
		gen(): number {
			return Atomics.load(header, H_GEN);
		},
		tick(): number {
			return Atomics.load(header, H_TICK);
		},
		step(): number {
			return Atomics.add(header, H_TICK, 1) + 1;
		},
	};
}
