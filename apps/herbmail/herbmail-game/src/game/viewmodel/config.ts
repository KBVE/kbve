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

export const INSPECT_REST: ViewmodelRest = {
	px: -0.1,
	py: 0.16,
	pz: -0.02,
	rx: 0.1,
	ry: 0,
	rz: 0,
	scale: 0.22,
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
	shoulder: 'shoulder.r',
	bicep: 'bicep.r',
	forearm: 'forearm.r',
	wrist: 'wrist.r',
	shoulderFrac: 0,
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
	poleOut: 0.35,
	poleBack: 0,
	wristAlign: true,
	wristRoll: 0,
	wristMax: 3.14,
	outputLerp: 22,
	fingerLocal: [0, 1, 0] as [number, number, number],
	palmLocal: [-1, 0, 0] as [number, number, number],
	debugAxes: true,
	debugLog: false,
} as const;

export interface ArmSide {
	key: 'r' | 'l';
	shoulder: string;
	bicep: string;
	forearm: string;
	wrist: string;
	socket: string;
	palmLocal: [number, number, number];
	bladeCam: [number, number, number];
	poleOutSign: number;
	requiresHeld: boolean;
	debug: boolean;
	labels: {
		shoulder: string[];
		bicep: string[];
		forearm: string[];
		wrist: string[];
	};
}

export const ARM_SIDES: { r: ArmSide; l: ArmSide } = {
	r: {
		key: 'r',
		shoulder: 'shoulder.r',
		bicep: 'bicep.r',
		forearm: 'forearm.r',
		wrist: 'wrist.r',
		socket: 'socket.r',
		palmLocal: [-1, 0, 0],
		bladeCam: [0.3, 0.85, -0.35],
		poleOutSign: 1,
		requiresHeld: false,
		debug: false,
		labels: {
			wrist: ['A', 'B', 'C', 'D', 'E', 'F'],
			forearm: ['G', 'H', 'I', 'J', 'K', 'L'],
			bicep: ['M', 'N', 'O', 'P', 'Q', 'R'],
			shoulder: ['S', 'T', 'U', 'V', 'W', 'X'],
		},
	},
	l: {
		key: 'l',
		shoulder: 'shoulder.l',
		bicep: 'bicep.l',
		forearm: 'forearm.l',
		wrist: 'wrist.l',
		socket: 'socket.l',
		palmLocal: [1, 0, 0],
		bladeCam: [-0.3, 0.85, -0.35],
		poleOutSign: -1,
		requiresHeld: true,
		debug: true,
		labels: {
			wrist: ['a', 'b', 'c', 'd', 'e', 'f'],
			forearm: ['g', 'h', 'i', 'j', 'k', 'l'],
			bicep: ['m', 'n', 'o', 'p', 'q', 'r'],
			shoulder: ['s', 't', 'u', 'v', 'w', 'x'],
		},
	},
};
