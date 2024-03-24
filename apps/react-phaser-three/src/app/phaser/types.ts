type GameKeys = 'up' | 'down' | 'left' | 'right' | 'space' | 'shift';

type KeyMappings = {
	[key in GameKeys]?: Phaser.Input.Keyboard.Key;
};

interface PlayerType {
	sessionId: string;
	x: number;
	y: number;
	z: number;
}

interface EndpointSettings {
	hostname: string;
	secure: boolean;
	port?: number;
	pathname?: string;
}

export { GameKeys, KeyMappings, PlayerType, EndpointSettings };
