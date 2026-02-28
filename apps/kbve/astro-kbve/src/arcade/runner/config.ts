// ============================================================================
// Game Configuration
// ============================================================================

export const BASE_WIDTH = 960;
export const BASE_HEIGHT = 540;

export const GAME_CONFIG = {
	gravity: 1400, // Slightly stronger gravity for snappier feel
	playerSpeed: 320, // Horizontal movement speed
	jumpForce: -620, // Stronger jump
	platformSpeed: 120, // Ground break-off speed
	spawnInterval: 3000, // Slower spawn rate
	groundOffset: 50,
	grappleMaxDistance: 450, // Slightly longer grapple reach
	// Movement smoothing
	acceleration: 2000, // How fast player accelerates
	deceleration: 2800, // How fast player decelerates (friction)
	maxSpeed: 380, // Max horizontal speed
} as const;

export const COLORS = {
	background: 0x1a202c,
	ground: 0x4a5568,
	player: 0x48bb78,
	platform: 0x667eea,
	enemyWalker: 0xe53e3e,
	enemyFlyer: 0xed8936,
	enemySpiker: 0x9f7aea,
	grappleLine: 0xffd700,
	gameOverText: '#e53e3e',
	scoreText: '#ffffff',
	hintText: '#a0aec0',
} as const;

export const PLAYER_SIZE = {
	width: 45,
	height: 55,
} as const;
