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

// ! GENERIC BROKEN 
export function wrapEnvelope<T>(
	payload: T,
	kind: number,
	format: PayloadFormat,
	metadata?: Uint8Array,
	version = 1,
): Uint8Array {
	const b = builder();
	let serializedPayload: Uint8Array;
	if (format === PayloadFormat.FLEX) {
		const inner = builder();
		inner.add(payload);
		serializedPayload = inner.finish();
	} else if (format === PayloadFormat.JSON) {
		serializedPayload = new TextEncoder().encode(JSON.stringify(payload));
	} else {
		throw new Error('Unsupported format for wrapEnvelope');
	}

	b.startMap();
	b.addKey('version'); b.add(version);
	b.addKey('kind'); b.add(kind);
	b.addKey('format'); b.add(format);
	b.addKey('payload'); b.add(serializedPayload);
	b.addKey('metadata'); b.add(metadata ?? new Uint8Array());
	b.end();

	return b.finish();
}

export function wrapEnvelopeRedisGETFlex(key: string): Uint8Array {
	const payloadBuilder = builder();
	payloadBuilder.startMap();
	payloadBuilder.addKey('key');
	payloadBuilder.add(key);
	// payloadBuilder.addKey('value'); // required by backend struct
	// payloadBuilder.add('');
	payloadBuilder.end();

	const payloadBytes = payloadBuilder.finish();

	const b = builder();
	b.startMap();
	b.addKey('version');
	b.add(1);
	b.addKey('kind');
	b.add(MessageKind.GET | MessageKind.REDIS);
	b.addKey('format');
	b.add(PayloadFormat.FLEX);
	b.addKey('payload');
	b.add(payloadBytes); // don't wrap in new Uint8Array again
	b.addKey('metadata');
	b.add(new Uint8Array());
	b.end();

	return b.finish();
}

export function unwrapEnvelope<T = unknown>(
	buffer: Uint8Array
): { envelope: JediEnvelopeFlex; payload: T } {
    const root = toReference(buffer.buffer as ArrayBuffer).toObject() as JediEnvelopeFlex;

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

export function inspectFlex(buffer: Uint8Array): void {
	try {
		console.log('[FlexObject]', unwrapFlexToJson(buffer));
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
		{ set: { key, value } },
		MessageKind.SET | MessageKind.REDIS,
		PayloadFormat.FLEX
	);
}

export function wrapRedisGet(key: string): Uint8Array {
	return wrapEnvelopeRedisGETFlex(key);
}

export function wrapRedisDel(key: string): Uint8Array {
	return wrapEnvelope(
		{ del: { key } },
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
		parseRedisPayload,
	}
};

export type FlexDataAPI = typeof scopeData;
