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
- **Circular References**: Automatically detect and preserve circular references in the typed codec
- **Object Identity**: Maintain object identity for shared references in the typed codec
- **UTF-8 Support**: Full Unicode string support in the typed codec using base64 encoding
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

Use the typed codec when you need exact JavaScript type preservation, circular references, or shared object identity:

```javascript
import { encode, decode } from 'lino-objects-codec';

const obj = { name: 'root' };
obj.self = obj;

const encoded = encode({ obj });
const decoded = decode({ notation: encoded });

console.log(decoded.self === decoded);
// Output: true
```

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

The library automatically handles circular references and shared objects:

```javascript
import { encode, decode } from 'lino-objects-codec';

// Self-referencing array
const arr = [1, 2, 3];
arr.push(arr); // Circular reference
const encoded = encode({ obj: arr });
const decoded = decode({ notation: encoded });
console.log(decoded[3] === decoded); // true - Reference preserved

// Self-referencing object
const obj = { name: 'root' };
obj.self = obj; // Circular reference
const encoded2 = encode({ obj: obj });
const decoded2 = decode({ notation: encoded2 });
console.log(decoded2.self === decoded2); // true - Reference preserved

// Shared references
const shared = { shared: 'data' };
const container = { first: shared, second: shared };
const encoded3 = encode({ obj: container });
const decoded3 = decode({ notation: encoded3 });
// Both references point to the same object
console.log(decoded3.first === decoded3.second); // true

// Complex circular structure (tree with back-references)
const root = { name: 'root', children: [] };
const child = { name: 'child', parent: root };
root.children.push(child);
const encoded4 = encode({ obj: root });
const decoded4 = decode({ notation: encoded4 });
console.log(decoded4.children[0].parent === decoded4); // true
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

The typed codec uses explicit type information:

- Basic types are encoded with type markers: `(int 42)`, `(str "hello")`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Shared / cyclic collections are defined inline with a self-reference id using
  the built-in links-notation `(self-ref: first-ref second-ref ...)` form, e.g.
  `(obj_0: array (int 1) (int 2) ...)` or `(obj_0: object (key val) ...)`
- Circular references use built-in links-notation references — the bare object
  id link `obj_0` — instead of a dedicated keyword. For example, a self-
  referencing object `{ self: obj }` encodes as
  `(obj_0: object ((str c2VsZg==) obj_0))` (no `(ref obj_0)` marker). See
  [issue #27](https://github.com/link-foundation/lino-objects-codec/issues/27)
  for the rationale.

This approach allows for:

- Universal representation of object graphs
- Preservation of object identity
- Natural handling of circular references
- Exact typed round-trips when readability is less important than preserving JavaScript semantics

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
