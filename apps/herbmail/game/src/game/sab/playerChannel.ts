// Shared-memory channel between the input owner (main thread) and whatever is
// simulating the player. Today that simulator is the sim worker; the same layout
// is what a server would fill, so the field set is deliberately transport-shaped
// rather than convenient for either side.
//
// SharedArrayBuffer makes the transport free, not instant: the simulator steps on
// its own schedule and the reader sees whatever was last written. So intent
// carries a sequence number and the pose carries the sequence it was derived
// from — that pairing is what lets the reader tell how stale a pose is, and is
// the same handshake client prediction reconciles against over a network.

export const PC = {
	// main -> sim
	INTENT_X: 0,
	INTENT_Y: 1,
	INTENT_Z: 2,
	YAW: 3,
	INPUT_SEQ: 4,
	FLAGS: 5,
	// authority-owned pose, written by whoever simulates
	POSE_X: 6,
	POSE_Y: 7,
	POSE_Z: 8,
	ACK_SEQ: 9,
	SIM_FLAGS: 10,
	// Pose the input owner arrived at on its own. Kept alongside the authority's
	// pose so the two can be compared without either side stalling on the other.
	LOCAL_X: 11,
	LOCAL_Y: 12,
	LOCAL_Z: 13,
} as const;

export const PLAYER_SLOTS = 14;

export const PC_FLAG = {
	GROUNDED: 1 << 0,
	SWIMMING: 1 << 1,
	RUNNING: 1 << 2,
} as const;

export interface Intent {
	vx: number;
	vy: number;
	vz: number;
	yaw: number;
	seq: number;
	flags: number;
}

export function writeIntent(ch: Float32Array, i: Intent): void {
	ch[PC.INTENT_X] = i.vx;
	ch[PC.INTENT_Y] = i.vy;
	ch[PC.INTENT_Z] = i.vz;
	ch[PC.YAW] = i.yaw;
	ch[PC.FLAGS] = i.flags;
	// Sequence last: a reader that sees this number is guaranteed to see the
	// fields above it, since no reader advances on an unchanged sequence.
	ch[PC.INPUT_SEQ] = i.seq;
}

export function readIntent(ch: Float32Array): Intent {
	return {
		vx: ch[PC.INTENT_X],
		vy: ch[PC.INTENT_Y],
		vz: ch[PC.INTENT_Z],
		yaw: ch[PC.YAW],
		seq: ch[PC.INPUT_SEQ],
		flags: ch[PC.FLAGS],
	};
}

export function writeAuthorityPose(
	ch: Float32Array,
	x: number,
	y: number,
	z: number,
	seq: number,
	flags = 0,
): void {
	ch[PC.POSE_X] = x;
	ch[PC.POSE_Y] = y;
	ch[PC.POSE_Z] = z;
	ch[PC.SIM_FLAGS] = flags;
	ch[PC.ACK_SEQ] = seq;
}

export function writeLocalPose(
	ch: Float32Array,
	x: number,
	y: number,
	z: number,
): void {
	ch[PC.LOCAL_X] = x;
	ch[PC.LOCAL_Y] = y;
	ch[PC.LOCAL_Z] = z;
}

/** Horizontal distance between the authority's pose and the input owner's own.
 * Y is excluded: gravity and swim are still resolved locally and would swamp the
 * horizontal disagreement this is meant to expose. */
export function poseDrift(ch: Float32Array): number {
	const dx = ch[PC.POSE_X] - ch[PC.LOCAL_X];
	const dz = ch[PC.POSE_Z] - ch[PC.LOCAL_Z];
	return Math.hypot(dx, dz);
}

/** How many inputs the authority is behind. Zero means it consumed the newest. */
export function inputLag(ch: Float32Array): number {
	return ch[PC.INPUT_SEQ] - ch[PC.ACK_SEQ];
}
