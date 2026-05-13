import Phaser from 'phaser';
import { BASE_WIDTH, COLORS, FONT } from '../config';

export interface BlackjackHudValues {
	bankroll: string;
	status: string;
	statusColor: string;
	strategy: string;
	betChip: string;
	dealerValue: string;
	playerValue: string;
	shoe: string;
	stats: string;
}

export class BlackjackHud {
	private readonly textCache = new Map<keyof BlackjackHudValues, string>();
	private readonly colorCache = new Map<string, string>();
	private statusText!: Phaser.GameObjects.Text;
	private strategyText!: Phaser.GameObjects.Text;
	private bankrollText!: Phaser.GameObjects.Text;
	private dealerValueText!: Phaser.GameObjects.Text;
	private playerValueText!: Phaser.GameObjects.Text;
	private shoeText!: Phaser.GameObjects.Text;
	private statsText!: Phaser.GameObjects.Text;
	private betChipText!: Phaser.GameObjects.Text;

	constructor(
		private readonly scene: Phaser.Scene,
		private readonly layer: Phaser.GameObjects.Container,
		private readonly chipTextureKey: string,
	) {}

	create() {
		const panel = this.scene.add.graphics();
		panel.fillStyle(COLORS.panel, 0.88);
		panel.fillRoundedRect(72, 618, BASE_WIDTH - 144, 116, 18);
		panel.lineStyle(2, COLORS.panelStroke, 0.7);
		panel.strokeRoundedRect(72, 618, BASE_WIDTH - 144, 116, 18);
		this.layer.add(panel);

		this.bankrollText = this.scene.add.text(104, 642, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.gold,
		});
		this.statusText = this.scene.add.text(BASE_WIDTH / 2, 639, '', {
			fontFamily: FONT.sans,
			fontSize: '24px',
			color: '#ffffff',
			align: 'center',
		});
		this.statusText.setOrigin(0.5, 0);
		this.strategyText = this.scene.add
			.text(BASE_WIDTH / 2, 669, '', {
				fontFamily: FONT.mono,
				fontSize: '16px',
				color: COLORS.muted,
				align: 'center',
			})
			.setOrigin(0.5, 0);

		const betChip = this.scene.add
			.image(332, 676, this.chipTextureKey)
			.setOrigin(0.5);
		this.betChipText = this.scene.add
			.text(332, 674, '', {
				fontFamily: FONT.mono,
				fontSize: '18px',
				color: '#111827',
				align: 'center',
			})
			.setOrigin(0.5);
		this.dealerValueText = this.scene.add.text(142, 178, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.soft,
		});
		this.playerValueText = this.scene.add.text(142, 432, '', {
			fontFamily: FONT.mono,
			fontSize: '18px',
			color: COLORS.soft,
		});
		this.shoeText = this.scene.add.text(BASE_WIDTH - 104, 642, '', {
			fontFamily: FONT.mono,
			fontSize: '16px',
			color: COLORS.muted,
			align: 'right',
		});
		this.shoeText.setOrigin(1, 0);
		this.statsText = this.scene.add.text(BASE_WIDTH - 120, 122, '', {
			fontFamily: FONT.mono,
			fontSize: '15px',
			color: COLORS.muted,
			align: 'right',
		});
		this.statsText.setOrigin(1, 0);

		this.layer.add([
			this.bankrollText,
			this.statusText,
			this.strategyText,
			betChip,
			this.betChipText,
			this.dealerValueText,
			this.playerValueText,
			this.shoeText,
			this.statsText,
		]);
	}

	update(values: BlackjackHudValues) {
		this.setTextIfChanged('bankroll', this.bankrollText, values.bankroll);
		this.setTextIfChanged('status', this.statusText, values.status);
		this.setColorIfChanged(
			'statusColor',
			this.statusText,
			values.statusColor,
		);
		this.setTextIfChanged('strategy', this.strategyText, values.strategy);
		this.setTextIfChanged('betChip', this.betChipText, values.betChip);
		this.setTextIfChanged(
			'dealerValue',
			this.dealerValueText,
			values.dealerValue,
		);
		this.setTextIfChanged(
			'playerValue',
			this.playerValueText,
			values.playerValue,
		);
		this.setTextIfChanged('shoe', this.shoeText, values.shoe);
		this.setTextIfChanged('stats', this.statsText, values.stats);
	}

	private setTextIfChanged(
		key: keyof BlackjackHudValues,
		text: Phaser.GameObjects.Text,
		value: string,
	) {
		if (this.textCache.get(key) === value) return;
		this.textCache.set(key, value);
		text.setText(value);
	}

	private setColorIfChanged(
		key: string,
		text: Phaser.GameObjects.Text,
		value: string,
	) {
		if (this.colorCache.get(key) === value) return;
		this.colorCache.set(key, value);
		text.setColor(value);
	}
}
