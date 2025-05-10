import { builder, toReference } from './flexbuilder';

export type FieldMap = Record<string, string>;
export type StreamRequest = { stream: string; id: string };

export enum PayloadFormat {
	PAYLOAD_UNKNOWN = 0,
	JSON = 1,
	FLEX = 2,
	PROTOBUF = 3,
	FLATBUFFER = 4,
}

export interface JediEnvelopeFlex {
	version: number;
	kind: number;
	format: number;
	payload: Uint8Array;
	metadata?: Uint8Array;
}

export enum MessageKind {
	// Verbs (Bits 0–7)
	UNKNOWN         = 0,
	ADD             = 1 << 0,
	READ            = 1 << 1,
	GET             = 1 << 2,
	SET             = 1 << 3,
	DEL             = 1 << 4,
	STREAM          = 1 << 5,
	GROUP           = 1 << 6,
	LIST            = 1 << 7,

	// Intent (Bits 8–15)
	ACTION          = 1 << 8,
	MESSAGE         = 1 << 9,
	INFO            = 1 << 10,
	DEBUG           = 1 << 11,
	ERROR           = 1 << 12,
	AUTH            = 1 << 13,
	HEARTBEAT       = 1 << 14,

	// Targets (Bits 16–23)
	CONFIG_UPDATE   = 1 << 15,
	REDIS           = 1 << 16,
	SUPABASE        = 1 << 17,
	FILESYSTEM      = 1 << 18,
	WEBSOCKET       = 1 << 19,
	HTTP_API        = 1 << 20,
	LOCAL_CACHE     = 1 << 21,
	AI              = 1 << 22,
}

function buildFlexPayload<T extends Record<string, any>>(payload: T): Uint8Array {
	const b = builder();
	b.startMap();

	for (const [key, value] of Object.entries(payload)) {
		b.addKey(key);
		b.add(value);
	}

	b.end();
	return b.finish();
}

export function wrapEnvelope<T extends Record<string, any>>(
	payload: T,
	kind: number,
	format: PayloadFormat,
	metadata?: Uint8Array,
	version = 1,
): Uint8Array {
	let serializedPayload: Uint8Array;

	if (format === PayloadFormat.FLEX) {
		serializedPayload = buildFlexPayload(payload);
	} else if (format === PayloadFormat.JSON) {
		serializedPayload = new TextEncoder().encode(JSON.stringify(payload));
	} else {
		throw new Error('Unsupported format for wrapEnvelope');
	}

	const b = builder();
	b.startMap();
	b.addKey('version');  b.add(version);
	b.addKey('kind');     b.add(kind);
	b.addKey('format');   b.add(format);
	b.addKey('payload');  b.add(serializedPayload);
	b.addKey('metadata'); b.add(metadata ?? new Uint8Array());
	b.end();

	return b.finish();
}

export function unwrapEnvelope<T = unknown>(
	buffer: Uint8Array | ArrayBuffer
): { envelope: JediEnvelopeFlex; payload: T } {
	const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

	const root = toReference(view.buffer as ArrayBuffer).toObject() as Record<string, any>;

	if (
		typeof root.version !== 'number' ||
		typeof root.kind !== 'number' ||
		typeof root.format !== 'number' ||
		!root.payload
	) {
		console.error('[unwrapEnvelope] Bad root:', root);
		throw new Error('[unwrapEnvelope] Invalid envelope structure');
	}

	const envelope: JediEnvelopeFlex = {
		version: root.version,
		kind: root.kind,
		format: root.format,
		payload: new Uint8Array(root.payload),
		metadata: root.metadata ? new Uint8Array(root.metadata) : undefined,
	};

	let parsedPayload: T;

	if (envelope.format === PayloadFormat.FLEX) {
		const ref = toReference(envelope.payload.buffer as ArrayBuffer);
		parsedPayload = ref.toObject() as T;
	} else if (envelope.format === PayloadFormat.JSON) {
		parsedPayload = JSON.parse(new TextDecoder().decode(envelope.payload)) as T;
	} else {
		throw new Error(`[unwrapEnvelope] Unsupported format: ${envelope.format}`);
	}

	return { envelope, payload: parsedPayload };
}

export function unwrapFlexToJson(buffer: Uint8Array) {
	return toReference(buffer.buffer as ArrayBuffer).toObject();
}

export function inspectFlex(buffer: Uint8Array | ArrayBuffer): void {
	try {
		const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
		const obj = unwrapFlexToJson(view);
		console.log('[FlexObject]', JSON.stringify(obj, null, 2));
	} catch (err) {
		console.error('[Flex Decode Error]', err);
	}
}

export function hasKind(kind: number, flag: number): boolean {
	return (kind & flag) === flag;
}


//	Redis Helpers

export function wrapRedisSet(key: string, value: string): Uint8Array {
	return wrapEnvelope(
		{ key, value },
		MessageKind.SET | MessageKind.REDIS,
		PayloadFormat.FLEX
	);
}

export function wrapRedisGet(key: string): Uint8Array {
	return wrapEnvelope(
		{ key },
		MessageKind.GET | MessageKind.REDIS,
		PayloadFormat.FLEX
	);
}

export function wrapRedisDel(key: string): Uint8Array {
	return wrapEnvelope(
		{ key },
		MessageKind.DEL | MessageKind.REDIS,
		PayloadFormat.FLEX
	);
}

export function parseRedisPayload<T = unknown>(envelopeBytes: Uint8Array): {
	envelope: JediEnvelopeFlex;
	payload: T;
} {
	const result = unwrapEnvelope<T>(envelopeBytes);
	if (!hasKind(result.envelope.kind, MessageKind.REDIS)) {
		throw new Error('[Redis] Not a Redis envelope');
	}
	return result;
}

export function wrapRedisXAdd(
	stream: string,
	fields: Record<string, string>,
	id = '*',
): Uint8Array {
	return wrapEnvelope(
		{ stream, id, fields },
		MessageKind.ADD | MessageKind.STREAM | MessageKind.REDIS,
		PayloadFormat.FLEX,
	);
}

export function wrapRedisXRead(
	streams: { stream: string; id: string }[],
	count?: number,
	block?: number,
): Uint8Array {

	const inner = builder();
	inner.startMap();

	inner.addKey('streams');
	inner.startVector(); 
	for (const { stream, id } of streams) {
		inner.startMap();
		inner.addKey('stream'); inner.add(stream);
		inner.addKey('id');     inner.add(id);
		inner.end();
	  }
	inner.end();

	if (count !== undefined) {
		inner.addKey('count'); inner.add(count);
	}
	if (block !== undefined) {
		inner.addKey('block'); inner.add(block);
	}

	inner.end();
	const serializedPayload = inner.finish();

	const b = builder();
	b.startMap();
	b.addKey('version');  b.add(1);
	b.addKey('kind');     b.add(MessageKind.READ | MessageKind.STREAM | MessageKind.REDIS);
	b.addKey('format');   b.add(PayloadFormat.FLEX);
	b.addKey('payload');  b.add(serializedPayload); 
	b.addKey('metadata'); b.add(new Uint8Array());
	b.end();

	return b.finish();
}



export const scopeData = {
	wrapEnvelope,
	unwrapEnvelope,
	MessageKind,
	PayloadFormat,
	unwrapFlexToJson,
	inspectFlex,
	hasKind,
    redis: {
		wrapRedisSet,
		wrapRedisGet,
		wrapRedisDel,
		wrapRedisXAdd,
		wrapRedisXRead,
		parseRedisPayload,
	}
};

export type FlexDataAPI = typeof scopeData;
