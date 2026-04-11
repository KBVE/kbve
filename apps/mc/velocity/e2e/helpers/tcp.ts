import { Socket } from 'net';

const HOST = process.env.VELOCITY_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.VELOCITY_PORT ?? '25578', 10);

export function getVelocityAddress() {
	return { host: HOST, port: PORT };
}

export async function tcpConnect(
	host = HOST,
	port = PORT,
	timeoutMs = 5_000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket = new Socket();
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`TCP connect to ${host}:${port} timed out`));
		}, timeoutMs);
		socket.once('error', (err) => {
			clearTimeout(timer);
			socket.destroy();
			reject(err);
		});
		socket.connect(port, host, () => {
			clearTimeout(timer);
			socket.end();
			resolve();
		});
	});
}

/**
 * Sends a Minecraft Server List Ping handshake + status request and
 * resolves with the raw response bytes if the server responds. Only
 * asserts that the proxy speaks the MC protocol — does not parse JSON.
 */
export async function mcStatusPing(
	host = HOST,
	port = PORT,
	timeoutMs = 10_000,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const socket = new Socket();
		const chunks: Buffer[] = [];
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`MC status ping to ${host}:${port} timed out`));
		}, timeoutMs);

		socket.once('error', (err) => {
			clearTimeout(timer);
			socket.destroy();
			reject(err);
		});

		socket.on('data', (buf) => {
			chunks.push(buf);
			if (Buffer.concat(chunks).length > 4) {
				clearTimeout(timer);
				socket.end();
				resolve(Buffer.concat(chunks));
			}
		});

		socket.connect(port, host, () => {
			const addr = Buffer.from(host, 'utf8');
			// Handshake: packetId 0x00, protoVersion 770 (1.21.11), addr, port, nextState 1
			const handshake = Buffer.concat([
				Buffer.from([0x00, 0x82, 0x06]),
				varInt(addr.length),
				addr,
				Buffer.from([(port >> 8) & 0xff, port & 0xff, 0x01]),
			]);
			socket.write(Buffer.concat([varInt(handshake.length), handshake]));
			// Status request: packetId 0x00, empty body
			socket.write(Buffer.from([0x01, 0x00]));
		});
	});
}

function varInt(value: number): Buffer {
	const bytes: number[] = [];
	let v = value;
	while ((v & ~0x7f) !== 0) {
		bytes.push((v & 0x7f) | 0x80);
		v >>>= 7;
	}
	bytes.push(v);
	return Buffer.from(bytes);
}
