import net from 'node:net';

export { logonChallenge } from '../../src/protocol';

export const HOST = process.env.TC9_HOST ?? '127.0.0.1';
export const AUTH_PORT = Number(process.env.TC9_AUTH_PORT ?? 3724);
export const GATEWAY_PORT = Number(process.env.TC9_GATEWAY_PORT ?? 8085);
export const GATEWAY_SECOND_PORT = Number(
	process.env.TC9_GATEWAY_SECOND_PORT ?? 8045,
);

export function connect(
	port: number,
	host = HOST,
	timeoutMs = 10_000,
): Promise<net.Socket> {
	return new Promise((resolve, reject) => {
		const socket = net.createConnection({ port, host });
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`timed out connecting to ${host}:${port}`));
		}, timeoutMs);
		socket.once('connect', () => {
			clearTimeout(timer);
			resolve(socket);
		});
		socket.once('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

export function readAtLeast(
	socket: net.Socket,
	bytes: number,
	timeoutMs = 10_000,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		let total = 0;
		const done = (err?: Error) => {
			clearTimeout(timer);
			socket.off('data', onData);
			socket.off('error', onError);
			socket.off('close', onClose);
			err ? reject(err) : resolve(Buffer.concat(chunks));
		};
		const timer = setTimeout(
			() =>
				done(
					new Error(
						`timed out waiting for ${bytes} bytes (got ${total})`,
					),
				),
			timeoutMs,
		);
		const onData = (chunk: Buffer) => {
			chunks.push(chunk);
			total += chunk.length;
			if (total >= bytes) done();
		};
		const onError = (err: Error) => done(err);
		const onClose = () =>
			done(
				total >= bytes
					? undefined
					: new Error(`socket closed after ${total} bytes`),
			);
		socket.on('data', onData);
		socket.once('error', onError);
		socket.once('close', onClose);
	});
}
