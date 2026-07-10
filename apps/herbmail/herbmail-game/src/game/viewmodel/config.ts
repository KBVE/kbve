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
	py: -0.06,
	pz: -0.08,
	rx: 0.1,
	ry: 0,
	rz: 0,
	scale: 0.12,
};

export const MOTION = {
	idleBobAmp: 0,
	idleBobFreq: 1.4,
	idleSwayAmp: 0,
	walkBobAmp: 0,
	walkBobFreq: 7,
	walkLerp: 5,
	swayPos: 0,
	swayRot: 0,
	swayLerp: 6,
	recoilBack: 0.09,
	recoilKick: 0.16,
	recoilRoll: 0.05,
	reachPush: 0.5,
	springBack: 10,
} as const;

export const SOCKET_BONE = 'socket.r';

export const ARM_IK = {
	enabled: true,
	holdToReach: false,
	bicep: 'bicep.r',
	forearm: 'forearm.r',
	wrist: 'wrist.r',
	reachFactor: 0.9,
	weightNear: 0.55,
	engageLerp: 10,
	releaseLerp: 2.5,
	missGrace: 0.6,
	targetLerp: 10,
	engageFrac: 0.9,
	releaseFrac: 1.05,
	palmOut: 0.015,
	poleSign: 1,
	poleHint: [0, -1, 0.15] as [number, number, number],
	wristAlign: true,
	fingerLocal: [0, 1, 0] as [number, number, number],
	palmLocal: [-1, 0, 0] as [number, number, number],
	debugAxes: true,
	debugLog: false,
} as const;
