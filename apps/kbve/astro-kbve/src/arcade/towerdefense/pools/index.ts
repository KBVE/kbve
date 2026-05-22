import type Phaser from 'phaser';

const DEFAULT_CAP = 256;

export class ArcPool {
	private pool: Phaser.GameObjects.Arc[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Arc {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled
				.setPosition(x, y)
				.setRadius(radius)
				.setFillStyle(color, alpha)
				.setStrokeStyle();
			pooled.setActive(true).setVisible(true).setAlpha(1).setScale(1);
			return pooled;
		}
		return this.scene.add.circle(x, y, radius, color, alpha);
	}

	release(sprite: Phaser.GameObjects.Arc): void {
		if (this.pool.length >= this.cap) {
			sprite.destroy();
			return;
		}
		sprite
			.setActive(false)
			.setVisible(false)
			.setStrokeStyle()
			.setPosition(-1000, -1000);
		this.pool.push(sprite);
	}
}

export class ProjectileSpritePool {
	private pool: Phaser.GameObjects.Arc[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(
		x: number,
		y: number,
		radius: number,
		color: number,
	): Phaser.GameObjects.Arc {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled.setPosition(x, y);
			pooled.setRadius(radius);
			pooled.setFillStyle(color);
			pooled.setActive(true);
			pooled.setVisible(true);
			return pooled;
		}
		return this.scene.add.circle(x, y, radius, color);
	}

	release(sprite: Phaser.GameObjects.Arc): void {
		if (this.pool.length >= this.cap) {
			sprite.destroy();
			return;
		}
		sprite.setActive(false);
		sprite.setVisible(false);
		this.pool.push(sprite);
	}
}

export class RectPool {
	private pool: Phaser.GameObjects.Rectangle[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(
		x: number,
		y: number,
		w: number,
		h: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Rectangle {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled
				.setPosition(x, y)
				.setSize(w, h)
				.setFillStyle(color, alpha)
				.setOrigin(0.5);
			pooled.setActive(true).setVisible(true).setAlpha(1).setScale(1);
			return pooled;
		}
		return this.scene.add.rectangle(x, y, w, h, color, alpha);
	}

	release(rect: Phaser.GameObjects.Rectangle): void {
		if (this.pool.length >= this.cap) {
			rect.destroy();
			return;
		}
		rect.setActive(false)
			.setVisible(false)
			.setStrokeStyle()
			.setPosition(-1000, -1000);
		this.pool.push(rect);
	}
}

export class GraphicsPool {
	private pool: Phaser.GameObjects.Graphics[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(): Phaser.GameObjects.Graphics {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled.clear();
			pooled.setActive(true).setVisible(true);
			return pooled;
		}
		return this.scene.add.graphics();
	}

	release(g: Phaser.GameObjects.Graphics): void {
		if (this.pool.length >= this.cap) {
			g.destroy();
			return;
		}
		g.clear();
		g.setActive(false).setVisible(false);
		this.pool.push(g);
	}
}

export class LinePool {
	private pool: Phaser.GameObjects.Line[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: number,
		alpha = 1,
		width = 2,
	): Phaser.GameObjects.Line {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled
				.setTo(x1, y1, x2, y2)
				.setStrokeStyle(width, color, alpha)
				.setLineWidth(width)
				.setOrigin(0, 0);
			pooled.setActive(true).setVisible(true).setAlpha(alpha);
			return pooled;
		}
		return this.scene.add
			.line(0, 0, x1, y1, x2, y2, color)
			.setOrigin(0, 0)
			.setLineWidth(width)
			.setAlpha(alpha);
	}

	release(line: Phaser.GameObjects.Line): void {
		if (this.pool.length >= this.cap) {
			line.destroy();
			return;
		}
		line.setActive(false).setVisible(false);
		this.pool.push(line);
	}
}

export class ImagePool {
	private pool: Phaser.GameObjects.Image[] = [];

	constructor(
		private scene: Phaser.Scene,
		private cap = DEFAULT_CAP,
	) {}

	acquire(x: number, y: number, key: string): Phaser.GameObjects.Image {
		const pooled = this.pool.pop();
		if (pooled) {
			pooled.setPosition(x, y).setTexture(key).setOrigin(0.5).clearTint();
			pooled.setActive(true).setVisible(true).setAlpha(1).setScale(1);
			return pooled;
		}
		return this.scene.add.image(x, y, key).setOrigin(0.5);
	}

	release(img: Phaser.GameObjects.Image): void {
		if (this.pool.length >= this.cap) {
			img.destroy();
			return;
		}
		img.clearTint();
		img.setActive(false)
			.setVisible(false)
			.setPosition(-1000, -1000)
			.setScale(1);
		this.pool.push(img);
	}
}

export interface GameObjectPools {
	arc: ArcPool;
	projectileSprite: ProjectileSpritePool;
	rect: RectPool;
	graphics: GraphicsPool;
	line: LinePool;
	image: ImagePool;
}

export function createGameObjectPools(scene: Phaser.Scene): GameObjectPools {
	return {
		arc: new ArcPool(scene),
		projectileSprite: new ProjectileSpritePool(scene),
		rect: new RectPool(scene),
		graphics: new GraphicsPool(scene),
		line: new LinePool(scene),
		image: new ImagePool(scene),
	};
}
