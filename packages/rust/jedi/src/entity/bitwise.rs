use crate::proto::jedi::{MessageKind, PayloadFormat};

pub fn has_flag(kind: i32, flag: MessageKind) -> bool {
    kind & flag as i32 != 0
}

pub fn is_redis(kind: i32) -> bool {
    has_flag(kind, MessageKind::Redis)
}

pub fn is_stream_xadd(kind: i32) -> bool {
    has_flag(kind, MessageKind::Redis)
        && has_flag(kind, MessageKind::Stream)
        && has_flag(kind, MessageKind::Add)
}
