// A catalog can retain a complete error message, including blank lines.
import assert from 'node:assert/strict';
import { formatIndented, parseIndented } from '../src/index.js';

const record = {
  id: 'catalog_entry',
  obj: {
    title: 'Registry import',
    error:
      'Import failed\n\n  expected: a catalog entry\n  received: an empty file',
    retry: true,
  },
};
const text = formatIndented(record);
console.log(text);
assert.deepEqual(parseIndented({ text }), record);
