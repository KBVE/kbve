import Phaser from 'phaser';

/**
 * A lazily-loaded set of GPU textures (one creature's packed sheets, a prop
 * atlas, …) keyed by `id`. `load` queues the files onto the scene loader,
 * `register` builds derived state (anims) once they arrive, `unload` frees both,
 * and `isLoaded` reports whether the textures are already resident.
 */
export interface TextureResource {
	id: string;
	load(scene: Phaser.Scene): void;
	register(scene: Phaser.Scene): void;
	unload(scene: Phaser.Scene): void;
	isLoaded(scene: Phaser.Scene): boolean;
}

/**
 * Reference-counted, lazy texture residency. Streaming entities load their
 * textures on first spawn and free them a grace period after the last instance
 * is gone, so VRAM tracks what's on-screen instead of the whole catalog (apex's
 * eight 4096² sheets + the wyvern variants would otherwise all stay resident).
 *
 * Loads are batched: `acquire` marks a resource wanted, `tick` flushes the
 * pending set onto the scene loader in one pass and registers each resource when
 * its files land (firing any queued `onReady`). `tick` also performs the grace
 * unloads, handing each freed id to `onUnload` so the caller can drain its pool.
 */
export class TextureResidency {
	private resources = new Map<string, TextureResource>();
	private refs = new Map<string, number>();
	private ready = new Set<string>();
	private toLoad = new Set<string>();
	private pending = new Map<string, Array<() => void>>();
	private unloadAt = new Map<string, number>();
	private loading = false;

	constructor(
		private scene: Phaser.Scene,
		private graceMs = 8000,
	) {}

	/**
	 * Claim a resource for one instance. Returns true if its textures are already
	 * resident (caller can use them now); false if a load was queued — `onReady`
	 * fires once the textures land so the caller can (re)apply them to its sprite.
	 */
	acquire(res: TextureResource, onReady?: () => void): boolean {
		const { id } = res;
		this.resources.set(id, res);
		this.refs.set(id, (this.refs.get(id) ?? 0) + 1);
		this.unloadAt.delete(id);
		if (this.ready.has(id)) return true;
		if (res.isLoaded(this.scene)) {
			res.register(this.scene);
			this.ready.add(id);
			return true;
		}
		if (onReady) {
			const list = this.pending.get(id) ?? [];
			list.push(onReady);
			this.pending.set(id, list);
		}
		this.toLoad.add(id);
		return false;
	}

	/** Drop one instance's claim; the resource unloads `graceMs` after it hits 0. */
	release(id: string): void {
		const n = (this.refs.get(id) ?? 0) - 1;
		if (n > 0) {
			this.refs.set(id, n);
			return;
		}
		this.refs.delete(id);
		if (this.ready.has(id)) {
			this.unloadAt.set(id, this.scene.time.now + this.graceMs);
		}
	}

	/**
	 * Flush queued loads and run grace unloads. Call once per frame. `onUnload`
	 * is invoked for each freed id BEFORE its textures are removed, so the caller
	 * can destroy any pooled sprites still holding them.
	 */
	tick(onUnload?: (id: string) => void): void {
		if (
			this.toLoad.size > 0 &&
			!this.loading &&
			!this.scene.load.isLoading()
		) {
			this.loading = true;
			for (const id of this.toLoad)
				this.resources.get(id)?.load(this.scene);
			this.toLoad.clear();
			this.scene.load.once(Phaser.Loader.Events.COMPLETE, () =>
				this.onLoadComplete(),
			);
			this.scene.load.start();
		}
		if (this.unloadAt.size > 0) {
			const now = this.scene.time.now;
			for (const [id, at] of [...this.unloadAt]) {
				if (now < at) continue;
				this.unloadAt.delete(id);
				if ((this.refs.get(id) ?? 0) > 0) continue;
				onUnload?.(id);
				this.resources.get(id)?.unload(this.scene);
				this.ready.delete(id);
			}
		}
	}

	private onLoadComplete(): void {
		this.loading = false;
		for (const [id, res] of this.resources) {
			if (this.ready.has(id) || !res.isLoaded(this.scene)) continue;
			res.register(this.scene);
			this.ready.add(id);
			const cbs = this.pending.get(id);
			this.pending.delete(id);
			cbs?.forEach((cb) => cb());
		}
	}
}
