import { describe, it, expect } from 'vitest';
import * as net from 'node:net';

const MC_HOST = process.env['MC_HOST'] ?? '127.0.0.1';
const MC_PORT = Number(process.env['MC_PORT'] ?? 25565);

/**
 * Encode a VarInt (Minecraft protocol format).
 */
function writeVarInt(value: number): Buffer {
	const bytes: number[] = [];
	while (true) {
		if ((value & ~0x7f) === 0) {
			bytes.push(value);
			break;
		}
		bytes.push((value & 0x7f) | 0x80);
		value >>>= 7;
	}
	return Buffer.from(bytes);
}

/**
 * Read a VarInt from a buffer at the given offset.
 * Returns [value, bytesRead].
 */
function readVarInt(buf: Buffer, offset: number): [number, number] {
	let result = 0;
	let shift = 0;
	let bytesRead = 0;

	while (true) {
		if (offset + bytesRead >= buf.length) {
			throw new Error('VarInt extends beyond buffer');
		}
		const byte = buf[offset + bytesRead]!;
		result |= (byte & 0x7f) << shift;
		bytesRead++;
		if ((byte & 0x80) === 0) break;
		shift += 7;
		if (shift >= 32) throw new Error('VarInt too large');
	}

	return [result, bytesRead];
}

/**
 * Build a Minecraft Handshake + Status Request packet sequence.
 * Protocol: https://wiki.vg/Server_List_Ping
 */
function buildStatusRequest(host: string, port: number): Buffer {
	// Handshake packet (packet ID 0x00)
	const protocolVersion = writeVarInt(-1); // -1 = not logged in, just status
	const hostBuf = Buffer.from(host, 'utf-8');
	const hostLen = writeVarInt(hostBuf.length);
	const portBuf = Buffer.alloc(2);
	portBuf.writeUInt16BE(port);
	const nextState = writeVarInt(1); // 1 = status

	const handshakePayload = Buffer.concat([
		writeVarInt(0x00), // packet ID
		protocolVersion,
		hostLen,
		hostBuf,
		portBuf,
		nextState,
	]);

	const handshakePacket = Buffer.concat([
		writeVarInt(handshakePayload.length),
		handshakePayload,
	]);

	// Status Request packet (packet ID 0x00, no fields)
	const statusPayload = writeVarInt(0x00);
	const statusPacket = Buffer.concat([
		writeVarInt(statusPayload.length),
		statusPayload,
	]);

	return Buffer.concat([handshakePacket, statusPacket]);
}

function waitForPort(
	host: string,
	port: number,
	timeoutMs = 20_000,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const deadline = Date.now() + timeoutMs;

		function attempt() {
			const socket = net.createConnection({ host, port }, () => {
				socket.destroy();
				resolve();
			});
			socket.on('error', () => {
				socket.destroy();
				if (Date.now() > deadline) {
					reject(
						new Error(
							`Timed out waiting for ${host}:${port} after ${timeoutMs}ms`,
						),
					);
				} else {
					setTimeout(attempt, 500);
				}
			});
		}

		attempt();
	});
}

describe('MC Server Status Ping', () => {
	it('should respond to a Server List Ping with valid JSON', async () => {
		await waitForPort(MC_HOST, MC_PORT);

		const response = await new Promise<string>((resolve, reject) => {
			const socket = net.createConnection(
				{ host: MC_HOST, port: MC_PORT },
				() => {
					socket.write(buildStatusRequest(MC_HOST, MC_PORT));
				},
			);

			const chunks: Buffer[] = [];
			socket.on('data', (chunk) => {
				chunks.push(chunk);

				// Try to parse — we may need multiple chunks
				const buf = Buffer.concat(chunks);
				try {
					const [packetLen, pLenBytes] = readVarInt(buf, 0);
					if (buf.length >= pLenBytes + packetLen) {
						// We have the full packet
						let offset = pLenBytes;
						const [, pIdBytes] = readVarInt(buf, offset); // packet ID (0x00)
						offset += pIdBytes;
						const [strLen, strLenBytes] = readVarInt(buf, offset);
						offset += strLenBytes;
						const json = buf
							.subarray(offset, offset + strLen)
							.toString('utf-8');
						socket.destroy();
						resolve(json);
					}
				} catch {
					// Not enough data yet, wait for more
				}
			});

			socket.on('error', (err) => {
				socket.destroy();
				reject(err);
			});

			setTimeout(() => {
				socket.destroy();
				reject(new Error('Timed out waiting for status response'));
			}, 10_000);
		});

		const status = JSON.parse(response);

		// Validate the MC status response structure
		expect(status).toHaveProperty('version');
		expect(status.version).toHaveProperty('name');
		expect(status.version).toHaveProperty('protocol');
		expect(typeof status.version.protocol).toBe('number');

		expect(status).toHaveProperty('players');
		expect(status.players).toHaveProperty('max');
		expect(status.players).toHaveProperty('online');

		expect(status).toHaveProperty('description');
	});
});
