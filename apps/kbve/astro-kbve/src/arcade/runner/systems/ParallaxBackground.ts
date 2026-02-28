import Phaser from 'phaser';
import { PARALLAX_LAYERS, PARALLAX_DIMENSIONS } from '../sprites';

// ============================================================================
// Parallax Layer - Individual scrolling layer using TileSprite
// ============================================================================

interface ParallaxLayer {
	key: string;
	speedFactor: number;
	tileSprite: Phaser.GameObjects.TileSprite;
}

// ============================================================================
// Parallax Background System
// Uses TileSprite for seamless infinite scrolling without seams
// ============================================================================

export class ParallaxBackground {
	private scene: Phaser.Scene;
	private layers: ParallaxLayer[] = [];

	constructor(scene: Phaser.Scene) {
		this.scene = scene;
	}

	// ============================================================================
	// Asset Loading (call in preload)
	// ============================================================================

	static preload(scene: Phaser.Scene): void {
		for (const layer of PARALLAX_LAYERS) {
			scene.load.image(layer.key, layer.path);
		}
	}

	// ============================================================================
	// Initialization (call in create)
	// ============================================================================

	create(): void {
		const screenWidth = this.scene.scale.width;
		const screenHeight = this.scene.scale.height;

		// Create each parallax layer (back to front) using TileSprite
		for (let i = 0; i < PARALLAX_LAYERS.length; i++) {
			const layerConfig = PARALLAX_LAYERS[i];

			// TileSprite handles seamless tiling internally
			// Position at top-left, size covers entire screen
			const tileSprite = this.scene.add.tileSprite(
				0,
				0,
				screenWidth,
				screenHeight,
				layerConfig.key,
			);

			tileSprite.setOrigin(0, 0);
			tileSprite.setDepth(-100 + i); // Negative depth = behind game objects
			tileSprite.setScrollFactor(0); // Don't move with camera directly

			// Scale the tile texture to fit screen height while maintaining aspect ratio
			const scaleY = screenHeight / PARALLAX_DIMENSIONS.height;
			tileSprite.setTileScale(scaleY, scaleY);

			this.layers.push({
				key: layerConfig.key,
				speedFactor: layerConfig.speedFactor,
				tileSprite,
			});
		}
	}

	// ============================================================================
	// Update (call each frame)
	// ============================================================================

	update(cameraScrollX: number): void {
		for (const layer of this.layers) {
			// TileSprite's tilePositionX handles seamless scrolling
			// Multiply by speedFactor for parallax effect
			layer.tileSprite.tilePositionX = cameraScrollX * layer.speedFactor;
		}
	}

	// ============================================================================
	// Resize handling
	// ============================================================================

	resize(): void {
		const screenWidth = this.scene.scale.width;
		const screenHeight = this.scene.scale.height;

		// Recalculate scale
		const scaleY = screenHeight / PARALLAX_DIMENSIONS.height;

		for (const layer of this.layers) {
			// Resize the TileSprite to cover the new screen size
			layer.tileSprite.setSize(screenWidth, screenHeight);
			layer.tileSprite.setTileScale(scaleY, scaleY);
		}
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	destroy(): void {
		for (const layer of this.layers) {
			layer.tileSprite.destroy();
		}
		this.layers = [];
	}
}
