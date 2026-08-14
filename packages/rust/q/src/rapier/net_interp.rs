//! Render-time interpolation over a snapshot stream.
//!
//! Snapshots arrive at the host's `snapshot_hz` (20, by default) while the app draws at
//! whatever the display runs at. Applying the newest snapshot directly means three or
//! four rendered frames of nothing and then one jump, so bodies are instead drawn from a
//! clock held deliberately behind the newest arrival, sampled between the two snapshots
//! that straddle it.
//!
//! The local player is the exception: drawing our own body in the past means our input
//! visibly lags our keypress on top of the round trip it already costs, so it is
//! extrapolated forward from the newest snapshot along the velocity that came with it.

use std::collections::VecDeque;

use super::sim3d::{BodyId, Iso, SimSnapshot};

#[derive(Clone, Copy, Debug)]
pub struct InterpConfig {
    /// How far behind the newest snapshot remote bodies are drawn. Must cover the gap
    /// between snapshots plus jitter, or the buffer runs dry and bodies stall.
    pub delay: f64,
    /// Fraction of the clock error corrected per second once the stream is flowing.
    pub catchup: f64,
    /// Clock error past which correcting smoothly is hopeless and the clock is reset —
    /// a stall, a suspend, or a host restart.
    pub max_drift: f64,
    /// Ceiling on how far the local body is carried past the newest snapshot.
    pub max_extrapolation: f64,
    /// Snapshots retained. Older ones can only be sampled if the clock falls behind.
    pub capacity: usize,
}

impl Default for InterpConfig {
    fn default() -> Self {
        Self {
            delay: 0.1,
            catchup: 2.0,
            max_drift: 0.5,
            max_extrapolation: 0.25,
            capacity: 16,
        }
    }
}

fn lerp3(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
    ]
}

/// Normalized lerp, taking the short way round. Cheaper than a true slerp and
/// indistinguishable at the angles one snapshot interval covers.
fn nlerp(a: [f32; 4], b: [f32; 4], t: f32) -> [f32; 4] {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let sign = if dot < 0.0 { -1.0 } else { 1.0 };
    let mut out = [0.0f32; 4];
    for i in 0..4 {
        out[i] = a[i] + (b[i] * sign - a[i]) * t;
    }
    let len = (out[0] * out[0] + out[1] * out[1] + out[2] * out[2] + out[3] * out[3]).sqrt();
    if len <= f32::EPSILON {
        return b;
    }
    for v in &mut out {
        *v /= len;
    }
    out
}

fn blend(a: &Iso, b: &Iso, t: f32) -> Iso {
    Iso {
        pos: lerp3(a.pos, b.pos, t),
        rot: nlerp(a.rot, b.rot, t),
    }
}

/// Holds recent snapshots and the clock they are sampled at.
pub struct SnapshotBuffer {
    config: InterpConfig,
    frames: VecDeque<SimSnapshot>,
    /// Sim-time the next `sample` reads at. `None` until the first snapshot lands.
    clock: Option<f64>,
    /// Local seconds since the newest snapshot was pushed.
    age: f64,
}

impl Default for SnapshotBuffer {
    fn default() -> Self {
        Self::new(InterpConfig::default())
    }
}

impl SnapshotBuffer {
    pub fn new(config: InterpConfig) -> Self {
        Self {
            config,
            frames: VecDeque::new(),
            clock: None,
            age: 0.0,
        }
    }

    pub fn set_config(&mut self, config: InterpConfig) {
        self.config = config;
    }

    pub fn clear(&mut self) {
        self.frames.clear();
        self.clock = None;
        self.age = 0.0;
    }

    pub fn latest(&self) -> Option<&SimSnapshot> {
        self.frames.back()
    }

    /// Sim-time currently being sampled, for diagnostics.
    pub fn render_time(&self) -> f64 {
        self.clock.unwrap_or(0.0)
    }

    /// Snapshots held. A number that keeps falling to one means `delay` is too short for
    /// the link.
    pub fn depth(&self) -> usize {
        self.frames.len()
    }

    /// Files a snapshot. Repeats of one already held are dropped — the client thread
    /// republishes its latest state every tick, so the same snapshot arrives many times
    /// over. Returns whether this one was new.
    pub fn push(&mut self, snapshot: SimSnapshot) -> bool {
        if let Some(newest) = self.frames.back()
            && snapshot.tick <= newest.tick
        {
            return false;
        }
        // A host restart rewinds sim_time; nothing already held can be blended against
        // what arrives after it.
        if let Some(newest) = self.frames.back()
            && snapshot.sim_time < newest.sim_time
        {
            self.frames.clear();
            self.clock = None;
        }
        self.frames.push_back(snapshot);
        while self.frames.len() > self.config.capacity {
            self.frames.pop_front();
        }
        self.age = 0.0;
        true
    }

    /// Advances the render clock by a frame of local time and eases it back toward the
    /// stream. Sampling without this returns the same pose every frame.
    pub fn advance(&mut self, delta: f64) {
        let Some(newest) = self.frames.back().map(|s| s.sim_time) else {
            return;
        };
        self.age += delta.max(0.0);

        let target = newest - self.config.delay;
        let Some(clock) = self.clock else {
            self.clock = Some(target);
            return;
        };

        let advanced = clock + delta.max(0.0);
        let error = target - advanced;
        let corrected = if error.abs() > self.config.max_drift {
            target
        } else {
            advanced + error * (self.config.catchup * delta.max(0.0)).clamp(0.0, 1.0)
        };
        // The correction is proportional, so it cannot hold the clock back on its own
        // once the stream stops and local time keeps accruing. Remote bodies stop at the
        // last thing the host actually said rather than being carried past it on a guess.
        let oldest = self.frames.front().map_or(newest, |s| s.sim_time);
        self.clock = Some(corrected.clamp(oldest, newest));
    }

    /// Pose for a remote body: the delayed clock, blended between the snapshots either
    /// side of it. Falls back to the nearest end when the clock sits outside the buffer.
    pub fn sample(&self, id: BodyId) -> Option<Iso> {
        let clock = self.clock?;
        let (older, newer) = self.straddling(clock)?;

        let a = older.body(id);
        let b = newer.body(id);
        match (a, b) {
            (Some(a), Some(b)) => {
                let span = newer.sim_time - older.sim_time;
                let t = if span > f64::EPSILON {
                    (((clock - older.sim_time) / span) as f32).clamp(0.0, 1.0)
                } else {
                    1.0
                };
                Some(blend(&a.iso, &b.iso, t))
            }
            // A body that only exists on one side of the clock has just spawned or is
            // about to go; pop it into place rather than blending against nothing.
            (None, Some(b)) => Some(b.iso),
            (Some(a), None) => Some(a.iso),
            (None, None) => None,
        }
    }

    /// Pose for the local body: the newest snapshot carried forward along its own
    /// velocity by however long ago it landed, so our own movement tracks the key that
    /// caused it instead of trailing the buffer.
    pub fn sample_leading(&self, id: BodyId) -> Option<Iso> {
        let newest = self.frames.back()?;
        let body = newest.body(id)?;
        let dt = self.age.clamp(0.0, self.config.max_extrapolation) as f32;
        Some(Iso {
            pos: [
                body.iso.pos[0] + body.linvel[0] * dt,
                body.iso.pos[1] + body.linvel[1] * dt,
                body.iso.pos[2] + body.linvel[2] * dt,
            ],
            rot: body.iso.rot,
        })
    }

    /// The pair of snapshots the clock falls between, clamped to the ends of the buffer.
    fn straddling(&self, clock: f64) -> Option<(&SimSnapshot, &SimSnapshot)> {
        if self.frames.is_empty() {
            return None;
        }
        if self.frames.len() == 1 {
            let only = self.frames.front()?;
            return Some((only, only));
        }
        for pair in 0..self.frames.len() - 1 {
            let older = &self.frames[pair];
            let newer = &self.frames[pair + 1];
            if clock <= newer.sim_time {
                return Some((older, newer));
            }
        }
        let last = self.frames.len() - 1;
        Some((&self.frames[last - 1], &self.frames[last]))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rapier::sim3d::BodySnapshot;

    const BODY: BodyId = BodyId(7);

    fn snapshot(tick: u64, x: f32, vx: f32) -> SimSnapshot {
        SimSnapshot {
            tick,
            sim_time: tick as f64 * 0.05,
            bodies: vec![BodySnapshot {
                id: BODY,
                iso: Iso::at(x, 0.0, 0.0),
                linvel: [vx, 0.0, 0.0],
                grounded: true,
            }],
        }
    }

    fn primed() -> SnapshotBuffer {
        let mut buffer = SnapshotBuffer::new(InterpConfig::default());
        for tick in 0..6 {
            buffer.push(snapshot(tick, tick as f32, 20.0));
        }
        buffer
    }

    #[test]
    fn a_repeated_snapshot_is_not_filed_twice() {
        let mut buffer = SnapshotBuffer::new(InterpConfig::default());
        assert!(buffer.push(snapshot(1, 0.0, 0.0)));
        assert!(!buffer.push(snapshot(1, 0.0, 0.0)));
        assert_eq!(buffer.depth(), 1);
    }

    #[test]
    fn the_clock_starts_a_delay_behind_the_newest_snapshot() {
        let mut buffer = primed();
        buffer.advance(0.016);
        let newest = buffer.latest().unwrap().sim_time;
        assert!((buffer.render_time() - (newest - 0.1)).abs() < 1e-9);
    }

    #[test]
    fn a_remote_body_is_drawn_between_two_snapshots_not_on_one() {
        let mut buffer = SnapshotBuffer::new(InterpConfig {
            // Deliberately off a snapshot boundary: the default 0.1 is two whole 20 Hz
            // intervals, so it lands exactly on a snapshot and blends nothing.
            delay: 0.12,
            ..InterpConfig::default()
        });
        for tick in 0..6 {
            buffer.push(snapshot(tick, tick as f32, 20.0));
        }
        buffer.advance(0.016);
        let x = buffer.sample(BODY).unwrap().pos[0];
        // Bodies advance one unit per snapshot, so a clock landing between them has to
        // read as a fraction.
        assert!(
            x.fract().abs() > 1e-4,
            "expected a blended position, got {x}"
        );
    }

    #[test]
    fn a_remote_body_moves_between_frames_without_new_snapshots() {
        let mut buffer = primed();
        buffer.advance(0.016);
        let first = buffer.sample(BODY).unwrap().pos[0];
        buffer.advance(0.016);
        let second = buffer.sample(BODY).unwrap().pos[0];
        assert!(second > first, "{first} -> {second} should have advanced");
    }

    #[test]
    fn the_clock_never_outruns_the_stream() {
        let mut buffer = primed();
        buffer.advance(0.016);
        for _ in 0..600 {
            buffer.advance(0.016);
        }
        let newest = buffer.latest().unwrap().sim_time;
        // With nothing new arriving the clock is pulled back to the target rather than
        // running off into the future.
        assert!(
            buffer.render_time() <= newest,
            "clock {} passed newest {newest}",
            buffer.render_time()
        );
    }

    #[test]
    fn a_long_stall_snaps_the_clock_instead_of_crawling_back() {
        let mut buffer = primed();
        buffer.advance(0.016);
        for tick in 6..200 {
            buffer.push(snapshot(tick, tick as f32, 20.0));
        }
        buffer.advance(0.016);
        let newest = buffer.latest().unwrap().sim_time;
        assert!((buffer.render_time() - (newest - 0.1)).abs() < 1e-6);
    }

    #[test]
    fn a_host_restart_drops_what_cannot_be_blended() {
        let mut buffer = primed();
        buffer.advance(0.016);
        let mut restarted = snapshot(999, 0.0, 0.0);
        restarted.sim_time = 0.0;
        buffer.push(restarted);
        assert_eq!(buffer.depth(), 1);
        assert!(buffer.sample(BODY).is_none(), "clock should be unset");
    }

    #[test]
    fn the_local_body_leads_the_delayed_clock() {
        let mut buffer = primed();
        buffer.advance(0.05);
        let remote = buffer.sample(BODY).unwrap().pos[0];
        let local = buffer.sample_leading(BODY).unwrap().pos[0];
        assert!(local > remote, "local {local} should lead remote {remote}");
    }

    #[test]
    fn extrapolation_is_capped_when_the_stream_dies() {
        let mut buffer = primed();
        for _ in 0..100 {
            buffer.advance(0.05);
        }
        let newest = buffer.latest().unwrap().body(BODY).unwrap().iso.pos[0];
        let local = buffer.sample_leading(BODY).unwrap().pos[0];
        assert!(
            (local - newest) <= 20.0 * 0.25 + 1e-4,
            "extrapolated {local} from {newest} past the cap"
        );
    }

    #[test]
    fn the_buffer_is_bounded() {
        let mut buffer = SnapshotBuffer::new(InterpConfig::default());
        for tick in 0..200 {
            buffer.push(snapshot(tick, tick as f32, 0.0));
        }
        assert_eq!(buffer.depth(), 16);
    }

    #[test]
    fn a_body_missing_from_one_side_still_resolves() {
        let mut buffer = SnapshotBuffer::new(InterpConfig::default());
        let mut empty = snapshot(0, 0.0, 0.0);
        empty.bodies.clear();
        buffer.push(empty);
        buffer.push(snapshot(1, 5.0, 0.0));
        buffer.advance(0.016);
        assert_eq!(buffer.sample(BODY).unwrap().pos[0], 5.0);
    }

    /// The staircase this module exists to remove: a 20 Hz stream drawn at 60 Hz moves on
    /// one frame in three and stands still on the other two. Applying snapshots directly
    /// is included as the control, so the test fails if the buffer ever stops helping.
    #[test]
    fn a_twenty_hertz_stream_drawn_at_sixty_moves_every_frame() {
        const SNAPSHOT_DT: f64 = 0.05;
        const FRAME_DT: f64 = 1.0 / 60.0;
        const SPEED: f32 = 4.0;

        let mut buffer = SnapshotBuffer::new(InterpConfig::default());
        let mut interpolated = Vec::new();
        let mut applied_directly = Vec::new();
        let mut next_snapshot = 0.0;
        let mut tick = 0;

        // Prime past the delay so the buffer has something to blend between.
        for _ in 0..4 {
            buffer.push(snapshot(
                tick,
                tick as f32 * SPEED * SNAPSHOT_DT as f32,
                SPEED,
            ));
            tick += 1;
            next_snapshot += SNAPSHOT_DT;
        }
        // Start level with the history just handed over. Starting at zero instead would
        // leave the stream silent for as long as the priming covered, and the buffer
        // would rightly pin at its newest snapshot rather than invent motion.
        let mut clock = next_snapshot - SNAPSHOT_DT;

        for _ in 0..300 {
            clock += FRAME_DT;
            while clock >= next_snapshot {
                buffer.push(snapshot(
                    tick,
                    tick as f32 * SPEED * SNAPSHOT_DT as f32,
                    SPEED,
                ));
                tick += 1;
                next_snapshot += SNAPSHOT_DT;
            }
            buffer.advance(FRAME_DT);
            interpolated.push(buffer.sample(BODY).unwrap().pos[0]);
            applied_directly.push(buffer.latest().unwrap().body(BODY).unwrap().iso.pos[0]);
        }

        let steps = |series: &[f32]| -> Vec<f32> {
            series.windows(2).map(|w| (w[1] - w[0]).abs()).collect()
        };
        let stalled = |series: &[f32]| steps(series).iter().filter(|d| **d < 1e-5).count();

        let control = stalled(&applied_directly);
        assert!(
            control > interpolated.len() / 3,
            "control should stall on most frames, stalled on {control}"
        );

        let stalls = stalled(&interpolated);
        assert_eq!(stalls, 0, "interpolated output stalled on {stalls} frames");

        // Every frame should cover roughly the same ground — that is what smooth means.
        let deltas = steps(&interpolated);
        let expected = SPEED * FRAME_DT as f32;
        let worst = deltas
            .iter()
            .map(|d| (d - expected).abs())
            .fold(0.0f32, f32::max);
        assert!(
            worst < expected * 0.5,
            "frame pacing varied by {worst} against an expected {expected} per frame"
        );
    }

    #[test]
    fn rotation_blends_the_short_way_round() {
        let a = [0.0, 0.0, 0.0, 1.0];
        let b = [0.0, 0.0, -0.0, -1.0];
        let mid = nlerp(a, b, 0.5);
        // Same orientation double-covered: halfway must stay put, not swing through the
        // long arc to the antipode.
        assert!((mid[3].abs() - 1.0).abs() < 1e-5, "{mid:?}");
    }
}
