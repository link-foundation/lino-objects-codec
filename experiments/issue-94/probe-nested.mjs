// Probe how the links-notation Parser reads nested indented documents.
import { Parser } from '../../js/node_modules/links-notation/dist/index.js';
const p = new Parser();
const dump = (l) => l && typeof l === 'object' ? { id: l.id, raw: l.rawId, q: l.quote, v: l.values?.map(dump) } : l;
const show = (l) => (l && typeof l === 'object' ? (l.values?.length ? [l.id, ...l.values.map(show)] : l.id) : l);
const docs = [
  "root:\n  intake:\n    state draining\n  tasks:\n    q-1:\n      args:\n        --model\n        ~1{}\n        '#x'\n  e:\n  n 1\n  s '1'\n",
  "root:\n  items:\n    :\n      a 1\n    :\n      a 2\n",
  "root:\n  a ~1{}\n  b ~1{}\n  c '~1{}'\n  d ~1{31}\n",
  "root:\n  a 'x\ny'\n  b 'p\r\nq'\n  c 'tab\there'\n",
  "root:\n  a ()\n  b x\n",
  "root:\n  'k y':\n    z 1\n",
  "root:\n  k #x\n  b 2\n",
];
for (const t of docs) {
  let r; try { r = JSON.stringify(p.parse(t).map(show)); } catch (e) { r = 'ERR ' + e.message.split('\n')[0]; }
  console.log(JSON.stringify(t)); console.log('  =>', r);
}
console.log(JSON.stringify(p.parse(docs[2]).map(dump)));
console.log(JSON.stringify(p.parseGroups(docs[0]).map(function g(x){return {e: show(x.element), c: x.children.map(g)}})));
