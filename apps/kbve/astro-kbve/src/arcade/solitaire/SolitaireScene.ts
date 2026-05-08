// ============================================================================
// Solitaire — Phaser scene (byte-packed engine, view-object rendering)
// ============================================================================
//
// State authority: `GameState` (state.ts), all bytes. The scene inflates a
// byte to a typed `CardView` once per construction and holds onto the
// derived strings + colors. Per-frame movement only touches the Phaser
// container — no allocations, no rule-layer calls.
//
// View map keyed by `getCardId(byte)` (suit + rank, ignoring face-up flag)
// so the scene tracks "the same card" across pile movement and face flips.

import Phaser from 'phaser';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	CARD_SIZE,
	COLORS,
	FOUNDATION_GAP,
	FOUNDATION_X_START,
	STOCK_X,
	TABLEAU_FAN_Y,
	TABLEAU_FAN_Y_DOWN,
	TABLEAU_X_GAP,
	TABLEAU_X_START,
	TABLEAU_Y,
	TIMING,
	TOP_ROW_Y,
	WASTE_X,
} from './config';
import {
	type CardByte,
	type CardView as DisplayView,
	SUIT_GLYPH,
	getCardId,
	isFaceUp,
	toCardView,
} from './cards';
import { GameState } from './state';
import { canDropOnFoundation, movableRun } from './rules';

interface DropTarget {
	pile: 'tableau' | 'foundation';
	index: number;
	x: number;
	y: number;
}

interface SceneCardView {
	id: string;
	display: DisplayView;
	container: Phaser.GameObjects.Container;
	face: Phaser.GameObjects.Container;
	back: Phaser.GameObjects.Container;
	shadow: Phaser.GameObjects.Graphics;
	/** Transparent rectangle child that owns the interactive hit area.
	 * Phaser's Container hit-testing with a custom centered Rectangle was
	 * unreliable — only the top-left quadrant registered events. Using a
	 * real Rectangle child sized to the full card and centered on the
	 * container origin makes the entire visible card surface clickable. */
	hitZone: Phaser.GameObjects.Rectangle;
	restY: number;
	hovered: boolean;
}

const HOVER_LIFT = 6;
const HOVER_SCALE = 1.04;
const DRAG_SCALE = 1.08;

export class SolitaireScene extends Phaser.Scene {
	private state!: GameState;
	private views = new Map<string, SceneCardView>();
	private dropTargets: DropTarget[] = [];
	private dragging: {
		cards: CardByte[];
		fromPile: 'waste' | 'tableau';
		fromCol?: number; // negative = foundation index (encoded -idx-1)
		fromCardIndex?: number;
		startX: number;
		startY: number;
		offset: { x: number; y: number };
	} | null = null;
	private winShown = false;

	constructor() {
		super({ key: 'SolitaireScene' });
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);

		// Only fire pointer events on the topmost interactive object at the
		// pointer's position. Card stacks overlap heavily — without this,
		// hover would also fire on every card under the cursor and we'd
		// burn CPU running rule checks for cards the user can't see.
		this.input.setTopOnly(true);

		this.drawSlots();
		this.drawHud();

		this.state = new GameState();
		this.state.reset();

		this.buildAllCardViews();
		this.layoutAll(false);

		this.input.on(
			'gameobjectdown',
			(_p: unknown, obj: Phaser.GameObjects.GameObject) => {
				if (obj.getData('role') === 'stockSlot') {
					this.handleStockClick();
				}
			},
		);
	}

	// -------------------------------------------------------------------
	// Static visuals
	// -------------------------------------------------------------------

	private drawSlots() {
		const stock = this.add
			.rectangle(
				STOCK_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				CARD_SIZE.width,
				CARD_SIZE.height,
				COLORS.slot,
			)
			.setStrokeStyle(2, COLORS.slotBorder)
			.setInteractive({ useHandCursor: true });
		stock.setData('role', 'stockSlot');

		this.add
			.text(
				STOCK_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				'↻',
				{ fontSize: '36px', color: '#0e3a25' },
			)
			.setOrigin(0.5);

		this.add
			.rectangle(
				WASTE_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				CARD_SIZE.width,
				CARD_SIZE.height,
				COLORS.slot,
			)
			.setStrokeStyle(2, COLORS.slotBorder);

		// Foundations 0..3 with suit hint glyph.
		for (let i = 0; i < 4; i++) {
			const x = FOUNDATION_X_START + i * FOUNDATION_GAP;
			this.add
				.rectangle(
					x + CARD_SIZE.width / 2,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					CARD_SIZE.width,
					CARD_SIZE.height,
					COLORS.slot,
				)
				.setStrokeStyle(2, COLORS.slotBorder);
			this.add
				.text(
					x + CARD_SIZE.width / 2,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					SUIT_GLYPH[i],
					{ fontSize: '36px', color: '#0e3a25' },
				)
				.setOrigin(0.5);
		}

		// Tableau slot outlines 0..6.
		for (let i = 0; i < 7; i++) {
			const x = TABLEAU_X_START + i * TABLEAU_X_GAP;
			this.add
				.rectangle(
					x + CARD_SIZE.width / 2,
					TABLEAU_Y + CARD_SIZE.height / 2,
					CARD_SIZE.width,
					CARD_SIZE.height,
					COLORS.slot,
				)
				.setStrokeStyle(2, COLORS.slotBorder);
		}

		this.dropTargets = [];
		for (let i = 0; i < 4; i++) {
			this.dropTargets.push({
				pile: 'foundation',
				index: i,
				x: FOUNDATION_X_START + i * FOUNDATION_GAP,
				y: TOP_ROW_Y,
			});
		}
		for (let i = 0; i < 7; i++) {
			this.dropTargets.push({
				pile: 'tableau',
				index: i,
				x: TABLEAU_X_START + i * TABLEAU_X_GAP,
				y: TABLEAU_Y,
			});
		}
	}

	private drawHud() {
		this.add
			.text(
				BASE_WIDTH / 2,
				24,
				'Klondike Solitaire — drag to move · click stock to draw · double-click → foundation · N new game · Z undo',
				{
					fontSize: '13px',
					color: COLORS.hintText,
					fontFamily: 'system-ui, sans-serif',
				},
			)
			.setOrigin(0.5, 0)
			.setResolution(2);

		this.input.keyboard?.on('keydown-N', () => this.newGame());
		this.input.keyboard?.on('keydown-Z', () => this.handleUndo());
	}

	// -------------------------------------------------------------------
	// Card sprite construction
	// -------------------------------------------------------------------

	private buildAllCardViews() {
		for (const byte of this.state.allCards()) {
			const id = getCardId(byte);
			this.views.set(id, this.makeCardView(byte));
		}
	}

	private makeCardView(byte: CardByte): SceneCardView {
		const display = toCardView(byte);
		const container = this.add.container(0, 0);

		const shadow = this.add.graphics();
		shadow.fillStyle(0x000000, 0.32);
		shadow.fillRoundedRect(
			-CARD_SIZE.width / 2 + 2,
			-CARD_SIZE.height / 2 + 4,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		shadow.setVisible(false);

		const face = this.makeFace(display);
		const back = this.makeBack();

		// Transparent full-card hit zone. Lives ABOVE face/back in the child
		// stack so pointer events always land here regardless of which
		// graphics children happen to be visible. `alpha: 0.001` instead of
		// pure 0 because some Phaser builds skip render-list registration
		// for fully transparent objects, which can also drop event hit testing.
		const hitZone = this.add.rectangle(
			0,
			0,
			CARD_SIZE.width,
			CARD_SIZE.height,
			0xffffff,
			0.001,
		);
		hitZone.setOrigin(0.5);
		hitZone.setInteractive({ useHandCursor: true });

		container.add([shadow, back, face, hitZone]);
		face.setVisible(display.faceUp);
		back.setVisible(!display.faceUp);

		hitZone.setData('cardId', display.id);
		this.input.setDraggable(hitZone, true);

		const view: SceneCardView = {
			id: display.id,
			display,
			container,
			face,
			back,
			shadow,
			hitZone,
			restY: 0,
			hovered: false,
		};

		hitZone.on('pointerover', () => this.onHoverEnter(view));
		hitZone.on('pointerout', () => this.onHoverLeave(view));
		hitZone.on('dragstart', (pointer: Phaser.Input.Pointer) =>
			this.onDragStart(pointer, view),
		);
		hitZone.on('drag', (pointer: Phaser.Input.Pointer) =>
			this.onDrag(pointer),
		);
		hitZone.on('dragend', () => this.onDragEnd());
		hitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
			if (pointer.event.detail === 2) {
				this.tryAutoFoundation(view.id);
				return;
			}
			// Single click on the top of stock → draw a card. The face-down
			// stock cards cover the stock slot rectangle (setTopOnly + higher
			// depth), so the slot's gameobjectdown listener never fires once
			// the deck has cards on it. Routing the click through the top
			// card's hit zone keeps the deck-click behavior.
			const stockTop = this.state.stock[this.state.stock.length - 1];
			if (stockTop !== undefined && getCardId(stockTop) === view.id) {
				this.handleStockClick();
			}
		});

		return view;
	}

	private makeFace(d: DisplayView): Phaser.GameObjects.Container {
		const face = this.add.container(0, 0);
		const bg = this.add.graphics();
		bg.fillStyle(COLORS.cardFace, 1);
		bg.lineStyle(2, COLORS.cardBorder, 1);
		bg.fillRoundedRect(
			-CARD_SIZE.width / 2,
			-CARD_SIZE.height / 2,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		bg.strokeRoundedRect(
			-CARD_SIZE.width / 2,
			-CARD_SIZE.height / 2,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		face.add(bg);

		const colorHex = d.color === 'red' ? COLORS.suitRed : COLORS.suitBlack;
		const colorStr = `#${colorHex.toString(16).padStart(6, '0')}`;

		const rankTL = this.add
			.text(
				-CARD_SIZE.width / 2 + 8,
				-CARD_SIZE.height / 2 + 6,
				d.label.replace(d.glyph, '').trim() || d.label.slice(0, -1),
				{
					fontSize: '20px',
					color: colorStr,
					fontStyle: 'bold',
					fontFamily: 'system-ui, sans-serif',
				},
			)
			.setOrigin(0, 0)
			.setResolution(2);

		const suitTL = this.add
			.text(
				-CARD_SIZE.width / 2 + 8,
				-CARD_SIZE.height / 2 + 28,
				d.glyph,
				{
					fontSize: '18px',
					color: colorStr,
					fontFamily: 'system-ui, sans-serif',
				},
			)
			.setOrigin(0, 0)
			.setResolution(2);

		const suitCenter = this.add
			.text(0, 8, d.glyph, {
				fontSize: '46px',
				color: colorStr,
				fontFamily: 'system-ui, sans-serif',
			})
			.setOrigin(0.5)
			.setResolution(2);

		face.add([rankTL, suitTL, suitCenter]);
		return face;
	}

	private makeBack(): Phaser.GameObjects.Container {
		const back = this.add.container(0, 0);
		const bg = this.add.graphics();
		bg.fillStyle(COLORS.cardBack, 1);
		bg.lineStyle(2, COLORS.cardBorder, 1);
		bg.fillRoundedRect(
			-CARD_SIZE.width / 2,
			-CARD_SIZE.height / 2,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);
		bg.strokeRoundedRect(
			-CARD_SIZE.width / 2,
			-CARD_SIZE.height / 2,
			CARD_SIZE.width,
			CARD_SIZE.height,
			CARD_SIZE.radius,
		);

		bg.lineStyle(1, COLORS.cardBackPattern, 0.7);
		const inset = 6;
		bg.strokeRoundedRect(
			-CARD_SIZE.width / 2 + inset,
			-CARD_SIZE.height / 2 + inset,
			CARD_SIZE.width - inset * 2,
			CARD_SIZE.height - inset * 2,
			CARD_SIZE.radius - 2,
		);

		const padX = inset + 4;
		const padY = inset + 4;
		const left = -CARD_SIZE.width / 2 + padX;
		const right = CARD_SIZE.width / 2 - padX;
		const top = -CARD_SIZE.height / 2 + padY;
		const bottom = CARD_SIZE.height / 2 - padY;

		bg.lineStyle(1, COLORS.cardBackPattern, 0.55);
		const step = 10;
		for (let off = left - (bottom - top); off < right; off += step) {
			const x1 = Math.max(left, off);
			const y1 = Math.max(top, top + (left - off));
			const x2 = Math.min(right, off + (bottom - top));
			const y2 = Math.min(bottom, top + (x2 - off));
			bg.lineBetween(x1, y1, x2, y2);
		}
		for (let off = left; off < right + (bottom - top); off += step) {
			const x1 = Math.min(right, off);
			const y1 = Math.max(top, top + (off - right));
			const x2 = Math.max(left, off - (bottom - top));
			const y2 = Math.min(bottom, top + (off - x2));
			bg.lineBetween(x1, y1, x2, y2);
		}

		back.add(bg);
		return back;
	}

	// -------------------------------------------------------------------
	// Layout — called whenever state changes; cheap O(52) repositioning.
	// -------------------------------------------------------------------

	private layoutAll(animate = false) {
		this.state.stock.forEach((byte, i) => {
			const v = this.viewFor(byte);
			this.positionCard(
				v,
				STOCK_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				i,
				animate,
			);
			v.face.setVisible(false);
			v.back.setVisible(true);
		});

		this.state.waste.forEach((byte, i) => {
			const v = this.viewFor(byte);
			this.positionCard(
				v,
				WASTE_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				100 + i,
				animate,
			);
			v.face.setVisible(true);
			v.back.setVisible(false);
		});

		this.state.foundations.forEach((pile, idx) => {
			const x =
				FOUNDATION_X_START + idx * FOUNDATION_GAP + CARD_SIZE.width / 2;
			pile.forEach((byte, i) => {
				const v = this.viewFor(byte);
				this.positionCard(
					v,
					x,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					200 + idx * 20 + i,
					animate,
				);
				v.face.setVisible(true);
				v.back.setVisible(false);
			});
		});

		this.state.tableaus.forEach((column, col) => {
			const x =
				TABLEAU_X_START + col * TABLEAU_X_GAP + CARD_SIZE.width / 2;
			let y = TABLEAU_Y + CARD_SIZE.height / 2;
			column.forEach((byte, i) => {
				const v = this.viewFor(byte);
				this.positionCard(v, x, y, 400 + col * 20 + i, animate);
				const up = isFaceUp(byte);
				v.face.setVisible(up);
				v.back.setVisible(!up);
				y += up ? TABLEAU_FAN_Y : TABLEAU_FAN_Y_DOWN;
			});
		});
	}

	/** Resolve the SceneCardView for a given byte (id is suit+rank-stable). */
	private viewFor(byte: CardByte): SceneCardView {
		const v = this.views.get(getCardId(byte));
		if (!v) throw new Error(`No view for card ${getCardId(byte)}`);
		return v;
	}

	private positionCard(
		v: SceneCardView,
		x: number,
		y: number,
		depth: number,
		animate: boolean,
	) {
		v.container.setDepth(depth);
		v.restY = y;
		v.container.setScale(1);
		v.shadow.setVisible(false);
		v.hovered = false;
		if (!animate) {
			v.container.setPosition(x, y);
			return;
		}
		this.tweens.add({
			targets: v.container,
			x,
			y,
			duration: TIMING.moveMs,
			ease: 'Cubic.Out',
		});
	}

	// -------------------------------------------------------------------
	// Stock / undo
	// -------------------------------------------------------------------

	private handleStockClick() {
		this.state.drawFromStock();
		this.layoutAll(true);
	}

	private handleUndo() {
		if (this.state.undo()) {
			this.winShown = false;
			this.layoutAll(true);
		}
	}

	// -------------------------------------------------------------------
	// Hover
	// -------------------------------------------------------------------

	/** True if this card is currently grab-eligible (face-up + reachable). */
	private isInteractableTop(id: string): boolean {
		// Waste top.
		const wasteTop = this.state.waste[this.state.waste.length - 1];
		if (wasteTop !== undefined && getCardId(wasteTop) === id) return true;

		// Foundation tops.
		for (const pile of this.state.foundations) {
			const top = pile[pile.length - 1];
			if (top !== undefined && getCardId(top) === id) return true;
		}

		// Any face-up tableau card (run can grab from middle).
		for (const col of this.state.tableaus) {
			for (const byte of col) {
				if (isFaceUp(byte) && getCardId(byte) === id) return true;
			}
		}

		return false;
	}

	private onHoverEnter(view: SceneCardView) {
		if (this.dragging) return;
		if (!this.isInteractableTop(view.id)) return;
		view.hovered = true;
		this.tweens.add({
			targets: view.container,
			y: view.restY - HOVER_LIFT,
			scale: HOVER_SCALE,
			duration: 110,
			ease: 'Cubic.Out',
		});
		view.shadow.setVisible(true);
		view.shadow.setAlpha(0.6);
	}

	private onHoverLeave(view: SceneCardView) {
		if (!view.hovered) return;
		view.hovered = false;
		this.tweens.add({
			targets: view.container,
			y: view.restY,
			scale: 1,
			duration: 120,
			ease: 'Cubic.Out',
		});
		view.shadow.setVisible(false);
	}

	// -------------------------------------------------------------------
	// Drag / drop
	// -------------------------------------------------------------------

	private onDragStart(_pointer: Phaser.Input.Pointer, head: SceneCardView) {
		const id = head.id;

		// Waste top → drag single.
		const wasteTop = this.state.waste[this.state.waste.length - 1];
		if (wasteTop !== undefined && getCardId(wasteTop) === id) {
			this.beginDrag([wasteTop], 'waste', undefined, undefined, head);
			return;
		}

		// Tableau column → maybe drag a run.
		for (let col = 0; col < 7; col++) {
			const idx = this.state.tableaus[col].findIndex(
				(byte) => getCardId(byte) === id,
			);
			if (idx === -1) continue;
			const run = movableRun(this.state.tableaus[col], idx);
			if (!run) {
				this.dragging = null;
				return;
			}
			this.beginDrag(run, 'tableau', col, idx, head);
			return;
		}

		// Foundation top → drag single back to a tableau.
		for (let f = 0; f < 4; f++) {
			const top =
				this.state.foundations[f][this.state.foundations[f].length - 1];
			if (top !== undefined && getCardId(top) === id) {
				this.beginDrag([top], 'tableau', -1 - f, 0, head);
				return;
			}
		}

		this.dragging = null;
	}

	private beginDrag(
		cards: CardByte[],
		fromPile: 'waste' | 'tableau',
		fromCol: number | undefined,
		fromCardIndex: number | undefined,
		head: SceneCardView,
	) {
		this.dragging = {
			cards,
			fromPile,
			fromCol,
			fromCardIndex,
			startX: head.container.x,
			startY: head.container.y,
			offset: { x: 0, y: 0 },
		};

		cards.forEach((byte, i) => {
			const v = this.viewFor(byte);
			v.container.setDepth(10000 + i);
			v.shadow.setVisible(true);
			v.shadow.setAlpha(0.55);
			this.tweens.add({
				targets: v.container,
				scale: DRAG_SCALE,
				duration: 90,
				ease: 'Cubic.Out',
			});
		});
	}

	private onDrag(pointer: Phaser.Input.Pointer) {
		if (!this.dragging) return;
		const dx = pointer.x - (this.dragging.startX + this.dragging.offset.x);
		const dy = pointer.y - (this.dragging.startY + this.dragging.offset.y);
		for (const byte of this.dragging.cards) {
			const v = this.viewFor(byte);
			v.container.x += dx;
			v.container.y += dy;
		}
		this.dragging.offset.x = pointer.x - this.dragging.startX;
		this.dragging.offset.y = pointer.y - this.dragging.startY;
	}

	private onDragEnd() {
		if (!this.dragging) return;
		const drag = this.dragging;
		this.dragging = null;

		for (const byte of drag.cards) {
			const v = this.viewFor(byte);
			this.tweens.add({
				targets: v.container,
				scale: 1,
				duration: 90,
				ease: 'Cubic.Out',
			});
			v.shadow.setVisible(false);
		}

		const head = drag.cards[0];
		const v = this.viewFor(head);
		const cx = v.container.x;
		const cy = v.container.y;

		const chosen = this.findDropTarget(cx, cy);
		const applied = chosen ? this.applyMove(drag, chosen) : false;
		this.layoutAll(true);

		if (!applied) {
			// snap-back implicit via layoutAll
		}

		if (this.state.hasWon() && !this.winShown) {
			this.winShown = true;
			this.showWin();
		}
	}

	private findDropTarget(cx: number, cy: number): DropTarget | null {
		for (const t of this.dropTargets) {
			const tx = t.x + CARD_SIZE.width / 2;
			const ty = t.y + CARD_SIZE.height / 2;
			const hitW = CARD_SIZE.width + 24;
			if (t.pile === 'tableau') {
				const minY = ty - CARD_SIZE.height / 2 - 12;
				if (
					Math.abs(cx - tx) < hitW / 2 &&
					cy > minY &&
					cy < BASE_HEIGHT
				) {
					return t;
				}
			} else {
				const hitH = CARD_SIZE.height + 24;
				if (
					Math.abs(cx - tx) < hitW / 2 &&
					Math.abs(cy - ty) < hitH / 2
				) {
					return t;
				}
			}
		}
		return null;
	}

	private applyMove(
		drag: NonNullable<typeof this.dragging>,
		target: DropTarget,
	): boolean {
		// Foundation drag (sentinel encoded in fromCol).
		if (drag.fromCol !== undefined && drag.fromCol < 0) {
			const fromFoundation = -drag.fromCol - 1;
			if (target.pile === 'tableau') {
				return this.state.moveFoundationToTableau(
					fromFoundation,
					target.index,
				);
			}
			return false;
		}

		if (drag.fromPile === 'waste') {
			if (target.pile === 'foundation') {
				return this.state.moveWasteToFoundation(target.index);
			}
			if (target.pile === 'tableau') {
				return this.state.moveWasteToTableau(target.index);
			}
		} else if (drag.fromPile === 'tableau') {
			if (drag.cards.length === 1 && target.pile === 'foundation') {
				return this.state.moveTableauToFoundation(
					drag.fromCol!,
					target.index,
				);
			}
			if (target.pile === 'tableau') {
				return this.state.moveTableauRun(
					drag.fromCol!,
					drag.fromCardIndex!,
					target.index,
				);
			}
		}
		return false;
	}

	// -------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------

	private tryAutoFoundation(id: string) {
		const wasteTop = this.state.waste[this.state.waste.length - 1];
		if (wasteTop !== undefined && getCardId(wasteTop) === id) {
			for (let f = 0; f < 4; f++) {
				if (canDropOnFoundation(wasteTop, this.state.foundations[f])) {
					if (this.state.moveWasteToFoundation(f)) {
						this.layoutAll(true);
						return;
					}
				}
			}
			return;
		}
		for (let col = 0; col < 7; col++) {
			const top =
				this.state.tableaus[col][this.state.tableaus[col].length - 1];
			if (top !== undefined && getCardId(top) === id) {
				for (let f = 0; f < 4; f++) {
					if (canDropOnFoundation(top, this.state.foundations[f])) {
						if (this.state.moveTableauToFoundation(col, f)) {
							this.layoutAll(true);
							return;
						}
					}
				}
				return;
			}
		}
	}

	private showWin() {
		this.add
			.text(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				'You won! 🎉  Press N for new game.',
				{
					fontSize: '32px',
					color: COLORS.winText,
					fontFamily: 'system-ui, sans-serif',
					fontStyle: 'bold',
				},
			)
			.setOrigin(0.5)
			.setDepth(99999)
			.setResolution(2);
	}

	private newGame() {
		this.scene.restart();
	}
}
