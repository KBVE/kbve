use crate::proto::jedi::MessageKind;
use once_cell::sync::Lazy;
use std::collections::HashMap;

impl MessageKind {
    pub fn try_from_valid(kind: i32) -> bool {
        if Self::try_from(kind).is_ok() {
            return true;
        }
        MESSAGE_KIND_MULTI_MAP.contains_key(&kind)
    }

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
        Self::has_flags(
            kind,
            &[MessageKind::Redis, MessageKind::Stream, MessageKind::Add],
        )
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
    (
        $(
            ($fn_name:ident, $const_name:ident, [ $( $variant:ident ),+ ])
        ),*
        $(,)?
    ) => {
        impl MessageKind {
            $(
                #[inline(always)]
                pub fn $fn_name(kind: i32) -> bool {
                    MessageKind::has_flags(kind, &[ $( MessageKind::$variant ),+ ])
                }
            )*

            $(
                pub const $const_name: i32 = 0 $(| MessageKind::$variant as i32)+;
            )*
        }

        pub static MESSAGE_KIND_MULTI_MAP: Lazy<HashMap<i32, &'static [MessageKind]>> = Lazy::new(|| {
            let mut map = HashMap::new();
            $(
                const $const_name: &[MessageKind] = &[ $( MessageKind::$variant ),+ ];
                map.insert(MessageKind::$const_name, $const_name);
            )*
            map
        });
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
    (clickhouse, Clickhouse),
    (reserved26, Reserved26),
    (reserved27, Reserved27),
    (reserved28, Reserved28),
    (reserved29, Reserved29),
    (reserved30, Reserved30),
    (reserved31, Reserved31)
);

define_multi_flag_checks!(
    (rget, RGET, [Redis, Get]),
    (rset, RSET, [Redis, Set]),
    (rdel, RDEL, [Redis, Del]),
    (xadd, XADD, [Redis, Stream, Add]),
    (xread, XREAD, [Redis, Stream, Read]),
    (watch, WATCH, [Redis, Heartbeat, Read, Info]),
    (unwatch, UNWATCH, [Redis, Heartbeat, Del, Info]),
    (publish, PUBLISH, [Redis, Message, Action]),
    (subscribe, SUBSCRIBE, [Redis, Message, Read]),
    (ch_insert, CH_INSERT, [Clickhouse, Add]),
    (ch_select, CH_SELECT, [Clickhouse, Read]),
    (ch_ddl, CH_DDL, [Clickhouse, Action, Set]),
);
