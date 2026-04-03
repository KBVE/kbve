import { jsonResponse, withIrcConnection } from "./_shared.ts";
import type { IrcRequest } from "./_shared.ts";

// ---------------------------------------------------------------------------
// IRC Server — Status & MOTD
//
// Actions: status, motd
// ---------------------------------------------------------------------------

export const SERVER_ACTIONS = ["status", "motd"];

export async function handleServer(req: IrcRequest): Promise<Response> {
  switch (req.action) {
    case "status": {
      try {
        const info = await withIrcConnection(async (irc) => {
          await irc.send("LUSERS");
          const lines = await irc.readUntil(
            (l) => l.includes(" 266 ") || l.includes(" 252 "),
          );
          return lines
            .filter((l) => / (25[0-9]|26[0-6]) /.test(l))
            .map((l) => {
              // Extract the human-readable part after the nick
              const parts = l.split(" :");
              return parts.length > 1 ? parts[parts.length - 1] : l;
            });
        });
        return jsonResponse({ status: "connected", info });
      } catch (err) {
        console.error("irc server.status error:", err);
        return jsonResponse(
          { status: "unreachable", error: "Ergo IRC server is not reachable" },
          503,
        );
      }
    }

    case "motd": {
      try {
        const motd = await withIrcConnection(async (irc) => {
          await irc.send("MOTD");
          const lines = await irc.readUntil(
            (l) => l.includes(" 376 ") || l.includes(" 422 "),
          );
          return lines
            .filter((l) => l.includes(" 372 "))
            .map((l) => {
              const parts = l.split(" :");
              return parts.length > 1 ? parts[parts.length - 1] : l;
            });
        });
        return jsonResponse({ motd });
      } catch (err) {
        console.error("irc server.motd error:", err);
        return jsonResponse(
          { error: "Failed to retrieve MOTD — Ergo unreachable" },
          503,
        );
      }
    }

    default:
      return jsonResponse(
        {
          error: `Unknown server action: ${req.action}. Available: ${SERVER_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}
