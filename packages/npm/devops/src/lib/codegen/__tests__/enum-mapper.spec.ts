import { describe, it, expect, beforeEach } from 'vitest';
import {
	transformEnumValue,
	getEnumValues,
	emitConstArray,
	emitNumericEnum,
} from '../enum-mapper.js';
import { makeDescEnum, resetFieldCounter } from './test-factories.js';
import type {
	EnumConfig,
	ConstArrayConfig,
	NumericEnumConfig,
} from '../types.js';

describe('transformEnumValue', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	it('skips zero/UNSPECIFIED value by default', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'STATUS_UNSPECIFIED', number: 0 },
		]);
		const result = transformEnumValue(
			enumDesc.values[0],
			enumDesc,
			undefined,
		);
		expect(result).toBeNull();
	});

	it('includes zero value when skipUnspecified=false', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'STATUS_UNSPECIFIED', number: 0 },
			{ name: 'STATUS_ACTIVE', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			skipUnspecified: false,
			stripPrefix: 'STATUS_',
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('unspecified');
	});

	it('uses valueOverride when set', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'STATUS_ACTIVE', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			valueOverrides: { STATUS_ACTIVE: 'is_active' },
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('is_active');
	});

	it('strips explicit prefix', () => {
		const enumDesc = makeDescEnum('pkg.Slot', [
			{ name: 'OSRS_SLOT_HEAD', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'OSRS_SLOT_',
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('head');
	});

	it('strips shared prefix when auto-detected', () => {
		const enumDesc = makeDescEnum(
			'pkg.Color',
			[
				{ name: 'COLOR_RED', number: 1 },
				{ name: 'COLOR_BLUE', number: 2 },
			],
			{ sharedPrefix: 'COLOR_' },
		);
		const result = transformEnumValue(
			enumDesc.values[0],
			enumDesc,
			undefined,
		);
		expect(result).toBe('red');
	});

	it('removes leading underscore after prefix strip', () => {
		const enumDesc = makeDescEnum('pkg.Num', [
			{ name: 'NUM__123', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'NUM_',
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('123');
	});

	it('applies lowercase transform (default)', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'ACTIVE', number: 1 },
		]);
		// No shared prefix to strip — need to set sharedPrefix to empty
		(enumDesc as any).sharedPrefix = '';
		const result = transformEnumValue(
			enumDesc.values[0],
			enumDesc,
			undefined,
		);
		expect(result).toBe('active');
	});

	it('applies kebab-case transform', () => {
		const enumDesc = makeDescEnum('pkg.Action', [
			{ name: 'ACTION_DO_THING', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'ACTION_',
			caseTransform: 'kebab-case',
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('do-thing');
	});

	it('applies none transform (preserves case)', () => {
		const enumDesc = makeDescEnum('pkg.Code', [
			{ name: 'CODE_AbCdEf', number: 1 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'CODE_',
			caseTransform: 'none',
		};
		const result = transformEnumValue(enumDesc.values[0], enumDesc, config);
		expect(result).toBe('AbCdEf');
	});
});

describe('getEnumValues', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	it('returns non-zero values with default config', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'STATUS_UNSPECIFIED', number: 0 },
			{ name: 'STATUS_ACTIVE', number: 1 },
			{ name: 'STATUS_INACTIVE', number: 2 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'STATUS_',
		};
		expect(getEnumValues(enumDesc, config)).toEqual(['active', 'inactive']);
	});

	it('returns empty array when only value is zero (skipped)', () => {
		const enumDesc = makeDescEnum('pkg.Status', [
			{ name: 'STATUS_UNSPECIFIED', number: 0 },
		]);
		expect(getEnumValues(enumDesc, undefined)).toEqual([]);
	});

	it('applies all overrides', () => {
		const enumDesc = makeDescEnum('pkg.Type', [
			{ name: 'TYPE_UNSPECIFIED', number: 0 },
			{ name: 'TYPE_A', number: 1 },
			{ name: 'TYPE_B', number: 2 },
		]);
		const config: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'TYPE_',
			valueOverrides: {
				TYPE_A: 'alpha',
				TYPE_B: 'bravo',
			},
		};
		expect(getEnumValues(enumDesc, config)).toEqual(['alpha', 'bravo']);
	});

	it('works with no config (pure defaults)', () => {
		const enumDesc = makeDescEnum(
			'pkg.Color',
			[
				{ name: 'COLOR_UNSPECIFIED', number: 0 },
				{ name: 'COLOR_RED', number: 1 },
			],
			{ sharedPrefix: 'COLOR_' },
		);
		expect(getEnumValues(enumDesc, undefined)).toEqual(['red']);
	});
});

describe('emitConstArray', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	it('emits properly formatted const array', () => {
		const enumDesc = makeDescEnum('pkg.Slot', [
			{ name: 'SLOT_UNSPECIFIED', number: 0 },
			{ name: 'SLOT_HEAD', number: 1 },
			{ name: 'SLOT_BODY', number: 2 },
		]);
		const config: ConstArrayConfig = {
			name: 'EquipSlots',
			sourceEnum: 'pkg.Slot',
		};
		const enumConfig: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'SLOT_',
		};
		const lines = emitConstArray(config, enumDesc, enumConfig);
		const output = lines.join('\n');

		expect(output).toContain('export const EquipSlots = [');
		expect(output).toContain("'head'");
		expect(output).toContain("'body'");
		expect(output).toContain('] as const;');
	});

	it('emits type alias when typeName is set', () => {
		const enumDesc = makeDescEnum('pkg.Slot', [
			{ name: 'SLOT_UNSPECIFIED', number: 0 },
			{ name: 'SLOT_HEAD', number: 1 },
		]);
		const config: ConstArrayConfig = {
			name: 'Slots',
			sourceEnum: 'pkg.Slot',
			typeName: 'SlotType',
		};
		const enumConfig: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'SLOT_',
		};
		const lines = emitConstArray(config, enumDesc, enumConfig);
		const output = lines.join('\n');

		expect(output).toContain(
			'export type SlotType = (typeof Slots)[number];',
		);
	});

	it('emits z.enum() schema when zodSchemaName is set', () => {
		const enumDesc = makeDescEnum('pkg.Slot', [
			{ name: 'SLOT_UNSPECIFIED', number: 0 },
			{ name: 'SLOT_HEAD', number: 1 },
		]);
		const config: ConstArrayConfig = {
			name: 'Slots',
			sourceEnum: 'pkg.Slot',
			zodSchemaName: 'SlotSchema',
		};
		const enumConfig: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'SLOT_',
		};
		const lines = emitConstArray(config, enumDesc, enumConfig);
		const output = lines.join('\n');

		expect(output).toContain('export const SlotSchema = z.enum(Slots);');
	});

	it('emits minimal output (no typeName, no zodSchemaName)', () => {
		const enumDesc = makeDescEnum('pkg.Color', [
			{ name: 'COLOR_UNSPECIFIED', number: 0 },
			{ name: 'COLOR_RED', number: 1 },
		]);
		const config: ConstArrayConfig = {
			name: 'Colors',
			sourceEnum: 'pkg.Color',
		};
		const enumConfig: EnumConfig = {
			mode: 'const_array',
			stripPrefix: 'COLOR_',
		};
		const lines = emitConstArray(config, enumDesc, enumConfig);
		const output = lines.join('\n');

		expect(output).toContain('export const Colors = [');
		expect(output).not.toContain('export type');
		expect(output).not.toContain('z.enum');
	});

	it('handles enum with only zero value (empty const array)', () => {
		const enumDesc = makeDescEnum('pkg.Empty', [
			{ name: 'EMPTY_UNSPECIFIED', number: 0 },
		]);
		const config: ConstArrayConfig = {
			name: 'EmptyValues',
			sourceEnum: 'pkg.Empty',
		};
		const lines = emitConstArray(config, enumDesc, undefined);
		const output = lines.join('\n');

		expect(output).toContain('export const EmptyValues = [');
		expect(output).toContain('] as const;');
	});
});

describe('emitNumericEnum', () => {
	beforeEach(() => {
		resetFieldCounter();
	});

	it('emits a numeric const object preserving integer values (incl. zero)', () => {
		const enumDesc = makeDescEnum('jobboard.Capability', [
			{ name: 'CAP_NONE', number: 0 },
			{ name: 'CAP_TAKER', number: 1 },
			{ name: 'CAP_POSTER', number: 2 },
			{ name: 'CAP_ADMIN', number: 4 },
		]);
		const config: NumericEnumConfig = {
			name: 'Capability',
			sourceEnum: 'jobboard.Capability',
		};
		const output = emitNumericEnum(config, enumDesc).join('\n');

		expect(output).toContain('export const Capability = {');
		expect(output).toContain('CAP_NONE: 0,');
		expect(output).toContain('CAP_TAKER: 1,');
		expect(output).toContain('CAP_ADMIN: 4,');
		expect(output).toContain('} as const;');
	});

	it('emits the value-union type when typeName is set', () => {
		const enumDesc = makeDescEnum('jobboard.GigStatus', [
			{ name: 'GIG_DRAFT', number: 0 },
			{ name: 'GIG_OPEN', number: 2 },
		]);
		const config: NumericEnumConfig = {
			name: 'GigStatus',
			sourceEnum: 'jobboard.GigStatus',
			typeName: 'GigStatusValue',
		};
		const output = emitNumericEnum(config, enumDesc).join('\n');

		expect(output).toContain(
			'export type GigStatusValue = (typeof GigStatus)[keyof typeof GigStatus];',
		);
	});

	it('emits a z.union of literals when zodSchemaName is set', () => {
		const enumDesc = makeDescEnum('jobboard.BudgetType', [
			{ name: 'BUDGET_UNSPECIFIED', number: 0 },
			{ name: 'BUDGET_FIXED', number: 1 },
		]);
		const config: NumericEnumConfig = {
			name: 'BudgetType',
			sourceEnum: 'jobboard.BudgetType',
			zodSchemaName: 'BudgetTypeSchema',
		};
		const output = emitNumericEnum(config, enumDesc).join('\n');

		expect(output).toContain(
			'export const BudgetTypeSchema = z.union([z.literal(0), z.literal(1)]);',
		);
	});

	it('emits minimal output (no typeName, no zodSchemaName)', () => {
		const enumDesc = makeDescEnum('jobboard.Capability', [
			{ name: 'CAP_TAKER', number: 1 },
		]);
		const config: NumericEnumConfig = {
			name: 'Capability',
			sourceEnum: 'jobboard.Capability',
		};
		const output = emitNumericEnum(config, enumDesc).join('\n');

		expect(output).not.toContain('export type');
		expect(output).not.toContain('z.union');
	});
});
