import { describe, it, expect, beforeEach } from 'vitest';
import { mapField, mapOneof } from '../field-mapper.js';
import {
	makeDescMessage,
	makeScalarField,
	makeEnumField,
	makeMessageField,
	makeListField,
	makeMapField,
	makeDescEnum,
	makeDescOneof,
	resetFieldCounter,
	ScalarType,
} from './test-factories.js';
import type { ProtoZodConfig } from '../types.js';

const EMPTY_CONFIG: ProtoZodConfig = {};

describe('mapField', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	// ─── Scalars ─────────────────────────────────────────────────────────

	describe('scalar fields', () => {
		it.each([
			[ScalarType.DOUBLE, 'z.number()'],
			[ScalarType.FLOAT, 'z.number()'],
			[ScalarType.INT32, 'z.number()'],
			[ScalarType.INT64, 'z.number()'],
			[ScalarType.UINT32, 'z.number()'],
			[ScalarType.UINT64, 'z.number()'],
			[ScalarType.SINT32, 'z.number()'],
			[ScalarType.SINT64, 'z.number()'],
			[ScalarType.FIXED32, 'z.number()'],
			[ScalarType.FIXED64, 'z.number()'],
			[ScalarType.SFIXED32, 'z.number()'],
			[ScalarType.SFIXED64, 'z.number()'],
		])('maps numeric scalar %i to %s', (scalar, expected) => {
			const field = makeScalarField('val', scalar);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(expected);
		});

		it('maps BOOL to z.boolean()', () => {
			const field = makeScalarField('flag', ScalarType.BOOL);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.boolean()',
			);
		});

		it('maps STRING to z.string()', () => {
			const field = makeScalarField('name', ScalarType.STRING);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe('z.string()');
		});

		it('maps BYTES to z.string()', () => {
			const field = makeScalarField('data', ScalarType.BYTES);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe('z.string()');
		});
	});

	// ─── Enums ───────────────────────────────────────────────────────────

	describe('enum fields', () => {
		it('defaults to z.string() when no enum config', () => {
			const enumDesc = makeDescEnum('pkg.Status', [
				{ name: 'STATUS_UNSPECIFIED', number: 0 },
				{ name: 'STATUS_ACTIVE', number: 1 },
			]);
			const field = makeEnumField('status', enumDesc);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe('z.string()');
		});

		it('uses z.string() for mode=string', () => {
			const enumDesc = makeDescEnum('pkg.Status', [
				{ name: 'STATUS_UNSPECIFIED', number: 0 },
				{ name: 'STATUS_ACTIVE', number: 1 },
			]);
			const field = makeEnumField('status', enumDesc);
			const config: ProtoZodConfig = {
				enums: {
					'pkg.Status': { mode: 'string' },
				},
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe('z.string()');
		});

		it('uses zodSchemaName when const_array has one', () => {
			const enumDesc = makeDescEnum('pkg.Slot', [
				{ name: 'SLOT_UNSPECIFIED', number: 0 },
				{ name: 'SLOT_HEAD', number: 1 },
			]);
			const field = makeEnumField('slot', enumDesc);
			const config: ProtoZodConfig = {
				enums: {
					'pkg.Slot': { mode: 'const_array' },
				},
				constArrays: [
					{
						name: 'Slots',
						sourceEnum: 'pkg.Slot',
						zodSchemaName: 'SlotSchema',
					},
				],
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe('SlotSchema');
		});

		it('falls back to z.string() for const_array without zodSchemaName', () => {
			const enumDesc = makeDescEnum('pkg.Slot', [
				{ name: 'SLOT_UNSPECIFIED', number: 0 },
				{ name: 'SLOT_HEAD', number: 1 },
			]);
			const field = makeEnumField('slot', enumDesc);
			const config: ProtoZodConfig = {
				enums: {
					'pkg.Slot': { mode: 'const_array' },
				},
				constArrays: [
					{
						name: 'Slots',
						sourceEnum: 'pkg.Slot',
					},
				],
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe('z.string()');
		});
	});

	// ─── Messages ────────────────────────────────────────────────────────

	describe('message fields', () => {
		it('uses default SchemaName for message reference', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			expect(mapField(field, 'pkg.Outer', EMPTY_CONFIG)).toBe(
				'InnerSchema.optional()',
			);
		});

		it('uses schemaNames override', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			const config: ProtoZodConfig = {
				schemaNames: { 'pkg.Inner': 'CustomInnerSchema' },
			};
			expect(mapField(field, 'pkg.Outer', config)).toBe(
				'CustomInnerSchema.optional()',
			);
		});
	});

	// ─── Lists ───────────────────────────────────────────────────────────

	describe('list fields', () => {
		it('maps list<scalar> to z.array(z.number())', () => {
			const field = makeListField('values', 'scalar', {
				scalar: ScalarType.INT32,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.array(z.number()).optional()',
			);
		});

		it('maps list<message> to z.array(Schema)', () => {
			const inner = makeDescMessage('pkg.Item', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeListField('items', 'message', {
				message: inner,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.array(ItemSchema).optional()',
			);
		});

		it('maps list<enum> to z.array(z.string())', () => {
			const enumDesc = makeDescEnum('pkg.Color', [
				{ name: 'COLOR_UNSPECIFIED', number: 0 },
				{ name: 'COLOR_RED', number: 1 },
			]);
			const field = makeListField('colors', 'enum', {
				enum: enumDesc,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.array(z.string()).optional()',
			);
		});
	});

	// ─── Maps ────────────────────────────────────────────────────────────

	describe('map fields', () => {
		it('maps map<string, string> to z.record()', () => {
			const field = makeMapField(
				'metadata',
				ScalarType.STRING,
				'scalar',
				{ scalar: ScalarType.STRING },
			);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.record(z.string(), z.string()).optional()',
			);
		});

		it('maps map<int32, message> to z.record()', () => {
			const val = makeDescMessage('pkg.Val', [
				makeScalarField('data', ScalarType.STRING),
			]);
			const field = makeMapField('lookup', ScalarType.INT32, 'message', {
				message: val,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.record(z.number(), ValSchema).optional()',
			);
		});
	});

	// ─── Oneofs ─────────────────────────────────────────────────────────

	describe('oneof fields (mapOneof)', () => {
		it('maps message-only oneof to z.union([SchemaA, SchemaB])', () => {
			const msgA = makeDescMessage('pkg.A', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const msgB = makeDescMessage('pkg.B', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const fields = [
				makeMessageField('a', msgA),
				makeMessageField('b', msgB),
			];
			const oneof = makeDescOneof('choice', fields);
			const result = mapOneof(oneof, 'pkg.Msg', EMPTY_CONFIG);
			expect(result).toBe('z.union([ASchema, BSchema]).optional()');
		});

		it('maps scalar/mixed oneof to z.union([z.object(...)])', () => {
			const msgA = makeDescMessage('pkg.A', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const fields = [
				makeScalarField('str_val', ScalarType.STRING),
				makeMessageField('msg_val', msgA),
			];
			const oneof = makeDescOneof('value', fields);
			const result = mapOneof(oneof, 'pkg.Msg', EMPTY_CONFIG);
			expect(result).toBe(
				'z.union([z.object({ str_val: z.string() }), z.object({ msg_val: ASchema })]).optional()',
			);
		});

		it('wraps single-variant oneof with .optional()', () => {
			const fields = [makeScalarField('val', ScalarType.INT32)];
			const oneof = makeDescOneof('single', fields);
			const result = mapOneof(oneof, 'pkg.Msg', EMPTY_CONFIG);
			expect(result).toBe('z.object({ val: z.number() }).optional()');
		});

		it('returns z.never().optional() for empty oneof', () => {
			const oneof = makeDescOneof('empty', []);
			const result = mapOneof(oneof, 'pkg.Msg', EMPTY_CONFIG);
			expect(result).toBe('z.never().optional()');
		});
	});

	// ─── Optionality ─────────────────────────────────────────────────────

	describe('optionality', () => {
		it('makes proto3Optional scalar fields optional', () => {
			const field = makeScalarField('opt_val', ScalarType.INT32, {
				proto3Optional: true,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.number().optional()',
			);
		});

		it('makes message fields optional by default', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'InnerSchema.optional()',
			);
		});

		it('makes list fields optional', () => {
			const field = makeListField('tags', 'scalar', {
				scalar: ScalarType.STRING,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.array(z.string()).optional()',
			);
		});

		it('makes map fields optional', () => {
			const field = makeMapField('meta', ScalarType.STRING, 'scalar', {
				scalar: ScalarType.STRING,
			});
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.record(z.string(), z.string()).optional()',
			);
		});

		it('does NOT make required scalar fields optional', () => {
			const field = makeScalarField('id', ScalarType.INT32);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe('z.number()');
		});

		it('applies .nullable().optional() for nullable fields', () => {
			const field = makeScalarField('val', ScalarType.INT32, {
				proto3Optional: true,
			});
			const config: ProtoZodConfig = {
				nullable: ['pkg.Msg.val'],
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe(
				'z.number().nullable().optional()',
			);
		});

		it('applies wildcard nullable', () => {
			const field = makeScalarField('val', ScalarType.INT32, {
				proto3Optional: true,
			});
			const config: ProtoZodConfig = {
				nullable: ['pkg.Msg.*'],
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe(
				'z.number().nullable().optional()',
			);
		});
	});

	// ─── Overrides, refinements, transforms ─────────────────────────────

	describe('overrides and extensions', () => {
		it('uses fieldOverrides for complete override', () => {
			const field = makeScalarField('val', ScalarType.STRING);
			const config: ProtoZodConfig = {
				fieldOverrides: {
					'pkg.Msg.val': 'z.lazy(() => CustomSchema)',
				},
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe(
				'z.lazy(() => CustomSchema)',
			);
		});

		it('appends refinement to base expression', () => {
			const field = makeScalarField('level', ScalarType.INT32);
			const config: ProtoZodConfig = {
				refinements: {
					'pkg.Msg.level': '.min(1).max(99)',
				},
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe(
				'z.number().min(1).max(99)',
			);
		});

		it('appends transform', () => {
			const field = makeScalarField('name', ScalarType.STRING);
			const config: ProtoZodConfig = {
				transforms: {
					'pkg.Msg.name': '(s) => s.toLowerCase()',
				},
			};
			expect(mapField(field, 'pkg.Msg', config)).toBe(
				'z.string().transform((s) => s.toLowerCase())',
			);
		});
	});

	// ─── Well-known types ────────────────────────────────────────────────

	describe('well-known types', () => {
		it('maps google.protobuf.Timestamp to z.string().datetime()', () => {
			const ts = makeDescMessage('google.protobuf.Timestamp', [
				makeScalarField('seconds', ScalarType.INT64),
			]);
			const field = makeMessageField('created_at', ts);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.string().datetime().optional()',
			);
		});

		it('maps google.protobuf.Struct to z.record()', () => {
			const struct = makeDescMessage('google.protobuf.Struct', []);
			const field = makeMessageField('metadata', struct);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.record(z.string(), z.unknown()).optional()',
			);
		});

		it('maps google.protobuf.Empty to z.object({})', () => {
			const empty = makeDescMessage('google.protobuf.Empty', []);
			const field = makeMessageField('empty', empty);
			expect(mapField(field, 'pkg.Msg', EMPTY_CONFIG)).toBe(
				'z.object({}).optional()',
			);
		});
	});

	// ─── lazyRefs / z.lazy() ─────────────────────────────────────────────

	describe('lazyRefs', () => {
		it('wraps message ref in z.lazy() when in lazyRefs', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			const lazyRefs = new Set(['pkg.Inner']);
			expect(mapField(field, 'pkg.Outer', EMPTY_CONFIG, lazyRefs)).toBe(
				'z.lazy(() => InnerSchema).optional()',
			);
		});

		it('does not wrap message ref when not in lazyRefs', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			const lazyRefs = new Set(['pkg.Other']);
			expect(mapField(field, 'pkg.Outer', EMPTY_CONFIG, lazyRefs)).toBe(
				'InnerSchema.optional()',
			);
		});

		it('fieldOverride takes precedence over lazyRefs', () => {
			const inner = makeDescMessage('pkg.Inner', [
				makeScalarField('id', ScalarType.INT32),
			]);
			const field = makeMessageField('inner', inner);
			const config: ProtoZodConfig = {
				fieldOverrides: {
					'pkg.Outer.inner': 'z.lazy(() => CustomSchema)',
				},
			};
			const lazyRefs = new Set(['pkg.Inner']);
			expect(mapField(field, 'pkg.Outer', config, lazyRefs)).toBe(
				'z.lazy(() => CustomSchema)',
			);
		});
	});
});
