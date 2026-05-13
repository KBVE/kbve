import Phaser from 'phaser';

export class CardPool {
	private readonly views: Phaser.GameObjects.Image[] = [];
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
		const view = this.getView();
		view.setTexture(textureKey);
		view.setPosition(x, y);
		view.setVisible(true);
		view.setActive(true);
	}

	hideUnused() {
		for (let i = this.activeViews; i < this.views.length; i++) {
			this.views[i].setVisible(false);
			this.views[i].setActive(false);
		}
	}

	private getView(): Phaser.GameObjects.Image {
		const view =
			this.views[this.activeViews] ??
			this.scene.add.image(0, 0, this.fallbackTextureKey).setOrigin(0);

		if (!this.views[this.activeViews]) {
			this.views.push(view);
			this.layer.add(view);
		}

		this.activeViews++;
		return view;
	}
}
