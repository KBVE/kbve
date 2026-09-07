// ---------------------------------------------------------------------------
// `deno test functions/_shared/logging.test.ts`
//
// The counterpart to withholding error detail from clients: the detail has to
// actually arrive server-side, or hardening the responses just deletes the
// information. These tests capture console output and assert the record is
// single-line JSON — Vector parses it without regex, so an unescaped newline
// or a non-serializable field silently costs a log line.
//
// Levels are routed by stream, not by field: error/warn to stderr, info to
// stdout, which is what keeps warnings out of the stdout log sink.
// ---------------------------------------------------------------------------

import { logError, logInfo, logWarn } from "./logging.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

interface Captured {
  stdout: string[];
  stderr: string[];
}

/** Run `fn` with console.log/error captured rather than printed. */
function capture(fn: () => void): Captured {
  const origLog = console.log;
  const origError = console.error;
  const out: Captured = { stdout: [], stderr: [] };
  console.log = (...args: unknown[]) => void out.stdout.push(String(args[0]));
  console.error = (...args: unknown[]) => void out.stderr.push(String(args[0]));
  try {
    fn();
  } finally {
    console.log = origLog;
    console.error = origError;
  }
  return out;
}

function soleRecord(lines: string[]): Record<string, unknown> {
  assertEquals(lines.length, 1, "exactly one line emitted");
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Stream routing
// ---------------------------------------------------------------------------

Deno.test("error and warn go to stderr, info to stdout", () => {
  const err = capture(() => logError("ctx", new Error("boom")));
  assertEquals(err.stderr.length, 1, "error on stderr");
  assertEquals(err.stdout.length, 0, "error not on stdout");

  const warn = capture(() => logWarn("ctx", { a: 1 }));
  assertEquals(warn.stderr.length, 1, "warn on stderr");
  assertEquals(warn.stdout.length, 0, "warn not on stdout");

  const info = capture(() => logInfo("ctx", { a: 1 }));
  assertEquals(info.stdout.length, 1, "info on stdout");
  assertEquals(info.stderr.length, 0, "info not on stderr");
});

// ---------------------------------------------------------------------------
// Record shape
// ---------------------------------------------------------------------------

Deno.test("every record is one line of parseable JSON", () => {
  // Vector reads line-delimited JSON; an embedded newline splits one event
  // into two unparseable halves.
  const out = capture(() =>
    logError("ctx", new Error("multi\nline\nmessage"), { note: "a\nb" })
  );
  const line = out.stderr[0];
  assertEquals(
    line.includes("\n"),
    false,
    "no raw newline in the emitted line",
  );
  JSON.parse(line);
});

Deno.test("records carry their level and context", () => {
  const err = soleRecord(capture(() => logError("mod.action", "x")).stderr);
  assertEquals(err.level, "error", "level");
  assertEquals(err.context, "mod.action", "context");

  const warn = soleRecord(capture(() => logWarn("w.ctx")).stderr);
  assertEquals(warn.level, "warn", "warn level");

  const info = soleRecord(capture(() => logInfo("i.ctx")).stdout);
  assertEquals(info.level, "info", "info level");
});

Deno.test("extra fields are merged into the record", () => {
  const rec = soleRecord(
    capture(() => logWarn("ctx", { fallback: "env", count: 3, ok: false }))
      .stderr,
  );
  assertEquals(rec.fallback, "env", "string field");
  assertEquals(rec.count, 3, "number field");
  assertEquals(rec.ok, false, "boolean field");
});

// ---------------------------------------------------------------------------
// Error serialization — the detail withheld from clients must land here
// ---------------------------------------------------------------------------

Deno.test("logError preserves the message and stack of a real Error", () => {
  const rec = soleRecord(
    capture(() => logError("ctx", new Error("upstream failed"))).stderr,
  );
  const error = rec.error as { message: string; stack?: string };
  assertEquals(error.message, "upstream failed", "message retained");
  assert(typeof error.stack === "string", "stack retained for debugging");
  assert(
    error.stack!.includes("upstream failed"),
    "stack references the error",
  );
});

Deno.test("logError stringifies non-Error throwables", () => {
  // `throw "string"` and thrown objects both reach this path; neither must
  // produce an empty record.
  for (
    const [thrown, expected] of [["plain string", "plain string"], [
      42,
      "42",
    ]] as const
  ) {
    const rec = soleRecord(capture(() => logError("ctx", thrown)).stderr);
    const error = rec.error as { message: string; stack?: string };
    assertEquals(
      error.message,
      expected,
      `message for ${JSON.stringify(thrown)}`,
    );
    assertEquals(error.stack, undefined, "no stack for a non-Error");
  }
});

Deno.test("logError keeps the postgres detail that responses withhold", () => {
  // safeRpcError strips code/hint/details from the client response and hands
  // them here instead. If this record loses them, the hardening removed the
  // information from the system rather than relocating it.
  const rec = soleRecord(
    capture(() =>
      logError("service_report_meme", 'relation "x" does not exist', {
        code: "42P01",
        hint: "Perhaps you meant y",
        details: "constraint fk_reporter",
      })
    ).stderr,
  );
  assertEquals(rec.code, "42P01", "sqlstate logged");
  assertEquals(rec.hint, "Perhaps you meant y", "hint logged");
  assertEquals(rec.details, "constraint fk_reporter", "details logged");
  assertEquals(
    (rec.error as { message: string }).message,
    'relation "x" does not exist',
    "driver message logged",
  );
});

Deno.test("an explicit error field does not displace the serialized error", () => {
  // `error` is spread last in emit(), so the serialized exception wins over a
  // caller-supplied field of the same name. Pinning the precedence.
  const rec = soleRecord(
    capture(() => logError("ctx", new Error("real"), { error: "decoy" }))
      .stderr,
  );
  const error = rec.error as { message: string };
  assertEquals(error.message, "real", "serialized error wins");
});

Deno.test("logging an Error with no message still emits a record", () => {
  const rec = soleRecord(capture(() => logError("ctx", new Error())).stderr);
  assertEquals((rec.error as { message: string }).message, "", "empty message");
  assertEquals(rec.context, "ctx", "context still present");
});
