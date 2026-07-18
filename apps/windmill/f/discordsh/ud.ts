import { fetchDefinition } from "../shared/urban.ts";

const UD_COLOR = 0x1d2439;

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const entry = await fetchDefinition(args.join(" ").trim());
  const requestedBy = (discord?.username as string) ?? null;

  const fields = [];
  if (entry.example) {
    fields.push({ name: "Example", value: entry.example, inline: false });
  }
  fields.push({
    name: "Votes",
    value: `👍 ${entry.thumbsUp} · 👎 ${entry.thumbsDown}`,
    inline: false,
  });

  return {
    embed: {
      title: entry.word,
      description: entry.definition,
      url: entry.permalink,
      color: UD_COLOR,
      author: entry.author ? `by ${entry.author}` : undefined,
      fields,
      footer: requestedBy
        ? `Urban Dictionary • requested by ${requestedBy}`
        : "Urban Dictionary",
    },
  };
}
