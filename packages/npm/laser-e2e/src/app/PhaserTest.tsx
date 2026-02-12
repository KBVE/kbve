import React, { useCallback, useState } from 'react';
import Phaser from 'phaser';
import { PhaserGame } from '@kbve/laser';

class BootScene extends Phaser.Scene {
	constructor() {
		super({ key: 'BootScene' });
	}

	create() {
		this.add.text(100, 100, 'Laser Phaser E2E', {
			fontSize: '24px',
			color: '#ffffff',
		});
	}
}

export const PhaserTest: React.FC = () => {
	const [ready, setReady] = useState(false);

	const handleReady = useCallback(() => {
		setReady(true);
	}, []);

	return (
		<div data-testid="phaser-container">
			<PhaserGame
				config={{
					scenes: [BootScene],
					width: 640,
					height: 480,
					backgroundColor: '#1a1a2e',
				}}
				onReady={handleReady}
				className="phaser-canvas"
			/>
			{ready && <span data-testid="phaser-ready">Game Ready</span>}
		</div>
	);
};
