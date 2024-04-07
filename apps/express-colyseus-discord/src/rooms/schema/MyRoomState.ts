import { Schema, Context, type, MapSchema } from '@colyseus/schema';

export class Player extends Schema {
	@type('number') x;
	@type('number') y;
	@type('number') z;
	@type('boolean') isOnPlatform;
	// TODO: Add the session id directly to the player schema
	constructor(x = 0, y = 0, z = 0) {
		super();
		this.x = x;
		this.y = y;
		this.z = z;
		this.isOnPlatform = true;
	}
}

export class MyRoomState extends Schema {
	@type({ map: Player })
	players = new MapSchema<Player>();
}
