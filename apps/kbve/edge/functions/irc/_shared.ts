import {
  extractToken,
  jsonResponse,
  parseJwt,
  requireServiceRole,
  createServiceClient,
  type JwtClaims,
} from "../_shared/supabase.ts";

export { extractToken, jsonResponse, parseJwt, createServiceClient };

// ---------------------------------------------------------------------------
// IRC Edge Function — Shared Types & Helpers
// ---------------------------------------------------------------------------

export interface IrcRequest {
  token: string;
  claims: JwtClaims;
  body: Record<string, unknown>;
  action: string;
}

/** Require service_role OR staff permissions via Supabase RPC. */
export async function requireStaffOrAdmin(
  claims: JwtClaims,
  token: string,
): Promise<Response | null> {
  // service_role passes immediately
  if (claims.role === "service_role") return null;

  // Authenticated users: check staff_permissions RPC
  if (!claims.sub) {
    return jsonResponse({ error: "Access denied" }, 403);
  }

  try {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("staff_permissions", {
      target_user_id: claims.sub,
    });
    if (error) throw error;
    // staff_permissions returns an integer bitmask; non-zero = staff
    if (typeof data === "number" && data > 0) return null;
  } catch (err) {
    console.error("staff check failed:", err);
  }

  return jsonResponse({ error: "Access denied: staff or service_role required" }, 403);
}

// ---------------------------------------------------------------------------
// IRC protocol constants
// ---------------------------------------------------------------------------

const ERGO_HOST = Deno.env.get("ERGO_IRC_HOST") ??
  "ergo-irc-service.irc.svc.cluster.local";
const ERGO_PORT = parseInt(Deno.env.get("ERGO_IRC_PORT") ?? "6667", 10);

const IRC_NICK = "edge-bot";
const IRC_USER = "edge-bot 0 * :KBVE Edge Function";

/** Max time to wait for IRC responses (ms). */
const IRC_TIMEOUT_MS = 10_000;

/**
 * Open a raw TCP connection to Ergo, register as the edge bot,
 * execute a callback, then disconnect.
 *
 * The callback receives helpers to send raw IRC lines and read
 * accumulated responses.
 */
export async function withIrcConnection<T>(
  fn: (irc: IrcConn) => Promise<T>,
): Promise<T> {
  const conn = await Deno.connect({ hostname: ERGO_HOST, port: ERGO_PORT });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buf = new Uint8Array(4096);
  const lines: string[] = [];
  let partial = "";

  const irc: IrcConn = {
    async send(line: string) {
      await conn.write(encoder.encode(line + "\r\n"));
    },
    async read(timeoutMs = IRC_TIMEOUT_MS): Promise<string[]> {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        // Use Deno.conn with a short read timeout
        conn.setReadDeadline?.(new Date(Math.min(Date.now() + 500, deadline)));
        try {
          const n = await conn.read(buf);
          if (n === null) break;
          partial += decoder.decode(buf.subarray(0, n));
          const parts = partial.split("\r\n");
          partial = parts.pop()!;
          lines.push(...parts);
        } catch {
          // read timeout or closed — check if we have enough data
          break;
        }
      }
      const result = [...lines];
      lines.length = 0;
      return result;
    },
    async readUntil(
      predicate: (line: string) => boolean,
      timeoutMs = IRC_TIMEOUT_MS,
    ): Promise<string[]> {
      const deadline = Date.now() + timeoutMs;
      const collected: string[] = [];
      while (Date.now() < deadline) {
        conn.setReadDeadline?.(new Date(Math.min(Date.now() + 500, deadline)));
        try {
          const n = await conn.read(buf);
          if (n === null) break;
          partial += decoder.decode(buf.subarray(0, n));
          const parts = partial.split("\r\n");
          partial = parts.pop()!;
          for (const line of parts) {
            // Respond to PING immediately to stay alive
            if (line.startsWith("PING")) {
              await conn.write(
                encoder.encode(line.replace("PING", "PONG") + "\r\n"),
              );
              continue;
            }
            collected.push(line);
            if (predicate(line)) return collected;
          }
        } catch {
          break;
        }
      }
      return collected;
    },
  };

  try {
    // Register with Ergo
    await irc.send(`NICK ${IRC_NICK}`);
    await irc.send(`USER ${IRC_USER}`);

    // Wait for welcome (001) or error
    await irc.readUntil(
      (line) => line.includes(" 001 ") || line.includes(" 433 "),
    );

    return await fn(irc);
  } finally {
    try {
      await irc.send("QUIT :edge function done");
    } catch { /* best-effort */ }
    try {
      conn.close();
    } catch { /* best-effort */ }
  }
}

export interface IrcConn {
  send(line: string): Promise<void>;
  read(timeoutMs?: number): Promise<string[]>;
  readUntil(
    predicate: (line: string) => boolean,
    timeoutMs?: number,
  ): Promise<string[]>;
}
