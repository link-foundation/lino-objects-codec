// Reproduce issue #79: run the JS codec without the Node-only globals a
// browser bundle lacks (`process` and `Buffer`).
//   node experiments/issue-79/reproduce.mjs
delete globalThis.process;
delete globalThis.Buffer;
const codec = await import("../../js/src/index.js");
let failures = 0;
const attempt = (title, run) => {
  try {
    console.log("ok  ", title, JSON.stringify(run()));
  } catch (error) {
    failures += 1;
    console.log("FAIL", title, `${error.name}: ${error.message}`);
  }
};
attempt("formatIndented", () =>
  codec.formatIndented({ id: "settings", obj: { "skin.name": "liquid" } }),
);
attempt(
  "parseIndented",
  () => codec.parseIndented({ text: "settings:\n  skin.name liquid" }).obj,
);
attempt("decode", () =>
  codec.decode({ notation: '(\n  skin.name "liquid"\n)' }),
);
attempt('decode of a (base64 "…") value', () =>
  codec.decode({ notation: '(\n  name (base64 "bGlxdWlk")\n)' }),
);
attempt("compact encode/decode round trip", () => {
  const notation = codec.encodeCompact({ obj: { name: "✓ à la mode" } });
  return [notation, codec.decode({ notation })];
});
codec.setDebugEnabled(true);
attempt(
  "parseIndented with tracing on",
  () => codec.parseIndented({ text: "settings:\n  skin.name liquid" }).obj,
);
codec.setDebugEnabled(null);
console.log(failures === 0 ? "all passed" : `${failures} failed`);
