# lino-objects-codec (JavaScript)

[![JS CI](https://github.com/link-foundation/lino-objects-codec/actions/workflows/js.yml/badge.svg)](https://github.com/link-foundation/lino-objects-codec/actions/workflows/js.yml)
[![npm](https://img.shields.io/npm/v/lino-objects-codec?label=npm&logo=npm)](https://www.npmjs.com/package/lino-objects-codec)
[![npm downloads](https://img.shields.io/npm/dm/lino-objects-codec.svg)](https://www.npmjs.com/package/lino-objects-codec)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg)](https://unlicense.org/)

A JavaScript library for working with Links Notation format. The default documented path is readable recursive indented Links Notation for repository data, with a typed codec available when exact JavaScript type preservation or object identity is required. This library provides:

- Readable recursive indented Links Notation for JSON-style objects
- Typed serialization/deserialization for JavaScript object graphs with circular reference support
- Compact JSON to Links Notation conversion utilities
- Fuzzy matching utilities for string comparison

These tools enable easy implementation of higher-level features like:

- [LinksNotationManager](https://github.com/konard/follow/blob/main/lino.lib.mjs) - Intermediate application data storage
- [Q&A Database](https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs) - Questions and answers database

## Features

- **Readable Indented Format**: Write nested objects and arrays as reviewable recursive Links Notation definitions with `formatIndented({ id, obj })`
- **Dynamic Parsing**: Parse readable indented data back with `parseIndented({ text })`; quoted references stay strings and unquoted numbers, booleans, and `null` become dynamic values
- **Typed Object Codec**: Encode JavaScript object graphs to Links Notation with type markers when exact type preservation is required
- **Typed Support**: Handle all common JavaScript types:
  - Basic types: `null`, `undefined`, `boolean`, `number`, `string`
  - Collections: `Array`, `Object`
  - Special number values: `NaN`, `Infinity`, `-Infinity`
- **Readable by Default**: `encode({ obj })` writes plain, indented text that can be read and reviewed
- **Object Identity**: Shared references and circular references are preserved by the compact format (`encodeCompact`) via object ids
- **Full Unicode**: Strings are written as text; only a value that cannot be written as text (one holding control characters) is base64-encoded, and it is marked individually as `(base64 "…")`
- **Opt-in Tracing**: Set `LINO_CODEC_DEBUG=1` to trace encoding and decoding, the same way in every language
- **Compact JSON/Lino Conversion**: Convert between JSON and compact Links Notation with `jsonToLino({ json })` and `linoToJson({ lino })`
- **Reference Escaping**: Properly escape strings for Links Notation format with `escapeReference({ value })`
- **Fuzzy Matching**: Find similar strings with Levenshtein distance and keyword similarity

## Installation

```bash
npm install lino-objects-codec
```

Or with other package managers:

```bash
# Bun
bun add lino-objects-codec

# Yarn
yarn add lino-objects-codec

# pnpm
pnpm add lino-objects-codec
```

## Quick Start

```javascript
import { formatIndented, parseIndented } from 'lino-objects-codec';

const data = {
  title: 'Indian Law',
  defaultLanguage: 'en',
  maxLines: 1500,
  nested: { ok: true },
  items: ['a', 1],
};

const lino = formatIndented({ id: 'obj_root', obj: data });
console.log(lino);
// Output:
// obj_root:
//   title 'Indian Law'
//   defaultLanguage en
//   maxLines 1500
//   nested obj_root_nested
//   items obj_root_items
//
// obj_root_nested:
//   ok true
//
// obj_root_items:
//   a
//   1

const parsed = parseIndented({ text: lino });
console.log(parsed.obj.items[1] === 1);
// Output: true
```

`encode({ obj })` writes the readable format. Use `encodeCompact({ obj })` when you
need exact JavaScript type preservation, circular references, or shared object
identity -- the compact format names shared nodes with `obj_N` ids, which the
readable tree has nowhere to put:

```javascript
import { encodeCompact, decode } from 'lino-objects-codec';

const obj = { name: 'root' };
obj.self = obj;

const encoded = encodeCompact({ obj });
const decoded = decode({ notation: encoded });

console.log(decoded.self === decoded);
// Output: true
```

## Output Formats

| Function                        | Output                                          |
| ------------------------------- | ----------------------------------------------- |
| `encode({ obj })`               | Readable, indented Links Notation (the default) |
| `encode({ obj, indent: '\t' })` | Same, with a custom indentation string          |
| `encodeCompact({ obj })`        | The previous single-line, base64 form           |
| `encodeObfuscated({ obj })`     | Alias of `encodeCompact`                        |

`decode({ notation })` accepts every one of them, so files written by older
versions keep working and are rewritten in the readable form the next time they
are saved.

## Usage Examples

### Readable Indented Data

```javascript
import { formatIndented, parseIndented } from 'lino-objects-codec';

const data = {
  catalog: {
    title: 'Indian Law',
    languages: ['en', 'hi'],
  },
  maxLines: 1500,
};

const text = formatIndented({ id: 'obj_root', obj: data });
const { obj } = parseIndented({ text });

console.log(obj.catalog.languages[0]);
// Output: en
```

Readable indented data is intentionally untyped and acyclic. Use quoted references for strings that look like numbers, booleans, `null`, or generated definition ids. Use the typed codec below when you need circular references, shared object identity, `undefined`, `NaN`, or exact string/number distinctions in all cases.

### Typed Basic Types

```javascript
import { encode, decode } from 'lino-objects-codec';

// null and undefined
console.log(decode({ notation: encode({ obj: null } }))); // null
console.log(decode({ notation: encode({ obj: undefined } }))); // undefined

// Booleans
console.log(decode({ notation: encode({ obj: true } }))); // true
console.log(decode({ notation: encode({ obj: false } }))); // false

// Numbers (integers and floats)
console.log(decode({ notation: encode({ obj: 42 } }))); // 42
console.log(decode({ notation: encode({ obj: -123 } }))); // -123
console.log(decode({ notation: encode({ obj: 3.14 } }))); // 3.14

// Special number values
console.log(decode({ notation: encode({ obj: Infinity } }))); // Infinity
console.log(decode({ notation: encode({ obj: -Infinity } }))); // -Infinity
console.log(Number.isNaN(decode({ notation: encode({ obj: NaN } })))); // true

// Strings (with full Unicode support)
console.log(decode({ notation: encode({ obj: 'hello' } }))); // 'hello'
console.log(decode({ notation: encode({ obj: '你好世界 🌍' } }))); // '你好世界 🌍'
console.log(decode({ notation: encode({ obj: 'multi\nline\nstring' } }))); // 'multi\nline\nstring'
```

### Typed Collections

```javascript
import { encode, decode } from 'lino-objects-codec';

// Arrays
const data = [1, 2, 3, 'hello', true, null];
console.log(JSON.stringify(decode({ notation: encode({ obj: data } }))) === JSON.stringify(data)); // true

// Nested arrays
const nested = [[1, 2], [3, 4], [5, [6, 7]]];
console.log(JSON.stringify(decode({ notation: encode({ obj: nested } }))) === JSON.stringify(nested)); // true

// Objects
const person = {
  name: 'Bob',
  age: 25,
  email: 'bob@example.com',
};
console.log(JSON.stringify(decode({ notation: encode({ obj: person } }))) === JSON.stringify(person)); // true

// Complex nested structures
const complexData = {
  users: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ],
  metadata: {
    version: 1,
    count: 2,
  },
};
console.log(JSON.stringify(decode({ notation: encode({ obj: complexData } }))) === JSON.stringify(complexData)); // true
```

### Circular References

Object identity -- shared nodes and cycles -- is a property of the **compact**
format, which names shared nodes with `obj_N` ids. The readable format is a plain
tree with nowhere to put those ids, so `encode` throws `CircularReferenceError`
on a cycle. Use `encodeCompact` when you need identity preserved:

```javascript
import { encode, encodeCompact, decode } from 'lino-objects-codec';

// Self-referencing array -- preserved by the compact format
const arr = [1, 2, 3];
arr.push(arr); // Circular reference
const decoded = decode({ notation: encodeCompact({ obj: arr }) });
console.log(decoded[3] === decoded); // true - Reference preserved

// Shared references -- the same object is restored once
const shared = { shared: 'data' };
const container = { first: shared, second: shared };
const decoded3 = decode({ notation: encodeCompact({ obj: container }) });
console.log(decoded3.first === decoded3.second); // true

// The readable format rejects a cycle rather than losing the identity
try {
  encode({ obj: arr });
} catch (error) {
  console.log(error.name); // CircularReferenceError
}
```

### JSON/Lino Conversion

Convert between JSON and Links Notation format:

```javascript
import { jsonToLino, linoToJson, escapeReference } from 'lino-objects-codec';

// Convert JSON to Links Notation
const data = { name: 'Alice', age: 30 };
const lino = jsonToLino({ json: data });
console.log(lino);
// Output: ((name Alice) (age 30))

// Convert Links Notation back to JSON
const json = linoToJson({ lino: '((name Alice) (age 30))' });
console.log(json);
// Output: { name: 'Alice', age: 30 }

// Escape strings for Links Notation
console.log(escapeReference({ value: 'hello' })); // hello
console.log(escapeReference({ value: 'hello world' })); // 'hello world'
console.log(escapeReference({ value: "it's" })); // "it's"
console.log(escapeReference({ value: 'key:value' })); // "key:value"
```

### Fuzzy Matching

Find similar strings using edit distance and keyword similarity:

```javascript
import {
  levenshteinDistance,
  stringSimilarity,
  findBestMatch,
  findAllMatches,
  extractKeywords,
  normalizeQuestion,
} from 'lino-objects-codec';

// Calculate edit distance
const distance = levenshteinDistance({ a: 'hello', b: 'hallo' }); // 1

// Calculate similarity (0-1)
const similarity = stringSimilarity({ a: 'hello', b: 'hallo' }); // 0.8

// Normalize questions for comparison
const normalized = normalizeQuestion({ question: 'What is your NAME?' });
// Output: 'what is your name'

// Extract keywords (no stopwords by default)
const keywords = extractKeywords({ question: 'What is the best programming language?' });
// Output: Set { 'what', 'is', 'the', 'best', 'programming', 'language', 'progr' }

// Extract keywords with custom stopwords
const stopwords = new Set(['what', 'is', 'the']);
const filteredKeywords = extractKeywords({ question: 'What is the best programming language?', stopwords });
// Output: Set { 'best', 'programming', 'language', 'progr' }

// Find best matching question in a database
const qaDatabase = new Map([
  ['What is your name?', 'Claude'],
  ['How old are you?', 'Unknown'],
]);

const match = findBestMatch({ question: { question: 'What is your age?', qaDatabase: qaDatabase: qaDatabase, threshold: 0.3 } });
// Returns: { question: 'How old are you?', answer: 'Unknown', score: 0.xx }

// Find all matches above threshold
const matches = findAllMatches({ question: { question: 'What is your name?', qaDatabase: qaDatabase: qaDatabase, threshold: 0.3 } });
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target.

Readable indented mode emits a root definition and a definition for each nested object or non-empty array:

- Object definitions contain key/value doublets: `title 'Indian Law'`
- Array definitions contain one value per line
- Nested values reference generated definition ids such as `obj_root_items`
- Empty arrays are written as `()`
- Quoted references parse as strings; unquoted references parse dynamically as numbers, booleans, `null`, definition references, or strings

### Readable format (the default)

`encode({ obj })` writes one `( )` construct for both objects and arrays, at
every level including the root. Lines of the form `key value` make an object,
bare-value lines make an array:

- Strings are double-quoted and written as text: `name "Alice"`
- Numbers, `true`, `false` and `null` are bare, so types survive a round trip
- `NaN`, `Infinity` and `-Infinity` are written as such
- An empty array is `()`; an empty object is `(` + newline + `)`
- A value that cannot be written as text (one containing control characters) is
  base64-encoded on its own and marked as `(base64 "bGluZTEKbGluZTI=")`;
  everything around it stays readable

### Compact format (`encodeCompact`)

The previous single-line form, kept for compatibility and for the object graphs
the readable tree cannot express (shared and circular references):

- Basic types carry a type marker: `(int 42)`, `(str aGVsbG8=)`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Shared / cyclic collections are defined inline with a self-reference id, e.g.
  `(obj_0: array (int 1) (int 2) ...)`; a self-referencing object `{ self: obj }`
  encodes as `(obj_0: object ((str c2VsZg==) obj_0))`. See
  [issue #27](https://github.com/link-foundation/lino-objects-codec/issues/27)
  for the rationale.

`decode` detects which of the two forms it is given, so previously written files
keep decoding.

## Debugging

Tracing is off by default. Turn it on to see what the codec does, either from
the environment or from code:

```bash
LINO_CODEC_DEBUG=1 node your_script.js   # 1, true, yes or on
```

```javascript
import { setDebugEnabled } from 'lino-objects-codec';

setDebugEnabled(true); // force on
setDebugEnabled(null); // follow LINO_CODEC_DEBUG again
```

Trace lines are written to standard error, prefixed with `[lino-codec]`. The
same switch and the same `LINO_CODEC_DEBUG` variable exist in the Python, Rust
and C# implementations.

## API Reference

### Readable Indented Data

#### `formatIndented({ id: id, obj: obj, indent: indent })`

Format a plain object as readable recursive indented Links Notation.

**Parameters:**

- `options.id` - Root definition id
- `options.obj` - Plain object to format
- `options.indent` - Optional indentation string, defaulting to two spaces

**Returns:**

- Formatted indented Links Notation string

**Throws:**

- `Error` - If `id` is missing, `obj` is not a plain object, or a circular reference is found

```javascript
formatIndented({
  id: 'obj_root',
  obj: { title: 'Indian Law', nested: { ok: true }, items: ['a', 1] },
});
```

#### `parseIndented({ text: text })`

Parse readable recursive indented Links Notation back to `{ id, obj }`.

**Parameters:**

- `options.text` - Indented Links Notation text

**Returns:**

- `{ id, obj }`, where `id` is the root definition id and `obj` is the parsed dynamic object

### Typed Object Codec

#### `encode({ obj: obj })`

Encode a JavaScript object to Links Notation format with type markers.

**Parameters:**

- `options.obj` - The JavaScript object to encode

**Returns:**

- String representation in Links Notation format

**Throws:**

- `TypeError` - If the object type is not supported

#### `decode({ notation: notation })`

Decode Links Notation format to a JavaScript object.

**Parameters:**

- `options.notation` - String in Links Notation format

**Returns:**

- Reconstructed JavaScript object

#### `ObjectCodec`

The main codec class that performs encoding and decoding. The module-level `encode({ obj: )` and `decode({ notation:  } })` functions use a shared instance of this class.

```javascript
import { ObjectCodec } from 'lino-objects-codec';

const codec = new ObjectCodec();
const encoded = codec.encode({ obj: [1, 2, 3] });
const decoded = codec.decode({ notation: encoded });
```

### JSON/Lino Conversion

#### `jsonToLino({ json: json })`

Convert JSON data to Links Notation format.

**Parameters:**

- `options.json` - Any JSON-serializable value (object, array, string, number, boolean, null)

**Returns:**

- Links Notation string representation

```javascript
jsonToLino({ json: { name: 'Alice', age: 30 } });
// Returns: ((name Alice) (age 30))

jsonToLino({ json: [1, 2, 3] });
// Returns: (1 2 3)
```

#### `linoToJson({ lino: lino })`

Convert Links Notation to JSON.

**Parameters:**

- `options.lino` - Links Notation string

**Returns:**

- Parsed JSON value

```javascript
linoToJson({ lino: '((name Alice) (age 30))' });
// Returns: { name: 'Alice', age: 30 }
```

#### `escapeReference({ value: value })`

Escape a value for safe use in Links Notation format.

**Parameters:**

- `options.value` - The value to escape (string, number, or boolean)

**Returns:**

- Escaped string suitable for Links Notation

```javascript
escapeReference({ value: 'hello' }); // 'hello'
escapeReference({ value: 'hello world' }); // "'hello world'"
escapeReference({ value: "it's" }); // "\"it's\""
```

#### `unescapeReference(options = {})`

Unescape a Links Notation reference.

**Parameters:**

- `options.str` - The escaped reference string

**Returns:**

- Unescaped string

#### `formatAsLino(options = {})`

Format an array as Links Notation with proper indentation.

**Parameters:**

- `options.values` - Array of values

**Returns:**

- Formatted Links Notation string

### Fuzzy Matching Utilities

#### `levenshteinDistance(options = {})`

Calculate edit distance between two strings.

**Parameters:**

- `options.a`, `options.b` - Strings to compare

**Returns:**

- Number of edits (insertions, deletions, substitutions) needed

#### `stringSimilarity(options = {})`

Calculate normalized similarity score between two strings.

**Parameters:**

- `options.a`, `options.b` - Strings to compare

**Returns:**

- Score between 0 (completely different) and 1 (identical)

#### `normalizeQuestion({ question: question })`

Normalize a question for comparison (lowercase, remove punctuation, standardize whitespace).

**Parameters:**

- `options.question` - Question string

**Returns:**

- Normalized string

#### `extractKeywords(options = {})`

Extract meaningful keywords from a question, optionally filtering out stopwords.

**Parameters:**

- `options.question` - Question string
- `options.stopwords` - Custom stopwords set to filter out (default: empty Set, no filtering)
- `options.minWordLength` - Minimum word length (default: 2)
- `options.stemLength` - Length for word stemming (default: 5, 0 to disable)

**Returns:**

- Set of keywords

#### `keywordSimilarity(options = {})`

Calculate keyword overlap similarity (Jaccard index).

**Parameters:**

- `options.a`, `options.b` - Questions to compare
- `options` - Same as extractKeywords

**Returns:**

- Score between 0 and 1

#### `findBestMatch({ question: question, qaDatabase: database, options })`

Find the best matching question from a database.

**Parameters:**

- `options.question` - Question to match
- `options.qaDatabase` - Map of questions to answers
- `options.threshold` - Minimum similarity threshold (default: 0.4)
- `options.editWeight` - Weight for edit distance similarity (default: 0.4)
- `options.keywordWeight` - Weight for keyword similarity (default: 0.6)
- `options.stopwords` - Stopwords to filter from keyword extraction
- `options.minWordLength` - Minimum word length for keyword extraction
- `options.stemLength` - Stem length for keyword extraction

**Returns:**

- `{ question, answer, score }` or null if no match above threshold

#### `findAllMatches({ question: question, qaDatabase: database, options })`

Find all matches above a threshold, sorted by score.

**Parameters:**

- Same as findBestMatch

**Returns:**

- Array of `{ question, answer, score }` sorted by score descending

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/link-foundation/lino-objects-codec.git
cd lino-objects-codec/js

# Install dependencies
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run example
npm run example
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests for your changes
4. Ensure all tests pass (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is licensed under the Unlicense - see the [LICENSE](../LICENSE) file for details.

## Links

- [GitHub Repository](https://github.com/link-foundation/lino-objects-codec)
- [Links Notation Specification](https://github.com/link-foundation/links-notation)
- [npm Package](https://www.npmjs.com/package/lino-objects-codec/)
- [Python Implementation](../python/)

## Acknowledgments

This project is built on top of the [links-notation](https://github.com/link-foundation/links-notation) library.
