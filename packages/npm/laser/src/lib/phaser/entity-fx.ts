import Phaser from 'phaser';

/** Quick hit-flash: white fill, settle to a hit colour, then clear. */
export function flashEntity(
	scene: Phaser.Scene,
	sprite: Phaser.GameObjects.Sprite,
	hitColor = 0xff6b6b,
): void {
	sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
	scene.time.delayedCall(60, () => sprite.setTint(hitColor));
	scene.time.delayedCall(180, () => {
		sprite.clearTint();
		sprite.setTintMode(Phaser.TintModes.MULTIPLY);
	});
}

/** Rising, fading combat/emote text that destroys itself when done. */
export function floatingText(
	scene: Phaser.Scene,
	x: number,
	y: number,
	text: string,
	color: string,
	depth: number,
): Phaser.GameObjects.Text {
	const label = scene.add
		.text(x, y, text, {
			fontFamily: 'monospace',
			fontSize: '14px',
			color,
			stroke: '#000000',
			strokeThickness: 3,
		})
		.setOrigin(0.5, 1)
		.setDepth(depth);
	scene.tweens.add({
		targets: label,
		y: y - 28,
		alpha: 0,
		duration: 900,
		ease: 'Cubic.easeOut',
		onComplete: () => label.destroy(),
	});
	return label;
}

/** Draw a health bar into an existing graphics object (green→amber→red). */
export function drawHealthBar(
	g: Phaser.GameObjects.Graphics,
	centerX: number,
	topY: number,
	hp: number,
	maxHp: number,
	width = 26,
): void {
	const pct = Math.max(0, Math.min(1, hp / maxHp));
	g.clear();
	g.fillStyle(0x000000, 0.6);
	g.fillRect(centerX - width / 2, topY, width, 4);
	g.fillStyle(pct > 0.5 ? 0x4ade80 : pct > 0.25 ? 0xfbbf24 : 0xf87171, 1);
	g.fillRect(centerX - width / 2 + 0.5, topY + 0.5, (width - 1) * pct, 3);
}

export interface CameraZoomOptions {
	min?: number;
	max?: number;
	step?: number;
}

/** Wire +/- keys and the mouse wheel to clamped main-camera zoom. */
export function attachCameraZoom(
	scene: Phaser.Scene,
	{ min = 0.6, max = 2.2, step = 0.2 }: CameraZoomOptions = {},
): void {
	const zoom = (delta: number) => {
		const cam = scene.cameras.main;
		cam.setZoom(Phaser.Math.Clamp(cam.zoom + delta, min, max));
	};
	scene.input.keyboard?.on('keydown-PLUS', () => zoom(step));
	scene.input.keyboard?.on('keydown-MINUS', () => zoom(-step));
	scene.input.on(
		'wheel',
		(_p: unknown, _o: unknown, _dx: number, dy: number) =>
			zoom(dy > 0 ? -step * 0.75 : step * 0.75),
	);
}
