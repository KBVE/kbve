import { Schema, Context, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
    @type("number") x;
    @type("number") y;
    @type("number") z;
    constructor(x = 0, y = 0, z = 0) {
        super();
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

export class MyRoomState extends Schema {
    @type({ map: Player })
    players = new MapSchema<Player>();
}
