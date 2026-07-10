import * as THREE from 'three';

export interface PlayOptions {
	fade?: number;
	loop?: boolean;
	timeScale?: number;
}

function syncPhase(
	from: THREE.AnimationAction,
	to: THREE.AnimationAction,
): void {
	const fd = from.getClip().duration;
	const td = to.getClip().duration;
	if (fd <= 0 || td <= 0) return;
	to.time = ((from.time % fd) / fd) * td;
}

export class CharacterAnimator {
	readonly mixer: THREE.AnimationMixer;
	private readonly actions = new Map<string, THREE.AnimationAction>();
	private readonly additive = new Map<string, THREE.AnimationAction>();
	private base: THREE.AnimationAction | null = null;
	private baseName = '';

	constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
		this.mixer = new THREE.AnimationMixer(root);
		for (const clip of clips) {
			this.actions.set(clip.name, this.mixer.clipAction(clip));
		}
	}

	has(name: string): boolean {
		return this.actions.has(name);
	}

	list(): string[] {
		return [...this.actions.keys()];
	}

	/** Crossfade the base (locomotion/stance) layer to a looping clip. */
	play(name: string, opts: PlayOptions = {}): void {
		const next = this.actions.get(name);
		if (!next) return;
		// Re-play if the base got stuck (e.g. StrictMode remount stopped it).
		if (next === this.base && next.isRunning()) return;
		const fade = opts.fade ?? 0.2;
		const prev = this.base;
		next.reset()
			.setEffectiveTimeScale(opts.timeScale ?? 1)
			.setEffectiveWeight(1)
			.setLoop(
				opts.loop === false ? THREE.LoopOnce : THREE.LoopRepeat,
				Infinity,
			)
			.fadeIn(fade)
			.play();
		if (prev && prev !== next) prev.fadeOut(fade);
		this.base = next;
		this.baseName = name;
	}

	current(): string {
		return this.baseName;
	}

	/** Play a one-shot clip over the base; resolves when it finishes. */
	playOnce(name: string, fade = 0.12): Promise<void> {
		const action = this.actions.get(name);
		if (!action) return Promise.resolve();
		return new Promise((resolve) => {
			const onFinished = (e: { action: THREE.AnimationAction }) => {
				if (e.action !== action) return;
				this.mixer.removeEventListener('finished', onFinished);
				action.fadeOut(fade);
				resolve();
			};
			this.mixer.addEventListener('finished', onFinished);
			action.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(1);
			action.clampWhenFinished = true;
			action.fadeIn(fade).play();
		});
	}

	/** Continuous blend between two looping clips (e.g. walk↔run), phase-synced. */
	blend(a: string, b: string, alpha: number): void {
		const wa = this.actions.get(a);
		const wb = this.actions.get(b);
		if (!wa || !wb) return;
		alpha = THREE.MathUtils.clamp(alpha, 0, 1);
		if (!wa.isRunning())
			wa.reset().setLoop(THREE.LoopRepeat, Infinity).play();
		if (!wb.isRunning()) {
			wb.reset().setLoop(THREE.LoopRepeat, Infinity).play();
			syncPhase(wa, wb);
		}
		wa.setEffectiveWeight(1 - alpha);
		wb.setEffectiveWeight(alpha);
		this.base = alpha > 0.5 ? wb : wa;
		this.baseName = alpha > 0.5 ? b : a;
	}

	/** Register an additive overlay clip (recoil/breathing/flinch). */
	registerAdditive(name: string, reference?: THREE.AnimationClip): void {
		const src = this.actions.get(name);
		if (!src || this.additive.has(name)) return;
		const clip = THREE.AnimationUtils.makeClipAdditive(
			src.getClip().clone(),
			0,
			reference,
			this.mixer.time,
		);
		const action = this.mixer.clipAction(clip);
		action.blendMode = THREE.AdditiveAnimationBlendMode;
		action.setLoop(THREE.LoopOnce, 1);
		action.clampWhenFinished = true;
		this.additive.set(name, action);
	}

	/** Fire a one-shot additive overlay on top of whatever the base is doing. */
	pulseAdditive(name: string, weight = 1): void {
		const action = this.additive.get(name);
		if (!action) return;
		action.reset().setEffectiveWeight(weight).play();
	}

	update(dt: number): void {
		this.mixer.update(dt);
	}

	dispose(): void {
		this.mixer.stopAllAction();
	}
}
