use bevy::prelude::*;

use crate::colony::billboard::{Billboard, BillboardAssets};
use crate::colony::grid::{ColonyGrid, GridPos};
use crate::colony::rules::ColonyRules;
use crate::colony::terrain::tile_height;

const PAWN_COUNT: usize = 12;

#[derive(Component, Debug, Clone, Copy)]
pub struct Pawn;

#[derive(Component, Debug, Clone, Copy)]
pub struct Wander {
    target: GridPos,
    seed: u32,
}

pub struct PawnPlugin;

impl Plugin for PawnPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Startup,
            spawn_pawns.after(crate::colony::terrain::spawn_ground),
        )
        .add_systems(Update, (pick_target, walk).chain());
    }
}

fn spawn_pawns(mut commands: Commands, grid: Res<ColonyGrid>, assets: Res<BillboardAssets>) {
    let size = grid.world_size();
    let center = GridPos::from_world(Vec3::new(size.x * 0.5, 0.0, size.y * 0.5));

    for i in 0..PAWN_COUNT {
        let offset = i as i32;
        let start = GridPos::new(center.x + offset % 5 - 2, center.z + offset / 5 - 2);
        if !grid.walkable(start) {
            continue;
        }

        commands.spawn((
            Name::new(format!("pawn-{i}")),
            Pawn,
            Billboard::default(),
            Wander {
                target: start,
                seed: 0x9E37_79B9u32.wrapping_mul(i as u32 + 1),
            },
            start,
            Mesh3d(assets.quad.clone()),
            MeshMaterial3d(assets.pawn.clone()),
            Transform::from_translation(pawn_translation(&grid, start)),
        ));
    }
}

fn pick_target(grid: Res<ColonyGrid>, mut pawns: Query<(&GridPos, &mut Wander, &Transform)>) {
    for (pos, mut wander, transform) in &mut pawns {
        let arrived = transform
            .translation
            .distance_squared(pawn_translation(&grid, wander.target))
            < 0.01;
        if !arrived && wander.target != *pos {
            continue;
        }

        wander.seed = wander
            .seed
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        let candidates = pos.neighbors();
        let choice = candidates[(wander.seed >> 16) as usize % candidates.len()];
        if grid.walkable(choice) {
            wander.target = choice;
        }
    }
}

fn walk(
    time: Res<Time>,
    grid: Res<ColonyGrid>,
    rules: Res<ColonyRules>,
    mut pawns: Query<(&mut GridPos, &Wander, &mut Transform)>,
) {
    for (mut pos, wander, mut transform) in &mut pawns {
        let goal = pawn_translation(&grid, wander.target);
        let delta = goal - transform.translation;
        let step = rules.pawn_speed * time.delta_secs();

        if delta.length() <= step {
            transform.translation = goal;
            *pos = wander.target;
        } else {
            transform.translation += delta.normalize() * step;
        }
    }
}

fn pawn_translation(grid: &ColonyGrid, pos: GridPos) -> Vec3 {
    pos.center() + Vec3::Y * (tile_height(grid, pos) + 0.7)
}
