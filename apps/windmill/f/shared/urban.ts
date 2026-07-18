export type UrbanEntry = {
  word: string;
  definition: string;
  example: string;
  author: string;
  permalink: string;
  thumbsUp: number;
  thumbsDown: number;
};

type UrbanApiEntry = {
  word: string;
  definition: string;
  example: string;
  author: string;
  permalink: string;
  thumbs_up: number;
  thumbs_down: number;
};

type UrbanApiResponse = { list: UrbanApiEntry[] };

const BASE = "https://api.urbandictionary.com/v0";
const MAX_LEN = 900;

function clean(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]/g, "$1")
    .replace(/\r/g, "")
    .trim()
    .slice(0, MAX_LEN);
}

export async function fetchDefinition(term = ""): Promise<UrbanEntry> {
  const who = term.trim();
  const url = who
    ? `${BASE}/define?term=${encodeURIComponent(who)}`
    : `${BASE}/random`;

  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`urbandictionary ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as UrbanApiResponse;
  if (!Array.isArray(data.list) || data.list.length === 0) {
    throw new Error(`no definition found${who ? ` for "${who}"` : ""}`);
  }

  const top = data.list.reduce((a, b) => (b.thumbs_up > a.thumbs_up ? b : a));
  return {
    word: top.word,
    definition: clean(top.definition),
    example: clean(top.example),
    author: top.author,
    permalink: top.permalink,
    thumbsUp: top.thumbs_up,
    thumbsDown: top.thumbs_down,
  };
}

export async function main(term = ""): Promise<UrbanEntry> {
  return fetchDefinition(term);
}
