import { Socket } from 'net';

const RCON_HOST = process.env.RCON_HOST ?? '127.0.0.1';
const RCON_PORT = parseInt(process.env.RCON_PORT ?? '25575', 10);
const RCON_PASSWORD = process.env.RCON_PASSWORD ?? 'test';

const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_EXECCOMMAND = 2;

function encodePacket(id: number, type: number, body: string): Buffer {
	const bodyBuf = Buffer.from(body, 'utf8');
	const size = 4 + 4 + bodyBuf.length + 2;
	const buf = Buffer.alloc(4 + size);
	buf.writeInt32LE(size, 0);
	buf.writeInt32LE(id, 4);
	buf.writeInt32LE(type, 8);
	bodyBuf.copy(buf, 12);
	buf.writeUInt8(0, 12 + bodyBuf.length);
	buf.writeUInt8(0, 13 + bodyBuf.length);
	return buf;
}

function decodePacket(buf: Buffer): { id: number; type: number; body: string } {
	const id = buf.readInt32LE(4);
	const type = buf.readInt32LE(8);
	const body = buf.toString('utf8', 12, buf.length - 2);
	return { id, type, body };
}

export class RconClient {
	private socket: Socket | null = null;
	private requestId = 0;

	async connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket = new Socket();
			this.socket.connect(RCON_PORT, RCON_HOST, () => resolve());
			this.socket.once('error', reject);
		});
	}

	async authenticate(): Promise<boolean> {
		const id = ++this.requestId;
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject(new Error('Not connected'));
			this.socket.write(encodePacket(id, SERVERDATA_AUTH, RCON_PASSWORD));
			this.socket.once('data', (data) => {
				const pkt = decodePacket(data);
				resolve(pkt.id === id && pkt.type === SERVERDATA_AUTH_RESPONSE);
			});
			this.socket.once('error', reject);
		});
	}

	async command(cmd: string): Promise<string> {
		const id = ++this.requestId;
		return new Promise((resolve, reject) => {
			if (!this.socket) return reject(new Error('Not connected'));
			this.socket.write(encodePacket(id, SERVERDATA_EXECCOMMAND, cmd));
			this.socket.once('data', (data) => {
				const pkt = decodePacket(data);
				resolve(pkt.body);
			});
			this.socket.once('error', reject);
		});
	}

	disconnect(): void {
		this.socket?.destroy();
		this.socket = null;
	}
}

export async function waitForRcon(
	timeoutMs = 180_000,
	intervalMs = 3_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const client = new RconClient();
			await client.connect();
			const authed = await client.authenticate();
			client.disconnect();
			if (authed) return;
		} catch {
			// Server not ready yet
		}
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	throw new Error(`RCON not ready after ${timeoutMs}ms`);
}
