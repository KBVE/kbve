import { createSocket } from 'dgram';

const HOST = process.env.FACTORIO_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.FACTORIO_UDP ?? '34197', 10);

export function getFactorioUdpAddress() {
	return { host: HOST, port: PORT };
}

export async function udpProbe(
	host = HOST,
	port = PORT,
	timeoutMs = 5_000,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const socket = createSocket('udp4');
		const timer = setTimeout(() => {
			socket.close();
			reject(new Error(`UDP probe to ${host}:${port} timed out`));
		}, timeoutMs);

		socket.once('error', (err) => {
			clearTimeout(timer);
			socket.close();
			reject(err);
		});

		socket.once('message', (msg) => {
			clearTimeout(timer);
			socket.close();
			resolve(msg);
		});

		const probe = Buffer.from([0x00]);
		socket.send(probe, port, host, (err) => {
			if (err) {
				clearTimeout(timer);
				socket.close();
				reject(err);
			}
		});
	});
}
