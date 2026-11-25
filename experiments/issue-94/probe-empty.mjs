// Probe how the links-notation Parser reads candidate spellings of an empty string.
import { Parser } from '../../js/node_modules/links-notation/dist/index.js';
const p = new Parser();
const show = (l) => (l && typeof l === 'object' ? (l.values?.length ? [l.id, ...l.values.map(show)] : l.id) : l);
const cands = ["''", '""', '``', "''''", '""""', '``````', "('')", '("")'];
for (const c of cands) {
  for (const t of [`root:\n  a ${c}\n  b ${c}\n`, `root:\n  a ${c}\n  b x\n`, `root:\n  a ${c}`, `root:\n  ${c}\n  ${c}\n`, `(a ${c})`, `root:\n  a:\n    ${c}\n  b 1\n`]) {
    let r; try { r = JSON.stringify(p.parse(t).map(show)); } catch (e) { r = 'ERR ' + e.message.split('\n')[0]; }
    console.log(JSON.stringify(t).padEnd(36), r);
  }
}
