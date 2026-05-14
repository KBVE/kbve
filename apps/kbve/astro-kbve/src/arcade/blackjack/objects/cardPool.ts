import Phaser from 'phaser';

export class CardPool {
	private readonly views: Phaser.GameObjects.Image[] = [];
	private readonly textureKeys: string[] = [];
	private readonly xPositions: number[] = [];
	private readonly yPositions: number[] = [];
	private activeViews = 0;

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly layer: Phaser.GameObjects.Container,
		private readonly fallbackTextureKey: string,
	) {}

	begin() {
		this.activeViews = 0;
	}

	place(textureKey: string, x: number, y: number) {
		const index = this.activeViews;
		const view = this.getView(index);
		if (this.textureKeys[index] !== textureKey) {
			view.setTexture(textureKey);
			this.textureKeys[index] = textureKey;
		}
		if (this.xPositions[index] !== x || this.yPositions[index] !== y) {
			view.setPosition(x, y);
			this.xPositions[index] = x;
			this.yPositions[index] = y;
		}
		if (!view.visible) view.setVisible(true);
		if (!view.active) view.setActive(true);
		this.activeViews++;
	}

	hideUnused() {
		for (let i = this.activeViews; i < this.views.length; i++) {
			this.views[i].setVisible(false);
			this.views[i].setActive(false);
		}
	}

	private getView(index: number): Phaser.GameObjects.Image {
		const view =
			this.views[index] ??
			this.scene.add.image(0, 0, this.fallbackTextureKey).setOrigin(0);

		if (!this.views[index]) {
			this.views.push(view);
			this.layer.add(view);
		}

		return view;
	}
}
