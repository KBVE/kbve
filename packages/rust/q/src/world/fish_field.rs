use godot::classes::mesh::PrimitiveType;
use godot::classes::notify::Node3DNotification;
use godot::classes::rendering_server::{MultimeshTransformFormat, ShadowCastingSetting};
use godot::classes::{
    ArrayMesh, Engine, Mesh, MeshInstance3D, Node3D, PackedScene, RenderingServer, ShaderMaterial,
};
use godot::prelude::*;

use crate::world::terrain::QTerrain;
use crate::world::{hash32, randf};

#[derive(Clone, Copy, Default)]
struct Fish {
    x: f32,
    y: f32,
    z: f32,
    bed: f32,
    yaw: f32,
    pitch: f32,
    dir: f32,
    depth: f32,
    base_depth: f32,
    lane: f32,
    phase: f32,
    offset: f32,
    rate: f32,
    size: f32,
    panic: f32,
    alive: bool,
    respawn: f32,
    pod: u32,
    vy: f32,
    speed: f32,
    roll: f32,
    flee_cd: f32,
}

struct Chunk {
    mm: Rid,
    inst: Rid,
    shadow_mm: Rid,
    shadow_inst: Rid,
    count: i32,
}

#[derive(GodotClass)]
#[class(init, base = Node3D)]
pub struct QFishField {
    base: Base<Node3D>,

    init_done: bool,

    #[export]
    terrain_path: NodePath,
    #[export]
    player_path: NodePath,
    #[export]
    fish_model: Option<Gd<PackedScene>>,
    #[export]
    fish_material: Option<Gd<ShaderMaterial>>,
    #[export]
    shadow_material: Option<Gd<ShaderMaterial>>,
    #[export]
    #[init(val = 8812)]
    fish_seed: i32,
    #[export]
    #[init(val = 320)]
    count: i32,
    #[export]
    #[init(val = 34)]
    pods: i32,
    #[export]
    #[init(val = 2)]
    pod_min: i32,
    #[export]
    #[init(val = 6)]
    pod_max: i32,
    #[export]
    #[init(val = 0.3)]
    school_chance: f32,
    #[export]
    #[init(val = 14)]
    school_min: i32,
    #[export]
    #[init(val = 34)]
    school_max: i32,
    #[export]
    #[init(val = 1.1)]
    pod_radius: f32,
    #[export]
    #[init(val = 0.28)]
    pod_spread_per_fish: f32,
    #[export]
    #[init(val = 120.0)]
    span: f32,
    #[export]
    #[init(val = 0.35)]
    depth_min: f32,
    #[export]
    #[init(val = 1.1)]
    depth_max: f32,
    #[export]
    #[init(val = 0.6)]
    bank_margin: f32,
    #[export]
    #[init(val = 0.3)]
    bed_clearance: f32,
    #[export]
    #[init(val = 70.0)]
    fade_end: f32,
    #[export]
    #[init(val = 30.0)]
    chunk_len: f32,
    #[export]
    #[init(val = 0.55)]
    swim_speed: f32,
    #[export]
    #[init(val = 0.9)]
    center_pull: f32,
    #[export]
    #[init(val = 6.5)]
    flee_radius: f32,
    #[export]
    #[init(val = 4.5)]
    flee_speed_mul: f32,
    #[export]
    #[init(val = 0.45)]
    panic_decay: f32,
    #[export]
    #[init(val = 1.8)]
    flee_turn: f32,
    #[export]
    #[init(val = 3.0)]
    bank_push: f32,
    #[export]
    #[init(val = 3.5)]
    panic_spread_radius: f32,
    #[export]
    #[init(val = 2.5)]
    flee_turn_cooldown: f32,
    #[export]
    #[init(val = 0.3)]
    flee_dive: f32,
    #[export]
    #[init(val = 0.5)]
    weave_amp: f32,
    #[export]
    #[init(val = 0.33)]
    weave_rate: f32,
    #[export]
    #[init(val = 0.14)]
    bob_amp: f32,
    #[export]
    #[init(val = 0.45)]
    bob_rate: f32,
    #[export]
    #[init(val = 0.4)]
    cohesion: f32,
    #[export]
    #[init(val = 0.9)]
    separation: f32,
    #[export]
    #[init(val = 0.6)]
    separation_radius: f32,
    #[export]
    #[init(val = 1.1)]
    pitch_amount: f32,
    #[export]
    #[init(val = 2.2)]
    turn_rate: f32,
    #[export]
    #[init(val = 6.0)]
    accel_smooth: f32,
    #[export]
    #[init(val = 1.2)]
    decel_smooth: f32,
    #[export]
    #[init(val = 0.35)]
    alignment: f32,
    #[export]
    #[init(val = 0.55)]
    roll_amount: f32,
    #[export]
    #[init(val = 6.0)]
    roll_smooth: f32,
    #[export]
    #[init(val = 0.75)]
    beat_hz: f32,
    #[export]
    #[init(val = 1.0)]
    beat_speed_gain: f32,
    #[export]
    #[init(val = 0.3)]
    match_speed: f32,
    #[export]
    #[init(val = 0.0)]
    yaw_offset: f32,
    #[export]
    #[init(val = 0.6)]
    shadow_size: f32,
    #[export]
    #[init(val = 0.5)]
    shadow_alpha: f32,
    #[export]
    #[init(val = 0.45)]
    catch_radius: f32,
    #[export]
    #[init(val = 14.0)]
    respawn_time: f32,
    #[export]
    #[init(val = 95.0)]
    sim_radius: f32,

    placed: i32,
    mesh: Option<Gd<Mesh>>,
    shadow_mesh: Option<Gd<ArrayMesh>>,
    terrain: Option<Gd<QTerrain>>,
    player: Option<Gd<Node3D>>,
    fish: Vec<Fish>,
    pod_ranges: Vec<(u32, u32)>,
    centroids: Vec<(f32, f32, f32)>,
    headings: Vec<(f32, f32)>,
    chunks: Vec<Chunk>,
    time: f32,
    chunk_cap: i32,
    buf: Vec<f32>,
    shadow_buf: Vec<f32>,
    scratch: PackedFloat32Array,
    overflow: i32,
    overflow_warned: bool,
    rng: u32,
    water: f32,
    half_width: f32,
    model_len: f32,
    simulated: i32,
}

impl QFishField {
    fn late_init(&mut self) -> bool {
        let _t = super::ReadyTimer::start("fish");

        let terrain = if self.terrain_path.is_empty() {
            self.base().get_node_or_null("../Terrain")
        } else {
            self.base().get_node_or_null(&self.terrain_path)
        }
        .and_then(|n| n.try_cast::<QTerrain>().ok());
        let Some(terrain) = terrain else {
            godot_error!("[QFishField] no QTerrain found; fish disabled");
            return true;
        };

        let (water, width) = {
            let t = terrain.bind();
            if t.cpu_heights().is_none() {
                return false;
            }
            (t.water(), t.river_width_value())
        };

        let Some(mesh) = self.model_mesh() else {
            godot_error!("[QFishField] no mesh in fish_model; fish disabled");
            return true;
        };
        let model_scale = self
            .fish_material
            .as_ref()
            .map(|m| m.get_shader_parameter("model_scale"))
            .filter(|v| !v.is_nil())
            .map(|v| v.to::<f32>())
            .unwrap_or(0.11);
        self.model_len = mesh.get_aabb().size.z.max(0.01) * model_scale;
        self.mesh = Some(mesh);

        if !self.player_path.is_empty() {
            self.player = self
                .base()
                .get_node_or_null(&self.player_path)
                .and_then(|n| n.try_cast::<Node3D>().ok());
            if self.player.is_none() {
                godot_warn!("[QFishField] player_path set but no Node3D there; fish will not flee");
            }
        }

        self.water = water;
        self.half_width = (width * 0.5 - self.bank_margin).max(0.4);
        self.rng = hash32(self.fish_seed as u32 | 1);

        let total = self.count.max(0) as usize;
        self.fish = Vec::with_capacity(total);
        let pods = self.pods.max(1);

        for pod in 0..pods {
            if self.fish.len() >= total {
                break;
            }
            let pod_start = self.fish.len() as u32;
            let pod_z = -self.span + randf(&mut self.rng) * self.span * 2.0;
            let school = randf(&mut self.rng) < self.school_chance;
            let (lo, hi) = if school {
                (self.school_min, self.school_max)
            } else {
                (self.pod_min, self.pod_max)
            };
            let span_n = (hi - lo).max(0) as f32;
            let want = lo + (randf(&mut self.rng) * (span_n + 0.999)) as i32;
            let want = want.max(1).min(total as i32 - self.fish.len() as i32);
            let spread = self.pod_radius + want as f32 * self.pod_spread_per_fish;
            let pod_dir = if randf(&mut self.rng) < 0.5 {
                -1.0
            } else {
                1.0
            };
            for _ in 0..want {
                let z = pod_z + (randf(&mut self.rng) - 0.5) * spread * 2.0;
                if let Some(mut f) = self.spawn_at(&terrain, z, pod_dir) {
                    f.pod = pod as u32;
                    self.fish.push(f);
                }
            }
            let n = self.fish.len() as u32 - pod_start;
            if n > 0 {
                self.pod_ranges.push((pod_start, n));
            }
        }
        self.centroids = vec![(0.0, 0.0, 0.0); self.pod_ranges.len()];
        self.headings = vec![(0.0, 0.0); self.pod_ranges.len()];

        self.placed = self.fish.len() as i32;
        godot_print!("[q] fish placed={}", self.placed);
        if self.placed == 0 {
            godot_warn!("[QFishField] no fish survived placement");
            return true;
        }

        if self.sim_radius <= self.fade_end {
            godot_warn!(
                "[QFishField] sim_radius {} <= fade_end {}; fish will visibly freeze before they fade out",
                self.sim_radius,
                self.fade_end
            );
        }

        if let Some(m) = self.fish_material.as_mut() {
            let fe = self.fade_end;
            m.set_shader_parameter("fade_end", &fe.to_variant());
            m.set_shader_parameter("water_level", &water.to_variant());
        }
        if let Some(m) = self.shadow_material.as_mut() {
            let fe = self.fade_end;
            m.set_shader_parameter("fade_end", &fe.to_variant());
        }

        self.terrain = Some(terrain);
        self.build();
        true
    }

    fn spawn_at(&mut self, terrain: &Gd<QTerrain>, z: f32, dir: f32) -> Option<Fish> {
        let lane = (randf(&mut self.rng) - 0.5) * self.half_width * 2.0;
        let x = terrain.bind().river_center(z) + lane;
        let bed = terrain.bind().sample_height(x, z);
        let headroom = self.water - bed - self.bed_clearance;
        if headroom < self.depth_min {
            return None;
        }
        let deepest = self.depth_max.min(headroom);
        let depth = self.depth_min + randf(&mut self.rng) * (deepest - self.depth_min);
        let rate = randf(&mut self.rng);
        Some(Fish {
            x,
            y: self.water - depth,
            z,
            bed,
            yaw: if dir > 0.0 { 0.0 } else { std::f32::consts::PI },
            pitch: 0.0,
            dir,
            depth,
            base_depth: depth,
            lane,
            phase: randf(&mut self.rng),
            offset: randf(&mut self.rng),
            rate,
            size: randf(&mut self.rng),
            panic: 0.0,
            alive: true,
            respawn: 0.0,
            pod: 0,
            vy: 0.0,
            roll: 0.0,
            flee_cd: 0.0,
            speed: self.swim_speed * (0.75 + 0.5 * rate),
        })
    }

    fn respawn_one(&mut self, i: usize) {
        let Some(terrain) = self.terrain.clone() else {
            return;
        };
        for _ in 0..8 {
            let z = -self.span + randf(&mut self.rng) * self.span * 2.0;
            let dir = if randf(&mut self.rng) < 0.5 {
                -1.0
            } else {
                1.0
            };
            if let Some(mut f) = self.spawn_at(&terrain, z, dir) {
                f.pod = self.fish[i].pod;
                self.fish[i] = f;
                return;
            }
        }
    }

    fn focus_point(&self) -> Vector3 {
        if let Some(cam) = self.base().get_viewport().and_then(|v| v.get_camera_3d()) {
            return cam.get_global_position();
        }
        if let Some(p) = self.player.as_ref() {
            return p.get_global_position();
        }
        Vector3::ZERO
    }

    fn tick(&mut self, delta: f32) {
        let Some(terrain) = self.terrain.clone() else {
            return;
        };
        let focus = self.focus_point();
        let sim_r = self.sim_radius.max(1.0);
        let sim_r2 = sim_r * sim_r;
        let player = self
            .player
            .as_ref()
            .map(|p| p.get_global_position())
            .unwrap_or(Vector3::new(1e9, 1e9, 1e9));

        let water = self.water;
        let flee_r = self.flee_radius.max(0.01);
        let base_speed = self.swim_speed;
        let pull = self.center_pull;
        let span = self.span;
        let decay = self.panic_decay;
        let flee_mul = self.flee_speed_mul;
        let depth_min = self.depth_min;
        let clearance = self.bed_clearance;
        let half_width = self.half_width;
        let bank_push = self.bank_push;
        let flee_turn = self.flee_turn;
        let flee_cd_time = self.flee_turn_cooldown;
        let flee_dive = self.flee_dive;
        let weave_amp = self.weave_amp;
        let weave_rate = self.weave_rate;
        let bob_amp = self.bob_amp;
        let bob_rate = self.bob_rate;
        let pitch_amount = self.pitch_amount;
        let cohesion = self.cohesion;
        let separation = self.separation;
        let sep_r = self.separation_radius.max(0.05);
        let turn_rate = self.turn_rate.max(0.1);
        let accel_smooth = self.accel_smooth.max(0.1);
        let decel_smooth = self.decel_smooth.max(0.1);
        let alignment = self.alignment;
        let roll_amount = self.roll_amount;
        let roll_smooth = self.roll_smooth.max(0.1);
        let beat_hz = self.beat_hz;
        let beat_speed_gain = self.beat_speed_gain;
        let match_speed = self.match_speed;

        self.time += delta;
        let time = self.time;

        for (pi, (start, len)) in self.pod_ranges.iter().enumerate() {
            let (s, e) = (*start as usize, (*start + *len) as usize);
            let mut sx = 0.0;
            let mut sz = 0.0;
            let mut hx = 0.0;
            let mut hz = 0.0;
            let mut n = 0.0;
            for f in self.fish[s..e].iter().filter(|f| f.alive) {
                sx += f.x;
                sz += f.z;
                let (fy, fc) = f.yaw.sin_cos();
                hx += fy;
                hz += fc;
                n += 1.0;
            }
            self.centroids[pi] = if n > 0.0 {
                (sx / n, sz / n, n)
            } else {
                (0.0, 0.0, 0.0)
            };
            let hl = (hx * hx + hz * hz).sqrt();
            self.headings[pi] = if hl > 0.001 {
                (hx / hl, hz / hl)
            } else {
                (0.0, 0.0)
            };
        }

        let mut steer = vec![(0.0f32, 0.0f32); self.fish.len()];
        let sep_r2 = sep_r * sep_r;
        for (pi, (start, len)) in self.pod_ranges.iter().enumerate() {
            let (s, e) = (*start as usize, (*start + *len) as usize);
            let (cx, cz, n) = self.centroids[pi];
            if n < 1.5 {
                continue;
            }
            let fdx = cx - focus.x;
            let fdz = cz - focus.z;
            if fdx * fdx + fdz * fdz > sim_r2 {
                continue;
            }
            for i in s..e {
                let fi = &self.fish[i];
                if !fi.alive {
                    continue;
                }
                let mut ax = (cx - fi.x) * cohesion;
                let mut az = (cz - fi.z) * cohesion;
                for j in s..e {
                    if i == j {
                        continue;
                    }
                    let fj = &self.fish[j];
                    if !fj.alive {
                        continue;
                    }
                    let dx = fi.x - fj.x;
                    let dz = fi.z - fj.z;
                    let d2 = dx * dx + dz * dz;
                    if d2 < sep_r2 && d2 > 1e-6 {
                        let d = d2.sqrt();
                        let w = (1.0 - d / sep_r) * separation;
                        ax += dx / d * w;
                        az += dz / d * w;
                    }
                }
                let (ahx, _) = self.headings[pi];
                if ahx != 0.0 {
                    ax += (ahx - fi.yaw.sin()) * alignment;
                }
                steer[i] = (ax.clamp(-1.5, 1.5), az.clamp(-1.5, 1.5));
            }
        }

        let t = terrain.bind();
        let mut respawn: Vec<usize> = Vec::new();
        let mut simulated = 0i32;
        for (i, f) in self.fish.iter_mut().enumerate() {
            if !f.alive {
                f.respawn -= delta;
                if f.respawn <= 0.0 {
                    respawn.push(i);
                }
                continue;
            }

            let fdx = f.x - focus.x;
            let fdz = f.z - focus.z;
            if fdx * fdx + fdz * fdz > sim_r2 {
                continue;
            }
            simulated += 1;

            let to_player = Vector3::new(player.x - f.x, 0.0, player.z - f.z);
            let pdist = to_player.length();
            f.flee_cd = (f.flee_cd - delta).max(0.0);
            if pdist < flee_r {
                f.panic = 1.0;
                if f.flee_cd <= 0.0 && to_player.z * f.dir > 0.0 {
                    f.dir = -f.dir;
                    f.flee_cd = flee_cd_time;
                }
            }
            f.panic = (f.panic - decay * delta).max(0.0);

            let center = t.river_center(f.z);
            let wob = (time * weave_rate + f.offset * std::f32::consts::TAU).sin() * weave_amp;
            let lane = (f.lane + wob).clamp(-half_width, half_width);
            let mut hx = ((center + lane - f.x) * pull).clamp(-1.0, 1.0);
            let mut hz = f.dir;

            hx += steer[i].0;

            if f.panic > 0.0 && pdist > 0.001 {
                let side = if player.x - center >= 0.0 { -1.0 } else { 1.0 };
                let urgency = (1.0 - pdist / flee_r).clamp(0.0, 1.0);
                hx += side * flee_turn * f.panic * urgency.max(0.25);
            }

            let off = f.x - center;
            let bank_t = (off.abs() / half_width).clamp(0.0, 1.0);
            hx -= off.signum() * bank_t * bank_t * bank_push;

            let hlen = (hx * hx + hz * hz).sqrt().max(0.001);
            hx /= hlen;
            hz /= hlen;

            if hz * f.dir < 0.35 {
                hz = f.dir * 0.35;
                let relen = (hx * hx + hz * hz).sqrt().max(0.001);
                hx /= relen;
                hz /= relen;
            }

            let along = (steer[i].1 * f.dir * match_speed).clamp(-0.3, 0.5);
            let cruise = base_speed * (0.75 + 0.5 * f.rate);
            let target = cruise * (1.0 + f.panic * (flee_mul - 1.0)) * (1.0 + along);
            let k = if target > f.speed {
                accel_smooth
            } else {
                decel_smooth
            };
            f.speed += (target - f.speed) * (1.0 - (-k * delta).exp());
            let speed = f.speed;

            let desired = hx.atan2(hz);
            let mut turn = desired - f.yaw;
            let tau = std::f32::consts::TAU;
            turn -= tau * ((turn / tau).round());
            let max_turn = turn_rate * (1.0 + f.panic) * delta;
            let applied = turn.clamp(-max_turn, max_turn);
            f.yaw += applied;

            let roll_target = (-applied / delta.max(0.0001) * roll_amount).clamp(-0.7, 0.7);
            f.roll += (roll_target - f.roll) * (1.0 - (-roll_smooth * delta).exp());

            let beat = 1.0 + (speed / cruise.max(0.001) - 1.0) * beat_speed_gain;
            f.phase += beat_hz * beat.clamp(0.6, 3.5) * (1.35 - 0.35 * f.size) * delta;
            f.phase = f.phase.fract();

            let (sy, cy) = f.yaw.sin_cos();
            f.x += sy * speed * delta;
            f.z += cy * speed * delta;

            if f.z > span {
                f.z -= span * 2.0;
            } else if f.z < -span {
                f.z += span * 2.0;
            }

            let center = t.river_center(f.z);
            let off = f.x - center;
            if off.abs() > half_width {
                f.x = center + off.signum() * half_width;
                f.lane = -off.signum() * half_width * 0.55;
            }

            f.depth = f.base_depth
                + (time * bob_rate + f.offset * std::f32::consts::TAU * 1.7).sin() * bob_amp
                + f.panic * flee_dive;

            f.bed = t.sample_height(f.x, f.z);
            let floor = f.bed + clearance;
            let ceiling = water - depth_min;
            let new_y = (water - f.depth).max(floor).min(ceiling.max(floor));

            let dy = (new_y - f.y) / delta.max(0.0001);
            f.vy = f.vy * 0.85 + dy * 0.15;
            f.pitch = (-(f.vy / speed.max(0.05)) * pitch_amount).clamp(-0.55, 0.55);
            f.y = new_y;
        }
        drop(t);
        self.simulated = simulated;

        let spread = self.panic_spread_radius;
        if spread > 0.0 {
            let srcs: Vec<(f32, f32)> = self
                .fish
                .iter()
                .filter(|f| f.alive && f.panic > 0.7)
                .map(|f| (f.x, f.z))
                .collect();
            if !srcs.is_empty() {
                let r2 = spread * spread;
                for f in self.fish.iter_mut() {
                    if !f.alive || f.panic >= 0.6 {
                        continue;
                    }
                    for (sx, sz) in srcs.iter() {
                        let dx = f.x - sx;
                        let dz = f.z - sz;
                        if dx * dx + dz * dz <= r2 {
                            f.panic = f.panic.max(0.8);
                            break;
                        }
                    }
                }
            }
        }

        for i in respawn {
            self.respawn_one(i);
        }
    }

    fn model_mesh(&self) -> Option<Gd<Mesh>> {
        let root = self.fish_model.as_ref()?.instantiate()?;
        let mut stack = vec![root.clone()];
        let mut found = None;
        while let Some(node) = stack.pop() {
            if let Ok(mi) = node.clone().try_cast::<MeshInstance3D>() {
                if let Some(mesh) = mi.get_mesh() {
                    found = Some(mesh);
                    break;
                }
            }
            for child in node.get_children().iter_shared() {
                stack.push(child);
            }
        }
        root.free();
        found
    }

    fn blob_mesh() -> Gd<ArrayMesh> {
        let verts = [
            Vector3::new(-0.5, 0.0, -0.5),
            Vector3::new(0.5, 0.0, -0.5),
            Vector3::new(0.5, 0.0, 0.5),
            Vector3::new(-0.5, 0.0, 0.5),
        ];
        let uvs = [
            Vector2::new(0.0, 0.0),
            Vector2::new(1.0, 0.0),
            Vector2::new(1.0, 1.0),
            Vector2::new(0.0, 1.0),
        ];
        let normals = [Vector3::UP; 4];
        let indices: [i32; 6] = [0, 1, 2, 0, 2, 3];

        let mut arrays = VarArray::new();
        arrays.resize(
            godot::classes::mesh::ArrayType::MAX.ord() as usize,
            &Variant::nil(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::VERTEX.ord() as usize,
            &PackedVector3Array::from(verts.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::NORMAL.ord() as usize,
            &PackedVector3Array::from(normals.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::TEX_UV.ord() as usize,
            &PackedVector2Array::from(uvs.as_slice()).to_variant(),
        );
        arrays.set(
            godot::classes::mesh::ArrayType::INDEX.ord() as usize,
            &PackedInt32Array::from(indices.as_slice()).to_variant(),
        );

        let mut am = ArrayMesh::new_gd();
        am.add_surface_from_arrays(PrimitiveType::TRIANGLES, &arrays);
        am
    }

    fn chunk_count(&self) -> usize {
        let len = self.chunk_len.max(4.0);
        (((self.span * 2.0) / len).ceil() as usize).max(1)
    }

    fn chunk_of(&self, z: f32) -> usize {
        let len = self.chunk_len.max(4.0);
        let n = self.chunk_count();
        (((z + self.span) / len).floor().max(0.0) as usize).min(n - 1)
    }

    fn build(&mut self) {
        let Some(world) = self.base().get_world_3d() else {
            return;
        };
        let Some(mesh) = self.mesh.as_ref().map(|m| m.get_rid()) else {
            return;
        };
        let shadow_mesh = Self::blob_mesh();
        let shadow_rid = shadow_mesh.get_rid();
        self.shadow_mesh = Some(shadow_mesh);

        let scenario = world.get_scenario();
        let n = self.chunk_count();
        let cap = ((self.placed as usize / n) as i32 * 3)
            .max(48)
            .min(self.placed);
        self.chunk_cap = cap;
        let len = self.chunk_len.max(4.0);
        let mut rs = RenderingServer::singleton();

        let fish_mat = self.fish_material.as_ref().map(|m| m.get_rid());
        let shadow_mat = self.shadow_material.as_ref().map(|m| m.get_rid());

        for c in 0..n {
            let z0 = -self.span + c as f32 * len;
            let z1 = (z0 + len).min(self.span);

            let mut xmin = f32::MAX;
            let mut xmax = f32::MIN;
            if let Some(terrain) = self.terrain.as_ref() {
                let t = terrain.bind();
                let steps = 12;
                for s in 0..=steps {
                    let z = z0 + (z1 - z0) * (s as f32 / steps as f32);
                    let cx = t.river_center(z);
                    xmin = xmin.min(cx);
                    xmax = xmax.max(cx);
                }
            }
            if xmin > xmax {
                xmin = 0.0;
                xmax = 0.0;
            }
            let pad = self.half_width + 2.0;
            let ymin = self.water - self.depth_max - 4.0;
            let ymax = self.water + 0.5;
            let aabb = Aabb::new(
                Vector3::new(xmin - pad, ymin, z0 - 2.0),
                Vector3::new((xmax - xmin) + pad * 2.0, ymax - ymin, (z1 - z0) + 4.0),
            );

            let mm = rs.multimesh_create();
            rs.multimesh_allocate_data_ex(mm, cap, MultimeshTransformFormat::TRANSFORM_3D)
                .custom_data_format(true)
                .done();
            rs.multimesh_set_mesh(mm, mesh);
            rs.multimesh_set_visible_instances(mm, 0);

            let inst = rs.instance_create();
            rs.instance_set_scenario(inst, scenario);
            rs.instance_set_base(inst, mm);
            if let Some(m) = fish_mat {
                rs.instance_geometry_set_material_override(inst, m);
            }
            rs.instance_geometry_set_cast_shadows_setting(inst, ShadowCastingSetting::OFF);
            rs.instance_set_custom_aabb(inst, aabb);
            rs.instance_set_transform(inst, Transform3D::IDENTITY);

            let smm = rs.multimesh_create();
            rs.multimesh_allocate_data_ex(smm, cap, MultimeshTransformFormat::TRANSFORM_3D)
                .custom_data_format(true)
                .done();
            rs.multimesh_set_mesh(smm, shadow_rid);
            rs.multimesh_set_visible_instances(smm, 0);

            let sinst = rs.instance_create();
            rs.instance_set_scenario(sinst, scenario);
            rs.instance_set_base(sinst, smm);
            if let Some(m) = shadow_mat {
                rs.instance_geometry_set_material_override(sinst, m);
            }
            rs.instance_geometry_set_cast_shadows_setting(sinst, ShadowCastingSetting::OFF);
            rs.instance_set_custom_aabb(sinst, aabb);
            rs.instance_set_transform(sinst, Transform3D::IDENTITY);

            self.chunks.push(Chunk {
                mm,
                inst,
                shadow_mm: smm,
                shadow_inst: sinst,
                count: 0,
            });
        }

        self.buf = vec![0.0; cap as usize * 16 * n];
        self.shadow_buf = vec![0.0; cap as usize * 16 * n];
        self.upload();
    }

    fn upload(&mut self) {
        if self.chunks.is_empty() {
            return;
        }
        let n = self.chunks.len();
        let stride = self.chunk_cap.max(1) as usize * 16;
        for buf in [&mut self.buf, &mut self.shadow_buf] {
            if buf.len() < stride * n {
                buf.resize(stride * n, 0.0);
            }
        }

        let mut counts = vec![0usize; n];
        let mut active = vec![false; n];
        let focus = self.focus_point();
        let sim_r = self.sim_radius.max(1.0);
        let sim_r2 = sim_r * sim_r;
        self.overflow = 0;
        let scale = self.shadow_size;
        let alpha = self.shadow_alpha;
        let water = self.water;
        let depth_max = self.depth_max.max(0.01);
        let yaw_off = self.yaw_offset;
        let model_len = self.model_len;

        for f in self.fish.iter() {
            if !f.alive {
                continue;
            }
            let c = self.chunk_of(f.z);
            let slot = counts[c];
            if slot * 16 >= stride {
                self.overflow += 1;
                continue;
            }
            let o = c * stride + slot * 16;
            let (s, cs) = (f.yaw + yaw_off).sin_cos();
            let (sp, cp) = f.pitch.sin_cos();
            let (sr, cr) = f.roll.sin_cos();
            self.buf[o..o + 16].copy_from_slice(&[
                cs * cr + s * sp * sr,
                -cs * sr + s * sp * cr,
                s * cp,
                f.x,
                cp * sr,
                cp * cr,
                -sp,
                f.y,
                -s * cr + cs * sp * sr,
                s * sr + cs * sp * cr,
                cs * cp,
                f.z,
                f.phase,
                f.rate,
                f.size,
                1.0,
            ]);

            let depth_t = ((f.y - f.bed) / depth_max).clamp(0.0, 1.0);
            let fish_len = model_len * (0.8 + 0.45 * f.size);
            let w = fish_len * scale * (1.0 + depth_t * 0.6);
            let a = alpha * (1.0 - depth_t * 0.55);
            let sy = water.min(f.bed + 0.02);
            self.shadow_buf[o..o + 16].copy_from_slice(&[
                cs * w,
                0.0,
                s * w,
                f.x,
                0.0,
                1.0,
                0.0,
                sy,
                -s * w,
                0.0,
                cs * w,
                f.z,
                a,
                0.0,
                0.0,
                1.0,
            ]);
            counts[c] = slot + 1;
            let fdx = f.x - focus.x;
            let fdz = f.z - focus.z;
            if fdx * fdx + fdz * fdz <= sim_r2 {
                active[c] = true;
            }
        }

        let mut rs = RenderingServer::singleton();
        let mut scratch = std::mem::take(&mut self.scratch);
        if scratch.len() != stride {
            scratch.resize(stride);
        }
        for c in 0..n {
            let used = counts[c];
            if used == 0 && self.chunks[c].count == 0 {
                continue;
            }
            if !active[c] && self.chunks[c].count == used as i32 {
                continue;
            }
            let o = c * stride;
            let (mm, smm) = (self.chunks[c].mm, self.chunks[c].shadow_mm);

            scratch
                .as_mut_slice()
                .copy_from_slice(&self.buf[o..o + stride]);
            rs.multimesh_set_buffer(mm, &scratch);
            rs.multimesh_set_visible_instances(mm, used as i32);

            scratch
                .as_mut_slice()
                .copy_from_slice(&self.shadow_buf[o..o + stride]);
            rs.multimesh_set_buffer(smm, &scratch);
            rs.multimesh_set_visible_instances(smm, used as i32);

            self.chunks[c].count = used as i32;
        }
        self.scratch = scratch;

        if self.overflow > 0 && !self.overflow_warned {
            self.overflow_warned = true;
            godot_warn!(
                "[QFishField] {} fish skipped this frame; chunk_cap={} exceeded (raise chunk_cap or chunk_len)",
                self.overflow,
                self.chunk_cap
            );
        }
    }

    fn free_all(&mut self) {
        let mut rs = RenderingServer::singleton();
        for c in self.chunks.drain(..) {
            for rid in [c.shadow_inst, c.shadow_mm, c.inst, c.mm] {
                if rid.is_valid() {
                    rs.free_rid(rid);
                }
            }
        }
    }
}

#[godot_api]
impl INode3D for QFishField {
    fn process(&mut self, delta: f64) {
        if Engine::singleton().is_editor_hint() {
            return;
        }
        if !self.init_done {
            if super::q_hidden("fish") || self.late_init() {
                self.init_done = true;
            }
            return;
        }
        if self.chunks.is_empty() || !self.base().is_visible_in_tree() {
            return;
        }
        let _t = super::StallTimer::start("fish_tick");
        self.tick(delta as f32);
        self.upload();
    }

    fn on_notification(&mut self, what: Node3DNotification) {
        match what {
            Node3DNotification::VISIBILITY_CHANGED => {
                let visible = self.base().is_visible_in_tree();
                let mut rs = RenderingServer::singleton();
                for c in self.chunks.iter() {
                    rs.instance_set_visible(c.inst, visible);
                    rs.instance_set_visible(c.shadow_inst, visible);
                }
            }
            Node3DNotification::PREDELETE => self.free_all(),
            _ => {}
        }
    }
}

#[godot_api]
impl QFishField {
    #[func]
    fn get_fish_stats(&self) -> VarDictionary {
        let alive = self.fish.iter().filter(|f| f.alive).count() as i64;
        let visible: i64 = self.chunks.iter().map(|c| c.count as i64).sum();
        let mut d = VarDictionary::new();
        let _ = d.insert("instances", self.placed as i64);
        let _ = d.insert("alive", alive);
        let _ = d.insert("visible", visible);
        let _ = d.insert("chunks", self.chunks.len() as i64);
        let _ = d.insert("simulated", self.simulated as i64);
        d
    }

    #[func]
    fn query_catch(&self, origin: Vector3, dir: Vector3, max_dist: f32) -> VarDictionary {
        let mut d = VarDictionary::new();
        let len = dir.length();
        let mut best = -1i64;
        let mut best_t = f32::MAX;
        let mut best_pos = Vector3::ZERO;
        if len > 0.001 {
            let ray = dir / len;
            let radius = self.catch_radius;
            for (i, f) in self.fish.iter().enumerate() {
                if !f.alive {
                    continue;
                }
                let to = Vector3::new(f.x, f.y, f.z) - origin;
                let t = to.dot(ray);
                if t < 0.0 || t > max_dist {
                    continue;
                }
                let r = f.size * 0.45 + radius;
                if (to - ray * t).length() <= r && t < best_t {
                    best = i as i64;
                    best_t = t;
                    best_pos = Vector3::new(f.x, f.y, f.z);
                }
            }
        }
        let _ = d.insert("hit", best >= 0);
        let _ = d.insert("index", best);
        let _ = d.insert("distance", if best >= 0 { best_t } else { -1.0 });
        let _ = d.insert("position", best_pos);
        d
    }

    #[func]
    fn nearest_fish(&self, point: Vector3, max_dist: f32) -> VarDictionary {
        let mut d = VarDictionary::new();
        let mut best = -1i64;
        let mut best_d = max_dist;
        let mut best_pos = Vector3::ZERO;
        for (i, f) in self.fish.iter().enumerate() {
            if !f.alive {
                continue;
            }
            let p = Vector3::new(f.x, f.y, f.z);
            let dist = (p - point).length();
            if dist <= best_d {
                best = i as i64;
                best_d = dist;
                best_pos = p;
            }
        }
        let _ = d.insert("hit", best >= 0);
        let _ = d.insert("index", best);
        let _ = d.insert("distance", if best >= 0 { best_d } else { -1.0 });
        let _ = d.insert("position", best_pos);
        d
    }

    #[func]
    fn take_fish(&mut self, index: i64) -> bool {
        let Some(f) = self.fish.get_mut(index.max(0) as usize).filter(|f| f.alive) else {
            return false;
        };
        f.alive = false;
        f.respawn = self.respawn_time;
        true
    }

    #[func]
    fn fish_position(&self, index: i64) -> Vector3 {
        self.fish
            .get(index.max(0) as usize)
            .filter(|f| f.alive)
            .map(|f| Vector3::new(f.x, f.y, f.z))
            .unwrap_or(Vector3::ZERO)
    }

    #[func]
    fn scare(&mut self, point: Vector3, radius: f32) {
        let r2 = radius * radius;
        for f in self.fish.iter_mut() {
            if !f.alive {
                continue;
            }
            let dx = f.x - point.x;
            let dz = f.z - point.z;
            if dx * dx + dz * dz <= r2 {
                f.panic = 1.0;
            }
        }
    }
}
