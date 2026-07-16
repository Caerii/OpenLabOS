import fs from "node:fs";
import path from "node:path";
import { DECKS } from "./src/decks.mjs";

const requested = process.argv[2];
const outRoot = path.resolve("slides", "out");

function safeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "deck";
}

function renderMarkdown(deck) {
  const lines = [`# ${deck.title}`, "", deck.subtitle, ""];
  for (const slide of deck.slides) {
    lines.push("---", "", `## ${slide.title}`, "");
    if (slide.kicker) lines.push(`_${slide.kicker}_`, "");
    for (const point of slide.points) lines.push(`- ${point}`);
    if (slide.evidence?.length) {
      lines.push("", "Evidence:");
      for (const item of slide.evidence) lines.push(`- ${item}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function writeDeck(deck) {
  const slug = safeName(deck.id);
  const outDir = path.join(outRoot, slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.md"), renderMarkdown(deck));
  fs.writeFileSync(path.join(outDir, "slides.json"), JSON.stringify(deck, null, 2));
  console.log(`[slides] wrote ${path.relative(process.cwd(), outDir)}`);
}

const decks = requested ? DECKS.filter((deck) => deck.id === requested) : DECKS;
if (!decks.length) {
  console.error(`[slides] unknown deck "${requested}"`);
  console.error(`[slides] available: ${DECKS.map((deck) => deck.id).join(", ")}`);
  process.exit(1);
}

for (const deck of decks) writeDeck(deck);
