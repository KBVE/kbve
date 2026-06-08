use bevy::prelude::{Commands, Local};
use simgrid::proto::Tile;
use simgrid::{EntityKind, GridPos, Health, MoveSpeed, MoveTarget, SimConfig, WalkableMap, Wander};

pub const MAP_WIDTH: i32 = 64;
pub const MAP_HEIGHT: i32 = 64;
pub const MAX_PLAYERS: usize = 32;

pub const KIND_PLAYER: u16 = 0;
pub const KIND_MONK: u16 = 1;
pub const KIND_BIRD: u16 = 2;

pub const PLAYER_HP: i32 = 100;
pub const PLAYER_TICKS_PER_TILE: u8 = 4;

pub const PLAYER_SPAWN: Tile = Tile::new(5, 12);

pub const MONK_SPAWN: Tile = Tile::new(4, 10);
pub const MONK_HP: i32 = 30;
pub const MONK_WANDER_RADIUS: i32 = 3;
pub const MONK_WANDER_PERIOD_TICKS: u32 = 30;
pub const MONK_TICKS_PER_TILE: u8 = 6;

pub const BIRD_COUNT: i32 = 10;
pub const BIRD_ORIGIN: Tile = Tile::new(7, 7);
pub const BIRD_HP: i32 = 10;
pub const BIRD_WANDER_RADIUS: i32 = 20;
pub const BIRD_WANDER_PERIOD_TICKS: u32 = 20;
pub const BIRD_TICKS_PER_TILE: u8 = 3;

pub fn config() -> SimConfig {
    SimConfig {
        player_kind: KIND_PLAYER,
        player_hp: PLAYER_HP,
        spawn: PLAYER_SPAWN,
        ticks_per_tile: PLAYER_TICKS_PER_TILE,
    }
}

pub fn walkable_map() -> WalkableMap {
    WalkableMap::open(MAP_WIDTH, MAP_HEIGHT)
}

pub fn spawn_world(mut done: Local<bool>, mut commands: Commands) {
    if *done {
        return;
    }
    *done = true;

    commands.spawn((
        EntityKind(KIND_MONK),
        GridPos::at(MONK_SPAWN),
        MoveTarget::default(),
        MoveSpeed {
            ticks_per_tile: MONK_TICKS_PER_TILE,
        },
        Health {
            hp: MONK_HP,
            max_hp: MONK_HP,
        },
        Wander::new(MONK_SPAWN, MONK_WANDER_RADIUS, MONK_WANDER_PERIOD_TICKS),
    ));

    for i in 0..BIRD_COUNT {
        let origin = Tile::new(BIRD_ORIGIN.x, BIRD_ORIGIN.y + i);
        commands.spawn((
            EntityKind(KIND_BIRD),
            GridPos::at(origin),
            MoveTarget::default(),
            MoveSpeed {
                ticks_per_tile: BIRD_TICKS_PER_TILE,
            },
            Health {
                hp: BIRD_HP,
                max_hp: BIRD_HP,
            },
            Wander::new(origin, BIRD_WANDER_RADIUS, BIRD_WANDER_PERIOD_TICKS),
        ));
    }
}
