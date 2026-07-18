import { fetchPoem } from "../shared/poem.ts";

export async function main(author = "") {
  const poem = await fetchPoem(author);
  return {
    title: poem.title,
    author: poem.author,
    lines: poem.lines,
    linecount: poem.lines.length,
  };
}
