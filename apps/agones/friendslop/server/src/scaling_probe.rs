//! What a full house costs the sim thread, measured rather than guessed at.
//!
//! Not an assertion: timings on a shared machine make a poor gate, and a threshold
//! that fails on a loaded CI box teaches people to ignore it. Run it when changing
//! anything the tick pays for:
//!
//! ```text
//! cargo test -p friendslop-server --release measure_a_full_house -- --ignored --nocapture
//! ```
//!
//! Read the ranges, not the medians. A field rebuild is round robin and a pet standing
//! in a blocked cell pays for an escape search, so the same configuration measures
//! differently depending on where everyone happens to be standing -- and the tail is
//! the number that decides whether a tick lands inside its budget.

use std::sync::Arc;
use std::time::{Duration, Instant};

use q::ground::{Ground, GroundSource};
use q::net::pets::PetConfig;
use q::net::session::{ClientSession, HostSession, SessionConfig};
use q::net::transport::Loopback;
use q::rapier::sim3d::SimConfig;
use q::worldgen::HeightParams;

use crate::props::{PropConfig, PropField};
use crate::terrain_stream::{StreamConfig, TerrainStreamer};

const SEED: u64 = 1337;
const EXTENT: f32 = 256.0;
const RES: i32 = 513;
const STRIDE: f32 = 128.0;

struct House {
    host: HostSession<Loopback>,
    /// Held so the peers stay joined; the host drops anyone who goes silent.
    _clients: Vec<ClientSession<Loopback>>,
}

fn build_with(
    players: usize,
    pets_each: usize,
    per_player: usize,
    obstacles_on: bool,
    only_first_deploys: bool,
) -> (House, usize) {
    let mesh = Loopback::mesh(players as u32 + 1);
    let config = SessionConfig {
        max_players: players,
        pets: PetConfig {
            per_player,
            total: 128,
            ..PetConfig::default()
        },
        ..SessionConfig::default()
    };
    let mut host = HostSession::dedicated(mesh[0].clone(), config, SimConfig::default(), SEED);
    let params = HeightParams {
        seed: SEED as i32,
        ..Default::default()
    };
    let spawn = Ground::new(GroundSource::Authored, SEED as i32, &params);
    host = host.with_ground(Arc::new(move |x, z| spawn.height(x, z)));

    let mut streamer = TerrainStreamer::new(StreamConfig {
        seed: SEED,
        ground_source: GroundSource::Authored,
        water_level: -1.4,
        road_width: 3.2,
        extent: EXTENT,
        resolution: RES,
        stride: STRIDE,
        keep_radius: EXTENT * 1.5,
        max_inflight: 2,
    });
    streamer.prime(host.world_mut());
    let mut props = PropField::new(PropConfig {
        seed: SEED,
        extent: EXTENT,
        stride: STRIDE,
        water_level: -1.4,
        road_width: 3.2,
        stone_grid_size: 22.0,
        tree_grid_size: 14.0,
        stone_seed: q::worldgen::StoneScatter::DEFAULT_SEED,
        tree_seed: q::worldgen::TreeScatter::DEFAULT_SEED,
    });
    props.sync(&streamer.loaded_origins(), host.world_mut());
    let obstacles = if obstacles_on {
        props.discs().len() / 3
    } else {
        0
    };
    if obstacles_on {
        host.set_pet_obstacles(props.discs());
    }

    let mut clients: Vec<ClientSession<Loopback>> = mesh[1..]
        .iter()
        .map(|t| ClientSession::connect(t.clone()))
        .collect();
    for _ in 0..120 {
        host.tick();
        for c in clients.iter_mut() {
            c.tick();
        }
    }
    for (i, c) in clients.iter_mut().enumerate() {
        if only_first_deploys && i > 0 {
            continue;
        }
        for k in 0..pets_each {
            c.deploy_pet((k % 4) as u8);
        }
    }
    for _ in 0..240 {
        host.tick();
        for c in clients.iter_mut() {
            c.tick();
        }
    }
    (
        House {
            host,
            _clients: clients,
        },
        obstacles,
    )
}

fn tick_cost(house: &mut House, rounds: u32) -> Duration {
    // Warm, then measure, so a cold branch predictor is not the finding.
    for _ in 0..120 {
        house.host.tick();
    }
    let t0 = Instant::now();
    for _ in 0..rounds {
        house.host.tick();
    }
    t0.elapsed() / rounds
}

#[test]
#[ignore = "measurement, not an assertion"]
fn measure_a_full_house() {
    let budget = Duration::from_secs_f64(1.0 / 60.0);
    println!("60Hz budget: {budget:?}\n");

    // Same pets, different numbers of owners: one flow field is stamped per owner, so
    // this is the only difference between the two.
    // Every case has sixteen players joined, so the only thing that moves is the pets,
    // how many owners they are split across, and whether the fields have rocks in them.
    let cases: [(usize, usize, bool, bool, &str); 7] = [
        (0, 10, true, false, "no pets"),
        (2, 10, true, false, "32 pets over 16 owners"),
        (4, 10, true, false, "64 pets over 16 owners"),
        (6, 10, true, false, "96 pets over 16 owners"),
        (96, 96, true, true, "96 pets, all one owner"),
        (6, 10, false, false, "96 pets over 16 owners, no obstacles"),
        (96, 96, false, true, "96 pets, one owner, no obstacles"),
    ];
    for (pets_each, per_player, obstacles_on, only_first, label) in cases {
        let (mut house, obstacles) =
            build_with(16, pets_each, per_player, obstacles_on, only_first);
        let pets = house.host.pet_count();
        let fields = house.host.pet_field_count();
        // Repeated, because this number moves: a field rebuild is round robin and a
        // pet standing in a blocked cell pays for an escape search, so what a tick
        // costs depends on where everyone happens to be standing.
        let mut runs: Vec<Duration> = (0..5).map(|_| tick_cost(&mut house, 200)).collect();
        runs.sort();
        let each = runs[runs.len() / 2];
        let (lo, hi) = (runs[0], runs[runs.len() - 1]);
        // The sim step on its own, so what the session spends thinking is separable
        // from what rapier spends solving.
        for _ in 0..60 {
            house.host.world_mut().step();
        }
        let t0 = Instant::now();
        for _ in 0..400 {
            house.host.world_mut().step();
        }
        let step = t0.elapsed() / 400;
        println!(
            "{label:<38} tick {each:>9.2?} ({:>3.0}%)  [{lo:.2?}..{hi:.2?}]  \
             rapier {step:>9.2?}  session {:>9.2?}  ({pets} pets, {fields} fields, \
             {obstacles} obstacles)",
            each.as_secs_f64() / budget.as_secs_f64() * 100.0,
            each.saturating_sub(step)
        );
    }

    // What a region change costs, which lands on this same thread between two ticks.
    println!();
    let mut streamer = TerrainStreamer::new(StreamConfig {
        seed: SEED,
        ground_source: GroundSource::Authored,
        water_level: -1.4,
        road_width: 3.2,
        extent: EXTENT,
        resolution: RES,
        stride: STRIDE,
        keep_radius: EXTENT * 1.5,
        max_inflight: 2,
    });
    let (mut house, _) = build_with(16, 6, 10, true, false);
    streamer.prime(house.host.world_mut());
    let mut props = PropField::new(PropConfig {
        seed: SEED,
        extent: EXTENT,
        stride: STRIDE,
        water_level: -1.4,
        road_width: 3.2,
        stone_grid_size: 22.0,
        tree_grid_size: 14.0,
        stone_seed: q::worldgen::StoneScatter::DEFAULT_SEED,
        tree_seed: q::worldgen::TreeScatter::DEFAULT_SEED,
    });

    // Players spread out, which is what makes the streamer keep more than one region.
    let spread: Vec<[f32; 2]> = (0..16)
        .map(|i| {
            let a = i as f32 / 16.0 * std::f32::consts::TAU;
            [a.cos() * 300.0, a.sin() * 300.0]
        })
        .collect();
    for round in 0..6 {
        let t0 = Instant::now();
        streamer.update(&spread, house.host.world_mut());
        let stream = t0.elapsed();
        let origins = streamer.loaded_origins();
        let t0 = Instant::now();
        props.sync(&origins, house.host.world_mut());
        let sync = t0.elapsed();
        println!(
            "round {round}: streamer.update {stream:>10.2?}   props.sync {sync:>10.2?}                {} regions, {} obstacles",
            origins.len(),
            props.discs().len() / 3
        );
    }
}
