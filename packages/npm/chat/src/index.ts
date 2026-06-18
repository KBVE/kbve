export {
	ChatKind,
	Platform,
	ChatEnvelopeSchema,
	ChatKindSchema,
	PlatformSchema,
	type ChatEnvelope,
	type ChatKindValue,
	type PlatformValue,
} from './generated/chat-schema';

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

export {
	parseIrcLine,
	decodeIrcTrailing,
	type ParsedIrcMessage,
	type DecodedMessage,
	type DecodedMessageType,
} from './irc.js';

export { GAMECHAT_KIND_CHAT, type GamechatFrame } from './gamechat.js';
