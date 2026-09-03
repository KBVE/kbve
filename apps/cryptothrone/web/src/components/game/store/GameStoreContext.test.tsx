import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
	GameStoreProvider,
	useGameStore,
	useGameDispatch,
	useGameSelector,
} from './GameStoreContext';

function StoreProbe() {
	const { state } = useGameStore();
	const dispatch = useGameDispatch();
	const hp = useGameSelector((s) => s.player.stats.hp);
	return (
		<div>
			<span data-testid="hp">{hp}</span>
			<span data-testid="username">{state.player.stats.username}</span>
			<button
				onClick={() =>
					dispatch({
						type: 'PLAYER_DAMAGE',
						payload: { damage: 10 },
					})
				}>
				hit
			</button>
		</div>
	);
}

describe('GameStoreContext', () => {
	it('provides state, selector, and dispatch inside the provider', () => {
		render(
			<GameStoreProvider>
				<StoreProbe />
			</GameStoreProvider>,
		);
		expect(screen.getByTestId('hp')).toHaveTextContent('100');
		expect(screen.getByTestId('username')).toHaveTextContent('Guest');
		act(() => {
			screen.getByText('hit').click();
		});
		expect(screen.getByTestId('hp')).toHaveTextContent('90');
	});

	it('useGameStore throws outside a provider', () => {
		const Bad = () => {
			useGameStore();
			return null;
		};
		expect(() => render(<Bad />)).toThrow(/GameStoreProvider/);
	});

	it('useGameDispatch throws outside a provider', () => {
		const Bad = () => {
			useGameDispatch();
			return null;
		};
		expect(() => render(<Bad />)).toThrow(/GameStoreProvider/);
	});

	it('useGameSelector throws outside a provider', () => {
		const Bad = () => {
			useGameSelector((s) => s);
			return null;
		};
		expect(() => render(<Bad />)).toThrow(/GameStoreProvider/);
	});
});
