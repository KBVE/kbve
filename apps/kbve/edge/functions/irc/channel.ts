import { jsonResponse, withIrcConnection } from "./_shared.ts";
import type { IrcRequest } from "./_shared.ts";

// ---------------------------------------------------------------------------
// IRC Channel — List, Topic, Names
//
// Actions: list, topic, names
// ---------------------------------------------------------------------------

export const CHANNEL_ACTIONS = ["list", "topic", "names"];

export async function handleChannel(req: IrcRequest): Promise<Response> {
  switch (req.action) {
    case "list": {
      try {
        const channels = await withIrcConnection(async (irc) => {
          await irc.send("LIST");
          const lines = await irc.readUntil((l) => l.includes(" 323 "));
          // 322 = RPL_LIST: <channel> <visible> :<topic>
          return lines
            .filter((l) => l.includes(" 322 "))
            .map((l) => {
              const match = l.match(/ 322 \S+ (\S+) (\d+) :?(.*)/);
              if (!match) return null;
              return {
                channel: match[1],
                users: parseInt(match[2], 10),
                topic: match[3] || "",
              };
            })
            .filter(Boolean);
        });
        return jsonResponse({ channels });
      } catch (err) {
        console.error("irc channel.list error:", err);
        return jsonResponse(
          { error: "Failed to list channels — Ergo unreachable" },
          503,
        );
      }
    }

    case "topic": {
      const { channel } = req.body;
      if (!channel || typeof channel !== "string") {
        return jsonResponse(
          { error: "channel is required (e.g. '#general')" },
          400,
        );
      }
      const safeChan = sanitizeChannel(channel);
      if (!safeChan) {
        return jsonResponse({ error: "Invalid channel name" }, 400);
      }

      try {
        const topic = await withIrcConnection(async (irc) => {
          await irc.send(`TOPIC ${safeChan}`);
          const lines = await irc.readUntil(
            (l) =>
              l.includes(" 332 ") ||
              l.includes(" 331 ") ||
              l.includes(" 403 "),
          );
          const topicLine = lines.find((l) => l.includes(" 332 "));
          if (topicLine) {
            const parts = topicLine.split(" :");
            return parts.length > 1 ? parts[parts.length - 1] : "";
          }
          return null;
        });
        return jsonResponse({ channel: safeChan, topic: topic ?? "(no topic set)" });
      } catch (err) {
        console.error("irc channel.topic error:", err);
        return jsonResponse(
          { error: "Failed to get topic — Ergo unreachable" },
          503,
        );
      }
    }

    case "names": {
      const { channel } = req.body;
      if (!channel || typeof channel !== "string") {
        return jsonResponse(
          { error: "channel is required (e.g. '#general')" },
          400,
        );
      }
      const safeChan = sanitizeChannel(channel);
      if (!safeChan) {
        return jsonResponse({ error: "Invalid channel name" }, 400);
      }

      try {
        const names = await withIrcConnection(async (irc) => {
          await irc.send(`NAMES ${safeChan}`);
          const lines = await irc.readUntil(
            (l) => l.includes(" 366 ") || l.includes(" 403 "),
          );
          // 353 = RPL_NAMREPLY: = <channel> :<names...>
          return lines
            .filter((l) => l.includes(" 353 "))
            .flatMap((l) => {
              const parts = l.split(" :");
              const nameStr = parts.length > 1 ? parts[parts.length - 1] : "";
              return nameStr
                .split(" ")
                .map((n) => n.replace(/^[@+%~&!]/, ""))
                .filter(Boolean);
            });
        });
        return jsonResponse({ channel: safeChan, names });
      } catch (err) {
        console.error("irc channel.names error:", err);
        return jsonResponse(
          { error: "Failed to get names — Ergo unreachable" },
          503,
        );
      }
    }

    default:
      return jsonResponse(
        {
          error: `Unknown channel action: ${req.action}. Available: ${CHANNEL_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize a channel name — must start with # and contain no spaces/control chars. */
function sanitizeChannel(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("#")) return null;
  if (trimmed.length > 50) return null;
  if (/[\s\x00-\x1f\x07,]/.test(trimmed)) return null;
  return trimmed;
}
