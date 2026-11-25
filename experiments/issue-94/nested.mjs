// Formats the issue's example in the nested form and reads it back both ways.
import { formatIndented, parseIndented } from '../../js/src/index.js';
import { Parser } from '../../js/node_modules/links-notation/dist/index.js';
const show = (l) => (l && typeof l === 'object' ? (l.values?.length ? [l.id, ...l.values.map(show)] : l.id) : l);
const obj = {
  intake: { state: 'draining' },
  tasks: { 'q-1': { args: ['--model', '', '#x'] } },
  matrix: [[1, 2], [], { k: 'v' }, {}],
  empty: {},
  '-': { dash: true },
  a: '',
  b: '',
  n: '1',
};
const text = formatIndented({ id: 'hive_mind_state', obj, nested: true });
console.log(text);
const back = parseIndented({ text, nested: true });
console.log(JSON.stringify(back));
console.log('round-trip:', JSON.stringify(back.obj) === JSON.stringify(obj));
console.log(JSON.stringify(new Parser().parse(text).map(show)));
