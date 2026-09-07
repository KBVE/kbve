// ---------------------------------------------------------------------------
// `deno test functions/_shared/routing.test.ts`
//
// parseCommand is the front door: every "module.action" request in the tree
// is split here before a handler is chosen. The interesting cases are the
// malformed ones — a command that splits wrong dispatches to the wrong
// handler rather than failing closed.
// ---------------------------------------------------------------------------

import { buildHelpText, parseCommand, type ParsedCommand } from "./routing.ts";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function parsed(command: unknown): ParsedCommand {
  const res = parseCommand(command, "help");
  assert(!(res instanceof Response), `expected a parse, got a Response`);
  return res;
}

function rejected(command: unknown): Response {
  const res = parseCommand(command, "help");
  assert(res instanceof Response, `expected a Response for ${command}`);
  return res;
}

Deno.test("parseCommand splits on the first dot", () => {
  const p = parsed("meme.react");
  assertEquals(p.module, "meme", "module");
  assertEquals(p.action, "react", "action");
});

Deno.test("parseCommand keeps later dots inside the action", () => {
  // "vault.token.set" is module `vault`, action `token.set` — splitting on the
  // last dot instead would route to a module named "vault.token".
  const p = parsed("vault.token.set");
  assertEquals(p.module, "vault", "module");
  assertEquals(p.action, "token.set", "action");
});

Deno.test("parseCommand rejects a missing or non-string command", () => {
  for (const bad of [undefined, null, "", 42, {}, [], true]) {
    assertEquals(rejected(bad).status, 400, `${JSON.stringify(bad)} status`);
  }
});

Deno.test("parseCommand rejects commands with no usable split point", () => {
  // Leading dot => empty module; trailing dot => empty action; no dot at all
  // => nothing to dispatch on. Each must fail rather than produce a half-empty
  // ParsedCommand that a registry lookup would then miss in a confusing way.
  for (const bad of ["nodot", ".leading", "trailing.", "."]) {
    assertEquals(rejected(bad).status, 400, `${bad} status`);
  }
});

Deno.test("parseCommand error text carries the help listing", async () => {
  const res = parseCommand("nodot", "meme.react, meme.save");
  assert(res instanceof Response, "expected rejection");
  const body = await res.json() as { error: string };
  assert(body.error.includes("meme.react"), "help text is included");
});

Deno.test("buildHelpText flattens a registry into module.action pairs", () => {
  const help = buildHelpText({
    meme: { actions: ["react", "save"] },
    forum: { actions: ["list"] },
  });
  assertEquals(help, "meme.react, meme.save, forum.list", "help text");
});

Deno.test("buildHelpText handles an empty registry and empty action lists", () => {
  assertEquals(buildHelpText({}), "", "empty registry");
  assertEquals(buildHelpText({ mod: { actions: [] } }), "", "empty actions");
});

Deno.test("buildHelpText output round-trips through parseCommand", () => {
  // Anything advertised as available must also be parseable; this catches a
  // registry key that contains a dot of its own.
  const registry = {
    meme: { actions: ["react"] },
    wow: { actions: ["staff.list"] },
  };
  for (const command of buildHelpText(registry).split(", ")) {
    const res = parseCommand(command, "help");
    assert(!(res instanceof Response), `${command} should parse`);
  }
});
