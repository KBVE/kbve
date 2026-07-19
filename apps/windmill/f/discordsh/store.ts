const STORE_URL = "https://kbve.com/store";
const BRAND = 0x8b5cf6;
const WARN = 0xf59e0b;

type Discord = { user_id?: string; username?: string };

type Product = { name: string; price: string; blurb: string };

const PRODUCTS: Product[] = [
  {
    name: "I AM AN IDIOT",
    price: "10 credits",
    blurb: "A WebGL collectible card — hidden until you unlock it. Yours to keep.",
  },
];

export async function main(args: string[] = [], discord: Discord = {}) {
  const sub = (args[0] ?? "").toLowerCase();

  switch (sub) {
    case "":
    case "view":
    case "catalog":
      return catalogEmbed(discord);
    case "buy":
      return buyComingSoon();
    case "help":
      return helpEmbed();
    default:
      return unknownSub(sub);
  }
}

function catalogEmbed(discord: Discord) {
  const fields = PRODUCTS.map((p) => ({
    name: p.name,
    value: `${p.blurb}\n**${p.price}**`,
    inline: false,
  }));
  return {
    embed: {
      title: "KBVE Store",
      url: STORE_URL,
      description:
        "Spend credits to unlock collectibles you actually own. " +
        `Browse and buy at [kbve.com/store](${STORE_URL}) — sign in with Discord.`,
      color: BRAND,
      fields,
      footer: {
        text: `${STORE_URL.replace(/^https?:\/\//, "")} · requested by ${discord.username ?? "you"}`,
      },
    },
  };
}

function buyComingSoon() {
  return {
    embed: {
      title: "Buy from Discord — coming soon",
      description:
        `Native \`/wm store buy\` is on the way. For now, unlock it at ` +
        `[kbve.com/store](${STORE_URL}) — sign in with Discord and spend your credits.`,
      color: WARN,
      url: STORE_URL,
    },
  };
}

function helpEmbed() {
  return {
    embed: {
      title: "/wm store",
      description:
        "`/wm store` — view the store\n" +
        "`/wm store buy` — purchase from Discord (coming soon)\n" +
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
