type Poem = {
  title: string;
  author: string;
  lines: string[];
  linecount: string;
};

type PoetryDbError = { status: number; reason: string };

const BASE = "https://poetrydb.org";

export async function main(
  args: string[] = [],
  discord?: Record<string, unknown>,
) {
  const author = args.join(" ").trim();
  const url = author
    ? `${BASE}/author/${encodeURIComponent(author)}`
    : `${BASE}/random/1`;

  const resp = await fetch(url, { headers: { accept: "application/json" } });
  if (!resp.ok) {
    throw new Error(`poetrydb ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as Poem[] | PoetryDbError;
  if (!Array.isArray(data)) {
    throw new Error(`no poems found${author ? ` for author "${author}"` : ""}`);
  }

  const poem = data[Math.floor(Math.random() * data.length)];
  return {
    title: poem.title,
    author: poem.author,
    lines: poem.lines.length > 24 ? poem.lines.slice(0, 24) : poem.lines,
    requestedBy: (discord?.username as string) ?? null,
  };
}
