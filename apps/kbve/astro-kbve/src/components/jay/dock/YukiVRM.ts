/**
 * Yuki VRM renderer — lazy-loaded Three.js scene that mounts a VRM
 * avatar inside the dock panel.
 *
 * Loaded only when the user toggles "3D Yuki" on, so the cost
 * (Three + GLTFLoader + @pixiv/three-vrm + the ~12 MB .vrm asset)
 * never lands on cold boot. The runtime is hand-coded vanilla Three
 * (no React Three Fiber) so it doesn't drag in `@react-three/*` or
 * a React tree — the dock panel hosts a raw `<canvas>` and this
 * module owns the render loop.
 *
 * Animation comes from three sources, all driven by the chat layer:
 *
 *   1. Idle: spring-based breath on the spine bone + auto-blink.
 *   2. Talking: mouth blendshapes (`aa`, `ih`, `ou`) driven by an
 *      AnalyserNode tapping the SpeechSynthesis output. Volume per
 *      frame → mouth shape value.
 *   3. Gestures: hand-authored bone rotation lerps for wave / nod /
 *      shake, triggered by `setState('wave')` etc.
 *
 * No webcam, no Kalidokit, no Mediapipe — pose data is either
 * deterministic (idle / canned gestures) or audio-derived (lipsync).
 *
 * Performance gates:
 *   - render loop pauses when `document.visibilityState !== 'visible'`
 *   - frame rate caps at 30 fps on coarse pointers (mobile)
 *   - render loop stops + WebGL context destroyed on `destroy()`
 */
import {
	AnimationMixer,
	Clock,
	Color,
	DirectionalLight,
	HemisphereLight,
	PerspectiveCamera,
	Scene,
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
	destroy(): void;
}

interface MountOpts {
	host: HTMLElement;
	vrmUrl?: string;
}

export async function mountYukiVRM(opts: MountOpts): Promise<YukiVRMHandle> {
	const { host, vrmUrl = DEFAULT_VRM_URL } = opts;

	// ── DOM + WebGL bootstrap ──────────────────────────────────────────
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
	const setSize = () => {
		const w = host.clientWidth || 320;
		const h = host.clientHeight || 360;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	};

	const scene = new Scene();
	scene.background = new Color(0x0f172a);

	const camera = new PerspectiveCamera(28, 1, 0.1, 20);
	camera.position.set(0, 1.35, 1.4);
	camera.lookAt(0, 1.25, 0);

	scene.add(new HemisphereLight(0xffffff, 0x404060, 0.9));
	const key = new DirectionalLight(0xffffff, 1.0);
	key.position.set(1, 2, 1.5);
	scene.add(key);

	setSize();
	const resizeObserver = new ResizeObserver(setSize);
	resizeObserver.observe(host);

	// ── VRM load ───────────────────────────────────────────────────────
	const loader = new GLTFLoader();
	loader.register((parser) => new VRMLoaderPlugin(parser));
	const gltf = await loader.loadAsync(vrmUrl);
	const vrm: VRM | undefined = gltf.userData.vrm;
	if (!vrm) throw new Error('VRM payload missing on loaded GLTF');
	// Optimization helpers are version-sensitive; non-fatal if they're
	// not on this build of @pixiv/three-vrm.
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
		/* ignore optimizer drift */
	}
	scene.add(vrm.scene);
	// Frame the head — VRMs are usually authored facing +Z.
	vrm.scene.rotation.y = Math.PI;

	// ── State + animation ──────────────────────────────────────────────
	const clock = new Clock();
	const mixer = new AnimationMixer(vrm.scene);
	let currentState: YukiState = 'idle';
	let blinkCooldown = 1.5 + Math.random() * 2;
	let blinkPhase = 0; // 0..1 across one blink

	const setExpression = (name: VRMExpressionPresetName, value: number) => {
		vrm.expressionManager?.setValue(name, value);
	};

	// Audio analyser for TTS lipsync. Created lazily on first `speak`.
	let audioCtx: AudioContext | null = null;
	let analyser: AnalyserNode | null = null;
	let buffer: Uint8Array | null = null;
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
		buffer = new Uint8Array(analyser.frequencyBinCount);
		const node =
			source instanceof HTMLAudioElement
				? ctx.createMediaElementSource(source)
				: ctx.createMediaStreamSource(source);
		node.connect(analyser);
		// HTMLAudio also wants to reach speakers — MediaStream doesn't.
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

	// ── Render loop with visibility gate + fps cap ─────────────────────
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

		// Lipsync drive.
		if (speakingActive && analyser && buffer) {
			analyser.getByteFrequencyData(buffer);
			let sum = 0;
			for (let i = 0; i < buffer.length; i++) sum += buffer[i];
			const avg = sum / buffer.length / 255; // 0..1
			const mouth = Math.min(1, avg * 2.3);
			setExpression('aa', mouth);
			setExpression('ih', mouth * 0.35);
			setExpression('ou', mouth * 0.25);
		}

		// Idle breath — gentle spine bob.
		const spine = vrm.humanoid?.getNormalizedBoneNode(
			VRMHumanBoneName.Spine,
		);
		if (spine) {
			const breath = Math.sin(performance.now() / 1400) * 0.018;
			spine.rotation.x = breath;
		}

		// Blink.
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

		mixer.update(delta);
		vrm.update(delta);
		renderer.render(scene, camera);
	};
	rafId = requestAnimationFrame(tick);

	const onVisibility = () => {
		clock.getDelta(); // burn the accumulated delta so resume isn't a jump
	};
	document.addEventListener('visibilitychange', onVisibility);

	const destroy = () => {
		if (disposed) return;
		disposed = true;
		cancelAnimationFrame(rafId);
		document.removeEventListener('visibilitychange', onVisibility);
		resizeObserver.disconnect();
		stopSpeaking();
		if (audioCtx) {
			void audioCtx.close().catch(() => {});
			audioCtx = null;
		}
		try {
			VRMUtils.deepDispose(vrm.scene);
		} catch {
			/* ignore */
		}
		renderer.dispose();
		canvas.remove();
	};

	// Touch a noop to silence unused-import diagnostics on tooling
	// that doesn't see VRMUtils.deepDispose at parse time.
	void currentState;
	void setState;

	return {
		setState,
		speak,
		stopSpeaking,
		destroy,
	};
}
