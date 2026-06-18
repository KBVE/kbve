export {
	ChatKind,
	Platform,
	ChatEnvelopeSchema,
	ChatKindSchema,
	PlatformSchema,
	type ChatEnvelope,
	type ChatKindValue,
	type PlatformValue,
} from '@kbve/proto/chat-schema';

export {
	parseEnvelope,
	formatEnvelope,
	toIrcLine,
	chatEnvelope,
	noticeEnvelope,
	wireTagForKind,
	kindFromWireTag,
	platformToWire,
	platformFromWire,
	type ParseContext,
} from './codec.js';
