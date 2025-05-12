
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

export const MultiMessageKind = {
    RGET:     MessageKind.REDIS | MessageKind.GET,
    RSET:     MessageKind.REDIS | MessageKind.SET,
    RDEL:     MessageKind.REDIS | MessageKind.DEL,
    XADD:     MessageKind.REDIS | MessageKind.STREAM | MessageKind.ADD,
    XREAD:    MessageKind.REDIS | MessageKind.STREAM | MessageKind.READ,
    WATCH:    MessageKind.REDIS | MessageKind.HEARTBEAT | MessageKind.READ | MessageKind.INFO,
    UNWATCH:  MessageKind.REDIS | MessageKind.HEARTBEAT | MessageKind.DEL | MessageKind.INFO,
    PUBLISH:  MessageKind.REDIS | MessageKind.MESSAGE | MessageKind.ACTION,
    SUBSCRIBE: MessageKind.REDIS | MessageKind.MESSAGE | MessageKind.READ,
} as const;

export type MultiMessageKindKey = keyof typeof MultiMessageKind;

