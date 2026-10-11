// Isolate the original character-array failure without a private archive.
// Optional argument: path to a pristine readable module saved from git.
// node --max-old-space-size=768 experiments/issue-68/tokenizer-baseline.mjs [module] [large]
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const source = process.argv[2]
  ? pathToFileURL(resolve(process.argv[2]))
  : new URL("../../js/src/readable.js", import.meta.url);
const { decode } = await import(source.href);
const size = process.argv[3] === "large" ? 144_497_741 : 2 ** 25 + 1024;
const notation = `${" ".repeat(size)}(o: (evidence "Tiếng Việt 🍫"))`;
assert.deepEqual(decode(notation), { evidence: "Tiếng Việt 🍫" });
console.log(
  JSON.stringify({
    bytes: Buffer.byteLength(notation),
    maxRSS: process.resourceUsage().maxRSS,
  }),
);
