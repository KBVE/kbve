/** Solitaire — Phaser scene. State lives in GameState; this file is render
 * + input only. Views are keyed by suit+rank so the same card sticks to
 * the same SceneCardView across pile movement. */

import Phaser from 'phaser';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	BOARD_PADDING,
	BOARD_RADIUS,
	CARD_SIZE,
	COLORS,
	FONT,
	FOUNDATION_GAP,
	FOUNDATION_X_START,
	HUD_COLORS,
	PLAY_WIDTH,
	SHOP_PRICES,
	SIDEBAR_PADDING_X,
	SIDEBAR_W,
	SIDEBAR_X,
	STATS,
	STOCK_DRAW_COUNT,
	STOCK_X,
	TABLEAU_FAN_Y,
	TABLEAU_FAN_Y_DOWN,
	TABLEAU_X_GAP,
	TABLEAU_X_START,
	TABLEAU_Y,
	TIMING,
	TOP_ROW_Y,
	WASTE_FAN_X,
	WASTE_X,
} from './config';
import {
	ALL_BONUS_BYTES,
	ALL_MONSTER_BYTES,
	BonusType,
	type CardByte,
	type CardView as DisplayView,
	FOUNDATION_SUITS,
	JOKER_BLACK_BYTE,
	JOKER_RED_BYTE,
	JokerVariant,
	MonsterKind,
	SUIT_GLYPH,
	getCardId,
	getCardIndex,
	getSuit,
	isBonus,
	isFaceUp,
	isMonster,
	toCardView,
} from './cards';
import { GameState } from './state';
import { canDropOnFoundation, canDropOnTableau, movableRun } from './rules';

interface DropTarget {
	pile: 'tableau' | 'foundation' | 'activate';
	index: number;
	x: number;
	y: number;
	w?: number;
	h?: number;
}

interface SceneCardView {
	id: string;
	display: DisplayView;
	container: Phaser.GameObjects.Container;
	face: Phaser.GameObjects.Container;
	back: Phaser.GameObjects.Container;
	shadow: Phaser.GameObjects.Graphics;
	monsterHpText?: Phaser.GameObjects.Text;
	monsterAtkText?: Phaser.GameObjects.Text;
	monsterNameText?: Phaser.GameObjects.Text;
	monsterEngagedRing?: Phaser.GameObjects.Graphics;
	peekRing: Phaser.GameObjects.Graphics;
	frozenRing: Phaser.GameObjects.Graphics;
	/** Real Rectangle child as the hit area — Phaser's Container hit-test
	 * with a custom Rectangle only fired in the top-left quadrant. */
	hitZone: Phaser.GameObjects.Rectangle;
	restY: number;
	restDepth: number;
	hovered: boolean;
	peeking: boolean;
	cardIndex: number;
}

const HOVER_LIFT = 6;
const HOVER_SCALE = 1.04;
const DRAG_SCALE = 1.08;

export class SolitaireScene extends Phaser.Scene {
	private state!: GameState;
	private viewByIndex: SceneCardView[] = new Array(64);
	private dropTargets: DropTarget[] = [];
	private foundationSlots: Phaser.GameObjects.Rectangle[] = [];
	private tableauSlots: Phaser.GameObjects.Rectangle[] = [];
	private activateSlot!: Phaser.GameObjects.Rectangle;
	private activateSlotGeom: { x: number; y: number; w: number; h: number } = {
		x: 0,
		y: 0,
		w: 0,
		h: 0,
	};
	private dragging: {
		cards: CardByte[];
		fromPile: 'waste' | 'tableau';
		/** Negative = foundation index (encoded as `-idx - 1`). */
		fromCol?: number;
		fromCardIndex?: number;
		startX: number;
		startY: number;
		offset: { x: number; y: number };
	} | null = null;
	private winShown = false;
	private winBanner: Phaser.GameObjects.Text | null = null;

	private hudScore!: Phaser.GameObjects.Text;
	private hudCombo!: Phaser.GameObjects.Text;
	private hudRound!: Phaser.GameObjects.Text;
	private hudBlind!: Phaser.GameObjects.Text;
	private hudCash!: Phaser.GameObjects.Text;
	private hudBest!: Phaser.GameObjects.Text;
	private hudHpNumber!: Phaser.GameObjects.Text;
	private hudHpBar!: Phaser.GameObjects.Graphics;
	private hudAttack!: Phaser.GameObjects.Text;
	private hudArmor!: Phaser.GameObjects.Text;

	/** Active modal layer (shop or game-over). Null when no modal showing. */
	private modal: Phaser.GameObjects.Container | null = null;

	constructor() {
		super({ key: 'SolitaireScene' });
	}

	preload() {
		this.load.json('npcdb', '/api/npcdb.json');
		this.buildMonsterPlaceholderTexture();
	}

	/** Heuristic mapping from npcdb-style stats to monster-card stats so the
	 * card combat stays manageable. Big NPC HP numbers (50+) compress to
	 * 2..6 hits; ATK compresses to 1..4 damage. */
	private scaleNpcToMonster(
		npc: { name?: string; stats?: { hp?: number; attack?: number } },
		fallback: { name: string; hp: number; atk: number },
	): { name: string; hp: number; atk: number } {
		const hp = Math.max(
			2,
			Math.min(8, Math.floor((npc.stats?.hp ?? 0) / 10)),
		);
		const atk = Math.max(
			1,
			Math.min(5, Math.floor((npc.stats?.attack ?? 0) / 2)),
		);
		return {
			name: typeof npc.name === 'string' ? npc.name : fallback.name,
			hp: hp || fallback.hp,
			atk: atk || fallback.atk,
		};
	}

	/** Pull three random enemy NPCs from the cached npcdb payload and bind
	 * them to the monster card slots. Silent no-op when the fetch failed —
	 * `MONSTER_KIND_PRESETS` keeps the state playable. */
	private bindNpcDataToMonsters() {
		const payload = this.cache.json.get('npcdb') as
			| {
					npcs?: {
						name?: string;
						stats?: Record<string, number>;
						type_flags?: number;
					}[];
			  }
			| undefined;
		const all = payload?.npcs;
		if (!Array.isArray(all) || all.length === 0) return;
		const enemies = all.filter((n) => (n.type_flags ?? 0) & 1);
		const pool = enemies.length > 0 ? enemies : all;
		const pickAt = (i: number) =>
			pool[
				(i * 7 + Math.floor(Math.random() * pool.length)) % pool.length
			];
		const goblin = pickAt(0);
		const skeleton = pickAt(1);
		const ghoul = pickAt(2);
		this.state.bindMonstersFromNpcs({
			[MonsterKind.Goblin]: this.scaleNpcToMonster(goblin, {
				name: 'Goblin',
				hp: 2,
				atk: 1,
			}),
			[MonsterKind.Skeleton]: this.scaleNpcToMonster(skeleton, {
				name: 'Skeleton',
				hp: 4,
				atk: 2,
			}),
			[MonsterKind.Ghoul]: this.scaleNpcToMonster(ghoul, {
				name: 'Ghoul',
				hp: 6,
				atk: 3,
			}),
		});
	}

	/** Skull-on-crimson placeholder for the monster portrait, generated
	 * once at preload. Swap out by overriding the `monster-placeholder`
	 * texture key once a real PNG ships. */
	private buildMonsterPlaceholderTexture() {
		const w = 70;
		const h = 90;
		const g = this.make.graphics({ x: 0, y: 0 }, false);
		g.fillStyle(0x7f1d1d, 1);
		g.fillRoundedRect(0, 0, w, h, 10);
		g.fillStyle(0x4c1010, 1);
		g.fillRoundedRect(6, 6, w - 12, h - 12, 8);
		g.fillStyle(0xfde68a, 1);
		g.fillCircle(w / 2, h / 2 - 6, 18);
		g.fillRect(w / 2 - 12, h / 2 + 6, 24, 12);
		g.fillStyle(0x4c1010, 1);
		g.fillCircle(w / 2 - 7, h / 2 - 8, 4);
		g.fillCircle(w / 2 + 7, h / 2 - 8, 4);
		g.fillRect(w / 2 - 1, h / 2 + 6, 2, 12);
		g.lineStyle(2, 0xfbbf24, 1);
		g.strokeRoundedRect(0, 0, w, h, 10);
		g.generateTexture('monster-placeholder', w, h);
		g.destroy();
	}

	create() {
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.input.setTopOnly(true);

		this.drawTableFelt();
		this.drawSlots();
		this.drawHud();

		this.state = new GameState();
		this.state.reset();
		this.bindNpcDataToMonsters();

		this.buildAllCardViews();
		this.layoutAll(false);
		this.updateHud();

		this.input.on(
			'gameobjectdown',
			(_p: unknown, obj: Phaser.GameObjects.GameObject) => {
				if (obj.getData('role') === 'stockSlot') {
					this.handleStockClick();
				}
			},
		);
	}

	private drawSlots() {
		this.drawBoards();

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
				{ fontSize: '44px', color: '#1f5e3d', fontFamily: FONT.sans },
			)
			.setOrigin(0.5)
			.setResolution(2);

		this.add
			.rectangle(
				WASTE_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				CARD_SIZE.width,
				CARD_SIZE.height,
				COLORS.slot,
			)
			.setStrokeStyle(2, COLORS.slotBorder);

		this.foundationSlots = [];
		for (let i = 0; i < 4; i++) {
			const x = FOUNDATION_X_START + i * FOUNDATION_GAP;
			const slot = this.add
				.rectangle(
					x + CARD_SIZE.width / 2,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					CARD_SIZE.width,
					CARD_SIZE.height,
					COLORS.slot,
				)
				.setStrokeStyle(2, COLORS.slotBorder);
			this.foundationSlots.push(slot);
			this.add
				.text(
					x + CARD_SIZE.width / 2,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					SUIT_GLYPH[FOUNDATION_SUITS[i]],
					{
						fontSize: '46px',
						color: '#1f5e3d',
						fontFamily: FONT.sans,
					},
				)
				.setOrigin(0.5)
				.setResolution(2);
		}

		this.tableauSlots = [];
		for (let i = 0; i < 7; i++) {
			const x = TABLEAU_X_START + i * TABLEAU_X_GAP;
			const slot = this.add
				.rectangle(
					x + CARD_SIZE.width / 2,
					TABLEAU_Y + CARD_SIZE.height / 2,
					CARD_SIZE.width,
					CARD_SIZE.height,
					COLORS.slot,
				)
				.setStrokeStyle(2, COLORS.slotBorder);
			this.tableauSlots.push(slot);
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
		/* Activate slot — geometry is filled in by drawSidebar (which runs
		 * after drawSlots). Push a placeholder so findDropTarget has the
		 * entry, then patch the coords from drawSidebar. */
		this.dropTargets.push({
			pile: 'activate',
			index: 0,
			x: 0,
			y: 0,
			w: 0,
			h: 0,
		});
	}

	/** Layered felt: outer "wood + gold trim" frame, then a soft radial
	 * vignette to fake an overhead light, then the two play-zone panels
	 * with gold borders. Result reads as a real card table instead of a
	 * flat green rectangle. */
	private drawTableFelt() {
		const g = this.add.graphics();
		g.setDepth(-200);

		g.fillStyle(COLORS.tableEdge, 1);
		g.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

		const trim = 8;
		g.fillStyle(COLORS.tableTrim, 1);
		g.fillRoundedRect(
			trim / 2,
			trim / 2,
			BASE_WIDTH - trim,
			BASE_HEIGHT - trim,
			18,
		);
		g.fillStyle(COLORS.tableTrimDark, 0.45);
		g.fillRoundedRect(
			trim / 2 + 2,
			trim / 2 + 2,
			BASE_WIDTH - trim - 4,
			BASE_HEIGHT - trim - 4,
			16,
		);

		const inset = trim + 6;
		g.fillStyle(COLORS.background, 1);
		g.fillRoundedRect(
			inset,
			inset,
			BASE_WIDTH - inset * 2,
			BASE_HEIGHT - inset * 2,
			12,
		);

		/* Fake an overhead light by stacking concentric translucent rects
		 * — cheap radial vignette without shaders. */
		const cx = BASE_WIDTH / 2;
		const cy = BASE_HEIGHT / 2;
		for (let i = 0; i < 6; i++) {
			const t = i / 6;
			const w = (BASE_WIDTH - inset * 2) * (1 - t * 0.7);
			const h = (BASE_HEIGHT - inset * 2) * (1 - t * 0.7);
			g.fillStyle(COLORS.feltCenter, 0.08);
			g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 12);
		}

		g.lineStyle(28, COLORS.feltEdge, 0.35);
		g.strokeRoundedRect(
			inset + 14,
			inset + 14,
			BASE_WIDTH - inset * 2 - 28,
			BASE_HEIGHT - inset * 2 - 28,
			10,
		);
	}

	/** Two darker felt panels — one behind the deal/discard row, one behind
	 * the tableau columns. Each board has a gold border + dark inner stroke
	 * for an inset bezel feel. */
	private drawBoards() {
		const g = this.add.graphics();
		g.setDepth(-100);

		const drawPanel = (x: number, y: number, w: number, h: number) => {
			g.fillStyle(0x000000, 0.28);
			g.fillRoundedRect(x + 2, y + 4, w, h, BOARD_RADIUS);
			g.fillStyle(COLORS.boardFill, 1);
			g.fillRoundedRect(x, y, w, h, BOARD_RADIUS);
			g.lineStyle(2, COLORS.boardInnerStroke, 1);
			g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, BOARD_RADIUS - 1);
			g.lineStyle(2, COLORS.boardBorder, 1);
			g.strokeRoundedRect(x, y, w, h, BOARD_RADIUS);
		};

		const topX = STOCK_X - BOARD_PADDING;
		const topY = TOP_ROW_Y - BOARD_PADDING;
		const topW =
			FOUNDATION_X_START +
			3 * FOUNDATION_GAP +
			CARD_SIZE.width +
			BOARD_PADDING -
			topX;
		const topH = CARD_SIZE.height + BOARD_PADDING * 2;
		drawPanel(topX, topY, topW, topH);

		const tabX = TABLEAU_X_START - BOARD_PADDING;
		const tabY = TABLEAU_Y - BOARD_PADDING;
		const tabW =
			TABLEAU_X_START +
			6 * TABLEAU_X_GAP +
			CARD_SIZE.width +
			BOARD_PADDING -
			tabX;
		const tabH = BASE_HEIGHT - tabY - BOARD_PADDING - 12;
		drawPanel(tabX, tabY, tabW, tabH);
	}

	/** Visually mark which foundation + tableau slots accept the bottom of
	 * the dragged stack. Called on dragstart. Foundations are suit-locked
	 * + reject jokers; tableau accepts jokers anywhere. Bonus cards light
	 * the activate slot only — they aren't legal anywhere else. */
	private highlightLegalDrops(headCard: CardByte, fromFoundationIdx: number) {
		if (isBonus(headCard)) {
			this.activateSlot
				.setFillStyle(COLORS.slotHighlight, 0.35)
				.setStrokeStyle(3, COLORS.slotHighlightBorder);
			return;
		}
		for (let i = 0; i < 4; i++) {
			const isSource = i === fromFoundationIdx;
			let legal = false;
			if (!isSource) {
				legal =
					getSuit(headCard) === FOUNDATION_SUITS[i] &&
					canDropOnFoundation(headCard, this.state.foundations[i]);
			}
			if (legal) {
				this.foundationSlots[i]
					.setFillStyle(COLORS.slotHighlight, 0.35)
					.setStrokeStyle(3, COLORS.slotHighlightBorder);
			}
		}
		for (let i = 0; i < 7; i++) {
			const legal = canDropOnTableau(headCard, this.state.tableaus[i]);
			if (legal) {
				this.tableauSlots[i]
					.setFillStyle(COLORS.slotHighlight, 0.35)
					.setStrokeStyle(3, COLORS.slotHighlightBorder);
			}
		}
	}

	private clearHighlights() {
		for (const slot of this.foundationSlots) {
			slot.setFillStyle(COLORS.slot, 1).setStrokeStyle(
				2,
				COLORS.slotBorder,
			);
		}
		for (const slot of this.tableauSlots) {
			slot.setFillStyle(COLORS.slot, 1).setStrokeStyle(
				2,
				COLORS.slotBorder,
			);
		}
		this.activateSlot
			.setFillStyle(COLORS.slot, 1)
			.setStrokeStyle(2, COLORS.slotBorder);
	}

	private drawHud() {
		this.drawTopHud();
		this.drawSidebar();

		this.add
			.text(
				PLAY_WIDTH / 2,
				BASE_HEIGHT - 24,
				'Drag to move  ·  Click stock to draw  ·  Double-click → foundation  ·  N new game  ·  Z undo',
				{
					fontSize: '13px',
					color: COLORS.hintText,
					fontFamily: FONT.sans,
				},
			)
			.setOrigin(0.5, 0.5)
			.setResolution(2);

		this.input.keyboard?.on('keydown-N', () => this.newGame());
		this.input.keyboard?.on('keydown-Z', () => this.handleUndo());
	}

	private drawTopHud() {
		const plateW = 360;
		const plateH = 64;
		const plateX = PLAY_WIDTH / 2 - plateW / 2;
		const plateY = 18;

		const plate = this.add.graphics();
		plate.setDepth(-150);
		plate.fillStyle(HUD_COLORS.hudBg, 0.92);
		plate.fillRoundedRect(plateX, plateY, plateW, plateH, 14);
		plate.lineStyle(2, HUD_COLORS.hudBorder, 0.9);
		plate.strokeRoundedRect(plateX, plateY, plateW, plateH, 14);
		plate.lineStyle(1, HUD_COLORS.hudBorder, 0.45);
		plate.strokeRoundedRect(
			plateX + 3,
			plateY + 3,
			plateW - 6,
			plateH - 6,
			12,
		);

		this.hudScore = this.add
			.text(PLAY_WIDTH / 2, plateY + 8, '0', {
				fontSize: '36px',
				color: HUD_COLORS.scoreText,
				fontStyle: 'bold',
				fontFamily: FONT.serif,
			})
			.setOrigin(0.5, 0)
			.setResolution(2);
		this.hudCombo = this.add
			.text(PLAY_WIDTH / 2, plateY + plateH - 18, '', {
				fontSize: '12px',
				color: HUD_COLORS.comboText,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5, 0)
			.setResolution(2);
	}

	/** Right-side panel hosting HP, combat stats, cash, and best score. */
	private drawSidebar() {
		const x = SIDEBAR_X;
		const y = 20;
		const w = SIDEBAR_W - 24;
		const h = BASE_HEIGHT - 40;

		const panel = this.add.graphics();
		panel.setDepth(-130);
		panel.fillStyle(0x000000, 0.28);
		panel.fillRoundedRect(x + 2, y + 4, w, h, BOARD_RADIUS);
		panel.fillStyle(COLORS.boardFill, 1);
		panel.fillRoundedRect(x, y, w, h, BOARD_RADIUS);
		panel.lineStyle(2, COLORS.boardInnerStroke, 1);
		panel.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, BOARD_RADIUS - 1);
		panel.lineStyle(2, COLORS.boardBorder, 1);
		panel.strokeRoundedRect(x, y, w, h, BOARD_RADIUS);

		const innerX = x + SIDEBAR_PADDING_X;
		const innerW = w - SIDEBAR_PADDING_X * 2;
		let cursorY = y + 16;

		this.add
			.text(x + w / 2, cursorY, 'STATUS', {
				fontSize: '14px',
				color: HUD_COLORS.hpText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0.5, 0)
			.setResolution(2);
		cursorY += 24;

		this.drawSidebarDivider(innerX, cursorY, innerW);
		cursorY += 12;

		this.add
			.text(innerX, cursorY, 'ROUND', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudRound = this.add
			.text(innerX + innerW, cursorY - 6, '1', {
				fontSize: '22px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);
		cursorY += 28;

		this.add
			.text(innerX, cursorY, 'TARGET', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudBlind = this.add
			.text(innerX + innerW, cursorY - 4, '200', {
				fontSize: '18px',
				color: HUD_COLORS.blindText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);
		cursorY += 28;

		this.drawSidebarDivider(innerX, cursorY, innerW);
		cursorY += 12;

		this.add
			.text(innerX, cursorY, 'HEALTH', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudHpNumber = this.add
			.text(innerX + innerW, cursorY - 6, '20 / 20', {
				fontSize: '22px',
				color: HUD_COLORS.hpText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);
		cursorY += 26;

		this.hudHpBar = this.add.graphics();
		this.hudHpBar.setDepth(-90);
		this.hpBarGeom = { x: innerX, y: cursorY, w: innerW, h: 14 };
		cursorY += 14 + 16;

		this.drawSidebarDivider(innerX, cursorY, innerW);
		cursorY += 12;

		this.add
			.text(innerX, cursorY, 'COMBAT', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		cursorY += 22;

		this.add
			.text(innerX, cursorY, 'Attack', {
				fontSize: '13px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.sans,
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudAttack = this.add
			.text(innerX + innerW, cursorY, '×1.00', {
				fontSize: '15px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);
		cursorY += 22;

		this.add
			.text(innerX, cursorY + 8, 'Armor', {
				fontSize: '13px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.sans,
			})
			.setOrigin(0, 0)
			.setResolution(2);
		const shieldW = 30;
		const shieldH = 34;
		const shieldCx = innerX + innerW - shieldW / 2;
		const shieldCy = cursorY + shieldH / 2;
		this.drawShield(shieldCx, shieldCy, shieldW, shieldH);
		this.hudArmor = this.add
			.text(shieldCx, shieldCy + 1, '0', {
				fontSize: '15px',
				color: '#fde68a',
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(0.5)
			.setResolution(2);
		cursorY += shieldH + 8;

		this.drawSidebarDivider(innerX, cursorY, innerW);
		cursorY += 12;

		this.add
			.text(innerX, cursorY, 'CASH', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudCash = this.add
			.text(innerX + innerW, cursorY - 6, '$0', {
				fontSize: '24px',
				color: HUD_COLORS.cashText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);
		cursorY += 32;

		this.add
			.text(innerX, cursorY, 'BEST', {
				fontSize: '11px',
				color: HUD_COLORS.roundText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0, 0)
			.setResolution(2);
		this.hudBest = this.add
			.text(innerX + innerW, cursorY, '—', {
				fontSize: '14px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.serif,
				fontStyle: 'bold',
			})
			.setOrigin(1, 0)
			.setResolution(2);

		const slotW = innerW;
		const slotH = 96;
		const slotX = innerX;
		const slotY = y + h - slotH - 16;

		this.add
			.text(x + w / 2, slotY - 18, 'ACTIVATE', {
				fontSize: '12px',
				color: HUD_COLORS.scoreText,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0.5, 0)
			.setResolution(2);

		const slot = this.add
			.rectangle(
				slotX + slotW / 2,
				slotY + slotH / 2,
				slotW,
				slotH,
				COLORS.slot,
			)
			.setStrokeStyle(2, COLORS.slotBorder);
		this.activateSlot = slot;
		this.activateSlotGeom = { x: slotX, y: slotY, w: slotW, h: slotH };
		const activateTarget = this.dropTargets.find(
			(t) => t.pile === 'activate',
		);
		if (activateTarget) {
			activateTarget.x = slotX;
			activateTarget.y = slotY;
			activateTarget.w = slotW;
			activateTarget.h = slotH;
		}

		this.add
			.text(slotX + slotW / 2, slotY + slotH / 2, '⚡', {
				fontSize: '40px',
				color: '#1f5e3d',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);
	}

	private drawSidebarDivider(x: number, y: number, w: number) {
		const g = this.add.graphics();
		g.setDepth(-120);
		g.lineStyle(1, HUD_COLORS.hudBorder, 0.45);
		g.lineBetween(x, y, x + w, y);
	}

	/** Heraldic shield — flat top, rounded shoulders, tapered to a point.
	 * Drawn once at sidebar build time; the armor number text is overlaid
	 * separately and updated by updateHud. */
	private drawShield(cx: number, cy: number, w: number, h: number) {
		const g = this.add.graphics();
		g.setDepth(-110);
		const top = cy - h / 2;
		const left = cx - w / 2;
		const right = cx + w / 2;
		const midY = top + h * 0.55;
		const bottom = cy + h / 2;

		g.fillStyle(0x1e3a8a, 1);
		g.beginPath();
		g.moveTo(left, top);
		g.lineTo(right, top);
		g.lineTo(right, midY);
		g.lineTo(cx, bottom);
		g.lineTo(left, midY);
		g.closePath();
		g.fillPath();

		g.lineStyle(2, HUD_COLORS.hudBorder, 1);
		g.strokePath();

		const ix = 3;
		const iyTop = top + ix;
		const iyMid = midY - 2;
		const iyBot = bottom - ix * 1.5;
		g.lineStyle(1, 0xfde68a, 0.55);
		g.beginPath();
		g.moveTo(left + ix, iyTop);
		g.lineTo(right - ix, iyTop);
		g.lineTo(right - ix, iyMid);
		g.lineTo(cx, iyBot);
		g.lineTo(left + ix, iyMid);
		g.closePath();
		g.strokePath();
	}

	private hpBarGeom: { x: number; y: number; w: number; h: number } = {
		x: 0,
		y: 0,
		w: 0,
		h: 0,
	};

	/** Refresh HUD text from current state. Cheap; called after every move. */
	private updateHud() {
		this.hudScore.setText(`${this.state.score}`);
		const combo = this.state.combo;
		if (combo > 1) {
			this.hudCombo.setText(
				`×${this.state.comboMultiplier} chain (${combo})`,
			);
		} else {
			this.hudCombo.setText('');
		}
		this.hudRound.setText(`${this.state.round}`);
		this.hudBlind.setText(`${this.state.blind}`);
		this.hudCash.setText(`$${this.state.cash}`);
		const best = this.state.bestRecord.bestScore;
		this.hudBest.setText(best > 0 ? `${best}` : '—');

		const scoreColor =
			this.state.score < 0
				? HUD_COLORS.scoreNegative
				: this.state.hasMetBlind()
					? HUD_COLORS.cashText
					: HUD_COLORS.scoreText;
		this.hudScore.setColor(scoreColor);

		this.hudHpNumber.setText(`${this.state.hp} / ${this.state.maxHp}`);
		this.redrawHpBar();

		this.hudAttack.setText(`×${this.state.attack.toFixed(2)}`);
		this.hudArmor.setText(`${this.state.armor}`);

		this.updateMonsterOverlays();
	}

	/** Gold-trimmed HP bar (dark backing, red fill, thick gold outer rim,
	 * lighter inner highlight). Skips the fill draw at 0% to avoid a
	 * 0-width rounded-rect artifact. */
	private redrawHpBar() {
		const { x, y, w, h } = this.hpBarGeom;
		this.hudHpBar.clear();
		const pct = this.state.maxHp > 0 ? this.state.hp / this.state.maxHp : 0;

		this.hudHpBar.fillStyle(HUD_COLORS.hpBg, 1);
		this.hudHpBar.fillRoundedRect(x, y, w, h, 5);

		if (pct > 0) {
			this.hudHpBar.fillStyle(HUD_COLORS.hpFill, 1);
			this.hudHpBar.fillRoundedRect(x, y, Math.max(2, w * pct), h, 5);
		}

		this.hudHpBar.lineStyle(2, HUD_COLORS.hudBorder, 1);
		this.hudHpBar.strokeRoundedRect(x, y, w, h, 5);

		this.hudHpBar.lineStyle(1, 0xfde68a, 0.55);
		this.hudHpBar.strokeRoundedRect(x + 1.5, y + 1.5, w - 3, h - 3, 4);
	}

	/** Pre-build views for every possible byte slot up front — bonus cards
	 * can be popped mid-run, so building from the live state would miss a
	 * view for a card that's not currently dealt. */
	private buildAllCardViews() {
		for (let suit = 0; suit < 4; suit++) {
			for (let rank = 0; rank < 13; rank++) {
				const byte = (suit << 4) | rank;
				this.viewByIndex[byte] = this.makeCardView(byte);
			}
		}
		this.viewByIndex[getCardIndex(JOKER_BLACK_BYTE)] =
			this.makeCardView(JOKER_BLACK_BYTE);
		this.viewByIndex[getCardIndex(JOKER_RED_BYTE)] =
			this.makeCardView(JOKER_RED_BYTE);
		for (const b of ALL_BONUS_BYTES) {
			this.viewByIndex[getCardIndex(b)] = this.makeCardView(b);
		}
		for (const b of ALL_MONSTER_BYTES) {
			this.viewByIndex[getCardIndex(b)] = this.makeCardView(b);
		}
	}

	/** Refresh monster card overlays (name, ATK, HP, engaged ring) from
	 * `state.monsters`. Cheap; called after every move + on initial deal. */
	private updateMonsterOverlays() {
		for (const b of ALL_MONSTER_BYTES) {
			const v = this.viewByIndex[getCardIndex(b)];
			if (!v) continue;
			const mob = this.state.monsters.get(v.cardIndex);
			if (!mob) {
				v.monsterEngagedRing?.setVisible(false);
				continue;
			}
			v.monsterNameText?.setText(mob.name);
			v.monsterAtkText?.setText(`ATK ${mob.atk}`);
			v.monsterHpText?.setText(`${mob.hp}/${mob.maxHp}`);
			v.monsterEngagedRing?.setVisible(mob.engaged);
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

		const peekRing = this.add.graphics();
		peekRing.lineStyle(3, 0x4ade80, 0.95);
		peekRing.strokeRoundedRect(
			-CARD_SIZE.width / 2 + 2,
			-CARD_SIZE.height / 2 + 2,
			CARD_SIZE.width - 4,
			CARD_SIZE.height - 4,
			CARD_SIZE.radius - 2,
		);
		peekRing.lineStyle(1, 0xbbf7d0, 0.75);
		peekRing.strokeRoundedRect(
			-CARD_SIZE.width / 2 + 5,
			-CARD_SIZE.height / 2 + 5,
			CARD_SIZE.width - 10,
			CARD_SIZE.height - 10,
			CARD_SIZE.radius - 4,
		);
		peekRing.setVisible(false);

		const frozenRing = this.add.graphics();
		frozenRing.lineStyle(3, 0xa855f7, 0.95);
		frozenRing.strokeRoundedRect(
			-CARD_SIZE.width / 2 + 2,
			-CARD_SIZE.height / 2 + 2,
			CARD_SIZE.width - 4,
			CARD_SIZE.height - 4,
			CARD_SIZE.radius - 2,
		);
		frozenRing.lineStyle(1, 0xe9d5ff, 0.75);
		frozenRing.strokeRoundedRect(
			-CARD_SIZE.width / 2 + 5,
			-CARD_SIZE.height / 2 + 5,
			CARD_SIZE.width - 10,
			CARD_SIZE.height - 10,
			CARD_SIZE.radius - 4,
		);
		frozenRing.setVisible(false);

		/* Hit zone sits ABOVE face/back in the child stack so pointer
		 * events always land here. `alpha: 0.001` instead of 0 because
		 * some Phaser builds skip render-list registration for fully
		 * transparent objects (and drop hit testing along with it). */
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

		container.add([shadow, back, peekRing, face, frozenRing, hitZone]);
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
			peekRing,
			frozenRing,
			hitZone,
			restY: 0,
			restDepth: 0,
			hovered: false,
			peeking: false,
			cardIndex: getCardIndex(byte),
		};

		if (display.monster !== undefined) {
			for (const child of face.list) {
				const role = (child as Phaser.GameObjects.GameObject).getData(
					'role',
				);
				if (role === 'monsterHp') {
					view.monsterHpText = child as Phaser.GameObjects.Text;
				} else if (role === 'monsterAtk') {
					view.monsterAtkText = child as Phaser.GameObjects.Text;
				} else if (role === 'monsterName') {
					view.monsterNameText = child as Phaser.GameObjects.Text;
				} else if (role === 'monsterEngagedRing') {
					view.monsterEngagedRing =
						child as Phaser.GameObjects.Graphics;
				}
			}
		}

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
			for (let col = 0; col < 7; col++) {
				const top =
					this.state.tableaus[col][
						this.state.tableaus[col].length - 1
					];
				if (
					top !== undefined &&
					isMonster(top) &&
					getCardId(top) === view.id
				) {
					if (this.state.attackMonster(col)) {
						this.layoutAll(true);
						this.updateHud();
					}
					return;
				}
			}
			/* Stock click is routed through the top stock-card's hit zone
			 * because face-down stock cards cover the slot rectangle once
			 * the deck has cards on it (setTopOnly + higher depth swallow
			 * the slot's gameobjectdown event). */
			const stockTop = this.state.stock[this.state.stock.length - 1];
			if (stockTop !== undefined && getCardId(stockTop) === view.id) {
				this.handleStockClick();
			}
		});

		return view;
	}

	private makeFace(d: DisplayView): Phaser.GameObjects.Container {
		if (d.joker) return this.makeJokerFace(d);
		if (d.bonus !== undefined) return this.makeBonusFace(d);
		if (d.monster !== undefined) return this.makeMonsterFace(d);

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
					fontFamily: FONT.sans,
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
					fontFamily: FONT.sans,
				},
			)
			.setOrigin(0, 0)
			.setResolution(2);

		const suitCenter = this.add
			.text(0, 8, d.glyph, {
				fontSize: '46px',
				color: colorStr,
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);

		face.add([rankTL, suitTL, suitCenter]);
		return face;
	}

	/** Joker face — distinct visual so wild cards read at a glance:
	 *   - deep indigo body with diagonal mid-purple stripe
	 *   - gold "JOKER" label top + bottom (rotated)
	 *   - centered gold ★ glyph
	 *   - red/black pip in the corners to hint which joker variant. */
	private makeJokerFace(d: DisplayView): Phaser.GameObjects.Container {
		const face = this.add.container(0, 0);
		const w = CARD_SIZE.width;
		const h = CARD_SIZE.height;

		const bg = this.add.graphics();
		bg.fillStyle(COLORS.jokerFace, 1);
		bg.fillRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		bg.fillStyle(COLORS.jokerStripe, 0.55);
		bg.beginPath();
		bg.moveTo(-w / 2, -h / 2 + h * 0.35);
		bg.lineTo(w / 2, -h / 2);
		bg.lineTo(w / 2, -h / 2 + h * 0.15);
		bg.lineTo(-w / 2, -h / 2 + h * 0.5);
		bg.closePath();
		bg.fillPath();
		bg.lineStyle(2, COLORS.jokerAccent, 1);
		bg.strokeRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		bg.lineStyle(1, COLORS.jokerAccent, 0.5);
		bg.strokeRoundedRect(
			-w / 2 + 5,
			-h / 2 + 5,
			w - 10,
			h - 10,
			CARD_SIZE.radius - 2,
		);
		face.add(bg);

		const goldStr = `#${COLORS.jokerAccent.toString(16).padStart(6, '0')}`;
		const pipColor =
			d.color === 'red' ? COLORS.jokerRedTint : COLORS.jokerBlackTint;

		const labelTL = this.add
			.text(-w / 2 + 6, -h / 2 + 6, 'JOKER', {
				fontSize: '11px',
				color: goldStr,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0, 0)
			.setResolution(2);
		const pipTL = this.add
			.rectangle(-w / 2 + 12, -h / 2 + 26, 8, 8, pipColor)
			.setOrigin(0.5);

		const star = this.add
			.text(0, 4, '★', {
				fontSize: '52px',
				color: goldStr,
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);

		face.add([labelTL, pipTL, star]);
		return face;
	}

	/** Bonus card face — distinct visuals per subtype so the player knows
	 * what kind of surprise just landed. Each variant gets its own body
	 * color, glyph, and label. Bonus cards auto-consume the moment they
	 * flip face-up, so this view is on-screen only for the brief reveal
	 * frame before layoutAll hides it. */
	private makeBonusFace(d: DisplayView): Phaser.GameObjects.Container {
		const face = this.add.container(0, 0);
		const w = CARD_SIZE.width;
		const h = CARD_SIZE.height;

		const variant = this.bonusVariantStyle(d.bonus!);
		const bg = this.add.graphics();
		bg.fillStyle(variant.bodyColor, 1);
		bg.fillRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		bg.fillStyle(variant.sheenColor, 0.45);
		bg.beginPath();
		bg.moveTo(-w / 2, -h / 2 + h * 0.35);
		bg.lineTo(w / 2, -h / 2);
		bg.lineTo(w / 2, -h / 2 + h * 0.15);
		bg.lineTo(-w / 2, -h / 2 + h * 0.5);
		bg.closePath();
		bg.fillPath();
		bg.lineStyle(2, COLORS.jokerAccent, 1);
		bg.strokeRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		bg.lineStyle(1, COLORS.jokerAccent, 0.5);
		bg.strokeRoundedRect(
			-w / 2 + 5,
			-h / 2 + 5,
			w - 10,
			h - 10,
			CARD_SIZE.radius - 2,
		);
		face.add(bg);

		const goldStr = `#${COLORS.jokerAccent.toString(16).padStart(6, '0')}`;

		const tag = this.add
			.text(-w / 2 + 6, -h / 2 + 6, variant.tag, {
				fontSize: '10px',
				color: goldStr,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0, 0)
			.setResolution(2);

		const glyph = this.add
			.text(0, -8, variant.glyph, {
				fontSize: '54px',
				color: goldStr,
				fontFamily: FONT.sans,
				fontStyle: 'bold',
			})
			.setOrigin(0.5)
			.setResolution(2);

		const payoff = this.add
			.text(0, h / 2 - 22, variant.payoff, {
				fontSize: '13px',
				color: goldStr,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);

		face.add([tag, glyph, payoff]);
		return face;
	}

	private bonusVariantStyle(type: BonusType): {
		bodyColor: number;
		sheenColor: number;
		glyph: string;
		tag: string;
		payoff: string;
	} {
		switch (type) {
			case BonusType.HP:
				return {
					bodyColor: 0x991b1b,
					sheenColor: 0xf87171,
					glyph: '✚',
					tag: 'HEALTH',
					payoff: '+5 HP',
				};
			case BonusType.Cash:
				return {
					bodyColor: 0x065f46,
					sheenColor: 0x34d399,
					glyph: '$',
					tag: 'CASH',
					payoff: '+$5',
				};
			case BonusType.Reveal:
			default:
				return {
					bodyColor: 0x4c1d95,
					sheenColor: 0xa78bfa,
					glyph: '◉',
					tag: 'REVEAL',
					payoff: 'flip 1',
				};
		}
	}

	private makeMonsterFace(d: DisplayView): Phaser.GameObjects.Container {
		const face = this.add.container(0, 0);
		const w = CARD_SIZE.width;
		const h = CARD_SIZE.height;

		const bg = this.add.graphics();
		bg.fillStyle(0x4c0519, 1);
		bg.fillRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		bg.lineStyle(2, 0xfbbf24, 1);
		bg.strokeRoundedRect(-w / 2, -h / 2, w, h, CARD_SIZE.radius);
		face.add(bg);

		const portrait = this.add
			.image(0, -8, 'monster-placeholder')
			.setOrigin(0.5);
		face.add(portrait);

		const atkPip = this.add
			.text(-w / 2 + 6, -h / 2 + 6, 'ATK —', {
				fontSize: '11px',
				color: '#fde68a',
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0, 0)
			.setResolution(2);
		face.add(atkPip);
		atkPip.setData('role', 'monsterAtk');

		const hpText = this.add
			.text(w / 2 - 6, -h / 2 + 6, '—/—', {
				fontSize: '11px',
				color: '#fecaca',
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(1, 0)
			.setResolution(2);
		face.add(hpText);
		hpText.setData('role', 'monsterHp');

		const name = this.add
			.text(0, h / 2 - 18, '???', {
				fontSize: '11px',
				color: '#fde68a',
				fontStyle: 'bold',
				fontFamily: FONT.sans,
				align: 'center',
				wordWrap: { width: w - 12 },
			})
			.setOrigin(0.5)
			.setResolution(2);
		face.add(name);
		name.setData('role', 'monsterName');

		const ring = this.add.graphics();
		ring.lineStyle(3, 0xef4444, 1);
		ring.strokeRoundedRect(
			-w / 2 + 2,
			-h / 2 + 2,
			w - 4,
			h - 4,
			CARD_SIZE.radius - 2,
		);
		ring.setVisible(false);
		face.add(ring);
		ring.setData('role', 'monsterEngagedRing');

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

	private layoutAll(animate = false, staggerByCardId?: Map<string, number>) {
		const stagger = (id: string) => staggerByCardId?.get(id) ?? 0;
		/* Track in-pile card indices this frame; views outside the set get
		 * hidden after layout (handles auto-consumed cards). */
		const visited = new Set<number>();
		const visit = (byte: CardByte) => visited.add(getCardIndex(byte));

		this.state.stock.forEach((byte, i) => {
			visit(byte);
			const v = this.viewFor(byte);
			this.positionCard(
				v,
				STOCK_X + CARD_SIZE.width / 2,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				i,
				animate,
				stagger(getCardId(byte)),
			);
			v.face.setVisible(false);
			v.back.setVisible(true);
			v.peekRing.setVisible(false);
			v.frozenRing.setVisible(false);
		});

		const wasteLen = this.state.waste.length;
		this.state.waste.forEach((byte, i) => {
			visit(byte);
			const v = this.viewFor(byte);
			const fromTop = wasteLen - 1 - i;
			const fanOffset =
				fromTop < STOCK_DRAW_COUNT
					? (STOCK_DRAW_COUNT - 1 - fromTop) * WASTE_FAN_X
					: 0;
			this.positionCard(
				v,
				WASTE_X + CARD_SIZE.width / 2 + fanOffset,
				TOP_ROW_Y + CARD_SIZE.height / 2,
				100 + i,
				animate,
				stagger(getCardId(byte)),
			);
			v.face.setVisible(true);
			v.back.setVisible(false);
			v.peekRing.setVisible(false);
			v.frozenRing.setVisible(false);
		});

		this.state.foundations.forEach((pile, idx) => {
			const x =
				FOUNDATION_X_START + idx * FOUNDATION_GAP + CARD_SIZE.width / 2;
			pile.forEach((byte, i) => {
				visit(byte);
				const v = this.viewFor(byte);
				this.positionCard(
					v,
					x,
					TOP_ROW_Y + CARD_SIZE.height / 2,
					200 + idx * 20 + i,
					animate,
					stagger(getCardId(byte)),
				);
				v.face.setVisible(true);
				v.back.setVisible(false);
				v.peekRing.setVisible(false);
				v.frozenRing.setVisible(false);
			});
		});

		this.state.tableaus.forEach((column, col) => {
			const x =
				TABLEAU_X_START + col * TABLEAU_X_GAP + CARD_SIZE.width / 2;
			let y = TABLEAU_Y + CARD_SIZE.height / 2;
			column.forEach((byte, i) => {
				visit(byte);
				const v = this.viewFor(byte);
				this.positionCard(
					v,
					x,
					y,
					400 + col * 20 + i,
					animate,
					stagger(getCardId(byte)),
				);
				const up = isFaceUp(byte);
				v.face.setVisible(up);
				v.back.setVisible(!up);
				v.peekRing.setVisible(
					!up && this.state.peekedCards.has(v.cardIndex),
				);
				v.frozenRing.setVisible(up && this.state.isFrozen(v.cardIndex));
				y += up ? TABLEAU_FAN_Y : TABLEAU_FAN_Y_DOWN;
			});
		});

		for (let i = 0; i < this.viewByIndex.length; i++) {
			const v = this.viewByIndex[i];
			if (!v) continue;
			v.container.setVisible(visited.has(i));
		}
	}

	private viewFor(byte: CardByte): SceneCardView {
		const v = this.viewByIndex[getCardIndex(byte)];
		if (!v) throw new Error(`No view for card ${getCardId(byte)}`);
		return v;
	}

	private positionCard(
		v: SceneCardView,
		x: number,
		y: number,
		depth: number,
		animate: boolean,
		delay = 0,
	) {
		v.container.setDepth(depth);
		v.restY = y;
		v.restDepth = depth;
		v.container.setScale(1);
		v.shadow.setVisible(false);
		v.hovered = false;

		if (!animate) {
			v.container.setPosition(x, y);
			v.container.setRotation(0);
			return;
		}

		/* Skip the tween if the container is already at the target — most
		 * cards don't move per move, so this avoids ~40 redundant tween
		 * allocations per turn. 0.5px threshold absorbs sub-pixel residue. */
		const c = v.container;
		const noMove = Math.abs(c.x - x) < 0.5 && Math.abs(c.y - y) < 0.5;
		const noRotation = Math.abs(c.rotation) < 0.001;
		if (noMove && noRotation) {
			c.setPosition(x, y);
			return;
		}

		this.tweens.add({
			targets: c,
			x,
			y,
			rotation: 0,
			duration: TIMING.moveMs,
			delay,
			ease: 'Cubic.Out',
		});
	}

	private handleStockClick() {
		this.state.drawFromStock();
		this.layoutAll(true);
		this.updateHud();
	}

	private handleUndo() {
		if (this.state.undo()) {
			this.tweens.killAll();
			this.winShown = false;
			this.winBanner?.setVisible(false);
			this.dismissModal();
			this.layoutAll(true);
			this.updateHud();
		}
	}

	/** True if this card is currently grab-eligible (face-up + reachable). */
	private isInteractableTop(id: string): boolean {
		for (const byte of this.state.waste) {
			if (getCardId(byte) === id) return true;
		}
		for (const pile of this.state.foundations) {
			const top = pile[pile.length - 1];
			if (top !== undefined && getCardId(top) === id) return true;
		}
		for (const col of this.state.tableaus) {
			for (const byte of col) {
				if (isFaceUp(byte) && getCardId(byte) === id) return true;
			}
		}
		return false;
	}

	private onHoverEnter(view: SceneCardView) {
		if (this.dragging) return;

		/* Peek path — face-down peeked tableau card flashes its face on
		 * hover. Checked before isInteractableTop because face-down cards
		 * don't otherwise count as interactable. */
		if (view.back.visible && this.state.peekedCards.has(view.cardIndex)) {
			view.peeking = true;
			view.hovered = true;
			view.face.setVisible(true);
			view.back.setVisible(false);
			view.container.setDepth(9000);
			return;
		}

		if (!this.isInteractableTop(view.id)) return;
		view.hovered = true;
		view.container.setDepth(9000);
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

		if (view.peeking) {
			view.peeking = false;
			view.face.setVisible(false);
			view.back.setVisible(true);
			view.container.setDepth(view.restDepth);
			return;
		}

		view.container.setDepth(view.restDepth);
		this.tweens.add({
			targets: view.container,
			y: view.restY,
			scale: 1,
			duration: 120,
			ease: 'Cubic.Out',
		});
		view.shadow.setVisible(false);
	}

	private onDragStart(_pointer: Phaser.Input.Pointer, head: SceneCardView) {
		const id = head.id;

		const wasteIdx = this.state.waste.findIndex(
			(byte) => getCardId(byte) === id,
		);
		if (wasteIdx !== -1) {
			const card = this.state.waste[wasteIdx];
			this.beginDrag([card], 'waste', undefined, wasteIdx, head);
			return;
		}

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
			for (const c of run) {
				if (this.state.isFrozen(c & 0x3f)) {
					this.dragging = null;
					return;
				}
			}
			this.beginDrag(run, 'tableau', col, idx, head);
			return;
		}

		for (let f = 0; f < 4; f++) {
			const top =
				this.state.foundations[f][this.state.foundations[f].length - 1];
			if (top !== undefined && getCardId(top) === id) {
				/* Foundation source encodes as `-foundationIdx - 1` in
				 * fromCol so applyMove can recognise it. */
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

		const sourceFoundation =
			fromCol !== undefined && fromCol < 0 ? -fromCol - 1 : -1;
		this.highlightLegalDrops(cards[0], sourceFoundation);

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
		this.clearHighlights();

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

		/* Multi-card moves stagger so the run "flows" into the column
		 * (30ms between cards) instead of all snapping at once. */
		let staggerMap: Map<string, number> | undefined;
		if (applied && drag.cards.length > 1) {
			staggerMap = new Map();
			drag.cards.forEach((byte, i) => {
				staggerMap!.set(getCardId(byte), i * 30);
			});
		}
		this.layoutAll(true, staggerMap);
		this.updateHud();

		if (this.state.hasWon() && !this.winShown) {
			this.winShown = true;
			this.showWin();
		}
	}

	private findDropTarget(cx: number, cy: number): DropTarget | null {
		for (const t of this.dropTargets) {
			if (t.pile === 'activate') {
				const tx = t.x + (t.w ?? 0) / 2;
				const ty = t.y + (t.h ?? 0) / 2;
				if (
					Math.abs(cx - tx) < (t.w ?? 0) / 2 &&
					Math.abs(cy - ty) < (t.h ?? 0) / 2
				) {
					return t;
				}
				continue;
			}
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
		if (target.pile === 'activate') {
			if (drag.cards.length !== 1) return false;
			if (!isBonus(drag.cards[0])) return false;
			if (drag.fromPile === 'waste') {
				return this.state.activateBonusFromWaste(
					drag.fromCardIndex ?? this.state.waste.length - 1,
				);
			}
			if (
				drag.fromPile === 'tableau' &&
				drag.fromCol !== undefined &&
				drag.fromCol >= 0
			) {
				return this.state.activateBonusFromTableau(drag.fromCol);
			}
			return false;
		}

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
				return this.state.moveWasteToFoundation(
					target.index,
					drag.fromCardIndex,
				);
			}
			if (target.pile === 'tableau') {
				return this.state.moveWasteToTableau(
					target.index,
					drag.fromCardIndex,
				);
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

	private tryAutoFoundation(id: string) {
		const wasteIdx = this.state.waste.findIndex(
			(byte) => getCardId(byte) === id,
		);
		if (wasteIdx !== -1) {
			const c = this.state.waste[wasteIdx];
			if (isBonus(c)) {
				if (this.state.activateBonusFromWaste(wasteIdx)) {
					this.layoutAll(true);
					this.updateHud();
				}
				return;
			}
			for (let f = 0; f < 4; f++) {
				if (canDropOnFoundation(c, this.state.foundations[f])) {
					if (this.state.moveWasteToFoundation(f, wasteIdx)) {
						this.layoutAll(true);
						this.updateHud();
						this.checkRoundEnd();
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
				if (isBonus(top)) {
					if (this.state.activateBonusFromTableau(col)) {
						this.layoutAll(true);
						this.updateHud();
					}
					return;
				}
				for (let f = 0; f < 4; f++) {
					if (canDropOnFoundation(top, this.state.foundations[f])) {
						if (this.state.moveTableauToFoundation(col, f)) {
							this.layoutAll(true);
							this.updateHud();
							this.checkRoundEnd();
							return;
						}
					}
				}
				return;
			}
		}
	}

	/** After any foundation-bound move, see if the round just ended. Win
	 * (foundations full) → finishRound + cascade + shop. */
	private checkRoundEnd() {
		if (this.state.hasWon() && !this.winShown) {
			this.winShown = true;
			this.showWin();
		}
	}

	private showWin() {
		/* Build the banner once + toggle visibility on subsequent wins —
		 * avoids leaking a Text object per win across undo / new-game. */
		if (!this.winBanner) {
			this.winBanner = this.add
				.text(
					PLAY_WIDTH / 2,
					BASE_HEIGHT / 2,
					'You won! 🎉  Press N for new game.',
					{
						fontSize: '32px',
						color: COLORS.winText,
						fontFamily: FONT.sans,
						fontStyle: 'bold',
					},
				)
				.setOrigin(0.5)
				.setDepth(99999)
				.setResolution(2);
			this.winBanner.setVisible(false);
		}

		const all: CardByte[] = [];
		for (const f of this.state.foundations) for (const c of f) all.push(c);

		const totalDelay = all.length * 35;
		all.forEach((byte, i) => {
			const v = this.viewFor(byte);
			v.container.setDepth(50000 + i);

			const dirX = (Math.random() - 0.5) * 1.6;
			const dirY = 0.7 + Math.random() * 0.6;
			const distance = BASE_WIDTH * 0.9;
			const targetX = v.container.x + dirX * distance;
			const targetY = v.container.y + dirY * distance + BASE_HEIGHT * 0.4;
			const spin = (Math.random() - 0.5) * Math.PI * 4;

			this.tweens.add({
				targets: v.container,
				x: targetX,
				y: targetY,
				rotation: spin,
				scale: 0.85 + Math.random() * 0.3,
				duration: 1200 + Math.random() * 600,
				delay: i * 35,
				ease: 'Cubic.In',
			});
		});

		this.time.delayedCall(totalDelay + 1500, () => {
			this.state.finishRound();
			this.updateHud();
			this.showShop();
		});
	}

	/** Reset full run (round 1, score 0, no owned jokers). */
	private newGame() {
		this.tweens.killAll();
		this.clearHighlights();
		this.dismissModal();
		this.state.resetRun();
		this.bindNpcDataToMonsters();
		this.winShown = false;
		this.winBanner?.setVisible(false);
		this.layoutAll(true);
		this.updateHud();
	}

	private dismissModal() {
		if (!this.modal) return;
		this.modal.destroy(true);
		this.modal = null;
	}

	private buildModalShell(title: string): {
		container: Phaser.GameObjects.Container;
		contentY: number;
	} {
		this.dismissModal();
		const c = this.add.container(0, 0);
		c.setDepth(60000);

		const backdrop = this.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				BASE_WIDTH,
				BASE_HEIGHT,
				0x000000,
				0.6,
			)
			.setInteractive();
		c.add(backdrop);

		/* Modal centered on the PLAY area (not the full canvas) so the
		 * sidebar stays visible behind it. */
		const w = 700;
		const h = 380;
		const x = (PLAY_WIDTH - w) / 2;
		const y = (BASE_HEIGHT - h) / 2;
		const panel = this.add.graphics();
		panel.fillStyle(HUD_COLORS.hudBg, 1);
		panel.fillRoundedRect(x, y, w, h, 18);
		panel.lineStyle(3, HUD_COLORS.hudBorder, 1);
		panel.strokeRoundedRect(x, y, w, h, 18);
		c.add(panel);

		const titleText = this.add
			.text(PLAY_WIDTH / 2, y + 20, title, {
				fontSize: '24px',
				color: HUD_COLORS.scoreText,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5, 0)
			.setResolution(2);
		c.add(titleText);

		this.modal = c;
		return { container: c, contentY: y + 64 };
	}

	private showShop() {
		const passed = this.state.hasMetBlind();
		const titleStr = passed
			? `Round ${this.state.round} cleared!`
			: `Round ${this.state.round} — short of target`;
		const { container, contentY } = this.buildModalShell(titleStr);

		const summary = this.add
			.text(
				PLAY_WIDTH / 2,
				contentY,
				`Score ${this.state.score}  ·  Target ${this.state.blind}  ·  Earned $${Math.floor(this.state.score / 10)}`,
				{
					fontSize: '13px',
					color: HUD_COLORS.roundText,
					fontFamily: FONT.sans,
				},
			)
			.setOrigin(0.5, 0)
			.setResolution(2);
		container.add(summary);

		const offers: { label: string; cost: number; apply: () => void }[] = [
			{
				label: 'Multiplier Joker\n(×1.5 mult)',
				cost: SHOP_PRICES.jokerMultiplier,
				apply: () => {
					this.state.ownedJokerVariants.push(JokerVariant.Multiplier);
				},
			},
			{
				label: 'ScoreBoost Joker\n(+50 flat)',
				cost: SHOP_PRICES.jokerScoreBoost,
				apply: () => {
					this.state.ownedJokerVariants.push(JokerVariant.ScoreBoost);
				},
			},
			{
				label: '+1 Armor\n(reduce damage)',
				cost: SHOP_PRICES.armorPoint,
				apply: () => {
					this.state.armor += 1;
				},
			},
			{
				label: '+1 Attack\n(×0.25 score boost)',
				cost: SHOP_PRICES.attackPoint,
				apply: () => {
					this.state.attack += STATS.attackStep;
				},
			},
			{
				label: 'Heal +5 HP',
				cost: SHOP_PRICES.healSmall,
				apply: () => {
					this.state.heal(5);
				},
			},
		];

		const cardW = 120;
		const cardH = 110;
		const gap = 12;
		const startX = PLAY_WIDTH / 2 - (cardW * 5 + gap * 4) / 2;
		const cardY = contentY + 36;

		offers.forEach((offer, i) => {
			const cx = startX + i * (cardW + gap);
			const card = this.add.graphics();
			card.fillStyle(0x0d3b24, 1);
			card.fillRoundedRect(cx, cardY, cardW, cardH, 10);
			card.lineStyle(2, HUD_COLORS.hudBorder, 0.8);
			card.strokeRoundedRect(cx, cardY, cardW, cardH, 10);
			container.add(card);

			const label = this.add
				.text(cx + cardW / 2, cardY + 18, offer.label, {
					fontSize: '12px',
					color: HUD_COLORS.scoreText,
					fontFamily: FONT.sans,
					align: 'center',
					wordWrap: { width: cardW - 16 },
				})
				.setOrigin(0.5, 0)
				.setResolution(2);
			container.add(label);

			const cost = this.add
				.text(cx + cardW / 2, cardY + cardH - 28, `$${offer.cost}`, {
					fontSize: '16px',
					color: HUD_COLORS.cashText,
					fontStyle: 'bold',
					fontFamily: FONT.sans,
				})
				.setOrigin(0.5, 0)
				.setResolution(2);
			container.add(cost);

			const hit = this.add
				.rectangle(
					cx + cardW / 2,
					cardY + cardH / 2,
					cardW,
					cardH,
					0xffffff,
					0.001,
				)
				.setInteractive({ useHandCursor: true });
			hit.on(
				'pointerover',
				() => card.alpha === 1 && card.setAlpha(0.85),
			);
			hit.on('pointerout', () => card.setAlpha(1));
			hit.on('pointerdown', () => {
				if (this.state.cash < offer.cost) return;
				this.state.cash -= offer.cost;
				offer.apply();
				this.updateHud();
				card.setAlpha(0.4);
				hit.disableInteractive();
			});
			container.add(hit);
		});

		const btnY = contentY + 36 + cardH + 30;
		const btnLabel = passed ? `→ Round ${this.state.round + 1}` : 'End Run';
		const btn = this.add.graphics();
		btn.fillStyle(passed ? 0x065f46 : 0x7f1d1d, 1);
		btn.fillRoundedRect(PLAY_WIDTH / 2 - 90, btnY, 180, 40, 10);
		btn.lineStyle(2, HUD_COLORS.hudBorder, 0.9);
		btn.strokeRoundedRect(PLAY_WIDTH / 2 - 90, btnY, 180, 40, 10);
		container.add(btn);
		const btnText = this.add
			.text(PLAY_WIDTH / 2, btnY + 20, btnLabel, {
				fontSize: '15px',
				color: HUD_COLORS.scoreText,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);
		container.add(btnText);

		const btnHit = this.add
			.rectangle(PLAY_WIDTH / 2, btnY + 20, 180, 40, 0xffffff, 0.001)
			.setInteractive({ useHandCursor: true });
		btnHit.on('pointerdown', () => {
			if (passed) {
				this.dismissModal();
				this.tweens.killAll();
				this.winShown = false;
				this.winBanner?.setVisible(false);
				this.state.advanceRound();
				this.bindNpcDataToMonsters();
				this.layoutAll(true);
				this.updateHud();
			} else {
				this.state.declareGameOver();
				this.showGameOver();
			}
		});
		container.add(btnHit);
	}

	private showGameOver() {
		const { container, contentY } = this.buildModalShell('Game Over');

		const summary = this.add
			.text(
				PLAY_WIDTH / 2,
				contentY,
				`Final score ${this.state.score}\nRound reached: ${this.state.round}\nBest score: ${this.state.bestRecord.bestScore}\nRuns played: ${this.state.bestRecord.totalRuns}`,
				{
					fontSize: '14px',
					color: HUD_COLORS.roundText,
					fontFamily: FONT.sans,
					align: 'center',
				},
			)
			.setOrigin(0.5, 0)
			.setResolution(2);
		container.add(summary);

		const btnY = contentY + 140;
		const btn = this.add.graphics();
		btn.fillStyle(0x065f46, 1);
		btn.fillRoundedRect(PLAY_WIDTH / 2 - 90, btnY, 180, 40, 10);
		btn.lineStyle(2, HUD_COLORS.hudBorder, 0.9);
		btn.strokeRoundedRect(PLAY_WIDTH / 2 - 90, btnY, 180, 40, 10);
		container.add(btn);
		const btnText = this.add
			.text(PLAY_WIDTH / 2, btnY + 20, 'New Run', {
				fontSize: '15px',
				color: HUD_COLORS.scoreText,
				fontStyle: 'bold',
				fontFamily: FONT.sans,
			})
			.setOrigin(0.5)
			.setResolution(2);
		container.add(btnText);

		const btnHit = this.add
			.rectangle(PLAY_WIDTH / 2, btnY + 20, 180, 40, 0xffffff, 0.001)
			.setInteractive({ useHandCursor: true });
		btnHit.on('pointerdown', () => {
			this.dismissModal();
			this.newGame();
		});
		container.add(btnHit);
	}
}
