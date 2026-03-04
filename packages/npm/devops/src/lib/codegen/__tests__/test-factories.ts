/**
 * Mock descriptor builders for testing proto-to-zod codegen modules.
 *
 * These factories create minimal objects that satisfy @bufbuild/protobuf
 * readonly descriptor interfaces via `as unknown as Type`.
 */

import { ScalarType } from '@bufbuild/protobuf';
import type {
	DescMessage,
	DescField,
	DescEnum,
	DescEnumValue,
	DescOneof,
} from '@bufbuild/protobuf';

// ─── Counter for unique field numbers ────────────────────────────────────────
let fieldNumberCounter = 1;

/** Reset field number counter (call in beforeEach) */
export function resetFieldCounter(): void {
	fieldNumberCounter = 1;
}

// ─── DescEnumValue ───────────────────────────────────────────────────────────

export function makeDescEnumValue(
	name: string,
	number: number,
	parent?: DescEnum,
): DescEnumValue {
	return {
		kind: 'enum_value',
		name,
		localName: name,
		number,
		deprecated: false,
		parent: parent as DescEnum,
		proto: {},
		toString: () => name,
	} as unknown as DescEnumValue;
}

// ─── DescEnum ────────────────────────────────────────────────────────────────

interface MakeDescEnumOpts {
	sharedPrefix?: string;
}

export function makeDescEnum(
	typeName: string,
	values: Array<{ name: string; number: number }>,
	opts?: MakeDescEnumOpts,
): DescEnum {
	const name = typeName.split('.').pop() ?? typeName;

	const enumDesc = {
		kind: 'enum',
		typeName,
		name,
		open: true,
		values: [] as DescEnumValue[],
		value: {} as Record<number, DescEnumValue>,
		sharedPrefix: opts?.sharedPrefix,
		deprecated: false,
		parent: undefined,
		file: {} as any,
		proto: {},
		toString: () => typeName,
	} as unknown as DescEnum;

	// Build values with parent reference
	const enumValues = values.map((v) =>
		makeDescEnumValue(v.name, v.number, enumDesc),
	);
	(enumDesc as any).values = enumValues;

	const valueRecord: Record<number, DescEnumValue> = {};
	for (const v of enumValues) {
		valueRecord[v.number] = v;
	}
	(enumDesc as any).value = valueRecord;

	// Auto-detect shared prefix if not provided
	if (opts?.sharedPrefix === undefined && enumValues.length > 1) {
		const names = enumValues.map((v) => v.name);
		let prefix = '';
		const first = names[0];
		for (let i = 0; i < first.length; i++) {
			if (names.every((n) => n[i] === first[i])) {
				prefix += first[i];
			} else {
				break;
			}
		}
		if (prefix.length > 0) {
			(enumDesc as any).sharedPrefix = prefix;
		}
	}

	return enumDesc;
}

// ─── DescField factories ─────────────────────────────────────────────────────

interface FieldOpts {
	proto3Optional?: boolean;
	oneof?: DescOneof;
	number?: number;
}

function makeFieldBase(name: string, opts?: FieldOpts) {
	return {
		kind: 'field' as const,
		name,
		localName: name,
		number: opts?.number ?? fieldNumberCounter++,
		jsonName: name,
		deprecated: false,
		presence: opts?.proto3Optional ? 'EXPLICIT' : 'IMPLICIT',
		oneof: opts?.oneof ?? undefined,
		proto: {
			proto3Optional: opts?.proto3Optional ?? false,
		},
		toString: () => name,
	};
}

export function makeScalarField(
	name: string,
	scalar: ScalarType,
	opts?: FieldOpts,
): DescField {
	return {
		...makeFieldBase(name, opts),
		fieldKind: 'scalar',
		scalar,
		longAsString: false,
		message: undefined,
		enum: undefined,
		getDefaultValue: () => undefined,
	} as unknown as DescField;
}

export function makeEnumField(
	name: string,
	enumDesc: DescEnum,
	opts?: FieldOpts,
): DescField {
	return {
		...makeFieldBase(name, opts),
		fieldKind: 'enum',
		scalar: undefined,
		message: undefined,
		enum: enumDesc,
		getDefaultValue: () => undefined,
	} as unknown as DescField;
}

export function makeMessageField(
	name: string,
	messageDesc: DescMessage,
	opts?: FieldOpts,
): DescField {
	return {
		...makeFieldBase(name, opts),
		fieldKind: 'message',
		scalar: undefined,
		message: messageDesc,
		enum: undefined,
		delimitedEncoding: false,
		getDefaultValue: () => undefined,
	} as unknown as DescField;
}

interface ListFieldOpts extends FieldOpts {
	packed?: boolean;
}

export function makeListField(
	name: string,
	listKind: 'scalar',
	inner: { scalar: ScalarType },
	opts?: ListFieldOpts,
): DescField;
export function makeListField(
	name: string,
	listKind: 'enum',
	inner: { enum: DescEnum },
	opts?: ListFieldOpts,
): DescField;
export function makeListField(
	name: string,
	listKind: 'message',
	inner: { message: DescMessage },
	opts?: ListFieldOpts,
): DescField;
export function makeListField(
	name: string,
	listKind: 'scalar' | 'enum' | 'message',
	inner: { scalar?: ScalarType; enum?: DescEnum; message?: DescMessage },
	opts?: ListFieldOpts,
): DescField {
	const base = makeFieldBase(name, opts);
	// list fields cannot be in a oneof
	(base as any).oneof = undefined;

	const shared = {
		...base,
		fieldKind: 'list' as const,
		listKind,
		packed: opts?.packed ?? true,
	};

	if (listKind === 'scalar') {
		return {
			...shared,
			scalar: inner.scalar!,
			enum: undefined,
			message: undefined,
			longAsString: false,
		} as unknown as DescField;
	} else if (listKind === 'enum') {
		return {
			...shared,
			scalar: undefined,
			enum: inner.enum!,
			message: undefined,
		} as unknown as DescField;
	} else {
		return {
			...shared,
			scalar: undefined,
			enum: undefined,
			message: inner.message!,
			delimitedEncoding: false,
		} as unknown as DescField;
	}
}

export function makeMapField(
	name: string,
	mapKey: ScalarType,
	mapKind: 'scalar',
	inner: { scalar: ScalarType },
	opts?: FieldOpts,
): DescField;
export function makeMapField(
	name: string,
	mapKey: ScalarType,
	mapKind: 'enum',
	inner: { enum: DescEnum },
	opts?: FieldOpts,
): DescField;
export function makeMapField(
	name: string,
	mapKey: ScalarType,
	mapKind: 'message',
	inner: { message: DescMessage },
	opts?: FieldOpts,
): DescField;
export function makeMapField(
	name: string,
	mapKey: ScalarType,
	mapKind: 'scalar' | 'enum' | 'message',
	inner: { scalar?: ScalarType; enum?: DescEnum; message?: DescMessage },
	opts?: FieldOpts,
): DescField {
	const base = makeFieldBase(name, opts);
	(base as any).oneof = undefined;

	const shared = {
		...base,
		fieldKind: 'map' as const,
		mapKey,
		mapKind,
		delimitedEncoding: false,
	};

	if (mapKind === 'scalar') {
		return {
			...shared,
			scalar: inner.scalar!,
			enum: undefined,
			message: undefined,
		} as unknown as DescField;
	} else if (mapKind === 'enum') {
		return {
			...shared,
			scalar: undefined,
			enum: inner.enum!,
			message: undefined,
		} as unknown as DescField;
	} else {
		return {
			...shared,
			scalar: undefined,
			enum: undefined,
			message: inner.message!,
		} as unknown as DescField;
	}
}

// ─── DescOneof ───────────────────────────────────────────────────────────────

export function makeDescOneof(
	name: string,
	fields: DescField[],
	parent?: DescMessage,
): DescOneof {
	const oneof = {
		kind: 'oneof' as const,
		name,
		localName: name,
		parent: parent as DescMessage,
		fields,
		deprecated: false,
		proto: {},
		toString: () => name,
	} as unknown as DescOneof;

	// Wire each field's oneof back-reference
	for (const field of fields) {
		(field as any).oneof = oneof;
	}

	return oneof;
}

// ─── DescMessage ─────────────────────────────────────────────────────────────

interface MakeDescMessageOpts {
	oneofs?: DescOneof[];
	nestedMessages?: DescMessage[];
	nestedEnums?: DescEnum[];
}

export function makeDescMessage(
	typeName: string,
	fields: DescField[],
	opts?: MakeDescMessageOpts,
): DescMessage {
	const name = typeName.split('.').pop() ?? typeName;
	const oneofs = opts?.oneofs ?? [];

	// Build members: interleave fields and oneofs in order
	// Fields not belonging to a oneof appear directly, oneofs appear once
	const seenOneofs = new Set<DescOneof>();
	const members: (DescField | DescOneof)[] = [];
	for (const field of fields) {
		if ((field as any).oneof && !seenOneofs.has((field as any).oneof)) {
			seenOneofs.add((field as any).oneof);
			members.push((field as any).oneof);
		} else if (!(field as any).oneof) {
			members.push(field);
		}
	}
	// Add any oneofs not yet seen (e.g., if passed via opts but fields not in main list)
	for (const oo of oneofs) {
		if (!seenOneofs.has(oo)) {
			members.push(oo);
		}
	}

	const fieldRecord: Record<string, DescField> = {};
	for (const f of fields) {
		fieldRecord[f.name] = f;
	}

	const msg = {
		kind: 'message' as const,
		typeName,
		name,
		fields,
		field: fieldRecord,
		oneofs,
		members,
		nestedMessages: opts?.nestedMessages ?? [],
		nestedEnums: opts?.nestedEnums ?? [],
		nestedExtensions: [],
		deprecated: false,
		parent: undefined,
		file: {} as any,
		proto: {},
		toString: () => typeName,
	} as unknown as DescMessage;

	// Wire parent references for fields and oneofs
	for (const field of fields) {
		(field as any).parent = msg;
	}
	for (const oo of oneofs) {
		(oo as any).parent = msg;
	}

	return msg;
}

// Re-export ScalarType for convenience in tests
export { ScalarType };
