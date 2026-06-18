import { useState, useCallback } from 'react';
import { FloatingWindow } from '@kbve/astro/ui';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import { pickStealLoot } from '../data/items';

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
	const diceRoll = useGameSelector((s) => s.diceRoll);
	const dispatch = useGameDispatch();
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
			const loot = pickStealLoot();
			if (loot) {
				dispatch({ type: 'ADD_ITEM', payload: { itemId: loot.id } });
			}
			dispatch({
				type: 'ADD_NOTIFICATION',
				payload: {
					title: 'Success!',
					message: loot
						? `You rolled ${total} and stole ${loot.name} from ${diceRoll.npcName}!`
						: `You rolled ${total} and stole from ${diceRoll.npcName}!`,
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
		<FloatingWindow
			storageKey="ct-dice-window"
			initial={{
				x:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerWidth - 360) / 2)
						: 200,
				y:
					typeof window !== 'undefined'
						? Math.max(12, (window.innerHeight - 320) / 3)
						: 100,
			}}
			size={{ width: 360, height: 320 }}
			resizable={false}
			title="Steal Attempt"
			onClose={handleClose}>
			<div className="p-5 text-white">
				<p className="mb-4 text-sm">
					Roll the dice to steal from {diceRoll.npcName}. You need 17
					or higher to succeed.
				</p>

				<div className="mb-4 flex justify-center gap-3">
					{diceRoll.diceValues.map((val, idx) => (
						<div
							key={idx}
							className={`flex h-14 w-14 items-center justify-center rounded-lg border-2 bg-gray-700 text-3xl ${rolling ? 'animate-pulse border-yellow-300' : val > 0 ? 'border-yellow-500' : 'border-gray-500'}`}>
							{val > 0 ? DICE_FACES[val] : '?'}
						</div>
					))}
				</div>

				{diceRoll.totalRoll !== null &&
					diceRoll.phase === 'result' &&
					!rolling && (
						<p className="mb-4 text-center text-lg">
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
							className="flex-1 rounded bg-yellow-500 py-2 text-white transition-all hover:bg-yellow-400 disabled:opacity-50">
							{rolling ? 'Rolling...' : 'Roll Dice'}
						</button>
					)}
					<button
						onClick={handleClose}
						disabled={rolling}
						className="flex-1 rounded bg-red-500 py-2 text-white transition-all hover:bg-red-600 disabled:opacity-50">
						Close
					</button>
				</div>
			</div>
		</FloatingWindow>
	);
}
