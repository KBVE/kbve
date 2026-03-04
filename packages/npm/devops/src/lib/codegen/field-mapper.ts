/**
 * Maps proto DescField to Zod expression strings.
 */

import { ScalarType } from '@bufbuild/protobuf';
import type { DescField, DescEnum, DescOneof } from '@bufbuild/protobuf';
import type { ProtoZodConfig } from './types.js';

/** Map a proto scalar type to a Zod expression */
function mapScalar(scalar: ScalarType): string {
	switch (scalar) {
		case ScalarType.DOUBLE:
		case ScalarType.FLOAT:
		case ScalarType.INT32:
		case ScalarType.UINT32:
		case ScalarType.SINT32:
		case ScalarType.FIXED32:
		case ScalarType.SFIXED32:
		case ScalarType.INT64:
		case ScalarType.UINT64:
		case ScalarType.SINT64:
		case ScalarType.FIXED64:
		case ScalarType.SFIXED64:
			return 'z.number()';
		case ScalarType.BOOL:
			return 'z.boolean()';
		case ScalarType.STRING:
			return 'z.string()';
		case ScalarType.BYTES:
			return 'z.string()';
		default:
			return 'z.unknown()';
	}
}

/** Check if a field matches a nullable pattern (exact or wildcard) */
function isNullable(fieldFqn: string, config: ProtoZodConfig): boolean {
	if (!config.nullable) return false;
	if (config.nullable.includes(fieldFqn)) return true;
	// Wildcard: "pkg.Msg.*"
	const dotIdx = fieldFqn.lastIndexOf('.');
	if (dotIdx > 0) {
		const wildcard = fieldFqn.substring(0, dotIdx) + '.*';
		if (config.nullable.includes(wildcard)) return true;
	}
	return false;
}

/** Well-known Google protobuf types → inline Zod expressions */
const WELL_KNOWN_TYPES: Record<string, string> = {
	'google.protobuf.Timestamp': 'z.string().datetime()',
	'google.protobuf.Duration': 'z.string()',
	'google.protobuf.Struct': 'z.record(z.string(), z.unknown())',
	'google.protobuf.Value': 'z.unknown()',
	'google.protobuf.ListValue': 'z.array(z.unknown())',
	'google.protobuf.Empty': 'z.object({})',
	'google.protobuf.Any':
		'z.object({ typeUrl: z.string(), value: z.string() })',
	'google.protobuf.StringValue': 'z.string()',
	'google.protobuf.BytesValue': 'z.string()',
	'google.protobuf.BoolValue': 'z.boolean()',
	'google.protobuf.Int32Value': 'z.number()',
	'google.protobuf.UInt32Value': 'z.number()',
	'google.protobuf.Int64Value': 'z.number()',
	'google.protobuf.UInt64Value': 'z.number()',
	'google.protobuf.FloatValue': 'z.number()',
	'google.protobuf.DoubleValue': 'z.number()',
	'google.protobuf.FieldMask': 'z.string()',
};

/** Check if a type name is a well-known Google protobuf type */
export function isWellKnownType(typeName: string): boolean {
	return typeName in WELL_KNOWN_TYPES;
}

/** Resolve schema name for a referenced message type, wrapping in z.lazy() for cycles */
function resolveSchemaName(
	typeName: string,
	config: ProtoZodConfig,
	lazyRefs?: Set<string>,
): string {
	// Well-known types get inlined as Zod expressions
	if (WELL_KNOWN_TYPES[typeName]) {
		return WELL_KNOWN_TYPES[typeName];
	}

	const schemaName =
		config.schemaNames?.[typeName] ??
		`${typeName.split('.').pop() ?? typeName}Schema`;

	if (lazyRefs?.has(typeName)) {
		return `z.lazy(() => ${schemaName})`;
	}
	return schemaName;
}

/**
 * Map a single proto field to a Zod expression string.
 *
 * @param field - The proto field descriptor
 * @param parentFqn - Fully qualified name of the parent message
 * @param config - Generator config
 * @returns Zod expression string
 */
export function mapField(
	field: DescField,
	parentFqn: string,
	config: ProtoZodConfig,
	lazyRefs?: Set<string>,
): string {
	const fieldFqn = `${parentFqn}.${field.name}`;

	// Check for complete field override (takes precedence over auto z.lazy())
	if (config.fieldOverrides?.[fieldFqn]) {
		return config.fieldOverrides[fieldFqn];
	}

	let expr: string;

	switch (field.fieldKind) {
		case 'scalar':
			expr = mapScalar(field.scalar);
			break;

		case 'enum':
			expr = mapEnumRef(field.enum, config);
			break;

		case 'message':
			expr = resolveSchemaName(field.message.typeName, config, lazyRefs);
			break;

		case 'list':
			expr = mapList(field, config, lazyRefs);
			break;

		case 'map':
			expr = mapMap(field, config, lazyRefs);
			break;

		default:
			expr = 'z.unknown()';
	}

	// Apply refinements
	if (config.refinements?.[fieldFqn]) {
		expr += config.refinements[fieldFqn];
	}

	// Apply transforms
	if (config.transforms?.[fieldFqn]) {
		expr += `.transform(${config.transforms[fieldFqn]})`;
	}

	// Apply optionality
	expr = applyOptionality(expr, field, fieldFqn, config);

	return expr;
}

/** Map an enum field reference */
function mapEnumRef(enumDesc: DescEnum, config: ProtoZodConfig): string {
	const enumConfig = config.enums?.[enumDesc.typeName];
	if (!enumConfig) return 'z.string()';

	if (enumConfig.mode === 'string') {
		return 'z.string()';
	}

	// For 'enum' and 'const_array' modes, check if there's a zodSchemaName
	const constArray = config.constArrays?.find(
		(ca) => ca.sourceEnum === enumDesc.typeName,
	);
	if (constArray?.zodSchemaName) {
		return constArray.zodSchemaName;
	}

	return 'z.string()';
}

/** Map a repeated (list) field */
function mapList(
	field: DescField & { fieldKind: 'list' },
	config: ProtoZodConfig,
	lazyRefs?: Set<string>,
): string {
	let itemExpr: string;

	switch (field.listKind) {
		case 'scalar':
			itemExpr = mapScalar(field.scalar);
			break;
		case 'enum':
			itemExpr = mapEnumRef(field.enum, config);
			break;
		case 'message':
			itemExpr = resolveSchemaName(
				field.message.typeName,
				config,
				lazyRefs,
			);
			break;
		default:
			itemExpr = 'z.unknown()';
	}

	return `z.array(${itemExpr})`;
}

/** Map a map field */
function mapMap(
	field: DescField & { fieldKind: 'map' },
	config: ProtoZodConfig,
	lazyRefs?: Set<string>,
): string {
	const keyExpr = mapScalar(field.mapKey);
	let valExpr: string;

	switch (field.mapKind) {
		case 'scalar':
			valExpr = mapScalar(field.scalar);
			break;
		case 'enum':
			valExpr = mapEnumRef(field.enum, config);
			break;
		case 'message':
			valExpr = resolveSchemaName(
				field.message.typeName,
				config,
				lazyRefs,
			);
			break;
		default:
			valExpr = 'z.unknown()';
	}

	return `z.record(${keyExpr}, ${valExpr})`;
}

/**
 * Map a oneof group to a Zod z.union() expression.
 *
 * - Message-only oneofs → z.union([SchemaA, SchemaB, ...])
 * - Scalar/mixed oneofs → z.union([z.object({name: expr}), ...])
 * - Always wrapped with .optional()
 */
export function mapOneof(
	oneof: DescOneof,
	parentFqn: string,
	config: ProtoZodConfig,
	lazyRefs?: Set<string>,
): string {
	// First pass: determine if all fields are message type (for flat union style)
	const allMessages = oneof.fields.every(
		(f) =>
			f.fieldKind === 'message' &&
			!config.fieldOverrides?.[`${parentFqn}.${f.name}`],
	);

	const variants: string[] = [];

	for (const field of oneof.fields) {
		const fieldFqn = `${parentFqn}.${field.name}`;

		// Check for complete field override
		if (config.fieldOverrides?.[fieldFqn]) {
			const name = config.renames?.[fieldFqn] ?? field.name;
			variants.push(
				`z.object({ ${name}: ${config.fieldOverrides[fieldFqn]} })`,
			);
			continue;
		}

		let expr: string;
		switch (field.fieldKind) {
			case 'scalar':
				expr = mapScalar(field.scalar);
				break;
			case 'enum':
				expr = mapEnumRef(field.enum, config);
				break;
			case 'message':
				expr = resolveSchemaName(
					field.message.typeName,
					config,
					lazyRefs,
				);
				break;
			default:
				expr = 'z.unknown()';
		}

		// Apply refinements
		if (config.refinements?.[fieldFqn]) {
			expr += config.refinements[fieldFqn];
		}

		// Apply transforms
		if (config.transforms?.[fieldFqn]) {
			expr += `.transform(${config.transforms[fieldFqn]})`;
		}

		if (allMessages) {
			// Message-only: push bare schema reference
			variants.push(expr);
		} else {
			// Mixed/scalar: wrap in z.object({fieldName: expr})
			const name = config.renames?.[fieldFqn] ?? field.name;
			variants.push(`z.object({ ${name}: ${expr} })`);
		}
	}

	if (variants.length === 0) {
		return 'z.never().optional()';
	}

	if (variants.length === 1) {
		return `${variants[0]}.optional()`;
	}

	return `z.union([${variants.join(', ')}]).optional()`;
}

/** Apply optionality (.optional() or .nullable().optional()) */
function applyOptionality(
	expr: string,
	field: DescField,
	fieldFqn: string,
	config: ProtoZodConfig,
): string {
	// Proto3: message fields and `optional` keyword fields have explicit presence
	// Repeated/map fields should also be optional for MDX tolerance
	const hasPresence = field.proto.proto3Optional === true;
	const isMessageField = field.fieldKind === 'message';
	const isRepeated = field.fieldKind === 'list' || field.fieldKind === 'map';

	const shouldBeOptional = hasPresence || isMessageField || isRepeated;
	if (!shouldBeOptional) return expr;

	if (isNullable(fieldFqn, config)) {
		return `${expr}.nullable().optional()`;
	}
	return `${expr}.optional()`;
}
