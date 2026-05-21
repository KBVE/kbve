import type Phaser from 'phaser';

export interface FloatingTextOptions {
	x: number;
	y: number;
	text: string;
	color: string;
	fontSize?: string;
	rise?: number;
	duration?: number;
	depth?: number;
}

const STYLE = {
	fontFamily: 'monospace',
	fontStyle: 'bold',
	stroke: '#000000',
	strokeThickness: 3,
} as const;

export class FloatingTextPool {
	private pool: Phaser.GameObjects.Text[] = [];
	private cap: number;

	constructor(
		private scene: Phaser.Scene,
		cap = 32,
	) {
		this.cap = cap;
	}

	spawn(opts: FloatingTextOptions): void {
		const pooled = this.pool.pop();
		const fontSize = opts.fontSize ?? '18px';
		const depth = opts.depth ?? 150;
		const rise = opts.rise ?? 50;
		const duration = opts.duration ?? 700;
		const text =
			pooled ??
			this.scene.add.text(opts.x, opts.y, opts.text, {
				...STYLE,
				fontSize,
				color: opts.color,
			});
		if (pooled) {
			pooled
				.setText(opts.text)
				.setPosition(opts.x, opts.y)
				.setColor(opts.color)
				.setFontSize(fontSize)
				.setActive(true)
				.setVisible(true)
				.setAlpha(1)
				.setScale(1);
		}
		text.setOrigin(0.5).setDepth(depth);
		this.scene.tweens.add({
			targets: text,
			y: opts.y - rise,
			alpha: 0,
			duration,
			ease: 'Cubic.easeOut',
			onComplete: () => this.release(text),
		});
	}

	private release(text: Phaser.GameObjects.Text): void {
		if (this.pool.length >= this.cap) {
			text.destroy();
			return;
		}
		text.setActive(false).setVisible(false).setPosition(-1000, -1000);
		this.pool.push(text);
	}
}
