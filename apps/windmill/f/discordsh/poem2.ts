import * as wmill from "windmill-client";

const POETRY = "https://poetrydb.org";
const COST = 3;

type Discord = { user_id?: string; username?: string };

export async function main(args: string[] = [], discord: Discord = {}) {
  const discordId = discord.user_id;
  if (!discordId) {
    return errEmbed("Missing Discord identity", "Could not read your Discord id.");
  }

  const author = args.join(" ").trim();
  const url = author
    ? `${POETRY}/author/${encodeURIComponent(author)}`
    : `${POETRY}/random/1`;
  let poem: Record<string, unknown> | undefined;
  try {
    const resp = await fetch(url, { headers: { accept: "application/json" } });
    const data = await resp.json();
    poem = Array.isArray(data) ? data[0] : data;
    if (!poem || poem.status === 404 || !poem.title) {
      return errEmbed(
        "No poem found",
        author ? `No poems by "${author}".` : "PoetryDB returned nothing.",
      );
    }
  } catch (_e) {
    return errEmbed(
      "PoetryDB unavailable",
      "Could not reach the poetry service. You were not charged.",
    );
  }

  const base = (await wmill.getVariable("f/discordsh/axum_base_url")).replace(/\/+$/, "");
  const token = await wmill.getVariable("f/discordsh/axum_service_token");
  let spend: Response;
  try {
    spend = await fetch(`${base}/api/v1/wallet/service/debit-discord`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        discord_id: discordId,
        amount: COST,
        reason: "discordsh/poem2",
        idempotency_key: crypto.randomUUID(),
      }),
    });
  } catch (_e) {
    return errEmbed(
      "Billing unavailable",
      "Could not reach the wallet service. You were not charged.",
    );
  }

  if (spend.status === 404) {
    return errEmbed(
      "Account not linked",
      "Link your Discord to your KBVE account to buy poems. You were not charged.",
    );
  }
  if (spend.status === 402) {
    return errEmbed(
      "Not enough credits",
      `poem2 costs ${COST} credits. Top up at kbve.com to keep reading.`,
    );
  }
  if (!spend.ok) {
    return errEmbed("Charge failed", `Wallet returned ${spend.status}. You were not charged.`);
  }

  const title = poem.title as string;
  const lines = (poem.lines as string[] | undefined) ?? [];
  const description = lines.join("\n").slice(0, 4000);
  const by = (poem.author as string | undefined) ?? null;
  return {
    embed: {
      title,
      description,
      color: 0x8b5cf6,
      author: by ? { name: by } : undefined,
      footer: { text: `${COST} credits · requested by ${discord.username ?? "you"}` },
    },
  };
}

function errEmbed(title: string, description: string) {
  return { embed: { title, description, color: 0xef4444 } };
}
