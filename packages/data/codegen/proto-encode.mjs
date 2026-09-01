/**
 * Encodes a registry JSON artifact against the schemas in packages/proto.
 *
 * The generators used to encode against descriptors built from
 * packages/data/proto. That schema and the one in packages/proto disagree on
 * field numbers -- every registry there moved its payload down to make room for
 * `meta` at field 1 -- so an artifact written by one and read by the other
 * decodes into the wrong fields. It does not fail loudly: MapRegistry's old
 * `object_defs = 3` is the new `zones = 3`, so 65 object definitions came back
 * as 65 malformed zones.
 *
 * The two schemas also disagree on how an id is carried. `packages/proto` uses
 * kbve.type.v1.Ulid, which is the 16 raw bytes rather than the 26-character
 * Crockford text, so the JSON's ids are converted on the way in. Which fields
 * those are is read from the descriptor rather than listed here, so a new Ulid
 * field needs no edit.
 */
import { readFileSync } from 'node:fs';
import {
	createFileRegistry,
	fromBinary,
	fromJson,
	toBinary,
} from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const ULID = 'kbve.type.v1.Ulid';
// Crockford Base32: no I, L, O or U, so nothing reads as a digit by mistake.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** The 16 bytes a 26-character ULID encodes. */
export function ulidToBytes(text) {
	if (typeof text !== 'string' || text.length !== 26) {
		throw new Error(`not a ULID: ${JSON.stringify(text)}`);
	}
	let bits = 0n;
	for (const ch of text.toUpperCase()) {
		const v = CROCKFORD.indexOf(ch);
		if (v < 0) throw new Error(`not a ULID (bad character ${ch}): ${text}`);
		bits = (bits << 5n) | BigInt(v);
	}
	// 26 characters carry 130 bits; the top two are padding and must be zero,
	// which is what makes the value fit in 16 bytes.
	if (bits >> 128n) throw new Error(`ULID overflows 128 bits: ${text}`);
	const out = new Uint8Array(16);
	for (let i = 15; i >= 0; i--) {
		out[i] = Number(bits & 0xffn);
		bits >>= 8n;
	}
	return out;
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

/**
 * Rewrites every Ulid-typed field in `value` from its text form to the object
 * shape the schema wants. Walks by descriptor, so it follows the schema rather
 * than a hand-kept list of field names.
 */
function convertUlids(desc, value, seen = new Set()) {
	if (value == null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map((v) => convertUlids(desc, v, seen));

	const out = {};
	for (const [key, v] of Object.entries(value)) {
		const field = desc.fields.find((f) => f.jsonName === key || f.name === key);
		if (!field || field.message == null) {
			out[key] = v;
			continue;
		}
		if (field.message.typeName === ULID) {
			// Already converted, or explicitly absent.
			if (v == null || typeof v === 'object') out[key] = v;
			else if (field.fieldKind === 'list' || Array.isArray(v)) {
				out[key] = v.map((s) => ({ value: b64(ulidToBytes(s)) }));
			} else {
				out[key] = { value: b64(ulidToBytes(v)) };
			}
			continue;
		}
		out[key] = convertUlids(field.message, v, seen);
	}
	return out;
}

/** Loads a FileDescriptorSet and returns a message descriptor from it. */
export function loadMessage(descriptorPath, typeName) {
	const set = fromBinary(FileDescriptorSetSchema, readFileSync(descriptorPath));
	const message = createFileRegistry(set).getMessage(typeName);
	if (!message) {
		throw new Error(
			`FATAL: ${typeName} not found in ${descriptorPath}. Rebuild it with \`buf build\` in packages/proto.`,
		);
	}
	return message;
}

/** JSON artifact -> wire bytes, against the packages/proto schema. */
export function encodeRegistry(descriptorPath, typeName, json) {
	const message = loadMessage(descriptorPath, typeName);
	const converted = convertUlids(message, json);
	return toBinary(message, fromJson(message, converted, { ignoreUnknownFields: true }));
}
