// Shared-memory contract between the main thread and the sim worker. Two buffers:
// a small Int32 control block (heartbeat/flags/counts, touched with Atomics) and a
// Float32 transform block laid out SoA-per-body (position + quaternion). Both are
// SAB-backed when isolated, plain ArrayBuffer otherwise — same indices either way,
// and the float block is directly uploadable to a GPU instance buffer later.

// --- Int32 control block ---
export const STATE_TICK = 0; // sim step heartbeat
export const STATE_RUNNING = 1; // 1 while the worker loop is live
export const STATE_BODY_COUNT = 2; // live dynamic bodies the worker is stepping
export const STATE_READY = 3; // 1 once Rapier has initialised in the worker
export const STATE_I32_SLOTS = 16;

// --- Float32 transform block: MAX_BODIES × [px py pz  qx qy qz qw  active] ---
export const MAX_BODIES = 64;
export const FLOATS_PER_BODY = 8;
export const XFORM_F32_LEN = MAX_BODIES * FLOATS_PER_BODY;

// --- Player kinematic proxy: main writes [x y z yaw] each frame, worker reads it
// to move the player's kinematic body so dynamic bodies collide with the player. ---
export const PLAYER_F32_LEN = 4;
