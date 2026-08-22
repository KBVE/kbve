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
// Scope is deliberate. `execute` carries no bindings because every caller on
// that path validates its inputs down to a fixed character class first, so the
// statements built on top of it contain no free text at all.
//
// The staff console broke that assumption: an operator-supplied search term is
// free text, and admin reads need result sets. Hence the second lane below —
// COM_STMT_PREPARE / COM_STMT_EXECUTE with binary rows. Binding, not escaping,
// is what keeps that term out of the statement, so anything carrying caller
// text must go through `prepared` and never through `execute`.
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

export class Reader {
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

  lenencInt(): number {
    return readLenencInt(this);
  }

  /** Length-encoded string. A NULL column (0xfb prefix) reads back as null. */
  lenencString(): string | null {
    if (this.buf[this.pos] === 0xfb) {
      this.pos++;
      return null;
    }
    return new TextDecoder().decode(this.bytes(readLenencInt(this)));
  }
}

export class Writer {
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

  lenencInt(v: number): this {
    if (v < 0xfb) return this.u8(v);
    if (v <= 0xffff) return this.u8(0xfc).u8(v & 0xff).u8((v >> 8) & 0xff);
    if (v <= 0xffffff) {
      return this.u8(0xfd).u8(v & 0xff).u8((v >> 8) & 0xff).u8(
        (v >> 16) & 0xff,
      );
    }
    return this.u8(0xfe).u32(v >>> 0).u32(Math.floor(v / 0x100000000));
  }

  lenencString(s: string): this {
    const b = new TextEncoder().encode(s);
    return this.lenencInt(b.length).raw(b);
  }

  u16(v: number): this {
    return this.u8(v & 0xff).u8((v >> 8) & 0xff);
  }

  i64(v: number): this {
    const big = BigInt(Math.trunc(v));
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigInt64(0, big, true);
    return this.raw(out);
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

/** The slice of Deno.Conn this client actually uses. */
export type MysqlDuplex = Pick<Deno.Conn, "read" | "write" | "close">;

export class MysqlConnection {
  private seq = 0;
  private buffered = new Uint8Array(0);

  private constructor(private readonly conn: MysqlDuplex) {}

  /**
   * Wraps an already-open duplex, skipping connect and handshake. The codec
   * below is pure byte work that cannot otherwise be exercised without a live
   * MySQL 8.4 server, which is exactly the thing this deployment does not have
   * yet — this is how the statement lanes get tested against captured packets.
   */
  static fromDuplex(conn: MysqlDuplex): MysqlConnection {
    return new MysqlConnection(conn);
  }

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

  /**
   * Runs a statement with server-side bound parameters and decodes any result
   * set. Parameters travel in their own packet section, so a value can never
   * be reparsed as SQL no matter what characters it contains.
   */
  async prepared(sql: string, params: Param[] = []): Promise<PreparedResult> {
    const stmtId = await this.prepare(sql, params.length);
    try {
      return await this.executePrepared(stmtId, params);
    } finally {
      // COM_STMT_CLOSE draws no reply, so there is nothing to await or check.
      this.seq = -1;
      await this.writePacket(
        new Writer().u8(0x19).u32(stmtId).build(),
      ).catch(() => {});
    }
  }

  private async prepare(sql: string, paramCount: number): Promise<number> {
    this.seq = -1;
    await this.writePacket(
      new Writer().u8(0x16).raw(new TextEncoder().encode(sql)).build(),
    );
    const packet = await this.readPacket();
    if (packet[0] === 0xff) throw this.decodeError(packet);
    if (packet[0] !== 0x00) {
      throw new MysqlError("unexpected COM_STMT_PREPARE response");
    }

    const r = new Reader(packet);
    r.u8();
    const stmtId = r.u32();
    const columnCount = r.u16();
    const declaredParams = r.u16();
    if (declaredParams !== paramCount) {
      throw new MysqlError(
        `statement expects ${declaredParams} parameters, got ${paramCount}`,
      );
    }

    // Definition packets for the placeholders and the columns are sent up
    // front and repeated by COM_STMT_EXECUTE, so drain them and use the
    // execute-time copy instead.
    for (let i = 0; i < declaredParams + columnCount; i++) {
      await this.readPacket();
    }
    return stmtId;
  }

  private async executePrepared(
    stmtId: number,
    params: Param[],
  ): Promise<PreparedResult> {
    const w = new Writer()
      .u8(0x17)
      .u32(stmtId)
      .u8(0x00)
      .u32(1);

    if (params.length > 0) {
      const nullBitmap = new Uint8Array((params.length + 7) >> 3);
      params.forEach((v, i) => {
        if (v === null || v === undefined) nullBitmap[i >> 3] |= 1 << (i & 7);
      });
      w.raw(nullBitmap).u8(1);
      for (const v of params) w.u16(paramType(v));
      for (const v of params) {
        if (v === null || v === undefined) continue;
        if (typeof v === "number") w.i64(v);
        else w.lenencString(v);
      }
    }

    this.seq = -1;
    await this.writePacket(w.build());

    const first = await this.readPacket();
    if (first[0] === 0xff) throw this.decodeError(first);
    if (first[0] === 0x00) {
      const r = new Reader(first);
      r.u8();
      return { rows: [], affectedRows: readLenencInt(r) };
    }

    const columnCount = readLenencInt(new Reader(first));
    const columns: ColumnDef[] = [];
    for (let i = 0; i < columnCount; i++) {
      columns.push(parseColumnDef(await this.readPacket()));
    }

    const rows: Row[] = [];
    for (;;) {
      const packet = await this.readPacket();
      if (packet[0] === 0xff) throw this.decodeError(packet);
      if (packet[0] === 0xfe && packet.length < 9) break;
      rows.push(decodeBinaryRow(packet, columns));
    }
    return { rows, affectedRows: 0 };
  }
}

export type Param = string | number | null;
export type Value = string | number | null;
export type Row = Record<string, Value>;

export interface PreparedResult {
  rows: Row[];
  affectedRows: number;
}

export interface ColumnDef {
  name: string;
  type: number;
  unsigned: boolean;
}

const TYPE_LONGLONG = 0x08;
const TYPE_VAR_STRING = 0xfd;
const TYPE_NULL = 0x06;
const UNSIGNED_FLAG = 0x20;

function paramType(v: Param): number {
  if (v === null || v === undefined) return TYPE_NULL;
  return typeof v === "number" ? TYPE_LONGLONG : TYPE_VAR_STRING;
}

export function parseColumnDef(packet: Uint8Array): ColumnDef {
  const r = new Reader(packet);
  r.lenencString(); // catalog
  r.lenencString(); // schema
  r.lenencString(); // table
  r.lenencString(); // org_table
  const name = r.lenencString() ?? "";
  r.lenencString(); // org_name
  r.lenencInt(); // fixed-length field marker
  r.u16(); // charset
  r.u32(); // column length
  const type = r.u8();
  const flags = r.u16();
  return { name, type, unsigned: (flags & UNSIGNED_FLAG) !== 0 };
}

/**
 * Binary result rows carry a NULL bitmap offset by two bits, then values laid
 * out per column type with no delimiters — so the column definitions are the
 * only thing that makes the payload parseable.
 */
export function decodeBinaryRow(packet: Uint8Array, columns: ColumnDef[]): Row {
  const bitmapLen = (columns.length + 9) >> 3;
  const bitmap = packet.subarray(1, 1 + bitmapLen);
  const r = new Reader(packet.subarray(1 + bitmapLen));
  const row: Row = {};

  columns.forEach((col, i) => {
    const nullBit = i + 2;
    if ((bitmap[nullBit >> 3] >> (nullBit & 7)) & 1) {
      row[col.name] = null;
      return;
    }
    row[col.name] = decodeBinaryValue(r, col);
  });
  return row;
}

export function decodeBinaryValue(r: Reader, col: ColumnDef): Value {
  switch (col.type) {
    case 0x01: {
      const b = r.u8();
      return col.unsigned ? b : (b << 24) >> 24;
    }
    case 0x02:
    case 0x0d: {
      const v = r.u16();
      return col.unsigned ? v : (v << 16) >> 16;
    }
    case 0x03:
    case 0x09: {
      const v = r.u32();
      return col.unsigned ? v : v | 0;
    }
    case TYPE_LONGLONG: {
      const b = r.bytes(8);
      const dv = new DataView(b.buffer, b.byteOffset, 8);
      const big = col.unsigned
        ? dv.getBigUint64(0, true)
        : dv.getBigInt64(0, true);
      // Counts and ids stay well inside the safe range; anything past it would
      // silently lose precision as a number, so hand it back as text.
      return big <= BigInt(Number.MAX_SAFE_INTEGER) &&
          big >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(big)
        : big.toString();
    }
    case 0x04: {
      const b = r.bytes(4);
      return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0, true);
    }
    case 0x05: {
      const b = r.bytes(8);
      return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0, true);
    }
    case 0x07:
    case 0x0a:
    case 0x0c:
      return decodeBinaryDateTime(r);
    default:
      return r.lenencString();
  }
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * Emitted as MySQL's own text form rather than an ISO instant: AzerothCore
 * stores server-local wall-clock time with no offset, so stamping a Z on it
 * would be a claim we cannot back up.
 */
export function decodeBinaryDateTime(r: Reader): string | null {
  const len = r.u8();
  if (len === 0) return null;
  const year = r.u16();
  const month = r.u8();
  const day = r.u8();
  let hour = 0, minute = 0, second = 0;
  if (len >= 7) {
    hour = r.u8();
    minute = r.u8();
    second = r.u8();
  }
  if (len >= 11) r.u32();
  return `${pad(year, 4)}-${pad(month)}-${pad(day)} ${pad(hour)}:${
    pad(minute)
  }:${pad(second)}`;
}

export function readLenencInt(r: Reader): number {
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
