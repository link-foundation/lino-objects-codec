import { formatIndented, parseIndented } from '../../js/src/index.js';

const samples = [
  'line1\nline2',
  'line1\n\nline2',
  '\n  indented\n\t \nroot:\n  key value\n',
  'line1\r\nline2',
  'first "quote"\nsecond \'quote\'',
  '`reference`',
];
let failures = 0;
for (const value of samples) {
  const text = formatIndented({ id: 'doc', obj: { t: value } });
  try {
    const actual = parseIndented({ text }).obj.t;
    if (actual !== value) throw new Error(`changed to ${JSON.stringify(actual)}`);
    console.log('PASS', JSON.stringify(value));
  } catch (error) {
    failures += 1;
    console.log('FAIL', JSON.stringify(value), error.message);
  }
}
process.exitCode = failures ? 1 : 0;
