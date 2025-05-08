import { builder, toReference } from './flexbuilder';

export type FieldMap = Record<string, string>;
export type StreamRequest = { stream: string; id: string };


export function buildXaddPayload(
	stream: string,
	fields: FieldMap,
	id = '*',
): Uint8Array {
	const b = builder();
	b.startMap();
	b.addKey('xadd');
	b.startMap();
	b.addKey('stream'); b.add(stream);
	b.addKey('id'); b.add(id);
	b.addKey('fields'); b.startVector();

	for (const [key, value] of Object.entries(fields)) {
		b.startMap();
		b.addKey('key'); b.add(key);
		b.addKey('value'); b.add(value);
		b.end();
	}

	b.end();
	b.end();
	b.end();
	return b.finish();
}

export function buildXreadPayload(
	streams: StreamRequest[],
	count?: number,
	block?: number,
): Uint8Array {
	const b = builder();
	b.startMap();
	b.addKey('xread');
	b.add({
		streams,
		...(count !== undefined && { count }),
		...(block !== undefined && { block }),
	});
	b.end();
	return b.finish();
}

export function unwrapFlexToJson(buffer: Uint8Array) {
	return toReference(buffer.buffer as ArrayBuffer).toObject();
}

export function inspectFlex(buffer: Uint8Array): void {
	try {
		console.log('[FlexObject]', unwrapFlexToJson(buffer));
	} catch (err) {
		console.error('[Flex Decode Error]', err);
	}
}

export const scopeData = {
	buildXaddPayload,
	buildXreadPayload,
	unwrapFlexToJson,
	inspectFlex,
};

export type FlexDataAPI = typeof scopeData;
