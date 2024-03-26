import { Scene } from 'phaser';

type GameActions = 'up' | 'down' | 'left' | 'right' | 'space' | 'shift';

export class KeybindsScene extends Scene {
	private keyTexts: Phaser.GameObjects.Text[] = [];
	private currentKeyBind: GameActions | null = null;
	private readonly whiteColor = '#ffffff';
	private readonly redColor = '#f00';
	private readonly greenColor = '#00ff00';
	private readonly actions: Record<GameActions, string> = {
		up: 'W',
		down: 'S',
		left: 'A',
		right: 'D',
		space: 'SPACE',
		shift: 'SHIFT',
	};

	constructor() {
		super({ key: 'Keybinds' });
	}

	create(): void {
		this.cameras.main.setBackgroundColor(0x000000);

		this.add
			.text(10, 10, 'X', { color: this.greenColor, fontSize: '32px' })
			.setInteractive()
			.on('pointerdown', () => this.scene.start('Main'));

		this.add.text(
			100,
			50,
			'Click on the action and press a key to rebind',
			{ color: this.whiteColor, fontSize: '20px' }
		);

		Object.entries(this.actions).forEach(([action, defaultKey], index) => {
			const keyName =
				localStorage.getItem(`custom${action}Key`) || defaultKey;
			const text = this.add
				.text(100, 100 + index * 40, `Set ${action}: ${keyName}`, {
					color: this.whiteColor,
					fontSize: '20px',
				})
				.setInteractive()
				.on('pointerdown', () => {
					this.currentKeyBind = action as GameActions;
					text.setColor(this.redColor);
				});

			this.keyTexts.push(text);
		});

		this.input.keyboard?.on('keydown', this.handleKeyDown.bind(this));
	}

	private handleKeyDown(event: KeyboardEvent): void {
		if (!this.currentKeyBind || !this.scene.isActive() || !this.keyTexts)
			return;
		if (['Escape', 'F5', 'Tab'].includes(event.code)) {
			this.resetCurrentKeyBind();
			return;
		}

		const newKey =
			event.code === 'Space' ? 'SPACE' : event.key.toUpperCase();
		localStorage.setItem(`custom${this.currentKeyBind}Key`, newKey);
		this.updateKeyText(this.currentKeyBind, newKey);
		this.resetCurrentKeyBind();
	}

	private updateKeyText(action: GameActions, newKey: string): void {
		const textToUpdate = this.keyTexts?.find(
			(text) => text.text.startsWith(`Set ${action}`) && text.active
		);

		if (textToUpdate) {
			textToUpdate
				.setText(`Set ${action}: ${newKey}`)
				.setColor(this.whiteColor);
		}
	}

	private resetCurrentKeyBind(): void {
		this.currentKeyBind = null;
	}
}
