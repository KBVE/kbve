import { Room, Client } from "@colyseus/core";
import { MyRoomState, Player } from "./schema/MyRoomState";
import { ServerScene } from "./ServerScene";

type GameKeys = "up" | "down" | "left" | "right" | "space" | "shift";

export class MyRoom extends Room<MyRoomState> {
    maxClients = 16;
    private serverScene: ServerScene; // Add serverScene as a property of MyRoom

    onCreate(options: any) {
        this.setState(new MyRoomState());
        this.serverScene = new ServerScene(); // Initialize serverScene

        this.onMessage("getPlayers", (client) => {
            const players = Array.from(this.state.players.entries()).map(
                ([sessionId, player]) => ({
                    sessionId,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                })
            );
            client.send("playersList", players);
        });

        this.onMessage("playerAction", (client, message: GameKeys) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                // Determine the action to take based on the message
                switch (message) {
                    case "up":
                        // Update player's y position or perform a jump action, for example
                        this.serverScene.movePlayer(client.sessionId, {
                            x: 0,
                            y: 0.1,
                            z: 0,
                        });
                        break;
                    case "down":
                        // Update player's y position to move down or crouch
                        this.serverScene.movePlayer(client.sessionId, {
                            x: 0,
                            y: -0.1,
                            z: 0,
                        });
                        break;
                    case "left":
                        // Update player's x position to move left
                        this.serverScene.movePlayer(client.sessionId, {
                            x: -0.1,
                            y: 0,
                            z: 0,
                        });
                        break;
                    case "right":
                        // Update player's x position to move right
                        this.serverScene.movePlayer(client.sessionId, {
                            x: 0.1,
                            y: 0,
                            z: 0,
                        });
                        break;
                    case "space":
                        // Perform a jump or other action associated with the space bar
                        break;
                    case "shift":
                        // Perform a run or other action associated with the shift key
                        break;
                    default:
                        console.log(`Unknown action: ${message}`);
                }
            }
        });

        this.serverScene.onUpdate = (delta) => {
            // Synchronize the player positions from the physics engine to the game state
            this.syncPlayerPositions();
        };
    }

    onJoin(client: Client, options: any) {
        console.log(`${client.sessionId} joined!`);
        const newPlayer = new Player();
        this.state.players.set(client.sessionId, newPlayer);
        this.serverScene.addPlayer(client.sessionId, {
            x: 0,
            y: 0,
            z: 0,
        }); // Add player to physics engine
        this.broadcast("playerJoined", {
            sessionId: client.sessionId,
            ...newPlayer,
        });
    }

    onLeave(client: Client, consented: boolean) {
        console.log(`${client.sessionId} left!`);
        this.state.players.delete(client.sessionId);
        this.broadcast("playerLeft", { sessionId: client.sessionId });
    }

    onDispose() {
        console.log(`room ${this.roomId} disposing...`);
    }

    private syncPlayerPositions() {
        // Here, we'll iterate over all players, get their updated positions
        // from the physics engine, and update the game state.
        // This should be filled with actual logic to fetch and apply new positions.
        this.state.players.forEach((player, sessionId) => {
            const newPosition = this.serverScene.getPlayerPosition(sessionId); // Replace with actual function to get position from physics
            if (newPosition) {
                player.x = newPosition.x;
                player.y = newPosition.y;
                player.z = newPosition.z;
                this.broadcast("playerMoved", {
                    sessionId,
                    x: player.x,
                    y: player.y,
                    z: player.z,
                });
            }
        });
    }
}
