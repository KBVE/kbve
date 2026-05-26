import { Socket } from 'net';

const HOST = process.env.FACTORIO_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.FACTORIO_RCON ?? '27015', 10);
const PASSWORD = process.env.FACTORIO_RCON_PASSWORD ?? '';

const SERVERDATA_AUTH = 3;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH_RESPONSE = 2;
const SERVERDATA_RESPONSE_VALUE = 0;

export function getRconConfig() {
	return { host: HOST, port: PORT, password: PASSWORD };
}

export class RconClient {
	private socket: Socket;
	private buffer: Buffer = Buffer.alloc(0);
	private nextId = 1;
	private pending = new Map<
		number,
		{ resolve: (body: string) => void; reject: (err: Error) => void }
	>();

	private constructor(socket: Socket) {
		this.socket = socket;
		socket.on('data', (chunk) => this.onData(chunk));
		socket.on('error', (err) => this.failAll(err));
		socket.on('close', () => this.failAll(new Error('RCON socket closed')));
	}

	static async connect(
		host = HOST,
		port = PORT,
		timeoutMs = 5_000,
	): Promise<RconClient> {
		return new Promise((resolve, reject) => {
			const socket = new Socket();
			const timer = setTimeout(() => {
				socket.destroy();
				reject(new Error(`RCON connect to ${host}:${port} timed out`));
			}, timeoutMs);
			socket.once('error', (err) => {
				clearTimeout(timer);
				reject(err);
			});
			socket.connect(port, host, () => {
				clearTimeout(timer);
				resolve(new RconClient(socket));
			});
		});
	}

	async authenticate(password = PASSWORD): Promise<void> {
		const id = this.send(SERVERDATA_AUTH, password);
		await this.waitFor(id, SERVERDATA_AUTH_RESPONSE);
	}

	async exec(command: string): Promise<string> {
		const id = this.send(SERVERDATA_EXECCOMMAND, command);
		return this.waitFor(id, SERVERDATA_RESPONSE_VALUE);
	}

	close(): void {
		this.socket.end();
	}

	private send(type: number, body: string): number {
		const id = this.nextId++;
		const bodyBuf = Buffer.from(body, 'utf8');
		const packet = Buffer.alloc(14 + bodyBuf.length);
		packet.writeInt32LE(10 + bodyBuf.length, 0);
		packet.writeInt32LE(id, 4);
		packet.writeInt32LE(type, 8);
		bodyBuf.copy(packet, 12);
		this.socket.write(packet);
		return id;
	}

	private waitFor(id: number, expectedType: number): Promise<string> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`RCON request ${id} timed out`));
			}, 10_000);
			this.pending.set(id, {
				resolve: (body) => {
					clearTimeout(timer);
					resolve(body);
				},
				reject: (err) => {
					clearTimeout(timer);
					reject(err);
				},
			});
			void expectedType;
		});
	}

	private onData(chunk: Buffer): void {
		this.buffer = Buffer.concat([this.buffer, chunk]);
		while (this.buffer.length >= 12) {
			const size = this.buffer.readInt32LE(0);
			if (this.buffer.length < size + 4) return;
			const id = this.buffer.readInt32LE(4);
			const body = this.buffer.slice(12, 4 + size - 2).toString('utf8');
			this.buffer = this.buffer.slice(4 + size);
			const pending = this.pending.get(id);
			if (pending) {
				this.pending.delete(id);
				pending.resolve(body);
			} else if (id === -1) {
				this.failAll(new Error('RCON auth rejected'));
			}
		}
	}

	private failAll(err: Error): void {
		for (const [, p] of this.pending) {
			p.reject(err);
		}
		this.pending.clear();
	}
}
