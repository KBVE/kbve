import express, { Application, Request, Response } from 'express';
import { MonitorOptions, monitor } from '@colyseus/monitor';
import { Server } from 'colyseus';
import fetch from 'cross-fetch';
import { createServer } from 'http';
import { WebSocketTransport } from '@colyseus/ws-transport';
import path from 'path';

// import { GAME_NAME } from './shared/Constants';
// import { StateHandlerRoom } from './rooms/StateHandlerRoom';
import { MyRoom } from './rooms/MyRoom';

// server scene
import { ServerScene } from './rooms/ServerScene';
// const host = process.env.HOST ?? 'localhost';
const port = process.env.PORT ? Number(process.env.PORT) : 3000;

const app: Application = express();
const router = express.Router();

const server = new Server({
	transport: new WebSocketTransport({
		server: createServer(app),
	}),
});

//const sharedServerScene = ServerScene.getInstance();
// Game Rooms
server
	// .define(GAME_NAME, StateHandlerRoom)
	//.define('my_room', MyRoom, { serverScene: sharedServerScene })
	.define('my_room', MyRoom, { serverScene:  ServerScene.getInstance()})

	// filterBy allows us to call joinOrCreate and then hold one game per channel
	// https://discuss.colyseus.io/topic/345/is-it-possible-to-run-joinorcreatebyid/3
	.filterBy(['channelId']);

app.use(express.json());

if (process.env.NODE_ENV === 'production') {
	const clientBuildPath = path.join(__dirname, '/assets');
	app.use(express.static(clientBuildPath));
}

router.use('/colyseus', monitor(server as Partial<MonitorOptions>));

// Fetch token from developer portal and return to the embedded app
router.post('/token', async (req: Request, res: Response) => {
	if (!process.env.VITE_CLIENT_ID || !process.env.CLIENT_SECRET) {
		console.error('VITE_CLIENT_ID or CLIENT_SECRET is not set.');
		return;
	}

	const response = await fetch(`https://discord.com/api/oauth2/token`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: new URLSearchParams({
			client_id: process.env.VITE_CLIENT_ID,
			client_secret: process.env.CLIENT_SECRET,
			grant_type: 'authorization_code',
			code: req.body.code,
		}),
	});

	const { access_token } = (await response.json()) as {
		access_token: string;
	};

	res.send({ access_token });
});

app.use(process.env.NODE_ENV === 'production' ? '/api' : '/', router);

server.listen(port).then(() => {
	console.log(`App is listening on port ${port} !`);
});
