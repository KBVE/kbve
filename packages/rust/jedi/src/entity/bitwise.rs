use crate::proto::jedi::{MessageKind, PayloadFormat};

impl MessageKind {
    #[inline(always)]
    pub fn has_flag(kind: i32, flag: MessageKind) -> bool {
        (kind & flag as i32) != 0
    }

    #[inline(always)]
    pub fn has_flags(kind: i32, flags: &[MessageKind]) -> bool {
        let combined_flags = flags.iter().fold(0, |acc, &flag| acc | flag as i32);
        (kind & combined_flags) == combined_flags
    }

    #[inline(always)]
    pub fn is_stream_xadd(kind: i32) -> bool {
        Self::has_flags(kind, &[MessageKind::Redis, MessageKind::Stream, MessageKind::Add])
    }
}

macro_rules! define_flag_checks {
    ($( ($fn_name:ident, $variant:ident) ),*) => {
        impl MessageKind {
            $(
                #[inline(always)]
                pub fn $fn_name(kind: i32) -> bool {
                    MessageKind::has_flag(kind, MessageKind::$variant)
                }
            )*
        }
    };
}

macro_rules! define_multi_flag_checks {
    ($( ($fn_name:ident, [ $( $variant:ident ),+ ]) ),*) => {
        impl MessageKind {
            $(
                #[inline(always)]
                pub fn $fn_name(kind: i32) -> bool {
                    MessageKind::has_flags(kind, &[ $( MessageKind::$variant ),+ ])
                }
            )*
        }
    };
}

define_flag_checks!(
    (add, Add),
    (read, Read),
    (get, Get),
    (set, Set),
    (del, Del),
    (stream, Stream),
    (group, Group),
    (list, List),
    (action, Action),
    (message, Message),
    (info, Info),
    (debug, Debug),
    (error, Error),
    (auth, Auth),
    (heartbeat, Heartbeat),
    (config_update, ConfigUpdate),
    (redis, Redis),
    (supabase, Supabase),
    (filesystem, Filesystem),
    (websocket, Websocket),
    (http_api, HttpApi),
    (local_cache, LocalCache),
    (ai, Ai),
    (external, External),
    (reserved25, Reserved25),
    (reserved26, Reserved26),
    (reserved27, Reserved27),
    (reserved28, Reserved28),
    (reserved29, Reserved29),
    (reserved30, Reserved30),
    (reserved31, Reserved31)
);

define_multi_flag_checks!(
    (xadd, [Redis, Stream, Add]),
    (xread, [Redis, Stream, Read]),
    (watch, [Redis, Heartbeat, Read, Stream]),
    (unwatch,  [Redis, Heartbeat, Del, Stream])
);