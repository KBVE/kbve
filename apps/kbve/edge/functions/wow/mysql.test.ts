// ---------------------------------------------------------------------------
// `deno test functions/wow/mysql.test.ts`
//
// The prepared-statement lane is pure byte work, so it is testable without a
// server — which matters here, because TC9_MYSQL_* is not provisioned and the
// first real exercise of this code would otherwise be against live account
// data.
//
// Every fixture below is a literal packet written from the MySQL 8.x protocol
// documentation, never a product of this module's own Writer. Feeding an
// encoder's output back into its decoder passes happily when both halves share
// the same mistake.
// ---------------------------------------------------------------------------

import {
  type ColumnDef,
  decodeBinaryRow,
  decodeBinaryValue,
  MysqlConnection,
  type MysqlDuplex,
  MysqlError,
  parseColumnDef,
  Reader,
  Writer,
} from "./mysql.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertBytes(
  actual: Uint8Array,
  expected: number[],
  label: string,
): void {
  const got = [...actual];
  if (got.length !== expected.length || got.some((b, i) => b !== expected[i])) {
    throw new Error(
      `${label}:\n  expected [${expected.map(hex).join(" ")}]\n  got      [${
        got.map(hex).join(" ")
      }]`,
    );
  }
}

function hex(b: number): string {
  return b.toString(16).padStart(2, "0");
}

function bytes(...parts: (number | number[] | string)[]): Uint8Array {
  const flat: number[] = [];
  for (const p of parts) {
    if (typeof p === "number") flat.push(p);
    else if (typeof p === "string") flat.push(...new TextEncoder().encode(p));
    else flat.push(...p);
  }
  return new Uint8Array(flat);
}

const u16 = (v: number): number[] => [v & 0xff, (v >> 8) & 0xff];
const u32 = (v: number): number[] => [
  v & 0xff,
  (v >>> 8) & 0xff,
  (v >>> 16) & 0xff,
  (v >>> 24) & 0xff,
];

// ---------------------------------------------------------------------------
// Length-encoded integers — the prefix boundaries the spec switches on
// ---------------------------------------------------------------------------

Deno.test("lenenc int decodes at every width boundary", () => {
  const cases: [number[], number, string][] = [
    [[0x00], 0, "zero"],
    [[0x01], 1, "one"],
    [[0xfa], 250, "250 is the last single-byte value"],
    [[0xfc, 0xfb, 0x00], 251, "251 needs the 0xfc prefix"],
    [[0xfc, 0xff, 0xff], 65535, "0xfc holds 16 bits"],
    [[0xfd, 0x00, 0x00, 0x01], 65536, "0xfd starts at 2^16"],
    [[0xfd, 0xff, 0xff, 0xff], 16777215, "0xfd holds 24 bits"],
    [[0xfe, ...u32(16777216), ...u32(0)], 16777216, "0xfe starts at 2^24"],
    [
      [0xfe, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00],
      8589934591,
      "0xfe carries the high word",
    ],
  ];
  for (const [raw, expected, label] of cases) {
    assertEquals(new Reader(bytes(raw)).lenencInt(), expected, label);
  }
});

Deno.test("0xfb is a NULL marker, not an integer prefix", () => {
  let thrown: unknown;
  try {
    new Reader(bytes([0xfb])).lenencInt();
  } catch (err) {
    thrown = err;
  }
  assert(thrown instanceof MysqlError, "0xfb must be rejected as an integer");
});

Deno.test("lenenc int encodes at every width boundary", () => {
  const cases: [number, number[], string][] = [
    [0, [0x00], "zero"],
    [250, [0xfa], "250 stays single-byte"],
    [251, [0xfc, 0xfb, 0x00], "251 promotes to 0xfc"],
    [65535, [0xfc, 0xff, 0xff], "0xfc upper bound"],
    [65536, [0xfd, 0x00, 0x00, 0x01], "0xfd lower bound"],
    [16777215, [0xfd, 0xff, 0xff, 0xff], "0xfd upper bound"],
    [16777216, [0xfe, ...u32(16777216), ...u32(0)], "0xfe lower bound"],
    [
      8589934591,
      [0xfe, 0xff, 0xff, 0xff, 0xff, 0x01, 0x00, 0x00, 0x00],
      "0xfe high word",
    ],
  ];
  for (const [value, expected, label] of cases) {
    assertBytes(new Writer().lenencInt(value).build(), expected, label);
  }
});

// ---------------------------------------------------------------------------
// Length-encoded strings
// ---------------------------------------------------------------------------

Deno.test("lenenc string handles NULL, empty and multi-byte payloads", () => {
  assertEquals(new Reader(bytes([0xfb])).lenencString(), null, "0xfb is NULL");
  assertEquals(new Reader(bytes([0x00])).lenencString(), "", "empty string");
  assertEquals(
    new Reader(bytes([0x05], "SNEED")).lenencString(),
    "SNEED",
    "short string",
  );
  assertEquals(
    new Reader(bytes([0x02], "é")).lenencString(),
    "é",
    "length is bytes, not characters",
  );

  const long = "x".repeat(300);
  assertEquals(
    new Reader(bytes([0xfc, ...u16(300)], long)).lenencString(),
    long,
    "0xfc-prefixed string",
  );
});

Deno.test("an empty lenenc string is not confused with NULL", () => {
  const r = new Reader(bytes([0x00, 0xfb, 0x00]));
  assertEquals(r.lenencString(), "", "first is empty");
  assertEquals(r.lenencString(), null, "second is NULL");
  assertEquals(r.lenencString(), "", "third is empty");
});

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

function columnDef(name: string, type: number, unsigned: boolean): Uint8Array {
  return bytes(
    [0x03],
    "def",
    [0x00, 0x00, 0x00],
    [name.length],
    name,
    [0x00],
    [0x0c],
    u16(0x21),
    u32(0),
    [type],
    u16(unsigned ? 0x20 : 0x00),
    [0x00],
    u16(0),
  );
}

Deno.test("column definition yields name, type and signedness", () => {
  const def = parseColumnDef(columnDef("unbandate", 0x08, true));
  assertEquals(def.name, "unbandate", "name");
  assertEquals(def.type, 0x08, "type");
  assertEquals(def.unsigned, true, "unsigned flag");

  const signed = parseColumnDef(columnDef("gmlevel", 0x01, false));
  assertEquals(signed.unsigned, false, "signed flag");
});

// ---------------------------------------------------------------------------
// Binary result rows
//
// The NULL bitmap in a result row is offset by two bits, so column N lives at
// bit N+2. Getting that wrong shifts every NULL onto its neighbour, which is
// silent and wrong rather than loud and wrong — hence the explicit
// first-and-last-column case below.
// ---------------------------------------------------------------------------

const ROW_COLUMNS: ColumnDef[] = [
  { name: "id", type: 0x08, unsigned: true },
  { name: "gmlevel", type: 0x01, unsigned: false },
  { name: "expansion", type: 0x01, unsigned: true },
  { name: "port", type: 0x02, unsigned: true },
  { name: "account", type: 0x03, unsigned: true },
  { name: "unbandate", type: 0x08, unsigned: true },
  { name: "username", type: 0xfd, unsigned: false },
  { name: "last_login", type: 0x0c, unsigned: false },
];

Deno.test("binary row honours the two-bit NULL bitmap offset", () => {
  // Columns 0 and 7 are NULL: bit 2 (0x04 of byte 0) and bit 9 (0x02 of byte 1).
  const packet = bytes(
    [0x00],
    [0x04, 0x02],
    [0xff],
    [0xc8],
    u16(40000),
    u32(3000000000),
    [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80],
    [0x05],
    "SNEED",
  );

  const row = decodeBinaryRow(packet, ROW_COLUMNS);

  assertEquals(row.id, null, "column 0 is NULL");
  assertEquals(row.last_login, null, "column 7 is NULL");
  assertEquals(row.gmlevel, -1, "signed TINY sign-extends");
  assertEquals(row.expansion, 200, "unsigned TINY stays positive");
  assertEquals(row.port, 40000, "unsigned SHORT above 2^15");
  assertEquals(row.account, 3000000000, "unsigned LONG above 2^31");
  assertEquals(
    row.unbandate,
    "9223372036854775808",
    "unsigned LONGLONG past 2^53 degrades to text rather than losing digits",
  );
  assertEquals(row.username, "SNEED", "VAR_STRING");
});

Deno.test("a bitmap with no NULLs decodes every column", () => {
  const packet = bytes(
    [0x00],
    [0x00, 0x00],
    u32(7),
    u32(0),
    [0x00],
    [0x00],
    u16(0),
    u32(0),
    u32(1893456000),
    u32(0),
    [0x00],
    [0x00],
    [0x00],
  );
  const row = decodeBinaryRow(packet, ROW_COLUMNS);
  assertEquals(row.id, 7, "LONGLONG in the safe range stays a number");
  assertEquals(row.unbandate, 1893456000, "unbandate timestamp");
  assertEquals(row.username, "", "empty VAR_STRING is not NULL");
  assertEquals(row.last_login, null, "zero-length DATETIME is NULL");
  assertEquals(row.gmlevel, 0, "signed zero");
});

Deno.test("signed and unsigned widths do not bleed into each other", () => {
  const cases: [ColumnDef, number[], string | number, string][] = [
    [{ name: "v", type: 0x01, unsigned: false }, [0x80], -128, "TINY min"],
    [
      { name: "v", type: 0x01, unsigned: true },
      [0xff],
      255,
      "TINY unsigned max",
    ],
    [{ name: "v", type: 0x02, unsigned: false }, u16(0xffff), -1, "SHORT -1"],
    [
      { name: "v", type: 0x02, unsigned: true },
      u16(0xffff),
      65535,
      "SHORT max",
    ],
    [
      { name: "v", type: 0x03, unsigned: false },
      u32(0xffffffff),
      -1,
      "LONG -1",
    ],
    [
      { name: "v", type: 0x03, unsigned: true },
      u32(0xffffffff),
      4294967295,
      "LONG unsigned max",
    ],
    [
      { name: "v", type: 0x09, unsigned: true },
      u32(3000000000),
      3000000000,
      "INT24 shares the LONG path",
    ],
    [
      { name: "v", type: 0x08, unsigned: false },
      [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      -1,
      "LONGLONG -1",
    ],
  ];
  for (const [col, raw, expected, label] of cases) {
    assertEquals(
      decodeBinaryValue(new Reader(bytes(raw)), col),
      expected,
      label,
    );
  }
});

Deno.test("string-family type codes all read as length-encoded text", () => {
  for (const type of [0xfd, 0xfe, 0xfc, 0xf6]) {
    const col: ColumnDef = { name: "v", type, unsigned: false };
    assertEquals(
      decodeBinaryValue(new Reader(bytes([0x03], "abc")), col),
      "abc",
      `type 0x${hex(type)}`,
    );
  }
});

Deno.test("DATETIME decodes at each declared length", () => {
  const col: ColumnDef = { name: "v", type: 0x0c, unsigned: false };
  assertEquals(
    decodeBinaryValue(new Reader(bytes([0x00])), col),
    null,
    "length 0 is NULL",
  );
  assertEquals(
    decodeBinaryValue(new Reader(bytes([0x04], u16(2024), [0x01, 0x02])), col),
    "2024-01-02 00:00:00",
    "date only",
  );
  assertEquals(
    decodeBinaryValue(
      new Reader(bytes([0x07], u16(2024), [0x01, 0x02, 0x03, 0x04, 0x05])),
      col,
    ),
    "2024-01-02 03:04:05",
    "date and time",
  );
  assertEquals(
    decodeBinaryValue(
      new Reader(
        bytes([0x0b], u16(2024), [0x01, 0x02, 0x03, 0x04, 0x05], u32(123456)),
      ),
      col,
    ),
    "2024-01-02 03:04:05",
    "microseconds are consumed, not emitted",
  );
});

// ---------------------------------------------------------------------------
// Full statement round trip against a scripted server
// ---------------------------------------------------------------------------

class ScriptedConn implements MysqlDuplex {
  readonly writes: Uint8Array[] = [];
  private inbox: Uint8Array;

  constructor(packets: Uint8Array[]) {
    const total = packets.reduce((n, p) => n + p.length, 0);
    this.inbox = new Uint8Array(total);
    let at = 0;
    for (const p of packets) {
      this.inbox.set(p, at);
      at += p.length;
    }
  }

  read(p: Uint8Array): Promise<number | null> {
    if (this.inbox.length === 0) return Promise.resolve(null);
    const n = Math.min(p.length, this.inbox.length);
    p.set(this.inbox.subarray(0, n));
    this.inbox = this.inbox.subarray(n);
    return Promise.resolve(n);
  }

  write(p: Uint8Array): Promise<number> {
    this.writes.push(new Uint8Array(p));
    return Promise.resolve(p.length);
  }

  close(): void {}

  payload(index: number): Uint8Array {
    return this.writes[index].subarray(4);
  }
}

function frame(seq: number, payload: Uint8Array): Uint8Array {
  return bytes(
    [
      payload.length & 0xff,
      (payload.length >> 8) & 0xff,
      (payload.length >> 16) & 0xff,
      seq,
    ],
    [...payload],
  );
}

function prepareOk(
  stmtId: number,
  columns: number,
  params: number,
): Uint8Array {
  return bytes([0x00], u32(stmtId), u16(columns), u16(params), [0x00], u16(0));
}

const HOSTILE = "'; DROP TABLE account; --";

Deno.test("prepared() binds parameters instead of splicing them", async () => {
  const paramDef = columnDef("?", 0xfd, false);
  const script = new ScriptedConn([
    frame(1, prepareOk(13, 0, 3)),
    frame(2, paramDef),
    frame(3, paramDef),
    frame(4, paramDef),
    // OK: affected rows 7, last insert id 0, status, warnings.
    frame(1, bytes([0x00, 0x07, 0x00], u16(2), u16(0))),
  ]);
  const conn = MysqlConnection.fromDuplex(script);

  const sql = "UPDATE acore_auth.account_banned SET active = 0 " +
    "WHERE banreason = ? AND id = ? AND bannedby = ?";
  const result = await conn.prepared(sql, [HOSTILE, 42, null]);

  assertEquals(result.affectedRows, 7, "affected rows");
  assertEquals(result.rows.length, 0, "an OK packet carries no rows");
  assertEquals(script.writes.length, 3, "prepare, execute, close");

  const prepared = script.payload(0);
  assertEquals(prepared[0], 0x16, "COM_STMT_PREPARE");
  assertEquals(
    new TextDecoder().decode(prepared.subarray(1)),
    sql,
    "the statement text is the literal, with placeholders intact",
  );
  assert(
    !new TextDecoder().decode(prepared).includes("DROP"),
    "the bound value must never reach the statement text",
  );

  const term = [...new TextEncoder().encode(HOSTILE)];
  assertBytes(
    script.payload(1),
    [
      0x17,
      ...u32(13),
      0x00,
      ...u32(1),
      0x04, // param 2 is NULL: bit 2, with no two-bit offset on this side
      0x01, // new-params-bound
      ...u16(0xfd), // VAR_STRING
      ...u16(0x08), // LONGLONG
      ...u16(0x06), // NULL
      term.length,
      ...term,
      ...[0x2a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    ],
    "COM_STMT_EXECUTE payload",
  );

  assertBytes(
    script.payload(2),
    [0x19, ...u32(13)],
    "COM_STMT_CLOSE payload",
  );
});

Deno.test("execute param bitmap is not offset like a row bitmap", async () => {
  const paramDef = columnDef("?", 0xfd, false);
  const script = new ScriptedConn([
    frame(1, prepareOk(1, 0, 2)),
    frame(2, paramDef),
    frame(3, paramDef),
    frame(1, bytes([0x00, 0x00, 0x00], u16(2), u16(0))),
  ]);
  const conn = MysqlConnection.fromDuplex(script);

  await conn.prepared("DELETE FROM t WHERE a = ? AND b = ?", [null, 1]);

  // Param 0 NULL sets bit 0. The same NULL in a result row would set bit 2.
  assertEquals(script.payload(1)[10], 0x01, "param 0 NULL sets the lowest bit");
});

Deno.test("prepared() decodes a result set end to end", async () => {
  const defs = ROW_COLUMNS.map((c) => columnDef(c.name, c.type, c.unsigned));
  const row = bytes(
    [0x00],
    [0x04, 0x02],
    [0xff],
    [0xc8],
    u16(40000),
    u32(3000000000),
    [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80],
    [0x05],
    "SNEED",
  );

  let seq = 1;
  const packets: Uint8Array[] = [frame(seq++, prepareOk(9, 8, 0))];
  for (const d of defs) packets.push(frame(seq++, d));
  seq = 1;
  packets.push(frame(seq++, bytes([0x08])));
  for (const d of defs) packets.push(frame(seq++, d));
  packets.push(frame(seq++, row));
  packets.push(frame(seq++, bytes([0xfe], u16(0), u16(2))));

  const conn = MysqlConnection.fromDuplex(new ScriptedConn(packets));
  const result = await conn.prepared(
    "SELECT id, gmlevel, expansion, port, account, unbandate, username, " +
      "last_login FROM acore_auth.account",
  );

  assertEquals(result.rows.length, 1, "one row before the terminator");
  assertEquals(result.rows[0].username, "SNEED", "string column");
  assertEquals(result.rows[0].account, 3000000000, "unsigned LONG column");
  assertEquals(result.rows[0].id, null, "NULL column");
});

Deno.test("a server error packet becomes MysqlError, not a decode crash", async () => {
  const conn = MysqlConnection.fromDuplex(
    new ScriptedConn([
      frame(
        1,
        bytes([0xff], u16(1142), [0x23], "42000", "SELECT command denied"),
      ),
    ]),
  );

  let thrown: unknown;
  try {
    await conn.prepared("SELECT 1 FROM acore_characters.characters");
  } catch (err) {
    thrown = err;
  }
  assert(thrown instanceof MysqlError, "must surface as MysqlError");
  assertEquals((thrown as MysqlError).code, 1142, "error code is preserved");
});

Deno.test("a parameter count mismatch is caught before execute", async () => {
  const conn = MysqlConnection.fromDuplex(
    new ScriptedConn([frame(1, prepareOk(1, 0, 2))]),
  );

  let thrown: unknown;
  try {
    await conn.prepared("DELETE FROM t WHERE a = ? AND b = ?", [1]);
  } catch (err) {
    thrown = err;
  }
  assert(thrown instanceof MysqlError, "arity mismatch must throw");
});
