import { jsonResponse, withIrcConnection } from "./_shared.ts";
import type { IrcRequest } from "./_shared.ts";

// ---------------------------------------------------------------------------
// IRC Message — Send & History
//
// Actions: send, history
// ---------------------------------------------------------------------------

export const MESSAGE_ACTIONS = ["send", "history"];

export async function handleMessage(req: IrcRequest): Promise<Response> {
  switch (req.action) {
    case "send": {
      const { channel, text } = req.body;
      if (!channel || typeof channel !== "string") {
        return jsonResponse(
          { error: "channel is required (e.g. '#general')" },
          400,
        );
      }
      if (!text || typeof text !== "string") {
        return jsonResponse({ error: "text is required" }, 400);
      }

      const safeChan = sanitizeChannel(channel);
      if (!safeChan) {
        return jsonResponse({ error: "Invalid channel name" }, 400);
      }
      const safeText = sanitizeMessage(text);
      if (!safeText) {
        return jsonResponse(
          { error: "Message is empty or exceeds 480 characters" },
          400,
        );
      }

      try {
        await withIrcConnection(async (irc) => {
          await irc.send(`JOIN ${safeChan}`);
          // Wait for JOIN acknowledgment or channel info
          await irc.readUntil(
            (l) =>
              l.includes(" 366 ") ||
              l.includes(" JOIN ") ||
              l.includes(" 473 ") ||
              l.includes(" 475 "),
            5000,
          );
          await irc.send(`PRIVMSG ${safeChan} :${safeText}`);
          // Small delay to ensure the message is sent before QUIT
          await irc.read(500);
        });
        return jsonResponse({ ok: true, channel: safeChan });
      } catch (err) {
        console.error("irc message.send error:", err);
        return jsonResponse(
          { error: "Failed to send message — Ergo unreachable" },
          503,
        );
      }
    }

    case "history": {
      const { channel, limit } = req.body;
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
      const count = Math.min(Math.max(parseInt(String(limit ?? 50), 10) || 50, 1), 100);

      try {
        const messages = await withIrcConnection(async (irc) => {
          await irc.send(`JOIN ${safeChan}`);
          await irc.readUntil(
            (l) => l.includes(" 366 ") || l.includes(" JOIN "),
            5000,
          );

          // CHATHISTORY is an IRCv3 extension supported by Ergo
          await irc.send(
            `CHATHISTORY LATEST ${safeChan} * ${count}`,
          );

          const lines = await irc.readUntil(
            (l) =>
              l.includes("BATCH") && l.includes("-") && !l.includes("+"),
            8000,
          );

          // Parse PRIVMSG lines from the batch
          return lines
            .filter((l) => l.includes("PRIVMSG"))
            .map((l) => {
              const match = l.match(/:(\S+)!\S* PRIVMSG (\S+) :(.*)/);
              if (!match) return null;
              // Extract server-time tag if present
              const timeMatch = l.match(/time=(\S+)/);
              return {
                nick: match[1],
                channel: match[2],
                text: match[3],
                time: timeMatch ? timeMatch[1] : null,
              };
            })
            .filter(Boolean);
        });
        return jsonResponse({ channel: safeChan, messages });
      } catch (err) {
        console.error("irc message.history error:", err);
        return jsonResponse(
          { error: "Failed to get history — Ergo unreachable" },
          503,
        );
      }
    }

    default:
      return jsonResponse(
        {
          error: `Unknown message action: ${req.action}. Available: ${MESSAGE_ACTIONS.join(", ")}`,
        },
        400,
      );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeChannel(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("#")) return null;
  if (trimmed.length > 50) return null;
  if (/[\s\x00-\x1f\x07,]/.test(trimmed)) return null;
  return trimmed;
}

/** Sanitize a message — strip control chars, enforce max length. */
function sanitizeMessage(input: string): string | null {
  const cleaned = input.replace(/[\x00-\x1f\x07]/g, "").trim();
  if (!cleaned || cleaned.length > 480) return null;
  return cleaned;
}
