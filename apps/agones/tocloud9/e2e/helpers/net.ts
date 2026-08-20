import net from 'node:net';

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

export function logonChallenge(account: string, build = 12340): Buffer {
	const name = Buffer.from(account.toUpperCase(), 'ascii');
	const body = Buffer.alloc(30 + name.length);
	let o = 0;
	body.write('WoW\0', o, 'ascii');
	o += 4;
	body[o++] = 3;
	body[o++] = 3;
	body[o++] = 5;
	body.writeUInt16LE(build, o);
	o += 2;
	body.write('68x\0', o, 'ascii');
	o += 4;
	body.write('niW\0', o, 'ascii');
	o += 4;
	body.write('SUne', o, 'ascii');
	o += 4;
	body.writeUInt32LE(0, o);
	o += 4;
	body.writeUInt32LE(0x0100007f, o);
	o += 4;
	body[o++] = name.length;
	name.copy(body, o);

	const header = Buffer.alloc(4);
	header[0] = 0x00;
	header[1] = 0x08;
	header.writeUInt16LE(body.length, 2);
	return Buffer.concat([header, body]);
}
