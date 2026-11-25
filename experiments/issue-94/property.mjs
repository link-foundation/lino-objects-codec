// Property sweep: every string over a tricky alphabet must read back unchanged
// through both parseIndented and the plain links-notation Parser.
import { formatIndented, parseIndented } from '../../js/src/index.js';
import { Parser } from '../../js/node_modules/links-notation/dist/index.js';
const parser = new Parser();
const alphabet = ['a', ' ', '#', '~', '1', '{', '}', "'", '"', '`', ':', '(', ')', '\n', '-', '\\', '\r', '\t'];
const maxLength = Number(process.argv[2] ?? 3);
let values = [''];
const all = [''];
for (let len = 1; len <= maxLength; len += 1) {
  values = values.flatMap((v) => alphabet.map((c) => v + c));
  all.push(...values);
}
// Plain reading: a pair is an anonymous two-value link, a header is a named link.
const plain = (link) => (link.values.length === 0 ? link.id : link.values.map(plain));
const failures = [];
for (const s of all) {
  const obj = { [s]: s, k: s, arr: [s, s], z: s };
  for (const nested of [false, true]) {
    const text = formatIndented({ id: 'root', obj, nested });
    let own, links;
    try { own = parseIndented({ text, nested }).obj; } catch (e) { own = e.message; }
    try { links = parser.parse(text); } catch (e) { links = e.message; }
    const ok1 = JSON.stringify(own) === JSON.stringify(obj);
    let ok2 = false;
    if (Array.isArray(links)) {
      const root = links[0];
      const pairs = root.values.map(plain);
      if (nested) {
        ok2 = root.id === 'root' && pairs.length === 4 &&
          JSON.stringify(pairs[0]) === JSON.stringify([s, s]) &&
          JSON.stringify(pairs[1]) === JSON.stringify(['k', s]) &&
          root.values[2].id === 'arr' && JSON.stringify(root.values[2].values.map(plain)) === JSON.stringify([s, s]) &&
          JSON.stringify(pairs[3]) === JSON.stringify(['z', s]);
      } else {
        const arr = links[1];
        ok2 = root.id === 'root' && pairs.length === 4 &&
          JSON.stringify(pairs[0]) === JSON.stringify([s, s]) &&
          JSON.stringify(pairs[1]) === JSON.stringify(['k', s]) &&
          JSON.stringify(pairs[3]) === JSON.stringify(['z', s]) &&
          arr && JSON.stringify(arr.values.map(plain)) === JSON.stringify([s, s]);
      }
    }
    if (!ok1 || !ok2) failures.push({ s, nested, ok1, ok2, text });
  }
}
console.log(`checked ${all.length} strings x 2 modes, failures: ${failures.length}`);
for (const f of failures.slice(0, 15)) console.log(JSON.stringify(f));
