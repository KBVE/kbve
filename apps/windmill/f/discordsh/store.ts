import * as wmill from "windmill-client";

const STORE_URL = "https://kbve.com/store";
const BRAND = 0x8b5cf6;
const WARN = 0xf59e0b;
const ERR = 0xef4444;
const OK = 0x22c55e;

type Discord = { user_id?: string; username?: string };

type Product = { slug: string; name: string; price: string; blurb: string };

const PRODUCTS: Product[] = [
  {
    slug: "i-am-an-idiot",
    name: "I AM AN IDIOT",
    price: "10 credits",
    blurb: "A WebGL collectible card — hidden until you unlock it. Yours to keep.",
  },
];

const DEFAULT_SLUG = PRODUCTS[0].slug;

export async function main(args: string[] = [], discord: Discord = {}) {
  const sub = (args[0] ?? "").toLowerCase();

  switch (sub) {
    case "":
    case "view":
    case "catalog":
      return catalogEmbed(discord);
    case "buy":
      return buy(args.slice(1), discord);
    case "balance":
    case "credits":
      return balance(discord);
    case "inventory":
    case "collection":
      return inventory(discord);
    case "help":
      return helpEmbed();
    default:
      return unknownSub(sub);
  }
}

function catalogEmbed(discord: Discord) {
  const fields = PRODUCTS.map((p) => ({
    name: p.name,
    value: `${p.blurb}\n**${p.price}** · \`/wm store buy ${p.slug}\``,
    inline: false,
  }));
  return {
    embed: {
      title: "KBVE Store",
      url: STORE_URL,
      description:
        "Spend credits to unlock collectibles you actually own. " +
        `Buy right here with \`/wm store buy\`, check credits with \`/wm store balance\`, ` +
        `see what you own with \`/wm store inventory\`, ` +
        `or browse at [kbve.com/store](${STORE_URL}) — sign in with Discord.`,
      color: BRAND,
      fields,
      footer: `${STORE_URL.replace(/^https?:\/\//, "")} · requested by ${discord.username ?? "you"}`,
    },
  };
}

async function buy(rest: string[], discord: Discord) {
  const discordId = discord.user_id;
  if (!discordId) {
    return errEmbed("Missing Discord identity", "Could not read your Discord id.");
  }

  const slug = (rest[0] ?? DEFAULT_SLUG).toLowerCase();
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) {
    return errEmbed(
      "Unknown product",
      `\`${slug}\` isn't in the store. Try \`/wm store\` to see what's available.`,
    );
  }

  const base = (await wmill.getVariable("f/discordsh/axum_base_url")).replace(/\/+$/, "");
  const token = await wmill.getVariable("f/discordsh/axum_service_token");
  let resp: Response;
  try {
    resp = await fetch(`${base}/api/v1/store/service/buy-discord`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        discord_id: discordId,
        slug,
        idempotency_key: crypto.randomUUID(),
      }),
    });
  } catch (_e) {
    return errEmbed(
      "Store unavailable",
      "Could not reach the store service. You were not charged.",
    );
  }

  if (resp.status === 404) {
    return errEmbed(
      "Account not linked",
      `Link your Discord to your KBVE account to buy from here — sign in at [kbve.com/store](${STORE_URL}). You were not charged.`,
    );
  }
  if (resp.status === 402) {
    return errEmbed(
      "Not enough credits",
      `**${product.name}** costs ${product.price}. Top up at [kbve.com](${STORE_URL}) to unlock it.`,
    );
  }
  if (!resp.ok) {
    return errEmbed("Purchase failed", `Store returned ${resp.status}. You were not charged.`);
  }

  return {
    embed: {
      title: `Unlocked — ${product.name}`,
      url: STORE_URL,
      description:
        `It's yours. Reveal your card at [kbve.com/store](${STORE_URL}) — sign in with Discord and it'll be waiting in your collection.`,
      color: OK,
      footer: `${product.price} · ${discord.username ?? "you"}`,
    },
  };
}

async function balance(discord: Discord) {
  const discordId = discord.user_id;
  if (!discordId) {
    return errEmbed("Missing Discord identity", "Could not read your Discord id.");
  }

  const base = (await wmill.getVariable("f/discordsh/axum_base_url")).replace(/\/+$/, "");
  const token = await wmill.getVariable("f/discordsh/axum_service_token");
  let resp: Response;
  try {
    resp = await fetch(`${base}/api/v1/wallet/service/balance-discord`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ discord_id: discordId }),
    });
  } catch (_e) {
    return errEmbed("Wallet unavailable", "Could not reach the wallet service.");
  }

  if (resp.status === 404) {
    return errEmbed(
      "Account not linked",
      `Link your Discord to your KBVE account — sign in at [kbve.com/store](${STORE_URL}).`,
    );
  }
  if (!resp.ok) {
    return errEmbed("Balance unavailable", `Wallet returned ${resp.status}.`);
  }

  const data = (await resp.json()) as { credits?: number };
  const credits = data.credits ?? 0;
  return {
    embed: {
      title: "Your credits",
      url: STORE_URL,
      description:
        `**${credits} credits**\n\n` +
        `Spend them with \`/wm store buy\`, or browse at [kbve.com/store](${STORE_URL}).`,
      color: BRAND,
      footer: `${STORE_URL.replace(/^https?:\/\//, "")} · ${discord.username ?? "you"}`,
    },
  };
}

async function inventory(discord: Discord) {
  const discordId = discord.user_id;
  if (!discordId) {
    return errEmbed("Missing Discord identity", "Could not read your Discord id.");
  }

  const base = (await wmill.getVariable("f/discordsh/axum_base_url")).replace(/\/+$/, "");
  const token = await wmill.getVariable("f/discordsh/axum_service_token");
  let resp: Response;
  try {
    resp = await fetch(`${base}/api/v1/store/service/inventory-discord`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ discord_id: discordId }),
    });
  } catch (_e) {
    return errEmbed("Store unavailable", "Could not reach the store service.");
  }

  if (resp.status === 404) {
    return errEmbed(
      "Account not linked",
      `Link your Discord to your KBVE account — sign in at [kbve.com/store](${STORE_URL}).`,
    );
  }
  if (!resp.ok) {
    return errEmbed("Collection unavailable", `Store returned ${resp.status}.`);
  }

  const data = (await resp.json()) as {
    items?: { slug: string; title?: string | null }[];
  };
  const items = data.items ?? [];
  if (items.length === 0) {
    return {
      embed: {
        title: "Your collection",
        url: STORE_URL,
        description:
          `Nothing here yet. Unlock your first collectible with \`/wm store buy\` — ` +
          `browse at [kbve.com/store](${STORE_URL}).`,
        color: BRAND,
        footer: `${STORE_URL.replace(/^https?:\/\//, "")} · ${discord.username ?? "you"}`,
      },
    };
  }

  const lines = items.map((it) => `• **${it.title ?? it.slug}** \`${it.slug}\``);
  return {
    embed: {
      title: `Your collection — ${items.length} item${items.length === 1 ? "" : "s"}`,
      url: STORE_URL,
      description: `${lines.join("\n")}\n\nReveal them at [kbve.com/store](${STORE_URL}).`,
      color: OK,
      footer: `${STORE_URL.replace(/^https?:\/\//, "")} · ${discord.username ?? "you"}`,
    },
  };
}

function helpEmbed() {
  return {
    embed: {
      title: "/wm store",
      description:
        "`/wm store` — view the store\n" +
        "`/wm store balance` — check your credits\n" +
        "`/wm store buy [slug]` — purchase with your credits (defaults to the featured card)\n" +
        "`/wm store inventory` — list the collectibles you own\n" +
        "`/wm store help` — this message",
      color: BRAND,
    },
  };
}

function unknownSub(sub: string) {
  return {
    embed: {
      title: "Unknown store command",
      description: `\`${sub}\` isn't a store command. Try \`/wm store help\`.`,
      color: WARN,
    },
  };
}
