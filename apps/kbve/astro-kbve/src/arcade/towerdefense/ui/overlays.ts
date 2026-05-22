import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH } from '../config';

const HOTKEY_LINES = [
	'KEYBINDS',
	'',
	'1-0  Select build',
	'ESC  Cancel',
	'N    Restart (resumes save)',
	'SHIFT+N  Wipe save + restart',
	'R    Restart on game over',
	'P / SPACE  Pause',
	'M    Toggle audio',
	'F1   Debug overlay',
	'F5   Reroll map',
	'?    Toggle this panel',
	'',
	'Click building to upgrade',
];

export class HotkeyOverlay {
	private container: Phaser.GameObjects.Container;
	private visible = false;

	constructor(scene: Phaser.Scene) {
		this.container = scene.add.container(BASE_WIDTH / 2, BASE_HEIGHT / 2);
		this.container.setDepth(600).setVisible(false);
		const bg = scene.add
			.rectangle(0, 0, 320, 280, 0x0d1117, 0.92)
			.setStrokeStyle(2, 0x4299e1, 0.8)
			.setOrigin(0.5);
		this.container.add(bg);
		const text = scene.add
			.text(0, 0, HOTKEY_LINES.join('\n'), {
				fontFamily: 'monospace',
				fontSize: '14px',
				color: '#f7fafc',
				align: 'left',
			})
			.setOrigin(0.5);
		this.container.add(text);
	}

	toggle(): void {
		this.visible = !this.visible;
		this.container.setVisible(this.visible);
	}
}

export class PauseOverlay {
	private container: Phaser.GameObjects.Container;
	private visible = false;

	constructor(scene: Phaser.Scene) {
		this.container = scene.add.container(0, 0);
		this.container.setDepth(550).setVisible(false);
		const veil = scene.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				BASE_WIDTH,
				BASE_HEIGHT,
				0x000000,
				0.4,
			)
			.setOrigin(0.5);
		this.container.add(veil);
		const label = scene.add
			.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 12, 'PAUSED', {
				fontFamily: 'monospace',
				fontSize: '56px',
				color: '#f7fafc',
				fontStyle: 'bold',
				stroke: '#000000',
				strokeThickness: 6,
			})
			.setOrigin(0.5);
		this.container.add(label);
		const hint = scene.add
			.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 36, 'P / SPACE to resume', {
				fontFamily: 'monospace',
				fontSize: '16px',
				color: '#a0aec0',
			})
			.setOrigin(0.5);
		this.container.add(hint);
	}

	setPaused(paused: boolean): void {
		if (this.visible === paused) return;
		this.visible = paused;
		this.container.setVisible(paused);
	}
}
