import {
	Clock,
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
	speak(audio: HTMLAudioElement | MediaStream): void;
	stopSpeaking(): void;
	pointAt(x: number, y: number): void;
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

	const lookAtTarget = new Object3D();
	lookAtTarget.position.set(0, 1.45, 0.6);
	scene.add(lookAtTarget);
	if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

	const targetWorld = new Vector3(0, 1.45, 0.6);
	const targetCurrent = new Vector3(0, 1.45, 0.6);

	const pointAt = (clientX: number, clientY: number): void => {
		const rect = host.getBoundingClientRect();
		const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
		const ny = ((clientY - rect.top) / rect.height) * 2 - 1;
		targetWorld.set(nx * 0.45, 1.45 - ny * 0.3, 0.6);
	};

	const onPointerMove = (ev: PointerEvent) => pointAt(ev.clientX, ev.clientY);
	host.addEventListener('pointermove', onPointerMove);
	host.addEventListener('pointerleave', () => {
		targetWorld.set(0, 1.45, 0.6);
	});

	const clock = new Clock();
	let currentState: YukiState = 'idle';
	let blinkCooldown = 1.5 + Math.random() * 2;
	let blinkPhase = 0;

	const setExpression = (name: VRMExpressionPresetName, value: number) => {
		vrm.expressionManager?.setValue(name, value);
	};

	let audioCtx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let buffer: Uint8Array<ArrayBuffer> | null = null;
	let speakingActive = false;

	const ensureAudio = (): AudioContext => {
		if (!audioCtx) {
			audioCtx = new (
				window.AudioContext ||
				(
					window as unknown as {
						webkitAudioContext: typeof AudioContext;
					}
				).webkitAudioContext
			)();
		}
		return audioCtx;
	};

	const speak = (source: HTMLAudioElement | MediaStream): void => {
		const ctx = ensureAudio();
		void ctx.resume();
		analyser = ctx.createAnalyser();
		analyser.fftSize = 256;
		buffer = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
		const node =
			source instanceof HTMLAudioElement
				? ctx.createMediaElementSource(source)
				: ctx.createMediaStreamSource(source);
		node.connect(analyser);
		if (source instanceof HTMLAudioElement) {
			analyser.connect(ctx.destination);
		}
		speakingActive = true;
		currentState = 'talking';
	};

	const stopSpeaking = (): void => {
		speakingActive = false;
		analyser?.disconnect();
		analyser = null;
		buffer = null;
		currentState = 'idle';
		setExpression('aa', 0);
		setExpression('ih', 0);
		setExpression('ou', 0);
	};

	const setState = (state: YukiState): void => {
		currentState = state;
		switch (state) {
			case 'happy':
				setExpression('happy', 1);
				break;
			case 'idle':
				setExpression('happy', 0);
				setExpression('angry', 0);
				setExpression('sad', 0);
				break;
		}
	};

	const coarse = window.matchMedia('(pointer: coarse)').matches;
	const minFrameMs = coarse ? 1000 / 30 : 1000 / 60;
	let lastFrame = 0;
	let rafId = 0;
	let disposed = false;

	const tick = (now: number) => {
		if (disposed) return;
		rafId = requestAnimationFrame(tick);
		if (document.visibilityState !== 'visible') return;
		if (now - lastFrame < minFrameMs) return;
		const delta = clock.getDelta();
		lastFrame = now;

		targetCurrent.lerp(targetWorld, Math.min(1, delta * 6));
		lookAtTarget.position.copy(targetCurrent);

		if (speakingActive && analyser && buffer) {
			analyser.getByteFrequencyData(buffer);
			let sum = 0;
			for (let i = 0; i < buffer.length; i++) sum += buffer[i];
			const avg = sum / buffer.length / 255;
			const mouth = Math.min(1, avg * 2.3);
			setExpression('aa', mouth);
			setExpression('ih', mouth * 0.35);
			setExpression('ou', mouth * 0.25);
		}

		const t = performance.now();
		const spine = vrm.humanoid?.getNormalizedBoneNode(
			VRMHumanBoneName.Spine,
		);
		if (spine) {
			spine.rotation.x = Math.sin(t / 1400) * 0.018;
			spine.rotation.z = Math.sin(t / 2700) * 0.012;
		}
		const hips = vrm.humanoid?.getNormalizedBoneNode(VRMHumanBoneName.Hips);
		if (hips) {
			hips.position.y = Math.sin(t / 1100) * 0.005;
		}

		blinkCooldown -= delta;
		if (blinkCooldown <= 0 && blinkPhase === 0) {
			blinkPhase = 0.0001;
		}
		if (blinkPhase > 0) {
			blinkPhase += delta * 6;
			const v = Math.sin(Math.min(1, blinkPhase) * Math.PI);
			setExpression('blink', v);
			if (blinkPhase >= 1) {
				blinkPhase = 0;
				setExpression('blink', 0);
				blinkCooldown = 2.5 + Math.random() * 3;
			}
		}

		vrm.update(delta);
		renderer.render(scene, camera);
	};
	rafId = requestAnimationFrame(tick);

	const onVisibility = () => {
		clock.getDelta();
	};
	document.addEventListener('visibilitychange', onVisibility);

	const destroy = () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(rafId);
		document.removeEventListener('visibilitychange', onVisibility);
		host.removeEventListener('pointermove', onPointerMove);
		resizeObserver.disconnect();
		stopSpeaking();
		if (audioCtx) {
			void audioCtx.close().catch(() => {});
			audioCtx = null;
		}
		try {
			VRMUtils.deepDispose(vrm.scene);
		} catch {
			void 0;
		}
		renderer.dispose();
		canvas.remove();
	};

	void currentState;
	void setState;

	return {
		setState,
		speak,
		stopSpeaking,
		pointAt,
		destroy,
	};
}
