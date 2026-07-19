import { fetchJoke } from "../shared/joke.ts";

const JOKE_COLOR = 0xf1c40f;

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const joke = await fetchJoke(args.join(" ").trim());
  const requestedBy = (discord?.username as string) ?? null;

  return {
    embed: {
      title: "😂 Joke",
      description: joke.text,
      url: joke.url,
      color: JOKE_COLOR,
      footer: requestedBy
        ? `${joke.label} • requested by ${requestedBy}`
        : joke.label,
    },
  };
}
