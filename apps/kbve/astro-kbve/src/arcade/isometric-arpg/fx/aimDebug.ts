import Phaser from 'phaser';
import { DEPTH_UI } from '../config';
import { CLASS_ANGLES } from '../entities/classes';

/**
 * Debug aim overlay: a fixed screen compass that draws all 16 sheet directions
 * and highlights the live aim, plus a degree/sheet readout that floats above the
 * ranger. Purely diagnostic — gated behind DEBUG_AIM. Helps spot facing skew
 * (e.g. one diagonal reading a few degrees off the others).
 *
 * The compass maps a screen-space *aim degree* (0=N/up, CW) onto the iso ground
 * so the needle points where the shot actually goes on screen.
 */
export class AimDebug {
	private compass: Phaser.GameObjects.Graphics;
	private needle: Phaser.GameObjects.Graphics;
	private readout: Phaser.GameObjects.Text;
	private cx = 0;
	private cy = 0;
	private readonly r = 46;

	constructor(private scene: Phaser.Scene) {
		this.compass = scene.add
			.graphics()
			.setScrollFactor(0)
			.setDepth(DEPTH_UI + 50);
		this.needle = scene.add
			.graphics()
			.setScrollFactor(0)
			.setDepth(DEPTH_UI + 51);
		this.readout = scene.add
			.text(0, 0, '', {
				fontFamily: 'monospace',
				fontSize: '12px',
				color: '#fde68a',
				stroke: '#000000',
				strokeThickness: 3,
			})
			.setOrigin(0.5, 1)
			.setDepth(DEPTH_UI + 52);
		this.layout();
		this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
		this.drawCompass();
	}

	private layout = () => {
		const cam = this.scene.cameras.main;
		this.cx = cam.width - this.r - 18;
		this.cy = cam.height - this.r - 18;
		this.drawCompass();
	};

	/** The fixed compass face: ring + 16 ticks + N/E/S/W labels (drawn once). */
	private drawCompass() {
		const g = this.compass;
		g.clear();
		g.fillStyle(0x000000, 0.45);
		g.fillCircle(this.cx, this.cy, this.r + 6);
		g.lineStyle(1.5, 0x4c5a78, 0.9);
		g.strokeCircle(this.cx, this.cy, this.r);
		// 16 ticks at the sheet directions.
		for (let i = 0; i < 16; i++) {
			const deg = i * 22.5;
			const p0 = this.point(deg, this.r - 6);
			const p1 = this.point(deg, this.r);
			g.lineStyle(i % 4 === 0 ? 2 : 1, 0x9fb3d8, i % 4 === 0 ? 1 : 0.6);
			g.beginPath();
			g.moveTo(p0.x, p0.y);
			g.lineTo(p1.x, p1.y);
			g.strokePath();
		}
	}

	/**
	 * Screen point on the compass for an aim degree. 0°=N(up), increasing
	 * clockwise — matches facingDegFromDelta. The needle is drawn flat (no iso
	 * squash) so the raw degree is easy to read against the ticks.
	 */
	private point(deg: number, radius: number) {
		const rad = ((deg - 90) * Math.PI) / 180; // 0°=up
		return {
			x: this.cx + Math.cos(rad) * radius,
			y: this.cy + Math.sin(rad) * radius,
		};
	}

	/** Update the live needle + above-bow readout for the current aim. */
	update(
		aimDeg: number,
		sheetAngle: string,
		bowX: number,
		bowY: number,
	): void {
		const tip = this.point(aimDeg, this.r - 3);
		this.needle.clear();
		this.needle.lineStyle(2.5, 0xfde68a, 1);
		this.needle.beginPath();
		this.needle.moveTo(this.cx, this.cy);
		this.needle.lineTo(tip.x, tip.y);
		this.needle.strokePath();
		this.needle.fillStyle(0xfde68a, 1);
		this.needle.fillCircle(tip.x, tip.y, 3);

		const idx = (CLASS_ANGLES as readonly string[]).indexOf(sheetAngle);
		this.readout.setText(`${aimDeg.toFixed(0)}°  ${sheetAngle} [${idx}]`);
		this.readout.setPosition(bowX, bowY);
	}

	destroy(): void {
		this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
		this.compass.destroy();
		this.needle.destroy();
		this.readout.destroy();
	}
}
