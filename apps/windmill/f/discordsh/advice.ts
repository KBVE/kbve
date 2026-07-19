import { fetchAdvice } from "../shared/advice.ts";

const ADVICE_COLOR = 0x1abc9c;

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const advice = await fetchAdvice(args.join(" ").trim());
  const requestedBy = (discord?.username as string) ?? null;

  return {
    embed: {
      title: "💡 Advice",
      description: advice.text,
      color: ADVICE_COLOR,
      footer: requestedBy
        ? `${advice.label} #${advice.id} • requested by ${requestedBy}`
        : `${advice.label} #${advice.id}`,
    },
  };
}
