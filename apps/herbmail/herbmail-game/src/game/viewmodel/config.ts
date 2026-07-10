export const ARMS_URL = '/models/arms.glb';

export interface ViewmodelRest {
	px: number;
	py: number;
	pz: number;
	rx: number;
	ry: number;
	rz: number;
	scale: number;
}

export const REST: ViewmodelRest = {
	px: 0,
	py: -0.28,
	pz: -0.54,
	rx: 0.1,
	ry: 0,
	rz: 0,
	scale: 0.12,
};

export const MOTION = {
	idleBobAmp: 0.006,
	idleBobFreq: 1.4,
	idleSwayAmp: 0.004,
	walkBobAmp: 0.02,
	walkBobFreq: 9,
	walkLerp: 6,
	swayPos: 0.05,
	swayRot: 0.06,
	swayLerp: 8,
	recoilBack: 0.09,
	recoilKick: 0.16,
	recoilRoll: 0.05,
	reachPush: 0.5,
	springBack: 10,
} as const;

export const SOCKET_BONE = 'socket.r';
