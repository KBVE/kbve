/**
 * Maps proto enums to const arrays, z.enum() schemas, and z.string() fields.
 */

import type { DescEnum, DescEnumValue } from '@bufbuild/protobuf';
import type { EnumConfig, ConstArrayConfig } from './types.js';

/** Transform a single enum value name to output string */
export function transformEnumValue(
	value: DescEnumValue,
	enumDesc: DescEnum,
	enumConfig?: EnumConfig,
): string | null {
	// Skip UNSPECIFIED (zero) value by default
	if ((enumConfig?.skipUnspecified ?? true) && value.number === 0) {
		return null;
	}

	// Check manual override
	if (enumConfig?.valueOverrides?.[value.name]) {
		return enumConfig.valueOverrides[value.name];
	}

	// Strip prefix
	const prefix = enumConfig?.stripPrefix ?? enumDesc.sharedPrefix ?? '';
	let name = value.name;
	if (prefix && name.startsWith(prefix)) {
		name = name.substring(prefix.length);
	}
	// Remove leading underscore
	if (name.startsWith('_')) name = name.substring(1);

	// Case transform
	const transform = enumConfig?.caseTransform ?? 'lowercase';
	switch (transform) {
		case 'lowercase':
			return name.toLowerCase();
		case 'kebab-case':
			return name.toLowerCase().replace(/_/g, '-');
		case 'none':
			return name;
	}
}

/** Get all transformed values for an enum */
export function getEnumValues(
	enumDesc: DescEnum,
	enumConfig?: EnumConfig,
): string[] {
	const values: string[] = [];
	for (const val of enumDesc.values) {
		const transformed = transformEnumValue(val, enumDesc, enumConfig);
		if (transformed !== null) {
			values.push(transformed);
		}
	}
	return values;
}

/** Emit a const array + type alias + optional z.enum() from an enum */
export function emitConstArray(
	config: ConstArrayConfig,
	enumDesc: DescEnum,
	enumConfig?: EnumConfig,
): string[] {
	const values = getEnumValues(enumDesc, enumConfig);
	const quoted = values.map((v) => `\t'${v}'`).join(',\n');
	const lines: string[] = [];

	// Const array
	lines.push(`export const ${config.name} = [`);
	lines.push(quoted + ',');
	lines.push('] as const;');
	lines.push('');

	// Type alias
	if (config.typeName) {
		lines.push(
			`export type ${config.typeName} = (typeof ${config.name})[number];`,
		);
		lines.push('');
	}

	// z.enum() schema
	if (config.zodSchemaName) {
		lines.push(
			`export const ${config.zodSchemaName} = z.enum(${config.name});`,
		);
		lines.push('');
	}

	return lines;
}
