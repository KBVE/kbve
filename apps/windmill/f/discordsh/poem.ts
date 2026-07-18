import { fetchPoem } from "../shared/poem.ts";

const POEM_COLOR = 0x8957e5;

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const poem = await fetchPoem(args.join(" ").trim());
  const requestedBy = (discord?.username as string) ?? null;

  return {
    embed: {
      title: poem.title,
      description: poem.lines.join("\n"),
      color: POEM_COLOR,
      author: poem.author,
      footer: requestedBy
        ? `PoetryDB • requested by ${requestedBy}`
        : "PoetryDB",
    },
  };
}
