import Phaser from 'phaser';

export type HandOwner = 'dealer' | 'player';

export interface CardPlacement {
	textureKey: string;
	x: number;
	y: number;
	owner: HandOwner;
	index: number;
}

interface DealerAnimationOptions {
	cardBackTextureKey: string;
	shoePosition: {
		x: number;
		y: number;
	};
	duration: number;
	stagger: number;
}

export class DealerAnimation {
	private readonly flyingCardViews: Phaser.GameObjects.Image[] = [];
	private previousDealerCardCount = 0;
	private previousPlayerCardCount = 0;

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly layer: Phaser.GameObjects.Container,
		private readonly options: DealerAnimationOptions,
	) {}

	animateNewCards(
		dealerCards: readonly CardPlacement[],
		playerCards: readonly CardPlacement[],
	) {
		const previousDealerCount = this.previousDealerCardCount;
		const previousPlayerCount = this.previousPlayerCardCount;
		this.previousDealerCardCount = dealerCards.length;
		this.previousPlayerCardCount = playerCards.length;

		const newCards: CardPlacement[] = [];
		if (dealerCards.length > previousDealerCount) {
			newCards.push(...dealerCards.slice(previousDealerCount));
		}
		if (playerCards.length > previousPlayerCount) {
			newCards.push(...playerCards.slice(previousPlayerCount));
		}
		if (newCards.length === 0) return;

		newCards
			.sort(
				(a, b) => a.index - b.index || (a.owner === 'player' ? -1 : 1),
			)
			.forEach((placement, index) => {
				this.animateCardFromShoe(placement, index);
			});
	}

	private animateCardFromShoe(placement: CardPlacement, order: number) {
		const view = this.getFlyingCardView();
		const startX = this.options.shoePosition.x + 18;
		const startY = this.options.shoePosition.y + 16;

		view.setTexture(placement.textureKey)
			.setPosition(startX, startY)
			.setScale(0.78)
			.setAlpha(0.92)
			.setAngle(-8)
			.setVisible(true)
			.setActive(true);

		this.scene.tweens.killTweensOf(view);
		this.scene.tweens.add({
			targets: view,
			x: placement.x,
			y: placement.y,
			scale: 1,
			alpha: 0,
			angle: 0,
			duration: this.options.duration,
			delay: order * this.options.stagger,
			ease: 'Sine.easeOut',
			onComplete: () => {
				view.setVisible(false);
				view.setActive(false);
			},
		});
	}

	private getFlyingCardView(): Phaser.GameObjects.Image {
		const inactiveView = this.flyingCardViews.find((view) => !view.active);
		if (inactiveView) return inactiveView;

		const view = this.scene.add
			.image(0, 0, this.options.cardBackTextureKey)
			.setOrigin(0)
			.setVisible(false)
			.setActive(false);
		this.flyingCardViews.push(view);
		this.layer.add(view);
		return view;
	}
}
