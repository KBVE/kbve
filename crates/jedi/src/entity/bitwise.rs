use crate::proto::jedi::MessageKind;
use std::collections::HashMap;
use std::sync::LazyLock;

/// The bitflag helpers for `MessageKind`.
///
/// These were inherent methods while the enum was generated into this crate.
/// It is generated into `kbve-proto` now, so the orphan rule puts them in a
/// trait instead. Every call site keeps its shape -- `MessageKind::xadd(kind)`
/// still resolves -- provided this trait is in scope, which is the one thing
/// the move costs.
///
/// A `MessageKind` is a bitmask rather than a plain enum: the wire carries an
/// `i32` that is several variants OR'd together, so most of these take the raw
/// `i32` rather than a decoded value. `try_from` alone would reject every
/// combination, which is what `try_from_valid` exists to fix.
pub trait MessageKindExt {
    fn try_from_valid(kind: i32) -> bool;
    fn has_flag(kind: i32, flag: MessageKind) -> bool;
    fn has_flags(kind: i32, flags: &[MessageKind]) -> bool;
    fn is_stream_xadd(kind: i32) -> bool;
}

impl MessageKindExt for MessageKind {
    fn try_from_valid(kind: i32) -> bool {
        if Self::try_from(kind).is_ok() {
            return true;
        }
        MESSAGE_KIND_MULTI_MAP.contains_key(&kind)
    }

    #[inline(always)]
    fn has_flag(kind: i32, flag: MessageKind) -> bool {
        (kind & flag as i32) != 0
    }

    #[inline(always)]
    fn has_flags(kind: i32, flags: &[MessageKind]) -> bool {
        let combined_flags = flags.iter().fold(0, |acc, &flag| acc | flag as i32);
        (kind & combined_flags) == combined_flags
    }

    #[inline(always)]
    fn is_stream_xadd(kind: i32) -> bool {
        Self::has_flags(
            kind,
            &[MessageKind::Redis, MessageKind::Stream, MessageKind::Add],
        )
    }
}

/// Declares the single-flag predicates, the multi-flag predicates, and the
/// combined-mask constants as one trait.
///
/// One macro rather than the two this file used to have: the parts all land on
/// the same trait now, and a trait cannot be reopened the way an inherent impl
/// could.
macro_rules! define_message_kind_flags {
    (
        single: [ $( ($fn_name:ident, $variant:ident) ),* $(,)? ],
        multi:  [ $( ($multi_fn:ident, $const_name:ident, [ $( $multi_variant:ident ),+ ]) ),* $(,)? ]
    ) => {
        pub trait MessageKindFlags {
            $( fn $fn_name(kind: i32) -> bool; )*
            $( fn $multi_fn(kind: i32) -> bool; )*
            $( const $const_name: i32; )*
        }

        impl MessageKindFlags for MessageKind {
            $(
                #[inline(always)]
                fn $fn_name(kind: i32) -> bool {
                    <MessageKind as MessageKindExt>::has_flag(kind, MessageKind::$variant)
                }
            )*
            $(
                #[inline(always)]
                fn $multi_fn(kind: i32) -> bool {
                    <MessageKind as MessageKindExt>::has_flags(
                        kind,
                        &[ $( MessageKind::$multi_variant ),+ ],
                    )
                }
            )*
            $(
                const $const_name: i32 = 0 $(| MessageKind::$multi_variant as i32)+;
            )*
        }

        /// Every combined mask, so a kind that is several flags at once can be
        /// recognised as valid and decomposed back into the variants it names.
        pub static MESSAGE_KIND_MULTI_MAP: LazyLock<HashMap<i32, &'static [MessageKind]>> =
            LazyLock::new(|| {
                let mut map = HashMap::new();
                $(
                    const $const_name: &[MessageKind] = &[ $( MessageKind::$multi_variant ),+ ];
                    map.insert(
                        <MessageKind as MessageKindFlags>::$const_name,
                        $const_name,
                    );
                )*
                map
            });
    };
}

define_message_kind_flags!(
    single: [
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
        (reserved31, Reserved31),
    ],
    multi: [
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
    ]
);
