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
	private readonly masked = new Map<string, THREE.AnimationAction>();
	private readonly activeBase = new Set<THREE.AnimationAction>();
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

	duration(name: string): number {
		return this.actions.get(name)?.getClip().duration ?? 0;
	}

	play(name: string, opts: PlayOptions = {}): void {
		const next = this.actions.get(name);
		if (!next) return;

		if (
			next === this.base &&
			next.isRunning() &&
			this.activeBase.size === 1
		)
			return;
		const fade = opts.fade ?? 0.2;
		const once = opts.loop === false;
		const loop = once ? THREE.LoopOnce : THREE.LoopRepeat;

		next.clampWhenFinished = once;
		if (next.isRunning() && this.activeBase.has(next)) {
			next.setEffectiveTimeScale(opts.timeScale ?? 1)
				.setLoop(loop, Infinity)
				.stopFading();
			next.setEffectiveWeight(1);
		} else {
			next.reset()
				.setEffectiveTimeScale(opts.timeScale ?? 1)
				.setEffectiveWeight(1)
				.setLoop(loop, Infinity)
				.fadeIn(fade)
				.play();
		}
		for (const a of this.activeBase) if (a !== next) a.fadeOut(fade);
		this.activeBase.clear();
		this.activeBase.add(next);
		this.base = next;
		this.baseName = name;
	}

	current(): string {
		return this.baseName;
	}

	setBaseTimeScale(ts: number): void {
		this.base?.setEffectiveTimeScale(ts);
	}

	setLocomotionReverse(reverse: boolean): void {
		const sign = reverse ? -1 : 1;
		for (const a of this.activeBase) {
			const ts = a.getEffectiveTimeScale();
			if (Math.sign(ts) !== sign)
				a.setEffectiveTimeScale(Math.abs(ts) * sign || sign);
		}
	}

	playOnce(
		name: string,
		fade = 0.12,
		timeScale = 1,
		fadeOut = fade,
	): Promise<void> {
		const action = this.actions.get(name);
		if (!action) return Promise.resolve();
		return new Promise((resolve) => {
			const onFinished = (e: { action: THREE.AnimationAction }) => {
				if (e.action !== action) return;
				this.mixer.removeEventListener('finished', onFinished);
				action.fadeOut(fadeOut);
				resolve();
			};
			this.mixer.addEventListener('finished', onFinished);
			action
				.reset()
				.setLoop(THREE.LoopOnce, 1)
				.setEffectiveWeight(1)
				.setEffectiveTimeScale(timeScale);
			action.clampWhenFinished = true;
			action.fadeIn(fade).play();
		});
	}

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
		for (const act of this.activeBase)
			if (act !== wa && act !== wb) act.fadeOut(0.15);
		this.activeBase.clear();
		this.activeBase.add(wa);
		this.activeBase.add(wb);
		this.base = alpha > 0.5 ? wb : wa;
		this.baseName = alpha > 0.5 ? b : a;
	}

	registerMasked(
		name: string,
		srcName: string,
		keepBone: (boneName: string) => boolean,
	): boolean {
		if (this.masked.has(name)) return true;
		const src = this.actions.get(srcName);
		if (!src) return false;
		const clip = src.getClip().clone();
		clip.tracks = clip.tracks.filter((t) => keepBone(t.name.split('.')[0]));
		if (!clip.tracks.length) return false;
		clip.name = name;
		const action = this.mixer.clipAction(clip);
		action.setLoop(THREE.LoopOnce, 1);
		this.masked.set(name, action);
		return true;
	}

	holdMasked(
		name: string,
		on: boolean,
		loop = true,
		frac = 0.5,
		fade = 0.15,
	): void {
		const action = this.masked.get(name);
		if (!action) return;
		if (on) {
			if (action.isRunning() && action.getEffectiveWeight() > 0.99)
				return;
			action.reset().setEffectiveWeight(1);
			if (loop) {
				action.setLoop(THREE.LoopRepeat, Infinity);
			} else {
				action.setLoop(THREE.LoopOnce, 1);
				action.clampWhenFinished = true;
				action.time = frac * action.getClip().duration;
				action.paused = true;
			}
			action.fadeIn(fade).play();
		} else if (action.isRunning()) {
			action.paused = false;
			action.fadeOut(fade);
		}
	}

	playMaskedOnce(
		name: string,
		fade = 0.12,
		timeScale = 1,
		fadeOut = fade,
	): Promise<void> {
		const action = this.masked.get(name);
		if (!action) return Promise.resolve();
		return new Promise((resolve) => {
			const onFinished = (e: { action: THREE.AnimationAction }) => {
				if (e.action !== action) return;
				this.mixer.removeEventListener('finished', onFinished);
				action.fadeOut(fadeOut);
				resolve();
			};
			this.mixer.addEventListener('finished', onFinished);
			action
				.reset()
				.setLoop(THREE.LoopOnce, 1)
				.setEffectiveWeight(1)
				.setEffectiveTimeScale(timeScale);
			action.clampWhenFinished = false;
			action.fadeIn(fade).play();
		});
	}

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
		this.activeBase.clear();
	}
}
