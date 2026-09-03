use bevy::asset::RenderAssetUsages;
use bevy::image::{ImageSampler, ImageSamplerDescriptor};
use bevy::prelude::*;
use bevy::render::render_resource::{Extent3d, TextureDimension, TextureFormat};

use crate::colony::camera::{CAMERA_PITCH, CAMERA_YAW};

#[derive(Component, Debug, Clone, Copy)]
pub struct Billboard {
    pub size: Vec2,
}

impl Default for Billboard {
    fn default() -> Self {
        Self {
            size: Vec2::new(1.0, 1.4),
        }
    }
}

#[derive(Resource, Debug, Clone)]
pub struct BillboardAssets {
    pub quad: Handle<Mesh>,
    pub pawn: Handle<StandardMaterial>,
}

pub struct BillboardPlugin;

impl Plugin for BillboardPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(PreStartup, load_billboard_assets)
            .add_systems(PostUpdate, face_camera);
    }
}

fn load_billboard_assets(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    mut images: ResMut<Assets<Image>>,
) {
    let quad = meshes.add(Rectangle::new(1.0, 1.0).mesh().build());
    let texture = images.add(pawn_sprite());
    let pawn = materials.add(StandardMaterial {
        base_color_texture: Some(texture),
        alpha_mode: AlphaMode::Mask(0.5),
        unlit: true,
        double_sided: true,
        cull_mode: None,
        ..default()
    });

    commands.insert_resource(BillboardAssets { quad, pawn });
}

fn face_camera(mut sprites: Query<(&Billboard, &mut Transform)>) {
    let rotation = Quat::from_euler(EulerRot::YXZ, CAMERA_YAW, -(FRAC_PI_2 - CAMERA_PITCH), 0.0);
    for (billboard, mut transform) in &mut sprites {
        transform.rotation = rotation;
        transform.scale = Vec3::new(billboard.size.x, billboard.size.y, 1.0);
    }
}

const FRAC_PI_2: f32 = std::f32::consts::FRAC_PI_2;

fn pawn_sprite() -> Image {
    const W: usize = 16;
    const H: usize = 16;

    let body = [230u8, 205, 160, 255];
    let cloth = [70u8, 95, 150, 255];
    let clear = [0u8, 0, 0, 0];

    let mut data = Vec::with_capacity(W * H * 4);
    for y in 0..H {
        for x in 0..W {
            let dx = x as i32 - 8;
            let px = match y {
                0..=2 => clear,
                3..=6 if (2..=5).contains(&dx.unsigned_abs()) => clear,
                3..=6 => body,
                7..=12 if dx.unsigned_abs() <= 4 => cloth,
                13..=14 if (1..=4).contains(&dx.unsigned_abs()) => cloth,
                _ => clear,
            };
            data.extend_from_slice(&px);
        }
    }

    let mut image = Image::new(
        Extent3d {
            width: W as u32,
            height: H as u32,
            depth_or_array_layers: 1,
        },
        TextureDimension::D2,
        data,
        TextureFormat::Rgba8UnormSrgb,
        RenderAssetUsages::RENDER_WORLD,
    );
    image.sampler = ImageSampler::Descriptor(ImageSamplerDescriptor::nearest());
    image
}
