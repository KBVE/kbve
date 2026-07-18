export type Poem = {
  title: string;
  author: string;
  lines: string[];
  linecount: string;
};

type PoetryDbError = { status: number; reason: string };

const BASE = "https://poetrydb.org";
const MAX_LINES = 24;

export async function fetchPoem(author = ""): Promise<Poem> {
  const who = author.trim();
  const url = who
    ? `${BASE}/author/${encodeURIComponent(who)}`
    : `${BASE}/random/1`;

  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`poetrydb ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as Poem[] | PoetryDbError;
  if (!Array.isArray(data)) {
    throw new Error(`no poems found${who ? ` for author "${who}"` : ""}`);
  }

  const poem = data[Math.floor(Math.random() * data.length)];
  return { ...poem, lines: poem.lines.slice(0, MAX_LINES) };
}

export async function main(author = ""): Promise<Poem> {
  return fetchPoem(author);
}
