import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { decodeCard } from '@kbve/laser';
import type { BlackjackStateView } from '@kbve/laser';
import {
	BlackjackStageScene,
	type StageState,
} from '../scenes/BlackjackStageScene';

const W = 520;
const H = 250;

function dealerValue(cards: number[]): number {
	let total = 0;
	let aces = 0;
	for (const b of cards) {
		const d = decodeCard(b);
		total += d.points;
		if (d.rank === 'A') aces++;
	}
	while (total > 21 && aces > 0) {
		total -= 10;
		aces--;
	}
	return total;
}

function toStageState(state: BlackjackStateView, myName: string): StageState {
	const mySeat = state.seats.find((s) => s.username === myName) ?? null;
	return {
		dealer: state.dealer_hand,
		dealerHidden: state.dealer_hidden,
		dealerValue: state.dealer_hidden
			? null
			: dealerValue(state.dealer_hand),
		hands: mySeat?.hands ?? [],
		activeHand:
			mySeat && state.active_slot === mySeat.slot
				? state.active_hand
				: null,
		mine: !!mySeat,
		phase: state.phase,
	};
}

function signature(state: BlackjackStateView, myName: string): string {
	const mySeat = state.seats.find((s) => s.username === myName);
	return JSON.stringify({
		d: state.dealer_hand,
		dh: state.dealer_hidden,
		p: state.phase,
		ah: state.active_slot === mySeat?.slot ? state.active_hand : null,
		h:
			mySeat?.hands.map((h) => [
				h.cards,
				h.outcome,
				h.doubled,
				h.bet,
				h.value,
			]) ?? [],
	});
}

export function BlackjackStage({
	state,
	myName,
}: {
	state: BlackjackStateView;
	myName: string;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	const sceneRef = useRef<BlackjackStageScene | null>(null);
	const readyRef = useRef(false);
	const pendingRef = useRef<StageState | null>(null);
	const sigRef = useRef('');

	useEffect(() => {
		if (!hostRef.current) return;
		const scene = new BlackjackStageScene();
		sceneRef.current = scene;
		const game = new Phaser.Game({
			type: Phaser.AUTO,
			width: W,
			height: H,
			parent: hostRef.current,
			transparent: true,
			banner: false,
			audio: { noAudio: true },
			scale: {
				mode: Phaser.Scale.FIT,
				autoCenter: Phaser.Scale.CENTER_BOTH,
			},
			scene,
		});
		game.events.once('stage-ready', () => {
			readyRef.current = true;
			if (pendingRef.current) scene.renderState(pendingRef.current);
		});
		return () => {
			readyRef.current = false;
			sceneRef.current = null;
			game.destroy(true);
		};
	}, []);

	useEffect(() => {
		const sig = signature(state, myName);
		if (sig === sigRef.current) return;
		sigRef.current = sig;
		const ss = toStageState(state, myName);
		pendingRef.current = ss;
		if (readyRef.current && sceneRef.current) {
			sceneRef.current.renderState(ss);
		}
	}, [state, myName]);

	return (
		<div
			ref={hostRef}
			className="mx-auto w-full"
			style={{ maxWidth: W, aspectRatio: `${W} / ${H}` }}
		/>
	);
}

export default BlackjackStage;
