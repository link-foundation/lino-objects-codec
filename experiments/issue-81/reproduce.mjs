// Reproduction for https://github.com/link-foundation/lino-objects-codec/issues/81
// Run from the repository root after `cd js && npm ci`:
//   node experiments/issue-81/reproduce.mjs
// Before the fix the unsafe integer Numbers came back as strings; after it
// every case prints `ok`.
import { encode, decode, encodeLine, decodeLine } from "../../js/src/index.js";
import { isDeepStrictEqual } from "node:util";

const value = {
  count: 1e18,
  nested: [-9007199254740992],
  // eslint-disable-next-line no-loss-of-precision
  rounded: 1000000000000000100,
  safe: Number.MAX_SAFE_INTEGER,
  text: "1e+18",
  digits: "1000000000000000000",
};

let failed = false;
for (const [name, text, back] of [
  ["readable", encode({ obj: value }), (notation) => decode({ notation })],
  [
    "single-line",
    encodeLine({ obj: value }),
    (notation) => decodeLine({ notation }),
  ],
]) {
  const decoded = back(text);
  const ok = isDeepStrictEqual(decoded, value);
  failed ||= !ok;
  console.log(`${name}: ${ok ? "ok" : "FAIL"}`);
  console.log(text);
  console.log(decoded);
}
process.exitCode = failed ? 1 : 0;
