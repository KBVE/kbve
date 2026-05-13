import Phaser from 'phaser';

import { collectNewDealPlacements } from './dealQueue';

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
	enabled: boolean;
}

export class DealerAnimation {
	private readonly flyingCardViews: Phaser.GameObjects.Image[] = [];
	private readonly dealQueue: CardPlacement[] = [];
	private nextFlyingCardIndex = 0;
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

		if (!this.options.enabled) return;

		const dealCount = collectNewDealPlacements(
			this.dealQueue,
			dealerCards,
			playerCards,
			previousDealerCount,
			previousPlayerCount,
		);
		if (dealCount === 0) return;

		for (let index = 0; index < dealCount; index++) {
			this.animateCardFromShoe(this.dealQueue[index], index);
		}
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
		const viewCount = this.flyingCardViews.length;
		for (let offset = 0; offset < viewCount; offset++) {
			const index = (this.nextFlyingCardIndex + offset) % viewCount;
			const view = this.flyingCardViews[index];
			if (!view.active) {
				this.nextFlyingCardIndex = (index + 1) % viewCount;
				return view;
			}
		}

		const view = this.scene.add
			.image(0, 0, this.options.cardBackTextureKey)
			.setOrigin(0)
			.setVisible(false)
			.setActive(false);
		this.flyingCardViews.push(view);
		this.nextFlyingCardIndex = 0;
		this.layer.add(view);
		return view;
	}
}
