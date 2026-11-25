// Reproduces issue #94: formatIndented output vs. the plain links-notation Parser.
import { formatIndented, parseIndented } from '../../js/src/index.js';
import { Parser } from '../../js/node_modules/links-notation/dist/index.js';
const show = (l) => (l && typeof l === 'object' ? (l.values?.length ? [l.id, ...l.values.map(show)] : l.id) : l);
const obj = { tasks: { 'q-1': { args: ['--model', '', '#x'] } }, a: '', b: '' };
const text = formatIndented({ id: 'hive_mind_state', obj });
console.log(text);
console.log(JSON.stringify(parseIndented({ text }).obj));
console.log(JSON.stringify(new Parser().parse(text).map(show)));
