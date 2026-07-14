import {
	AnimationMixer,
	Box3,
	Color,
	DirectionalLight,
	HemisphereLight,
	LoopOnce,
	LoopRepeat,
	MathUtils,
	Object3D,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
	VRMAnimationLoaderPlugin,
	createVRMAnimationClip,
} from '@pixiv/three-vrm-animation';

class FrameTimer {
	private prev = 0;
	private delta = 0;
	update(now: number): void {
		this.delta = this.prev ? Math.min((now - this.prev) / 1000, 0.1) : 0;
		this.prev = now;
	}
	getDelta(): number {
		return this.delta;
	}
}
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
	playAnimation(url: string, loop?: boolean, fade?: number): Promise<void>;
	stopAnimation(fade?: number): void;
	setIdleAnimation(url: string | null): void;
	destroy(): void;
}

interface MountOpts {
	host: HTMLElement;
	vrmUrl?: string;
	transparent?: boolean;
}

const REST_POSE: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
	[VRMHumanBoneName.LeftUpperArm]: [0, 0, MathUtils.degToRad(85)],
	[VRMHumanBoneName.RightUpperArm]: [0, 0, MathUtils.degToRad(-85)],
	[VRMHumanBoneName.LeftLowerArm]: [0, MathUtils.degToRad(-15), 0],
	[VRMHumanBoneName.RightLowerArm]: [0, MathUtils.degToRad(15), 0],
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

	canvas.addEventListener(
		'webglcontextlost',
		(ev) => {
			ev.preventDefault();
			console.warn('[yuki-vrm] webgl context lost');
		},
		false,
	);
	canvas.addEventListener(
		'webglcontextrestored',
		() => {
			console.warn('[yuki-vrm] webgl context restored');
		},
		false,
	);

	const scene = new Scene();
	if (!transparent) scene.background = new Color(0x0f172a);

	const camera = new PerspectiveCamera(45, 1, 0.1, 20);
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

	console.warn('[yuki-vrm] mount start', {
		vrmUrl,
		hostSize: { w: host.clientWidth, h: host.clientHeight },
		transparent,
	});

	const loader = new GLTFLoader();
	loader.register((parser) => new VRMLoaderPlugin(parser));
	loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
	let gltf;
	try {
		gltf = await loader.loadAsync(vrmUrl);
	} catch (err) {
		console.error('[yuki-vrm] loadAsync failed', vrmUrl, err);
		throw err;
	}
	const vrm: VRM | undefined = gltf.userData.vrm;
	if (!vrm) {
		console.error('[yuki-vrm] gltf has no userData.vrm', gltf);
		throw new Error('VRM payload missing on loaded GLTF');
	}
	console.warn('[yuki-vrm] gltf loaded', {
		hasVrm: !!vrm,
		hasHumanoid: !!vrm.humanoid,
		sceneChildrenBeforeAdd: scene.children.length,
	});

	try {
		(
			VRMUtils as unknown as {
				removeUnnecessaryVertices?: (s: unknown) => void;
			}
		).removeUnnecessaryVertices?.(gltf.scene);
		(
			VRMUtils as unknown as { combineSkeletons?: (s: unknown) => void }
		).combineSkeletons?.(gltf.scene);
		(VRMUtils as unknown as { rotateVRM0?: (v: VRM) => void }).rotateVRM0?.(
			vrm,
		);
	} catch (err) {
		console.warn('[yuki-vrm] VRMUtils preprocess threw', err);
	}

	scene.add(vrm.scene);
	applyRestPose(vrm);

	vrm.scene.updateMatrixWorld(true);
	const bounds = new Box3().setFromObject(vrm.scene);
	const size = new Vector3();
	bounds.getSize(size);

	const reframedY = bounds.min.y + size.y * 0.5;
	const distance = size.y * 1.7;
	camera.position.set(0, reframedY, distance);
	camera.lookAt(0, reframedY, 0);

	const gl = renderer.getContext();
	console.warn('[yuki-vrm] mount ready', {
		hasHumanoid: !!vrm.humanoid,
		sceneChildren: scene.children.length,
		canvasSize: { w: canvas.width, h: canvas.height },
		hostSize: { w: host.clientWidth, h: host.clientHeight },
		webglContextLost: gl ? gl.isContextLost() : 'no-context',
		vrmUrl,
	});

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
	lookAtTarget.position.set(0, reframedY, 0.6);
	scene.add(lookAtTarget);
	if (vrm.lookAt) vrm.lookAt.target = lookAtTarget;

	const targetWorld = new Vector3(0, reframedY, 0.6);
	const targetCurrent = new Vector3(0, reframedY, 0.6);
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

	const timer = new FrameTimer();
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
	let firstRenderLogged = false;

	const mixer = new AnimationMixer(vrm.scene);
	const clipCache = new Map<
		string,
		ReturnType<typeof createVRMAnimationClip>
	>();
	let currentAction: ReturnType<typeof mixer.clipAction> | null = null;
	let idleAnimationUrl: string | null = null;
	const DEFAULT_FADE = 0.8;
	const IDLE_RESUME_FADE = 1.0;

	mixer.addEventListener('finished', (e) => {
		const ev = e as unknown as {
			action: ReturnType<typeof mixer.clipAction>;
		};
		if (ev.action !== currentAction) return;
		if (idleAnimationUrl && !missingClipUrls.has(idleAnimationUrl)) {
			void playAnimation(idleAnimationUrl, true, IDLE_RESUME_FADE);
		} else {
			stopAnimation();
		}
	});

	const stopAnimation = (fade = DEFAULT_FADE): void => {
		if (!currentAction) {
			applyRestPose(vrm);
			return;
		}
		const action = currentAction;
		currentAction = null;
		action.fadeOut(fade);
		setTimeout(
			() => {
				action.stop();
				if (!currentAction) applyRestPose(vrm);
			},
			Math.ceil(fade * 1000) + 16,
		);
	};

	const missingClipUrls = new Set<string>();
	const loadClip = async (
		url: string,
	): Promise<ReturnType<typeof createVRMAnimationClip> | null> => {
		const cached = clipCache.get(url);
		if (cached) return cached;
		if (missingClipUrls.has(url)) return null;
		try {
			const head = await fetch(url, { method: 'HEAD' });
			if (!head.ok) {
				missingClipUrls.add(url);
				console.warn('[yuki-vrm] vrma asset missing', url, head.status);
				return null;
			}
		} catch (err) {
			missingClipUrls.add(url);
			console.warn('[yuki-vrm] vrma asset probe failed', url, err);
			return null;
		}
		try {
			const gltf = await loader.loadAsync(url);
			const animations: unknown[] =
				(gltf.userData as { vrmAnimations?: unknown[] })
					?.vrmAnimations ?? [];
			if (!animations.length) {
				missingClipUrls.add(url);
				console.warn('[yuki-vrm] no vrmAnimations in', url);
				return null;
			}
			const clip = createVRMAnimationClip(
				animations[0] as Parameters<typeof createVRMAnimationClip>[0],
				vrm,
			);
			clipCache.set(url, clip);
			return clip;
		} catch (err) {
			missingClipUrls.add(url);
			console.warn('[yuki-vrm] vrma load failed', url, err);
			return null;
		}
	};

	const playAnimation = async (
		url: string,
		loop = true,
		fade = DEFAULT_FADE,
	): Promise<void> => {
		const clip = await loadClip(url);
		if (!clip) return;
		const next = mixer.clipAction(clip);
		if (currentAction === next) {
			next.paused = false;
			return;
		}
		next.enabled = true;
		next.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
		next.clampWhenFinished = true;
		next.reset();
		if (currentAction) {
			currentAction.fadeOut(fade);
			next.fadeIn(fade);
		} else {
			next.setEffectiveWeight(1);
		}
		next.play();
		currentAction = next;
	};

	const tick = (now: number) => {
		if (disposed) return;
		rafId = requestAnimationFrame(tick);
		if (document.visibilityState !== 'visible') return;
		void active;

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

		const animationActive = currentAction !== null;
		const breath = Math.sin(now / 1400);
		const sway = Math.sin(now / 2300);
		const idleHeadDrift = Math.sin(now / 3700);

		if (!animationActive && spineBone) {
			spineBone.rotation.x = breath * 0.02 - 0.035;
			spineBone.rotation.z = sway * 0.015;
			spineBone.rotation.y = MathUtils.lerp(
				spineBone.rotation.y,
				lastPointNx * 0.12 + sway * 0.04,
				Math.min(1, delta * 4),
			);
		}
		if (!animationActive && hipsBone) {
			hipsBone.position.y = Math.sin(now / 1100) * 0.005;
			hipsBone.rotation.y = sway * 0.05;
			hipsBone.rotation.z = Math.sin(now / 3100) * 0.018;
		}
		if (
			!animationActive &&
			headBone &&
			!activeGesture &&
			currentState === 'idle'
		) {
			headBone.rotation.x = MathUtils.lerp(
				headBone.rotation.x,
				idleHeadDrift * 0.05 - 0.02,
				Math.min(1, delta * 2),
			);
			headBone.rotation.z = MathUtils.lerp(
				headBone.rotation.z,
				Math.sin(now / 5300) * 0.04,
				Math.min(1, delta * 2),
			);
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

		if (!activeGesture && currentState === 'idle') {
			const happyPulse = 0.18 + Math.sin(now / 4200) * 0.06;
			expressionTarget['happy'] = happyPulse;
			expressionTarget['relaxed'] = 0.12;
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

		mixer.update(delta);
		vrm.update(delta);
		try {
			renderer.render(scene, camera);
		} catch (err) {
			if (!firstRenderLogged) {
				console.error('[yuki-vrm] renderer.render threw', err);
				firstRenderLogged = true;
			}
			return;
		}
		if (!firstRenderLogged) {
			firstRenderLogged = true;
			const ctx = renderer.getContext();
			console.warn('[yuki-vrm] first render', {
				canvasSize: { w: canvas.width, h: canvas.height },
				canvasClientSize: {
					w: canvas.clientWidth,
					h: canvas.clientHeight,
				},
				hostSize: { w: host.clientWidth, h: host.clientHeight },
				visibility: document.visibilityState,
				webglContextLost: ctx ? ctx.isContextLost() : 'no-context',
				vrmSceneVisible: vrm.scene.visible,
			});
		}
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
		playAnimation,
		stopAnimation,
		setIdleAnimation: (url: string | null) => {
			idleAnimationUrl = url;
		},
		destroy,
	};
}
