import {
	Color,
	DirectionalLight,
	HemisphereLight,
	MathUtils,
	Object3D,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Timer } from 'three/examples/jsm/misc/Timer.js';
import {
	VRM,
	VRMHumanBoneName,
	VRMLoaderPlugin,
	VRMUtils,
	type VRMExpressionPresetName,
} from '@pixiv/three-vrm';

const DEFAULT_VRM_URL = '/assets/vt/witch-mimiko-meadow.vrm';

export type YukiState = 'idle' | 'talking' | 'wave' | 'nod' | 'shake' | 'happy';

export interface YukiVRMHandle {
	setState(state: YukiState): void;
	pointAt(x: number, y: number): void;
	setActive(active: boolean): void;
	destroy(): void;
}

interface MountOpts {
	host: HTMLElement;
	vrmUrl?: string;
	transparent?: boolean;
}

const REST_POSE: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
	[VRMHumanBoneName.LeftUpperArm]: [0, 0, MathUtils.degToRad(75)],
	[VRMHumanBoneName.RightUpperArm]: [0, 0, MathUtils.degToRad(-75)],
	[VRMHumanBoneName.LeftLowerArm]: [0, MathUtils.degToRad(-12), 0],
	[VRMHumanBoneName.RightLowerArm]: [0, MathUtils.degToRad(12), 0],
	[VRMHumanBoneName.LeftHand]: [0, 0, MathUtils.degToRad(8)],
	[VRMHumanBoneName.RightHand]: [0, 0, MathUtils.degToRad(-8)],
};

function applyRestPose(vrm: VRM): void {
	if (!vrm.humanoid) return;
	for (const [name, [x, y, z]] of Object.entries(REST_POSE)) {
		const bone = vrm.humanoid.getNormalizedBoneNode(
			name as VRMHumanBoneName,
		);
		if (bone) bone.rotation.set(x, y, z);
	}
}

type ExpressionTargets = Partial<Record<VRMExpressionPresetName, number>>;

interface Gesture {
	name: 'wave' | 'nod' | 'shake';
	elapsed: number;
	duration: number;
}

export async function mountYukiVRM(opts: MountOpts): Promise<YukiVRMHandle> {
	const { host, vrmUrl = DEFAULT_VRM_URL, transparent = false } = opts;

	host.innerHTML = '';
	const canvas = document.createElement('canvas');
	canvas.className = 'yuki-vrm__canvas';
	canvas.style.cssText =
		'width:100%;height:100%;display:block;background:transparent;';
	host.appendChild(canvas);

	const renderer = new WebGLRenderer({
		canvas,
		antialias: true,
		alpha: true,
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

	const scene = new Scene();
	if (!transparent) scene.background = new Color(0x0f172a);

	const camera = new PerspectiveCamera(30, 1, 0.1, 20);
	camera.position.set(0, 1.45, 1.1);
	camera.lookAt(0, 1.42, 0);

	const setSize = () => {
		const w = host.clientWidth || 320;
		const h = host.clientHeight || 360;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};
	setSize();
	const resizeObserver = new ResizeObserver(setSize);
	resizeObserver.observe(host);

	scene.add(new HemisphereLight(0xffffff, 0x404060, 0.9));
	const key = new DirectionalLight(0xffffff, 1.0);
	key.position.set(1, 2, 1.5);
	scene.add(key);

	const loader = new GLTFLoader();
	loader.register((parser) => new VRMLoaderPlugin(parser));
	const gltf = await loader.loadAsync(vrmUrl);
	const vrm: VRM | undefined = gltf.userData.vrm;
	if (!vrm) throw new Error('VRM payload missing on loaded GLTF');

	try {
		(
			VRMUtils as unknown as {
				removeUnnecessaryVertices?: (s: unknown) => void;
			}
		).removeUnnecessaryVertices?.(gltf.scene);
		(
			VRMUtils as unknown as { combineSkeletons?: (s: unknown) => void }
		).combineSkeletons?.(gltf.scene);
	} catch {
		void 0;
	}

	scene.add(vrm.scene);
	applyRestPose(vrm);

	try {
		(
			vrm as unknown as { springBoneManager?: { reset?: () => void } }
		).springBoneManager?.reset?.();
	} catch {
		void 0;
	}

	const humanoid = vrm.humanoid;
	const spineBone = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Spine);
	const hipsBone = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Hips);
	const headBone = humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Head);
	const rUpperArm = humanoid?.getNormalizedBoneNode(
		VRMHumanBoneName.RightUpperArm,
	);
	const rLowerArm = humanoid?.getNormalizedBoneNode(
		VRMHumanBoneName.RightLowerArm,
	);

	const lookAtTarget = new Object3D();
	lookAtTarget.position.set(0, 1.45, 0.6);
	scene.add(lookAtTarget);
	if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

	const targetWorld = new Vector3(0, 1.45, 0.6);
	const targetCurrent = new Vector3(0, 1.45, 0.6);
	let lastInteractionMs = performance.now();
	let lastPointNx = 0;

	const pointAt = (clientX: number, clientY: number): void => {
		const rect = host.getBoundingClientRect();
		const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
		const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
		const cnx = Math.max(-1.5, Math.min(1.5, nx));
		const cny = Math.max(-1.5, Math.min(1.5, ny));
		targetWorld.set(cnx * 0.45, 1.45 - cny * 0.3, 0.6);
		lastPointNx = cnx;
		lastInteractionMs = performance.now();
	};

	const onPointerMove = (ev: PointerEvent) => pointAt(ev.clientX, ev.clientY);
	host.addEventListener('pointermove', onPointerMove);
	host.addEventListener('pointerleave', () => {
		targetWorld.set(0, 1.45, 0.6);
		lastPointNx = 0;
	});

	const timer = new Timer();
	let currentState: YukiState = 'idle';
	let blinkCooldown = 1.5 + Math.random() * 2;
	let blinkPhase = 0;
	let activeGesture: Gesture | null = null;

	const expressionCurrent: Record<string, number> = {};
	const expressionTarget: ExpressionTargets = {};

	const setExpression = (
		name: VRMExpressionPresetName,
		value: number,
	): void => {
		expressionTarget[name] = value;
		lastInteractionMs = performance.now();
	};

	const triggerGesture = (
		name: 'wave' | 'nod' | 'shake',
		duration: number,
	): void => {
		activeGesture = { name, elapsed: 0, duration };
		lastInteractionMs = performance.now();
	};

	const setState = (state: YukiState): void => {
		currentState = state;
		switch (state) {
			case 'happy':
				setExpression('happy', 1);
				break;
			case 'wave':
				triggerGesture('wave', 1.6);
				setExpression('happy', 0.6);
				break;
			case 'nod':
				triggerGesture('nod', 0.7);
				break;
			case 'shake':
				triggerGesture('shake', 0.8);
				break;
			case 'idle':
				setExpression('happy', 0);
				setExpression('angry', 0);
				setExpression('sad', 0);
				break;
		}
		lastInteractionMs = performance.now();
	};

	const applyGesture = (gesture: Gesture) => {
		const p = Math.min(1, gesture.elapsed / gesture.duration);
		const fade = Math.sin(p * Math.PI);
		if (gesture.name === 'wave') {
			if (rUpperArm) {
				const baseZ = MathUtils.degToRad(-75);
				const lift = MathUtils.degToRad(-115) - baseZ;
				rUpperArm.rotation.z = baseZ + lift * fade;
				rUpperArm.rotation.x = MathUtils.degToRad(-10) * fade;
			}
			if (rLowerArm) {
				const sway = Math.sin(gesture.elapsed * 14) * 0.5 * fade;
				rLowerArm.rotation.y = MathUtils.degToRad(12) + sway;
			}
		} else if (gesture.name === 'nod') {
			if (headBone)
				headBone.rotation.x += Math.sin(p * Math.PI * 2) * 0.18 * fade;
		} else if (gesture.name === 'shake') {
			if (headBone)
				headBone.rotation.y += Math.sin(p * Math.PI * 2) * 0.22 * fade;
		}
	};

	const coarse = window.matchMedia('(pointer: coarse)').matches;
	const activeFps = coarse ? 30 : 60;
	const idleFps = 15;
	let lastFrame = 0;
	let rafId = 0;
	let disposed = false;
	let active = true;

	const tick = (now: number) => {
		if (disposed) return;
		rafId = requestAnimationFrame(tick);
		if (!active) return;
		if (document.visibilityState !== 'visible') return;

		const idleMs = now - lastInteractionMs;
		const isIdle =
			!activeGesture && currentState === 'idle' && idleMs > 2000;
		const fps = isIdle ? idleFps : activeFps;
		const minFrameMs = 1000 / fps;
		if (now - lastFrame < minFrameMs) return;
		timer.update(now);
		const delta = timer.getDelta();
		lastFrame = now;

		targetCurrent.lerp(targetWorld, Math.min(1, delta * 6));
		lookAtTarget.position.copy(targetCurrent);

		if (spineBone) {
			spineBone.rotation.x = Math.sin(now / 1400) * 0.018;
			spineBone.rotation.z = Math.sin(now / 2700) * 0.012;
			spineBone.rotation.y = MathUtils.lerp(
				spineBone.rotation.y,
				lastPointNx * 0.12,
				Math.min(1, delta * 4),
			);
		}
		if (hipsBone) {
			hipsBone.position.y = Math.sin(now / 1100) * 0.005;
		}

		if (activeGesture) {
			activeGesture.elapsed += delta;
			applyGesture(activeGesture);
			if (activeGesture.elapsed >= activeGesture.duration) {
				activeGesture = null;
				applyRestPose(vrm);
			}
		}

		blinkCooldown -= delta;
		if (blinkCooldown <= 0 && blinkPhase === 0) {
			blinkPhase = 0.0001;
		}
		if (blinkPhase > 0) {
			blinkPhase += delta * 6;
			const v = Math.sin(Math.min(1, blinkPhase) * Math.PI);
			expressionTarget['blink'] = v;
			if (blinkPhase >= 1) {
				blinkPhase = 0;
				expressionTarget['blink'] = 0;
				blinkCooldown = 2.5 + Math.random() * 3;
			}
		}

		const expSpeed = Math.min(1, delta * 8);
		const mgr = vrm.expressionManager;
		if (mgr) {
			for (const k of Object.keys(expressionTarget)) {
				const target =
					expressionTarget[k as VRMExpressionPresetName] ?? 0;
				const current = expressionCurrent[k] ?? 0;
				const next = current + (target - current) * expSpeed;
				expressionCurrent[k] = next;
				mgr.setValue(k as VRMExpressionPresetName, next);
			}
		}

		vrm.update(delta);
		renderer.render(scene, camera);
	};
	rafId = requestAnimationFrame(tick);

	const onVisibility = () => {
		timer.update(performance.now());
		timer.getDelta();
	};
	document.addEventListener('visibilitychange', onVisibility);

	const setActive = (next: boolean): void => {
		active = next;
		if (next) {
			timer.update(performance.now());
			timer.getDelta();
			lastInteractionMs = performance.now();
		}
	};

	const destroy = () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(rafId);
		document.removeEventListener('visibilitychange', onVisibility);
		host.removeEventListener('pointermove', onPointerMove);
		resizeObserver.disconnect();
		try {
			VRMUtils.deepDispose(vrm.scene);
		} catch {
			void 0;
		}
		renderer.dispose();
		canvas.remove();
	};

	void currentState;

	return {
		setState,
		pointAt,
		setActive,
		destroy,
	};
}
