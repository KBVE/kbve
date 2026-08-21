// ---------------------------------------------------------------------------
// Minimal MySQL 8.4 client — just enough of the protocol to run a handful of
// statements against acore_auth from inside an edge worker.
//
// Why not a driver: the deno.land MySQL modules predate MySQL 8.4, where
// mysql_native_password is compiled out and caching_sha2_password is the only
// way in. Rather than pin a driver that cannot complete the handshake, this
// implements the two auth paths 8.4 actually offers over a plaintext socket —
// the cached fast path, and the RSA public-key exchange for a cold cache.
//
// Scope is deliberate. There is no prepared-statement support because every
// caller validates its inputs down to a fixed character class first, so the
// statements built on top of this contain no free text at all.
// ---------------------------------------------------------------------------

const CLIENT_LONG_PASSWORD = 0x00000001;
const CLIENT_LONG_FLAG = 0x00000004;
const CLIENT_CONNECT_WITH_DB = 0x00000008;
const CLIENT_PROTOCOL_41 = 0x00000200;
const CLIENT_SECURE_CONNECTION = 0x00008000;
const CLIENT_PLUGIN_AUTH = 0x00080000;
const CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA = 0x00200000;
const CLIENT_DEPRECATE_EOF = 0x01000000;

const CLIENT_FLAGS = CLIENT_LONG_PASSWORD |
  CLIENT_LONG_FLAG |
  CLIENT_CONNECT_WITH_DB |
  CLIENT_PROTOCOL_41 |
  CLIENT_SECURE_CONNECTION |
  CLIENT_PLUGIN_AUTH |
  CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA |
  CLIENT_DEPRECATE_EOF;

const MAX_PACKET = 0x1000000;
const CONNECT_TIMEOUT_MS = 5_000;

export class MysqlError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "MysqlError";
  }
}

/** True when the server rejected a write because a UNIQUE index already holds the value. */
export function isDuplicateKey(err: unknown): boolean {
  return err instanceof MysqlError && err.code === 1062;
}

class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  u8(): number {
    return this.buf[this.pos++];
  }

  u16(): number {
    const v = this.buf[this.pos] | (this.buf[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }

  u32(): number {
    const v = this.buf[this.pos] |
      (this.buf[this.pos + 1] << 8) |
      (this.buf[this.pos + 2] << 16) |
      (this.buf[this.pos + 3] << 24);
    this.pos += 4;
    return v >>> 0;
  }

  bytes(n: number): Uint8Array {
    const v = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }

  skip(n: number): void {
    this.pos += n;
  }

  /** Reads through the next NUL, or to the end if the string is unterminated. */
  nullString(): string {
    const start = this.pos;
    while (this.pos < this.buf.length && this.buf[this.pos] !== 0) this.pos++;
    const out = this.buf.subarray(start, this.pos);
    if (this.pos < this.buf.length) this.pos++;
    return new TextDecoder().decode(out);
  }

  restString(): string {
    return new TextDecoder().decode(this.buf.subarray(this.pos));
  }
}

class Writer {
  private parts: Uint8Array[] = [];

  u8(v: number): this {
    this.parts.push(new Uint8Array([v & 0xff]));
    return this;
  }

  u32(v: number): this {
    this.parts.push(
      new Uint8Array([
        v & 0xff,
        (v >> 8) & 0xff,
        (v >> 16) & 0xff,
        (v >> 24) & 0xff,
      ]),
    );
    return this;
  }

  zeros(n: number): this {
    this.parts.push(new Uint8Array(n));
    return this;
  }

  raw(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }

  nullString(s: string): this {
    this.parts.push(new TextEncoder().encode(s));
    return this.u8(0);
  }

  /** Length-encoded blob. Auth payloads are always short, so only the 1-byte form is needed. */
  lenencBytes(b: Uint8Array): this {
    if (b.length > 250) {
      throw new MysqlError("length-encoded payload too large for auth packet");
    }
    return this.u8(b.length).raw(b);
  }

  build(): Uint8Array {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of this.parts) {
      out.set(p, offset);
      offset += p.length;
    }
    return out;
  }
}

async function sha256(...chunks: Uint8Array[]): Promise<Uint8Array> {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    joined.set(c, offset);
    offset += c.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
}

function xorInto(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i % b.length];
  return out;
}

/**
 * caching_sha2_password fast-auth scramble:
 *   XOR(SHA256(pw), SHA256(SHA256(SHA256(pw)) || nonce))
 */
async function scramble(
  password: string,
  nonce: Uint8Array,
): Promise<Uint8Array> {
  if (password === "") return new Uint8Array(0);
  const pw = new TextEncoder().encode(password);
  const h1 = await sha256(pw);
  const h2 = await sha256(h1);
  const h3 = await sha256(h2, nonce);
  return xorInto(h1, h3);
}

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Cold-cache path. The server hands back its RSA public key and expects the
 * NUL-terminated password, obfuscated with the nonce, encrypted under
 * OAEP/SHA-1 — which is what MySQL's RSA_PKCS1_OAEP_PADDING means.
 */
async function encryptPassword(
  password: string,
  nonce: Uint8Array,
  pem: string,
): Promise<Uint8Array> {
  const plain = new TextEncoder().encode(password + "\0");
  const obfuscated = xorInto(plain, nonce);
  const key = await crypto.subtle.importKey(
    "spki",
    pemToDer(pem),
    { name: "RSA-OAEP", hash: "SHA-1" },
    false,
    ["encrypt"],
  );
  return new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, obfuscated),
  );
}

export interface MysqlConfig {
  hostname: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export class MysqlConnection {
  private seq = 0;
  private buffered = new Uint8Array(0);

  private constructor(private readonly conn: Deno.Conn) {}

  static async connect(cfg: MysqlConfig): Promise<MysqlConnection> {
    const conn = await Promise.race([
      Deno.connect({ hostname: cfg.hostname, port: cfg.port }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new MysqlError("mysql connect timed out")),
          CONNECT_TIMEOUT_MS,
        )
      ),
    ]);
    const client = new MysqlConnection(conn);
    try {
      await client.handshake(cfg);
    } catch (err) {
      client.close();
      throw err;
    }
    return client;
  }

  close(): void {
    try {
      this.conn.close();
    } catch {
      // Already closed, or the peer hung up first. Nothing to salvage.
    }
  }

  // ---------- framing ----------

  private async fill(n: number): Promise<void> {
    while (this.buffered.length < n) {
      const chunk = new Uint8Array(16 * 1024);
      const read = await this.conn.read(chunk);
      if (read === null) {
        throw new MysqlError("mysql closed the connection mid-packet");
      }
      const merged = new Uint8Array(this.buffered.length + read);
      merged.set(this.buffered);
      merged.set(chunk.subarray(0, read), this.buffered.length);
      this.buffered = merged;
    }
  }

  private async readPacket(): Promise<Uint8Array> {
    await this.fill(4);
    const len = this.buffered[0] | (this.buffered[1] << 8) |
      (this.buffered[2] << 16);
    this.seq = this.buffered[3];
    await this.fill(4 + len);
    const payload = this.buffered.subarray(4, 4 + len);
    const copy = new Uint8Array(payload);
    this.buffered = this.buffered.subarray(4 + len);
    return copy;
  }

  private async writePacket(payload: Uint8Array): Promise<void> {
    this.seq = (this.seq + 1) & 0xff;
    const frame = new Uint8Array(4 + payload.length);
    frame[0] = payload.length & 0xff;
    frame[1] = (payload.length >> 8) & 0xff;
    frame[2] = (payload.length >> 16) & 0xff;
    frame[3] = this.seq;
    frame.set(payload, 4);
    let written = 0;
    while (written < frame.length) {
      written += await this.conn.write(frame.subarray(written));
    }
  }

  // ---------- handshake ----------

  private async handshake(cfg: MysqlConfig): Promise<void> {
    const greeting = await this.readPacket();
    const r = new Reader(greeting);

    const protocol = r.u8();
    if (protocol === 0xff) throw this.decodeError(greeting);
    if (protocol !== 10) {
      throw new MysqlError(`unsupported mysql handshake protocol ${protocol}`);
    }

    r.nullString(); // server version
    r.u32(); // connection id
    const nonce1 = r.bytes(8);
    r.skip(1); // filler
    r.u16(); // capability flags, lower
    r.u8(); // charset
    r.u16(); // status flags
    r.u16(); // capability flags, upper
    const authDataLen = r.u8();
    r.skip(10); // reserved
    // The trailing NUL of part 2 is counted in authDataLen but is not scramble data.
    const part2Len = Math.max(13, authDataLen - 8) - 1;
    const nonce2 = r.bytes(part2Len);
    const plugin = r.remaining > 0 ? r.nullString() : "caching_sha2_password";

    if (plugin !== "caching_sha2_password") {
      throw new MysqlError(`unsupported mysql auth plugin ${plugin}`);
    }

    const nonce = new Uint8Array(nonce1.length + nonce2.length);
    nonce.set(nonce1);
    nonce.set(nonce2, nonce1.length);

    const response = new Writer()
      .u32(CLIENT_FLAGS)
      .u32(MAX_PACKET)
      .u8(0xff) // utf8mb4_0900_ai_ci
      .zeros(23)
      .nullString(cfg.username)
      .lenencBytes(await scramble(cfg.password, nonce))
      .nullString(cfg.database)
      .nullString(plugin)
      .build();

    await this.writePacket(response);
    await this.finishAuth(cfg.password, nonce);
  }

  private async finishAuth(password: string, nonce: Uint8Array): Promise<void> {
    for (;;) {
      const packet = await this.readPacket();
      switch (packet[0]) {
        case 0x00:
          return;
        case 0xff:
          throw this.decodeError(packet);
        case 0x01: {
          const status = packet[1];
          if (status === 0x03) break; // fast auth succeeded; OK packet follows
          if (status !== 0x04) {
            throw new MysqlError(
              `unexpected auth status 0x${status.toString(16)}`,
            );
          }
          // Full auth. Ask for the public key, then send the encrypted password.
          await this.writePacket(new Uint8Array([0x02]));
          const keyPacket = await this.readPacket();
          if (keyPacket[0] === 0xff) throw this.decodeError(keyPacket);
          const pem = new TextDecoder().decode(keyPacket.subarray(1));
          await this.writePacket(await encryptPassword(password, nonce, pem));
          break;
        }
        default:
          throw new MysqlError(
            `unexpected auth packet 0x${packet[0].toString(16)}`,
          );
      }
    }
  }

  private decodeError(packet: Uint8Array): MysqlError {
    const r = new Reader(packet);
    r.u8(); // 0xff
    const code = r.u16();
    if (packet[3] === 0x23) r.skip(6); // '#' + SQL state
    return new MysqlError(r.restString() || `mysql error ${code}`, code);
  }

  // ---------- statements ----------

  /**
   * Runs a statement that returns no rows and reports how many it touched.
   * A result set coming back is a programming error, not a runtime condition,
   * so it throws rather than silently returning 0.
   */
  async execute(sql: string): Promise<number> {
    this.seq = -1;
    await this.writePacket(
      new Writer().u8(0x03).raw(new TextEncoder().encode(sql)).build(),
    );
    const packet = await this.readPacket();
    if (packet[0] === 0xff) throw this.decodeError(packet);
    if (packet[0] !== 0x00) {
      throw new MysqlError("statement returned a result set; expected OK");
    }
    const r = new Reader(packet);
    r.u8();
    return readLenencInt(r);
  }
}

function readLenencInt(r: Reader): number {
  const first = r.u8();
  if (first < 0xfb) return first;
  if (first === 0xfc) return r.u16();
  if (first === 0xfd) {
    const b = r.bytes(3);
    return b[0] | (b[1] << 8) | (b[2] << 16);
  }
  if (first === 0xfe) {
    const lo = r.u32();
    const hi = r.u32();
    return lo + hi * 0x100000000;
  }
  throw new MysqlError(
    `unexpected length-encoded integer prefix 0x${first.toString(16)}`,
  );
}
