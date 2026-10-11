// Finite, offline reproductions. Run each in its own memory-limited process:
// node --expose-gc --max-old-space-size=768 experiments/issue-68/large-document.mjs document
// node --max-old-space-size=128 experiments/issue-68/large-document.mjs quoted
// node --max-old-space-size=128 experiments/issue-68/large-document.mjs escaped
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { encode, encodeCompact, decode } from "../../js/src/index.js";

const mode = process.argv[2];
if (mode === "document") {
  const payload = "historical proof source evidence ".repeat(2556);
  const history = Array.from({ length: 1764 }, (_, id) => ({
    id,
    source: payload,
    title: "Tiếng Việt 🍫 日本語",
    quote: 'both "double" and \'single\' quotes ending "',
    marker: "\r\u0001%AA",
    verified: true,
    nested: [null, false, { saved: id }],
  }));
  let notation = encode({ obj: history });
  const bytes = Buffer.byteLength(notation);
  assert.ok(bytes >= 144_497_741, `${bytes} bytes`);
  const digest = createHash("sha256").update(notation).digest("hex");
  const restored = decode({ notation });
  assert.equal(restored.length, history.length);
  // Check every record, including JSON and the legacy compact conversion.
  for (let i = 0; i < history.length; i += 1) {
    assert.deepEqual(restored[i], history[i]);
    assert.equal(JSON.stringify(restored[i]), JSON.stringify(history[i]));
    assert.deepEqual(
      decode({ notation: encodeCompact({ obj: restored[i] }) }),
      history[i],
    );
  }
  notation = null;
  global.gc?.();
  assert.equal(
    createHash("sha256")
      .update(encode({ obj: restored }))
      .digest("hex"),
    digest,
  );
  console.log(
    JSON.stringify({
      mode,
      records: restored.length,
      bytes,
      sha256: digest,
      maxRSS: process.resourceUsage().maxRSS,
    }),
  );
} else if (mode === "quoted") {
  const text = "a".repeat(16 * 1024 ** 2) + "🍫";
  assert.equal(decode({ notation: `"${text}"` }), text);
  assert.equal(decode({ notation: `"""${text}\"'"""` }), `${text}"'`);
  assert.equal(
    decode({ notation: `"legacy ""value"" ${text}"` }),
    `legacy "value" ${text}`,
  );
  console.log(JSON.stringify({ mode, maxRSS: process.resourceUsage().maxRSS }));
} else if (mode === "escaped") {
  const text = "a".repeat(8 * 1024 ** 2) + "🍫";
  assert.equal(decode({ notation: `(escaped "${text}%0D%25")` }), `${text}\r%`);
  console.log(JSON.stringify({ mode, maxRSS: process.resourceUsage().maxRSS }));
} else {
  throw new Error(`unknown probe: ${mode}`);
}
