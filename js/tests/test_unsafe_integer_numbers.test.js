/**
 * Regression tests for issue #81: the readable encoders turned a finite Number
 * whose integer spelling exceeds Number.MAX_SAFE_INTEGER into a string on the
 * round trip, because the bare digits it was written as are read back as a
 * string (a reader keeps digits it cannot hold exactly). Such a Number is now
 * written with an exponent, which reads back as the same Number, while safe
 * integers, numeric-looking strings and keys, and bigint values keep the
 * formatting they had before.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  encode,
  decode,
  encodeLine,
  decodeLine,
  encodeCompact,
  decodeCompact,
} from '../src/index.js';

const UNSAFE_INTEGERS = [
  // The first integers past the safe boundary, on both sides.
  [Number.MAX_SAFE_INTEGER + 1, '9.007199254740992e+15'],
  [Number.MIN_SAFE_INTEGER - 1, '-9.007199254740992e+15'],
  [Number.MAX_SAFE_INTEGER + 3, '9.007199254740994e+15'],
  [-(Number.MAX_SAFE_INTEGER + 3), '-9.007199254740994e+15'],
  // The values from the issue report.
  [1e18, '1e+18'],
  [-1e18, '-1e+18'],
  // 1000000000000000100 is not representable; it is the double 1e18 + 128,
  // which needs one more significant digit than 1e18 to round-trip.
  // eslint-disable-next-line no-loss-of-precision
  [1000000000000000100, '1.0000000000000001e+18'],
  [2 ** 64, '1.8446744073709552e+19'],
  // From 1e21 on String() already uses an exponent; the spelling is unchanged.
  [1e21, '1e+21'],
  [Number.MAX_VALUE, '1.7976931348623157e+308'],
];

const SAFE_INTEGERS = [
  [Number.MAX_SAFE_INTEGER, '9007199254740991'],
  [Number.MIN_SAFE_INTEGER, '-9007199254740991'],
  [Number.MAX_SAFE_INTEGER - 1, '9007199254740990'],
  [1e15, '1000000000000000'],
  [0, '0'],
  [42, '42'],
  [-7, '-7'],
];

const FORMS = [
  ['readable', (obj) => decode({ notation: encode({ obj }) })],
  ['single-line', (obj) => decodeLine({ notation: encodeLine({ obj }) })],
];

for (const [form, roundtrip] of FORMS) {
  for (const [value, spelling] of UNSAFE_INTEGERS) {
    test(`${form}: unsafe integer Number ${spelling} stays a Number`, () => {
      const decoded = roundtrip(value);
      assert.equal(typeof decoded, 'number');
      assert.ok(Object.is(decoded, value), `${decoded} !== ${value}`);
    });
  }

  for (const [value, spelling] of SAFE_INTEGERS) {
    test(`${form}: safe integer ${spelling} stays a Number`, () => {
      assert.ok(Object.is(roundtrip(value), value));
    });
  }

  test(`${form}: the issue reproduction keeps the original Numbers`, () => {
    const value = { count: 1e18, nested: [-9007199254740992] };
    assert.deepEqual(roundtrip(value), value);
  });

  test(`${form}: unsafe integers inside nested arrays and objects`, () => {
    const value = {
      amounts: [1e18, -1e18, [Number.MAX_SAFE_INTEGER + 1]],
      ledger: {
        total: 2 ** 60,
        entries: [{ id: 1, amount: -(2 ** 55) }],
        safe: Number.MAX_SAFE_INTEGER,
      },
    };
    assert.deepEqual(roundtrip(value), value);
  });

  test(`${form}: numeric-looking strings stay strings`, () => {
    const value = [
      '1000000000000000000',
      '-9007199254740992',
      '9007199254740991',
      '1e+18',
      '1e18',
      '-1e+18',
      '9.007199254740992e+15',
      '1.0000000000000001e+18',
      '1000000000000000100',
      '42',
    ];
    assert.deepEqual(roundtrip(value), value);
  });

  test(`${form}: numeric-looking keys stay keys and values keep types`, () => {
    const value = {
      1000000000000000000: 1e18,
      '1e+18': '1e+18',
      '9.007199254740992e+15': Number.MAX_SAFE_INTEGER + 1,
      9007199254740991: '9007199254740991',
      '-9007199254740992': -9007199254740992,
    };
    const decoded = roundtrip(value);
    assert.deepEqual(decoded, value);
    assert.deepEqual(Object.keys(decoded), Object.keys(value));
  });

  test(`${form}: bigint is still written as its digits`, () => {
    // A bigint keeps every digit: a safe one reads back as a Number and an
    // unsafe one as its exact digit string, as before.
    assert.equal(roundtrip(10n ** 20n), '100000000000000000000');
    assert.equal(roundtrip(-(2n ** 53n)), '-9007199254740992');
    assert.equal(roundtrip(123n), 123);
  });
}

test('readable: unsafe integer Numbers are written with an exponent', () => {
  for (const [value, spelling] of UNSAFE_INTEGERS) {
    assert.equal(encode({ obj: value }), spelling);
    assert.equal(encodeLine({ obj: value }), spelling);
  }
});

test('readable: safe integers keep their plain digits', () => {
  for (const [value, spelling] of SAFE_INTEGERS) {
    assert.equal(encode({ obj: value }), spelling);
    assert.equal(encodeLine({ obj: value }), spelling);
  }
});

test('readable: matching strings are quoted, Numbers are bare', () => {
  assert.equal(
    encodeLine({ obj: { n: 1e18, s: '1e+18', d: '1000000000000000000' } }),
    '(o: (n 1e+18) (s "1e+18") (d "1000000000000000000"))'
  );
  assert.equal(
    encode({ obj: { n: 1e18, s: '1e+18' } }),
    '(\n  n 1e+18\n  s "1e+18"\n)'
  );
});

test('readable: bare unsafe digits written by hand still read as strings', () => {
  // The reader is unchanged: digits it cannot hold exactly are kept as text,
  // which is what preserves a bigint or an identifier written as digits.
  assert.equal(
    decode({ notation: '1000000000000000000' }),
    '1000000000000000000'
  );
  assert.deepEqual(decodeLine({ notation: '(o: (id 9007199254740993))' }), {
    id: '9007199254740993',
  });
});

test('compact: unsafe integer Numbers already keep the Number type', () => {
  const value = { count: 1e18, nested: [-9007199254740992] };
  assert.deepEqual(
    decodeCompact({ notation: encodeCompact({ obj: value }) }),
    value
  );
});
