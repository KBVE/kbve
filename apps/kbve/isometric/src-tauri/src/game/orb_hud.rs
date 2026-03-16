use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderType};
use bevy::shader::ShaderRef;

use super::state::PlayerState;

// ---------------------------------------------------------------------------
// Uniforms
// ---------------------------------------------------------------------------

#[derive(ShaderType, Clone, Copy)]
pub struct OrbUniforms {
    pub fill: f32,
    pub wobble: f32,
    pub glow: f32,
    pub _pad0: f32,
    pub liquid_color: Vec4,
    pub glass_color: Vec4,
    pub bg_color: Vec4,
    pub rim_color: Vec4,
}

impl Default for OrbUniforms {
    fn default() -> Self {
        Self {
            fill: 0.75,
            wobble: 0.02,
            glow: 0.45,
            _pad0: 0.0,
            liquid_color: Vec4::new(0.90, 0.10, 0.10, 1.0),
            glass_color: Vec4::new(0.20, 0.24, 0.30, 1.0),
            bg_color: Vec4::new(0.05, 0.06, 0.08, 1.0),
            rim_color: Vec4::new(0.9, 0.95, 1.0, 1.0),
        }
    }
}

// ---------------------------------------------------------------------------
// UiMaterial
// ---------------------------------------------------------------------------

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct OrbMaterial {
    #[uniform(0)]
    pub uniforms: OrbUniforms,
}

impl Default for OrbMaterial {
    fn default() -> Self {
        Self {
            uniforms: OrbUniforms::default(),
        }
    }
}

impl UiMaterial for OrbMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/orb.wgsl".into()
    }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

#[derive(Component)]
struct HealthOrb;

#[derive(Component)]
struct ManaOrb;

#[derive(Component)]
struct EnergyOrb;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORB_SIZE: f32 = 80.0;
const ORB_MARGIN: f32 = 16.0;

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

pub struct OrbHudPlugin;

impl Plugin for OrbHudPlugin {
    fn build(&self, app: &mut App) {
        app.add_plugins(UiMaterialPlugin::<OrbMaterial>::default());
        app.add_systems(Startup, spawn_orbs);
        app.add_systems(
            Update,
            update_orbs.run_if(resource_changed::<super::state::PlayerState>),
        );
    }
}

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

fn spawn_orbs(mut commands: Commands, mut orb_materials: ResMut<Assets<OrbMaterial>>) {
    // Health orb — bottom-left
    let hp_mat = orb_materials.add(OrbMaterial {
        uniforms: OrbUniforms {
            fill: 1.0,
            wobble: 0.02,
            glow: 0.45,
            _pad0: 0.0,
            liquid_color: Vec4::new(0.90, 0.10, 0.10, 1.0), // red
            glass_color: Vec4::new(0.20, 0.24, 0.30, 1.0),
            bg_color: Vec4::new(0.05, 0.06, 0.08, 1.0),
            rim_color: Vec4::new(0.9, 0.95, 1.0, 1.0),
        },
    });

    commands.spawn((
        Node {
            position_type: PositionType::Absolute,
            left: Val::Px(ORB_MARGIN),
            bottom: Val::Px(ORB_MARGIN + 120.0 + 12.0), // above the virtual joystick
            width: Val::Px(ORB_SIZE),
            height: Val::Px(ORB_SIZE),
            ..default()
        },
        MaterialNode(hp_mat),
        HealthOrb,
    ));

    // Mana orb — bottom-right
    let mp_mat = orb_materials.add(OrbMaterial {
        uniforms: OrbUniforms {
            fill: 1.0,
            wobble: 0.025,
            glow: 0.5,
            _pad0: 0.0,
            liquid_color: Vec4::new(0.15, 0.40, 0.95, 1.0), // blue
            glass_color: Vec4::new(0.20, 0.24, 0.30, 1.0),
            bg_color: Vec4::new(0.05, 0.06, 0.08, 1.0),
            rim_color: Vec4::new(0.9, 0.95, 1.0, 1.0),
        },
    });

    // Mana orb — bottom-right, above action buttons (24px margin + 56+12+56 = 148px)
    commands.spawn((
        Node {
            position_type: PositionType::Absolute,
            right: Val::Px(ORB_MARGIN),
            bottom: Val::Px(160.0),
            width: Val::Px(ORB_SIZE),
            height: Val::Px(ORB_SIZE),
            ..default()
        },
        MaterialNode(mp_mat),
        ManaOrb,
    ));

    // Energy orb — bottom-right, above mana orb
    let ep_mat = orb_materials.add(OrbMaterial {
        uniforms: OrbUniforms {
            fill: 1.0,
            wobble: 0.018,
            glow: 0.4,
            _pad0: 0.0,
            liquid_color: Vec4::new(0.95, 0.80, 0.15, 1.0), // yellow
            glass_color: Vec4::new(0.20, 0.24, 0.30, 1.0),
            bg_color: Vec4::new(0.05, 0.06, 0.08, 1.0),
            rim_color: Vec4::new(0.9, 0.95, 1.0, 1.0),
        },
    });

    commands.spawn((
        Node {
            position_type: PositionType::Absolute,
            right: Val::Px(ORB_MARGIN),
            bottom: Val::Px(160.0 + ORB_SIZE + 8.0), // above mana orb
            width: Val::Px(ORB_SIZE),
            height: Val::Px(ORB_SIZE),
            ..default()
        },
        MaterialNode(ep_mat),
        EnergyOrb,
    ));
}

// ---------------------------------------------------------------------------
// Update fill from PlayerState
// ---------------------------------------------------------------------------

fn update_orbs(
    player_state: Res<PlayerState>,
    hp_query: Query<&MaterialNode<OrbMaterial>, With<HealthOrb>>,
    mp_query: Query<
        &MaterialNode<OrbMaterial>,
        (With<ManaOrb>, Without<HealthOrb>, Without<EnergyOrb>),
    >,
    ep_query: Query<
        &MaterialNode<OrbMaterial>,
        (With<EnergyOrb>, Without<HealthOrb>, Without<ManaOrb>),
    >,
    mut orb_materials: ResMut<Assets<OrbMaterial>>,
) {
    let hp_fill = if player_state.max_health > 0.0 {
        (player_state.health / player_state.max_health).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let mp_fill = if player_state.max_mana > 0.0 {
        (player_state.mana / player_state.max_mana).clamp(0.0, 1.0)
    } else {
        0.0
    };

    let ep_fill = if player_state.max_energy > 0.0 {
        (player_state.energy / player_state.max_energy).clamp(0.0, 1.0)
    } else {
        0.0
    };

    // Update health orb
    for handle in &hp_query {
        if let Some(mat) = orb_materials.get_mut(handle) {
            mat.uniforms.fill = hp_fill;
            // Pulse glow when low health
            mat.uniforms.glow = if hp_fill < 0.2 { 0.8 } else { 0.45 };
            mat.uniforms.wobble = if hp_fill < 0.2 { 0.035 } else { 0.02 };
        }
    }

    // Update mana orb
    for handle in &mp_query {
        if let Some(mat) = orb_materials.get_mut(handle) {
            mat.uniforms.fill = mp_fill;
        }
    }

    // Update energy orb
    for handle in &ep_query {
        if let Some(mat) = orb_materials.get_mut(handle) {
            mat.uniforms.fill = ep_fill;
        }
    }
}
