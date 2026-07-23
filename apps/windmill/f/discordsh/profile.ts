import {
  creditsToUsd,
  fetchProfile,
  type SupabaseResource,
} from "../shared/profile.ts";

const PROFILE_COLOR = 0x22c55e;
const SITE = "https://kbve.com";

export async function main(
  _args: string[] = [],
  discord?: Record<string, unknown>,
  sb?: SupabaseResource,
  valkeyUrl = "",
) {
  if (!sb?.url || !sb?.service_key) {
    throw new Error("supabase resource not configured for profile lookup");
  }

  const discordId = (discord?.user_id as string) ?? "";
  const username = (discord?.username as string) ?? "there";
  const profile = await fetchProfile(discordId, sb, valkeyUrl || undefined);

  if (!profile.linked) {
    return {
      ephemeral: true,
      embed: {
        title: "🔗 Link your KBVE account",
        description:
          `You don't have a KBVE account linked to this Discord yet, ${username}.\n\n` +
          `Sign in with Discord at [kbve.com](${SITE}) to link — then your ` +
          `credits and khash will show up here.`,
        color: PROFILE_COLOR,
        footer: "Read-only preview • spending coming soon",
      },
    };
  }

  const name = profile.kbveUsername ?? "—";
  const profileUrl = profile.kbveUsername
    ? `${SITE}/@${profile.kbveUsername}`
    : undefined;

  return {
    ephemeral: true,
    embed: {
      title: `👤 ${name}`,
      description: profile.kbveUsername
        ? `[View profile](${profileUrl})`
        : "No public username set yet.",
      url: profileUrl,
      color: PROFILE_COLOR,
      fields: [
        {
          name: "💳 Credits",
          value: `${profile.credits.toLocaleString()} (${creditsToUsd(profile.credits)})`,
          inline: true,
        },
        {
          name: "⚡ Khash",
          value: profile.khash.toLocaleString(),
          inline: true,
        },
      ],
      footer: profile.cached
        ? "Read-only preview • cached • spending coming soon"
        : "Read-only preview • spending coming soon",
    },
  };
}
