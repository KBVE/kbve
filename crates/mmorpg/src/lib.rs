//! Batteries-included MMORPG toolkit for Bevy.
//!
//! Every subsystem lives in its own crate so a consumer that wants one of them
//! pays for one of them. This crate is the front door: it re-exports those
//! crates behind features and groups the configuration-free plugins into
//! [`MmorpgPlugins`].
//!
//! ```toml
//! mmorpg = { version = "0.1", features = ["character", "npc", "items"] }
//! ```
//!
//! Nothing is enabled by default. `features = ["full"]` turns on everything.

#![cfg_attr(docsrs, feature(doc_cfg))]

#[cfg(feature = "character")]
pub use bevy_player;

#[cfg(feature = "camera")]
pub use bevy_cam;

#[cfg(feature = "npc")]
pub use {bevy_behavior, bevy_npc};

#[cfg(feature = "items")]
pub use {bevy_inventory, bevy_items};

#[cfg(feature = "progress")]
pub use {bevy_quests, bevy_skills};

#[cfg(feature = "combat")]
pub use bevy_battle;

#[cfg(feature = "social")]
pub use bevy_chat;

#[cfg(feature = "state")]
pub use bevy_statemachine;

#[cfg(feature = "net")]
pub use mmorpg_net;

pub mod prelude {
    //! One glob for the types a game touches every day.

    #[cfg(feature = "character")]
    pub use bevy_player::{Player, PlayerPhysics, plugin::PlayerPlugin};

    #[cfg(feature = "camera")]
    pub use bevy_cam::{CameraConfig, IsometricCameraPlugin};

    #[cfg(feature = "npc")]
    pub use bevy_behavior::{
        Aware, BehaviorContext, BehaviorNode, Healthed, NodeStatus, Positioned, Selector, Sequence,
    };
    #[cfg(feature = "npc")]
    pub use bevy_npc::{BevyNpcPlugin, NpcDb, ProtoNpcId};

    #[cfg(feature = "items")]
    pub use bevy_items::{BevyItemsPlugin, ItemDb, ProtoItemId};

    #[cfg(feature = "progress")]
    pub use bevy_quests::{BevyQuestsPlugin, ProtoQuestId, QuestDb};
    #[cfg(feature = "progress")]
    pub use bevy_skills::{
        BevySkillsPlugin, GrantXpMsg, LevelUpMsg, SkillCheckMsg, SkillCheckResultMsg, SkillDef,
        SkillEntry, SkillId, SkillProfile, SkillRegistry, XpCurve,
    };

    #[cfg(feature = "combat")]
    pub use bevy_battle::BevyBattlePlugin;

    #[cfg(feature = "social")]
    pub use bevy_chat::{ChatInbox, ChatMessage, ChatOutbox, ChatPlugin, IncomingChatEvent};

    #[cfg(feature = "net")]
    pub use mmorpg_net::{
        Guest, MMORPG_PROTOCOL_ID, MmorpgProtocolPlugin, MoveIntent, PlayerId, PlayerInput,
        PlayerName, TICK_HZ,
    };

    pub use crate::MmorpgPlugins;
}

use bevy::app::{PluginGroup, PluginGroupBuilder};

/// Every enabled subsystem that runs without configuration.
///
/// `bevy_chat`'s [`ChatPlugin`](bevy_chat::ChatPlugin) needs an IRC endpoint
/// and `bevy_inventory`/`bevy_statemachine` are generic over the game's own
/// types, so those three are added by hand rather than pulled in here.
#[derive(Default)]
pub struct MmorpgPlugins;

impl PluginGroup for MmorpgPlugins {
    fn build(self) -> PluginGroupBuilder {
        #[allow(unused_mut)]
        let mut group = PluginGroupBuilder::start::<Self>();

        #[cfg(feature = "character")]
        {
            group = group.add(bevy_player::plugin::PlayerPlugin::default());
        }
        #[cfg(feature = "camera")]
        {
            group = group.add(bevy_cam::IsometricCameraPlugin::default());
        }
        #[cfg(feature = "npc")]
        {
            group = group.add(bevy_npc::BevyNpcPlugin);
        }
        #[cfg(feature = "items")]
        {
            group = group.add(bevy_items::BevyItemsPlugin);
        }
        #[cfg(feature = "progress")]
        {
            group = group
                .add(bevy_skills::BevySkillsPlugin)
                .add(bevy_quests::BevyQuestsPlugin);
        }
        #[cfg(feature = "combat")]
        {
            group = group.add(bevy_battle::BevyBattlePlugin);
        }
        #[cfg(feature = "net")]
        {
            group = group.add(mmorpg_net::MmorpgProtocolPlugin);
        }

        group
    }
}
