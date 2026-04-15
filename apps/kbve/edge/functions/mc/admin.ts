import {
  checkStaffPermissions,
  jsonResponse,
  type McRequest,
  requireNonEmpty,
  requireStaffOrServiceRole,
  staffPerm,
} from "./_shared.ts";

// ---------------------------------------------------------------------------
// MC Admin Module — Staff-gated RCON execution
//
// Actions:
//   execute   — send a raw MC command via RCON to a target server
//   give      — shorthand: give item to player
//   teleport  — shorthand: teleport player
//   broadcast — shorthand: broadcast message to server
//
// Env vars per server (lobby / survival):
//   MC_RCON_LOBBY_HOST, MC_RCON_LOBBY_PORT, MC_RCON_LOBBY_PASSWORD
//   MC_RCON_SURVIVAL_HOST, MC_RCON_SURVIVAL_PORT, MC_RCON_SURVIVAL_PASSWORD
// ---------------------------------------------------------------------------

type Handler = (mcReq: McRequest) => Promise<Response>;

// ---------------------------------------------------------------------------
// RCON protocol (Minecraft Source RCON)
//
// Packet: [length:i32le] [requestId:i32le] [type:i32le] [body:ascii+\0] [\0]
//   type 3 = login, type 2 = command, type 0 = response
// ---------------------------------------------------------------------------

const RCON_LOGIN = 3;
const RCON_COMMAND = 2;
const RCON_TIMEOUT_MS = 5000;

function encodeRconPacket(
  requestId: number,
  type: number,
  body: string,
): Uint8Array {
  const bodyBytes = new TextEncoder().encode(body);
  // length = 4 (requestId) + 4 (type) + body.length + 1 (null) + 1 (null)
  const length = 4 + 4 + bodyBytes.length + 2;
  const buf = new ArrayBuffer(4 + length);
  const view = new DataView(buf);
  view.setInt32(0, length, true);
  view.setInt32(4, requestId, true);
  view.setInt32(8, type, true);
  new Uint8Array(buf, 12).set(bodyBytes);
  // Two null terminators already zero from ArrayBuffer
  return new Uint8Array(buf);
}

async function readRconPacket(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ requestId: number; type: number; body: string }> {
  // Read until we have at least 4 bytes for the length prefix
  let buffer = new Uint8Array(0);

  function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const result = new Uint8Array(a.length + b.length);
    result.set(a);
    result.set(b, a.length);
    return result;
  }

  while (buffer.length < 4) {
    const { value, done } = await reader.read();
    if (done || !value) throw new Error("RCON connection closed unexpectedly");
    buffer = concat(buffer, value);
  }

  const lengthView = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const packetLength = lengthView.getInt32(0, true);

  // Read remaining bytes for this packet
  const totalNeeded = 4 + packetLength;
  while (buffer.length < totalNeeded) {
    const { value, done } = await reader.read();
    if (done || !value) throw new Error("RCON connection closed unexpectedly");
    buffer = concat(buffer, value);
  }

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const requestId = view.getInt32(4, true);
  const type = view.getInt32(8, true);
  const bodyEnd = 12 + packetLength - 10; // minus requestId(4) + type(4) + 2 nulls
  const body = new TextDecoder().decode(buffer.slice(12, 12 + bodyEnd));

  return { requestId, type, body };
}

interface RconConfig {
  host: string;
  port: number;
  password: string;
}

// Server name → env var prefix mapping
const SERVER_ENV_MAP: Record<string, string> = {
  lobby: "MC_RCON_LOBBY",
  survival: "MC_RCON_SURVIVAL",
};

function getServerConfig(serverName: string): RconConfig | null {
  const prefix = SERVER_ENV_MAP[serverName];
  if (!prefix) return null;

  const host = Deno.env.get(`${prefix}_HOST`);
  const port = Deno.env.get(`${prefix}_PORT`);
  const password = Deno.env.get(`${prefix}_PASSWORD`);

  if (!host || !port || !password) return null;

  return { host, port: parseInt(port, 10), password };
}

async function rconExecute(
  config: RconConfig,
  command: string,
): Promise<string> {
  const conn = await Deno.connect({
    hostname: config.host,
    port: config.port,
  });

  try {
    const writer = conn.writable.getWriter();
    const reader = conn.readable.getReader();

    // Login
    await writer.write(encodeRconPacket(1, RCON_LOGIN, config.password));
    const loginResp = await Promise.race([
      readRconPacket(reader),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RCON login timeout")), RCON_TIMEOUT_MS)
      ),
    ]);

    if (loginResp.requestId === -1) {
      throw new Error("RCON authentication failed");
    }

    // Send command
    await writer.write(encodeRconPacket(2, RCON_COMMAND, command));
    const cmdResp = await Promise.race([
      readRconPacket(reader),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("RCON command timeout")),
          RCON_TIMEOUT_MS,
        )
      ),
    ]);

    reader.releaseLock();
    writer.releaseLock();

    return cmdResp.body;
  } finally {
    try {
      conn.close();
    } catch {
      // already closed
    }
  }
}

// ---------------------------------------------------------------------------
// Command sanitization — block dangerous commands at the edge
// ---------------------------------------------------------------------------

const BLOCKED_COMMANDS = [
  "stop",
  "op",
  "deop",
  "ban-ip",
  "pardon-ip",
  "whitelist",
  "save-all",
  "save-off",
  "save-on",
  "reload",
];

function isBlockedCommand(command: string): boolean {
  const first = command.trim().split(/\s+/)[0].toLowerCase().replace(/^\//, "");
  return BLOCKED_COMMANDS.includes(first);
}

// Max command length to prevent abuse
const MAX_COMMAND_LENGTH = 512;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const handlers: Record<string, Handler> = {
  // -----------------------------------------------------------------------
  // execute — send a raw MC command via RCON
  // -----------------------------------------------------------------------
  async execute({ claims, token, body }) {
    const denied = await requireStaffOrServiceRole(token, claims);
    if (denied) return denied;

    const { server, command } = body;

    const serverErr = requireNonEmpty(server, "server");
    if (serverErr) return serverErr;

    if (!command || typeof command !== "string") {
      return jsonResponse({ error: "command is required" }, 400);
    }

    if (command.length > MAX_COMMAND_LENGTH) {
      return jsonResponse(
        { error: `command exceeds maximum length of ${MAX_COMMAND_LENGTH}` },
        400,
      );
    }

    if (isBlockedCommand(command)) {
      return jsonResponse(
        { error: "This command is blocked for safety" },
        403,
      );
    }

    // Dangerous commands require MODERATOR+
    const dangerousPatterns = [/^\/?(kick|ban|pardon)\s/i];
    const isDangerous = dangerousPatterns.some((re) => re.test(command));
    if (isDangerous && claims.role !== "service_role") {
      const perms = await checkStaffPermissions(token);
      if ((perms & staffPerm.MODERATOR) === 0) {
        return jsonResponse(
          { error: "This command requires MODERATOR or higher" },
          403,
        );
      }
    }

    const config = getServerConfig(server as string);
    if (!config) {
      return jsonResponse(
        {
          error: `Unknown server: ${server}. Available: ${Object.keys(SERVER_ENV_MAP).join(", ")}`,
        },
        400,
      );
    }

    try {
      const response = await rconExecute(config, command as string);
      return jsonResponse({
        success: true,
        server,
        command,
        response: response || "(no output)",
      });
    } catch (err) {
      console.error("RCON error:", err);
      const msg = err instanceof Error ? err.message : "RCON connection failed";
      return jsonResponse({ error: msg }, 502);
    }
  },

  // -----------------------------------------------------------------------
  // give — shorthand: /give <player> <item> [count]
  // -----------------------------------------------------------------------
  async give({ claims, token, body }) {
    const denied = await requireStaffOrServiceRole(token, claims);
    if (denied) return denied;

    const { server, player, item, count } = body;

    const serverErr = requireNonEmpty(server, "server");
    if (serverErr) return serverErr;

    if (!player || typeof player !== "string") {
      return jsonResponse({ error: "player name is required" }, 400);
    }

    if (!item || typeof item !== "string") {
      return jsonResponse({ error: "item is required (e.g. diamond_sword)" }, 400);
    }

    // Validate item format: namespace:id or just id
    if (!/^[a-z_][a-z0-9_]*(?::[a-z_][a-z0-9_]*)?$/.test(item as string)) {
      return jsonResponse(
        { error: "item must be a valid MC item ID (e.g. diamond, minecraft:diamond_sword)" },
        400,
      );
    }

    const amt = count !== undefined ? Math.min(Math.max(Number(count) || 1, 1), 64) : 1;
    const mcCommand = `give ${player} ${item} ${amt}`;

    const config = getServerConfig(server as string);
    if (!config) {
      return jsonResponse(
        { error: `Unknown server: ${server}. Available: ${Object.keys(SERVER_ENV_MAP).join(", ")}` },
        400,
      );
    }

    try {
      const response = await rconExecute(config, mcCommand);
      return jsonResponse({ success: true, server, command: mcCommand, response: response || "(no output)" });
    } catch (err) {
      console.error("RCON error:", err);
      const msg = err instanceof Error ? err.message : "RCON connection failed";
      return jsonResponse({ error: msg }, 502);
    }
  },

  // -----------------------------------------------------------------------
  // teleport — shorthand: /tp <player> <x> <y> <z>
  // -----------------------------------------------------------------------
  async teleport({ claims, token, body }) {
    const denied = await requireStaffOrServiceRole(token, claims);
    if (denied) return denied;

    const { server, player, x, y, z, target_player } = body;

    const serverErr = requireNonEmpty(server, "server");
    if (serverErr) return serverErr;

    if (!player || typeof player !== "string") {
      return jsonResponse({ error: "player name is required" }, 400);
    }

    let mcCommand: string;
    if (target_player && typeof target_player === "string") {
      // tp player to another player
      mcCommand = `tp ${player} ${target_player}`;
    } else {
      // tp player to coordinates
      if (x === undefined || y === undefined || z === undefined) {
        return jsonResponse(
          { error: "Either target_player or x/y/z coordinates are required" },
          400,
        );
      }
      const nx = Number(x);
      const ny = Number(y);
      const nz = Number(z);
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
        return jsonResponse({ error: "x, y, z must be valid numbers" }, 400);
      }
      mcCommand = `tp ${player} ${nx} ${ny} ${nz}`;
    }

    const config = getServerConfig(server as string);
    if (!config) {
      return jsonResponse(
        { error: `Unknown server: ${server}. Available: ${Object.keys(SERVER_ENV_MAP).join(", ")}` },
        400,
      );
    }

    try {
      const response = await rconExecute(config, mcCommand);
      return jsonResponse({ success: true, server, command: mcCommand, response: response || "(no output)" });
    } catch (err) {
      console.error("RCON error:", err);
      const msg = err instanceof Error ? err.message : "RCON connection failed";
      return jsonResponse({ error: msg }, 502);
    }
  },

  // -----------------------------------------------------------------------
  // broadcast — shorthand: /say <message>
  // -----------------------------------------------------------------------
  async broadcast({ claims, token, body }) {
    const denied = await requireStaffOrServiceRole(token, claims);
    if (denied) return denied;

    const { server, message } = body;

    const serverErr = requireNonEmpty(server, "server");
    if (serverErr) return serverErr;

    if (!message || typeof message !== "string") {
      return jsonResponse({ error: "message is required" }, 400);
    }

    if ((message as string).length > 256) {
      return jsonResponse({ error: "message exceeds 256 characters" }, 400);
    }

    const mcCommand = `say ${message}`;

    const config = getServerConfig(server as string);
    if (!config) {
      return jsonResponse(
        { error: `Unknown server: ${server}. Available: ${Object.keys(SERVER_ENV_MAP).join(", ")}` },
        400,
      );
    }

    try {
      const response = await rconExecute(config, mcCommand);
      return jsonResponse({ success: true, server, command: mcCommand, response: response || "(no output)" });
    } catch (err) {
      console.error("RCON error:", err);
      const msg = err instanceof Error ? err.message : "RCON connection failed";
      return jsonResponse({ error: msg }, 502);
    }
  },
};

export const ADMIN_ACTIONS = Object.keys(handlers);

export async function handleAdmin(mcReq: McRequest): Promise<Response> {
  const handler = handlers[mcReq.action];
  if (!handler) {
    return jsonResponse(
      {
        error: `Unknown admin action: ${mcReq.action}. Use: ${ADMIN_ACTIONS.join(", ")}`,
      },
      400,
    );
  }
  return handler(mcReq);
}
