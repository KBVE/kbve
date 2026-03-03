import { useState, useCallback } from 'react';
import { useGameStore } from '../store/GameStoreContext';

function rollDie(): number {
	return Math.floor(Math.random() * 6) + 1;
}

const DICE_FACES: Record<number, string> = {
	1: '\u2680',
	2: '\u2681',
	3: '\u2682',
	4: '\u2683',
	5: '\u2684',
	6: '\u2685',
};

export function DiceRollModal() {
	const { state, dispatch } = useGameStore();
	const diceRoll = state.diceRoll;
	const [rolling, setRolling] = useState(false);

	const handleRoll = useCallback(() => {
		if (!diceRoll || rolling) return;
		setRolling(true);

		let ticks = 0;
		const maxTicks = 15;
		const interval = setInterval(() => {
			ticks++;
			const tempValues = Array.from({ length: diceRoll.diceCount }, () =>
				rollDie(),
			);
			dispatch({
				type: 'UPDATE_DICE_VALUES',
				payload: {
					diceValues: tempValues,
					totalRoll: tempValues.reduce((a, b) => a + b, 0),
				},
			});

			if (ticks >= maxTicks) {
				clearInterval(interval);
				const finalValues = Array.from(
					{ length: diceRoll.diceCount },
					() => rollDie(),
				);
				const total = finalValues.reduce((a, b) => a + b, 0);
				dispatch({
					type: 'UPDATE_DICE_VALUES',
					payload: { diceValues: finalValues, totalRoll: total },
				});
				setRolling(false);
				resolveRoll(total);
			}
		}, 80);
	}, [diceRoll, rolling, dispatch]);

	const resolveRoll = (total: number) => {
		if (!diceRoll) return;

		if (total >= 17) {
			dispatch({
				type: 'ADD_NOTIFICATION',
				payload: {
					title: 'Success!',
					message: `You rolled ${total} and stole from ${diceRoll.npcName}!`,
					type: 'success',
				},
			});
		} else if (total <= 4) {
			dispatch({
				type: 'ADD_NOTIFICATION',
				payload: {
					title: 'Critical Failure!',
					message: `You rolled ${total} — ${diceRoll.npcName} caught you and struck back!`,
					type: 'danger',
				},
			});
			dispatch({ type: 'PLAYER_DAMAGE', payload: { damage: 5 } });
		} else {
			dispatch({
				type: 'ADD_NOTIFICATION',
				payload: {
					title: 'Failed',
					message: `You rolled ${total} and failed to steal from ${diceRoll.npcName}.`,
					type: 'warning',
				},
			});
			dispatch({ type: 'PLAYER_DAMAGE', payload: { damage: 1 } });
		}
	};

	const handleClose = () => {
		dispatch({ type: 'SET_DICE_ROLL', payload: null });
		setRolling(false);
	};

	if (!diceRoll) return null;

	return (
		<div className="fixed inset-0 flex items-center justify-center z-50 bg-zinc-800/50 text-white">
			<div className="bg-zinc-800 p-6 rounded-lg shadow-lg w-96 border border-yellow-500">
				<h2 className="text-lg text-yellow-400 font-bold mb-4">
					Steal Attempt
				</h2>
				<p className="mb-4 text-sm">
					Roll the dice to steal from {diceRoll.npcName}. You need 17
					or higher to succeed.
				</p>

				<div className="flex justify-center gap-3 mb-4">
					{diceRoll.diceValues.map((val, idx) => (
						<div
							key={idx}
							className={`w-14 h-14 flex items-center justify-center bg-gray-700 border-2 rounded-lg text-3xl ${rolling ? 'border-yellow-300 animate-pulse' : val > 0 ? 'border-yellow-500' : 'border-gray-500'}`}>
							{val > 0 ? DICE_FACES[val] : '?'}
						</div>
					))}
				</div>

				{diceRoll.totalRoll !== null &&
					diceRoll.phase === 'result' &&
					!rolling && (
						<p className="text-center text-lg mb-4">
							Total:{' '}
							<span
								className={`font-bold ${diceRoll.totalRoll >= 17 ? 'text-green-400' : diceRoll.totalRoll <= 4 ? 'text-red-400' : 'text-yellow-400'}`}>
								{diceRoll.totalRoll}
							</span>
						</p>
					)}

				<div className="flex gap-2">
					{diceRoll.phase === 'rolling' && (
						<button
							onClick={handleRoll}
							disabled={rolling}
							className="flex-1 py-2 bg-yellow-500 hover:bg-yellow-400 text-white rounded transition-all disabled:opacity-50">
							{rolling ? 'Rolling...' : 'Roll Dice'}
						</button>
					)}
					<button
						onClick={handleClose}
						disabled={rolling}
						className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-all disabled:opacity-50">
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
