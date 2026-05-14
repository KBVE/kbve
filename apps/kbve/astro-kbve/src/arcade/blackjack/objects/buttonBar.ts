import Phaser from 'phaser';
import { FONT } from '../config';

export const BUTTON_TEXTURE_SIZE = {
	width: 104,
	height: 40,
	radius: 8,
} as const;

export type ButtonKey =
	| 'deal'
	| 'hit'
	| 'stand'
	| 'double'
	| 'betDown'
	| 'betUp'
	| 'next'
	| 'new';

export interface ButtonSpec {
	key: ButtonKey;
	label: string;
	x: number;
	y: number;
	w: number;
	enabled: () => boolean;
	action: () => void;
}

interface ButtonView {
	spec: ButtonSpec;
	box: Phaser.GameObjects.Image;
	text: Phaser.GameObjects.Text;
	lastEnabled: boolean | null;
	lastTextAlpha: number | null;
}

export class ButtonBar {
	private readonly views: ButtonView[] = [];
	private readonly viewsByKey = new Map<ButtonKey, ButtonView>();

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly layer: Phaser.GameObjects.Container,
		private readonly textureKey: (enabled: boolean) => string,
		private readonly onAction: () => void,
	) {}

	create(specs: readonly ButtonSpec[]) {
		for (const spec of specs) {
			const box = this.scene.add
				.image(spec.x, spec.y, this.textureKey(spec.enabled()))
				.setOrigin(0)
				.setDisplaySize(spec.w, BUTTON_TEXTURE_SIZE.height);
			const text = this.scene.add
				.text(spec.x + spec.w / 2, spec.y + 20, spec.label, {
					fontFamily: FONT.sans,
					fontSize: '16px',
					color: '#ffffff',
				})
				.setOrigin(0.5);

			const hitArea = this.scene.add
				.zone(spec.x, spec.y, spec.w, BUTTON_TEXTURE_SIZE.height)
				.setOrigin(0)
				.setInteractive({ useHandCursor: true });
			hitArea.on('pointerup', () => {
				if (!spec.enabled()) return;
				spec.action();
				this.onAction();
			});

			this.layer.add([box, text, hitArea]);
			const view = {
				spec,
				box,
				text,
				lastEnabled: null,
				lastTextAlpha: null,
			};
			this.views.push(view);
			this.viewsByKey.set(spec.key, view);
		}
	}

	run(key: ButtonKey): boolean {
		const button = this.viewsByKey.get(key);
		if (!button || !button.spec.enabled()) return false;
		button.spec.action();
		return true;
	}

	update() {
		for (const view of this.views) {
			const enabled = view.spec.enabled();
			if (view.lastEnabled !== enabled) {
				view.box.setTexture(this.textureKey(enabled));
				view.lastEnabled = enabled;
			}
			const textAlpha = enabled ? 1 : 0.42;
			if (view.lastTextAlpha !== textAlpha) {
				view.text.setAlpha(textAlpha);
				view.lastTextAlpha = textAlpha;
			}
		}
	}
}
