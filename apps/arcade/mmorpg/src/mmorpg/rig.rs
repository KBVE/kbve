//! The rig profile: which bones, hinges, limits and clips a body is built from.

use bevy::asset::io::Reader;
use bevy::asset::{AssetLoader, LoadContext};
use bevy::prelude::*;
use kinetree::{LimbLimits, RestHinge};
use serde::Deserialize;

pub const PROFILE: &str = "characters/quaternius_ubc/quaternius_ubc.rig.ron";

/// Everything the character systems need to know about one skeleton and its clip library.
#[derive(Asset, TypePath, Deserialize, Debug, Clone)]
pub struct RigProfile {
    pub model: String,
    pub library: String,
    pub armature: String,
    pub ankle_height: f32,
    pub legs: Vec<LimbSpec>,
    pub gaits: GaitClips,
    pub attacks: AttackClips,
    pub casts: CastClips,
    pub hit: String,
    pub death: String,
}

/// A two-bone limb by bone name, its hinge axis in the root bone's basis, and its flexion ceiling.
#[derive(Deserialize, Debug, Clone)]
pub struct LimbSpec {
    pub root: String,
    pub mid: String,
    pub tip: String,
    pub hinge: Option<[f32; 3]>,
    pub max_flexion_deg: f32,
}

impl LimbSpec {
    pub fn rest(&self) -> Option<RestHinge> {
        self.hinge
            .and_then(|axis| RestHinge::from_local_axis(Vec3::from_array(axis)))
    }

    pub fn limits(&self) -> LimbLimits {
        LimbLimits::flexion(self.max_flexion_deg.to_radians())
    }
}

/// Clip names for each gait, resolved against the library's named animations.
#[derive(Deserialize, Debug, Clone)]
pub struct GaitClips {
    pub idle: String,
    pub walk: String,
    pub jog: String,
    pub sprint: String,
    pub jump: String,
    pub back: String,
    pub left: String,
    pub right: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct AttackClips {
    pub jab: String,
    pub cross: String,
}

#[derive(Deserialize, Debug, Clone)]
pub struct CastClips {
    pub channel: String,
    pub release: String,
    pub poison: String,
}

#[derive(Debug, thiserror::Error)]
pub enum RigError {
    #[error("read rig profile: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse rig profile: {0}")]
    Ron(#[from] ron::error::SpannedError),
}

#[derive(Default, TypePath)]
pub struct RigLoader;

impl AssetLoader for RigLoader {
    type Asset = RigProfile;
    type Settings = ();
    type Error = RigError;

    async fn load(
        &self,
        reader: &mut dyn Reader,
        _settings: &(),
        _context: &mut LoadContext<'_>,
    ) -> Result<RigProfile, RigError> {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).await?;
        Ok(ron::de::from_bytes(&bytes)?)
    }

    fn extensions(&self) -> &[&str] {
        &["rig.ron"]
    }
}

/// The profile every character is built from, plus the clip library once it has been requested.
#[derive(Resource)]
pub struct Rig {
    pub profile: Handle<RigProfile>,
    pub library: Option<Handle<Gltf>>,
}

pub struct RigPlugin;

impl Plugin for RigPlugin {
    fn build(&self, app: &mut App) {
        app.init_asset::<RigProfile>()
            .init_asset_loader::<RigLoader>()
            .add_systems(Startup, load_rig);
    }
}

fn load_rig(mut commands: Commands, assets: Res<AssetServer>) {
    commands.insert_resource(Rig {
        profile: assets.load(PROFILE),
        library: None,
    });
}
