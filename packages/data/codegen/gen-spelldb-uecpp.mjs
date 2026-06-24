#!/usr/bin/env node
/**
 * Generate Unreal Engine C++ (USTRUCT + yyjson populate) from spelldb.proto.
 *
 * Mirrors gen-npcdb-uecpp.mjs but emits UE-native types instead of Zod:
 *   - one USTRUCT per spell-package message (topo-ordered, definition-before-use)
 *   - a Populate(FStruct&, yyjson_val*) per message reading the camelCase JSON
 *     keys the data codegen emits.
 *
 * Output (into the KBVESpellDB plugin):
 *   Public/Generated/KBVESpellDBProtoTypes.h   (USTRUCTs, UHT-processed)
 *   Public/Generated/KBVESpellDBProtoParse.h   (yyjson populate fns)
 *
 * Usage: node packages/data/codegen/gen-spelldb-uecpp.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromBinary, createFileRegistry } from '@bufbuild/protobuf';
import { FileDescriptorSetSchema } from '@bufbuild/protobuf/wkt';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DESCRIPTOR = resolve(__dirname, 'descriptors/spelldb.binpb');
const OUT_DIR = resolve(
	__dirname,
	'../../../packages/unreal/KBVESpellDB/Source/KBVESpellDB/Public/Generated',
);
const PKG_PREFIX = 'spell.';
const STRUCT_PREFIX = 'FKBVEGen';

// proto FieldDescriptorProto.Type (ScalarType) → UE C++ type
function scalarToUE(scalar) {
	switch (scalar) {
		case 1: return 'double';   // DOUBLE
		case 2: return 'float';    // FLOAT
		case 3: case 4: case 6:
		case 16: case 18: return 'int64';
		case 5: case 7: case 13:
		case 15: case 17: return 'int32';
		case 8: return 'bool';     // BOOL
		case 9: return 'FString';  // STRING
		case 12: return 'TArray<uint8>'; // BYTES
		default: return 'int32';
	}
}

// yyjson reader expression for a scalar field, given the source val var `V`
function scalarReader(scalar, V) {
	switch (scalar) {
		case 1: return `(yyjson_is_num(${V}) ? yyjson_get_real(${V}) : 0.0)`;
		case 2: return `(float)(yyjson_is_num(${V}) ? yyjson_get_real(${V}) : 0.0)`;
		case 3: case 4: case 6: case 16: case 18:
			return `(int64)(yyjson_is_int(${V}) ? yyjson_get_sint(${V}) : (yyjson_is_uint(${V}) ? (int64)yyjson_get_uint(${V}) : 0))`;
		case 5: case 7: case 13: case 15: case 17:
			return `(int32)(yyjson_is_int(${V}) ? yyjson_get_int(${V}) : (yyjson_is_uint(${V}) ? (int32)yyjson_get_uint(${V}) : 0))`;
		case 8: return `(yyjson_is_bool(${V}) ? yyjson_get_bool(${V}) : false)`;
		case 9: return `(yyjson_is_str(${V}) ? FString(UTF8_TO_TCHAR(yyjson_get_str(${V}))) : FString())`;
		case 12: return `KBVEGenBytesFromJson(${V})`; // BYTES — proto3 JSON base64 string
		default: return '0';
	}
}

function pascal(name) {
	return name
		.split(/[_\s]+/)
		.filter(Boolean)
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join('');
}

function structName(msgName) {
	return STRUCT_PREFIX + msgName;
}

function loadMessages() {
	const fds = fromBinary(FileDescriptorSetSchema, new Uint8Array(readFileSync(DESCRIPTOR)));
	const reg = createFileRegistry(fds);
	const messages = new Map(); // typeName → DescMessage
	for (const t of reg) {
		if (t.kind === 'message' && t.typeName.startsWith(PKG_PREFIX)) {
			messages.set(t.typeName, t);
		}
	}
	return messages;
}

// map<string, V> value → UE element type (value kind lives on field.mapKind)
function mapValueUE(field, messages) {
	if (field.mapKind === 'scalar') return scalarToUE(field.scalar);
	if (field.mapKind === 'enum') return 'FString';
	if (field.mapKind === 'message') {
		return messages.has(field.message.typeName) ? structName(field.message.name) : 'FString';
	}
	return 'FString';
}

// default initializer for a UPROPERTY of the given field
function fieldDefault(field, messages) {
	if (field.fieldKind === 'scalar') {
		if (field.scalar === 8) return ' = false';
		if (field.scalar === 9 || field.scalar === 12) return '';
		return ' = 0';
	}
	return ''; // enum FString, message struct, list TArray, map — default-construct
}

// UE field type for a field descriptor
function fieldUEType(field, messages) {
	if (field.fieldKind === 'scalar') return scalarToUE(field.scalar);
	if (field.fieldKind === 'enum') return 'FString';
	if (field.fieldKind === 'message') {
		return messages.has(field.message.typeName) ? structName(field.message.name) : 'FString';
	}
	if (field.fieldKind === 'list') {
		if (field.listKind === 'scalar') return `TArray<${scalarToUE(field.scalar)}>`;
		if (field.listKind === 'enum') return 'TArray<FString>';
		if (field.listKind === 'message') {
			return messages.has(field.message.typeName)
				? `TArray<${structName(field.message.name)}>`
				: 'TArray<FString>';
		}
	}
	if (field.fieldKind === 'map') return `TMap<FString, ${mapValueUE(field, messages)}>`;
	return 'int32';
}

// topo-sort messages so a struct is defined before any struct that embeds it
function topoSort(messages) {
	const ordered = [];
	const visited = new Set();
	const visiting = new Set();
	function visit(typeName) {
		if (visited.has(typeName)) return;
		if (visiting.has(typeName)) return; // cycle: emit later, refs are by-value TArray/struct — break gracefully
		visiting.add(typeName);
		const msg = messages.get(typeName);
		for (const f of msg.fields) {
			const dep = f.fieldKind === 'message' ? f.message
				: (f.fieldKind === 'list' && f.listKind === 'message' ? f.message
				: (f.fieldKind === 'map' && f.mapKind === 'message' ? f.message : null));
			if (dep && messages.has(dep.typeName) && dep.typeName !== typeName) {
				visit(dep.typeName);
			}
		}
		visiting.delete(typeName);
		visited.add(typeName);
		ordered.push(msg);
	}
	for (const tn of messages.keys()) visit(tn);
	return ordered;
}

function emitStructs(ordered, messages) {
	const lines = [];
	lines.push('#pragma once', '');
	lines.push('// AUTO-GENERATED by gen-spelldb-uecpp.mjs from spell/spelldb.proto — DO NOT EDIT', '');
	lines.push('#include "CoreMinimal.h"');
	lines.push('#include "KBVESpellDBProtoTypes.generated.h"', '');

	for (const msg of ordered) {
		lines.push('USTRUCT(BlueprintType)');
		lines.push(`struct KBVESPELLDB_API ${structName(msg.name)}`);
		lines.push('{');
		lines.push('\tGENERATED_BODY()', '');
		for (const f of msg.fields) {
			const ueType = fieldUEType(f, messages);
			lines.push('\tUPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|SpellDB")');
			lines.push(`\t${ueType} ${pascal(f.name)}${fieldDefault(f, messages)};`, '');
		}
		lines.push('};', '');
	}
	return lines.join('\n');
}

function emitParsers(ordered, messages) {
	const lines = [];
	lines.push('#pragma once', '');
	lines.push('// AUTO-GENERATED by gen-spelldb-uecpp.mjs — DO NOT EDIT', '');
	lines.push('#include "CoreMinimal.h"');
	lines.push('#include "Misc/Base64.h"');
	lines.push('#include "Generated/KBVESpellDBProtoTypes.h"');
	lines.push('#include "KBVEYYJson.h"', '');
	lines.push('namespace KBVESpellDBProto', '{');
	lines.push('\tinline TArray<uint8> KBVEGenBytesFromJson(yyjson_val* V)');
	lines.push('\t{');
	lines.push('\t\tTArray<uint8> Bytes;');
	lines.push('\t\tif (V && yyjson_is_str(V)) FBase64::Decode(FString(UTF8_TO_TCHAR(yyjson_get_str(V))), Bytes);');
	lines.push('\t\treturn Bytes;');
	lines.push('\t}', '');

	for (const msg of ordered) {
		const sn = structName(msg.name);
		lines.push(`\tinline void Populate(${sn}& Out, yyjson_val* Obj)`);
		lines.push('\t{');
		lines.push('\t\tif (!Obj || !yyjson_is_obj(Obj)) return;');
		lines.push('\t\tyyjson_val* V = nullptr; (void)V;');
		for (const f of msg.fields) {
			const prop = pascal(f.name);
			const key = f.jsonName;
			if (f.fieldKind === 'scalar') {
				lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}"))) Out.${prop} = ${scalarReader(f.scalar, 'V')};`);
			} else if (f.fieldKind === 'enum') {
				lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}")) && yyjson_is_str(V)) Out.${prop} = FString(UTF8_TO_TCHAR(yyjson_get_str(V)));`);
			} else if (f.fieldKind === 'message' && messages.has(f.message.typeName)) {
				lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}"))) Populate(Out.${prop}, V);`);
			} else if (f.fieldKind === 'list') {
				lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}")) && yyjson_is_arr(V))`);
				lines.push('\t\t{');
				lines.push('\t\t\tsize_t Idx, Max; yyjson_val* Elem;');
				lines.push('\t\t\tyyjson_arr_foreach(V, Idx, Max, Elem)');
				lines.push('\t\t\t{');
				if (f.listKind === 'scalar') {
					lines.push(`\t\t\t\tOut.${prop}.Add(${scalarReader(f.scalar, 'Elem')});`);
				} else if (f.listKind === 'enum') {
					lines.push('\t\t\t\tif (yyjson_is_str(Elem)) Out.' + prop + '.Add(FString(UTF8_TO_TCHAR(yyjson_get_str(Elem))));');
				} else if (f.listKind === 'message' && messages.has(f.message.typeName)) {
					lines.push(`\t\t\t\t${structName(f.message.name)} ElemOut; Populate(ElemOut, Elem); Out.${prop}.Add(MoveTemp(ElemOut));`);
				}
				lines.push('\t\t\t}');
				lines.push('\t\t}');
			} else if (f.fieldKind === 'map') {
				let reader = null;
				if (f.mapKind === 'scalar') reader = scalarReader(f.scalar, 'MV');
				else if (f.mapKind === 'enum') reader = '(yyjson_is_str(MV) ? FString(UTF8_TO_TCHAR(yyjson_get_str(MV))) : FString())';
				if (reader) {
					lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}")) && yyjson_is_obj(V))`);
					lines.push('\t\t{');
					lines.push('\t\t\tsize_t MIdx, MMax; yyjson_val *MK, *MV;');
					lines.push('\t\t\tyyjson_obj_foreach(V, MIdx, MMax, MK, MV)');
					lines.push('\t\t\t{');
					lines.push(`\t\t\t\tOut.${prop}.Add(FString(UTF8_TO_TCHAR(yyjson_get_str(MK))), ${reader});`);
					lines.push('\t\t\t}');
					lines.push('\t\t}');
				} else if (f.mapKind === 'message' && messages.has(f.message.typeName)) {
					lines.push(`\t\tif ((V = yyjson_obj_get(Obj, "${key}")) && yyjson_is_obj(V))`);
					lines.push('\t\t{');
					lines.push('\t\t\tsize_t MIdx, MMax; yyjson_val *MK, *MV;');
					lines.push('\t\t\tyyjson_obj_foreach(V, MIdx, MMax, MK, MV)');
					lines.push('\t\t\t{');
					lines.push(`\t\t\t\t${structName(f.message.name)} ElemOut; Populate(ElemOut, MV); Out.${prop}.Add(FString(UTF8_TO_TCHAR(yyjson_get_str(MK))), MoveTemp(ElemOut));`);
					lines.push('\t\t\t}');
					lines.push('\t\t}');
				}
			}
		}
		lines.push('\t}', '');
	}
	lines.push('}');
	return lines.join('\n');
}

const messages = loadMessages();
const ordered = topoSort(messages);
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'KBVESpellDBProtoTypes.h'), emitStructs(ordered, messages) + '\n');
writeFileSync(resolve(OUT_DIR, 'KBVESpellDBProtoParse.h'), emitParsers(ordered, messages) + '\n');
console.log(`✓ Generated ${ordered.length} USTRUCTs → ${OUT_DIR}`);
