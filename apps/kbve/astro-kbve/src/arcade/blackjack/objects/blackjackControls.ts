import Phaser from 'phaser';
import {
	clampBet,
	createBlackjackState,
	doubleDown,
	hit,
	resetToBetting,
	stand,
	startRound,
	type BlackjackState,
} from '../state';
import { ButtonBar, type ButtonKey, type ButtonSpec } from './buttonBar';

interface BlackjackControlsOptions {
	scene: Phaser.Scene;
	layer: Phaser.GameObjects.Container;
	textureKey: (enabled: boolean) => string;
	getState: () => BlackjackState;
	setState: (state: BlackjackState) => void;
	onAction: () => void;
}

export class BlackjackControls {
	private readonly buttonBar: ButtonBar;
	private lastButtonStateKey = '';

	constructor(private readonly options: BlackjackControlsOptions) {
		this.buttonBar = new ButtonBar(
			options.scene,
			options.layer,
			options.textureKey,
			options.onAction,
		);
	}

	create() {
		this.buttonBar.create(this.createButtonSpecs());
		this.bindKeyboard();
	}

	update() {
		const buttonStateKey = this.buttonStateKey();
		if (this.lastButtonStateKey === buttonStateKey) return;
		this.lastButtonStateKey = buttonStateKey;
		this.buttonBar.update();
	}

	private buttonStateKey(): string {
		const { phase, canDouble } = this.state;
		return `${phase}:${canDouble ? 1 : 0}`;
	}

	private createButtonSpecs(): ButtonSpec[] {
		return [
			{
				key: 'betDown',
				label: '-',
				x: 432,
				y: 691,
				w: 50,
				enabled: () => this.state.phase === 'betting',
				action: () => this.changeBet(-25),
			},
			{
				key: 'betUp',
				label: '+',
				x: 492,
				y: 691,
				w: 50,
				enabled: () => this.state.phase === 'betting',
				action: () => this.changeBet(25),
			},
			{
				key: 'deal',
				label: 'Deal',
				x: 562,
				y: 691,
				w: 92,
				enabled: () => this.state.phase === 'betting',
				action: () => startRound(this.state),
			},
			{
				key: 'hit',
				label: 'Hit',
				x: 674,
				y: 691,
				w: 82,
				enabled: () => this.state.phase === 'player-turn',
				action: () => hit(this.state),
			},
			{
				key: 'stand',
				label: 'Stand',
				x: 766,
				y: 691,
				w: 92,
				enabled: () => this.state.phase === 'player-turn',
				action: () => stand(this.state),
			},
			{
				key: 'double',
				label: 'Double',
				x: 868,
				y: 691,
				w: 104,
				enabled: () =>
					this.state.phase === 'player-turn' && this.state.canDouble,
				action: () => doubleDown(this.state),
			},
			{
				key: 'next',
				label: 'Next',
				x: 982,
				y: 691,
				w: 90,
				enabled: () => this.state.phase === 'round-over',
				action: () => resetToBetting(this.state),
			},
			{
				key: 'new',
				label: 'New',
				x: 1082,
				y: 691,
				w: 84,
				enabled: () => true,
				action: () => {
					this.options.setState(createBlackjackState());
				},
			},
		];
	}

	private bindKeyboard() {
		this.options.scene.input.keyboard?.on('keydown-H', () =>
			this.runAction('hit'),
		);
		this.options.scene.input.keyboard?.on('keydown-S', () =>
			this.runAction('stand'),
		);
		this.options.scene.input.keyboard?.on('keydown-D', () =>
			this.runAction('double'),
		);
		this.options.scene.input.keyboard?.on('keydown-ENTER', () => {
			this.runAction(this.state.phase === 'round-over' ? 'next' : 'deal');
		});
		this.options.scene.input.keyboard?.on('keydown-N', () =>
			this.runAction('new'),
		);
		this.options.scene.input.keyboard?.on('keydown-UP', () =>
			this.runAction('betUp'),
		);
		this.options.scene.input.keyboard?.on('keydown-DOWN', () =>
			this.runAction('betDown'),
		);
	}

	private runAction(key: ButtonKey) {
		if (!this.buttonBar.run(key)) return;
		this.options.onAction();
	}

	private changeBet(delta: number) {
		this.state.bet = clampBet(this.state.bet + delta, this.state.bankroll);
		this.state.message = `Bet set to $${this.state.bet}.`;
	}

	private get state(): BlackjackState {
		return this.options.getState();
	}
}
