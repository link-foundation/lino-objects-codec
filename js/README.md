# link-notation-objects-codec (JavaScript)

A JavaScript library for working with Links Notation format. This library provides:
- Universal serialization/deserialization for JavaScript objects with circular reference support
- JSON to Links Notation conversion utilities
- Fuzzy matching utilities for string comparison

These tools enable easy implementation of higher-level features like:
- [LinksNotationManager](https://github.com/konard/follow/blob/main/lino.lib.mjs) - Intermediate application data storage
- [Q&A Database](https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs) - Questions and answers database

## Features

- **Universal Serialization**: Encode JavaScript objects to Links Notation format
- **Type Support**: Handle all common JavaScript types:
  - Basic types: `null`, `undefined`, `boolean`, `number`, `string`
  - Collections: `Array`, `Object`
  - Special number values: `NaN`, `Infinity`, `-Infinity`
- **Circular References**: Automatically detect and preserve circular references
- **Object Identity**: Maintain object identity for shared references
- **UTF-8 Support**: Full Unicode string support using base64 encoding
- **Simple API**: Easy-to-use `encode()` and `decode()` functions
- **JSON/Lino Conversion**: Convert between JSON and Links Notation with `jsonToLino()` and `linoToJson()`
- **Reference Escaping**: Properly escape strings for Links Notation format with `escapeReference()`
- **Fuzzy Matching**: Find similar strings with Levenshtein distance and keyword similarity

## Installation

```bash
npm install link-notation-objects-codec
```

Or with other package managers:

```bash
# Bun
bun add link-notation-objects-codec

# Yarn
yarn add link-notation-objects-codec

# pnpm
pnpm add link-notation-objects-codec
```

## Quick Start

```javascript
import { encode, decode } from 'link-notation-objects-codec';

// Encode basic types
const encoded = encode({ name: 'Alice', age: 30, active: true });
console.log(encoded);
// Output: (object obj_0 ((str bmFt...) (int 30)) ((str YWN0...) (bool true)))

// Decode back to JavaScript object
const decoded = decode(encoded);
console.log(decoded);
// Output: { name: 'Alice', age: 30, active: true }

// Roundtrip preserves data
console.log(JSON.stringify(decoded) === JSON.stringify({ name: 'Alice', age: 30, active: true }));
// Output: true
```

## Usage Examples

### Basic Types

```javascript
import { encode, decode } from 'link-notation-objects-codec';

// null and undefined
console.log(decode(encode(null))); // null
console.log(decode(encode(undefined))); // undefined

// Booleans
console.log(decode(encode(true))); // true
console.log(decode(encode(false))); // false

// Numbers (integers and floats)
console.log(decode(encode(42))); // 42
console.log(decode(encode(-123))); // -123
console.log(decode(encode(3.14))); // 3.14

// Special number values
console.log(decode(encode(Infinity))); // Infinity
console.log(decode(encode(-Infinity))); // -Infinity
console.log(Number.isNaN(decode(encode(NaN)))); // true

// Strings (with full Unicode support)
console.log(decode(encode('hello'))); // 'hello'
console.log(decode(encode('你好世界 🌍'))); // '你好世界 🌍'
console.log(decode(encode('multi\nline\nstring'))); // 'multi\nline\nstring'
```

### Collections

```javascript
import { encode, decode } from 'link-notation-objects-codec';

// Arrays
const data = [1, 2, 3, 'hello', true, null];
console.log(JSON.stringify(decode(encode(data))) === JSON.stringify(data)); // true

// Nested arrays
const nested = [[1, 2], [3, 4], [5, [6, 7]]];
console.log(JSON.stringify(decode(encode(nested))) === JSON.stringify(nested)); // true

// Objects
const person = {
  name: 'Bob',
  age: 25,
  email: 'bob@example.com',
};
console.log(JSON.stringify(decode(encode(person))) === JSON.stringify(person)); // true

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
console.log(JSON.stringify(decode(encode(complexData))) === JSON.stringify(complexData)); // true
```

### Circular References

The library automatically handles circular references and shared objects:

```javascript
import { encode, decode } from 'link-notation-objects-codec';

// Self-referencing array
const arr = [1, 2, 3];
arr.push(arr); // Circular reference
const encoded = encode(arr);
const decoded = decode(encoded);
console.log(decoded[3] === decoded); // true - Reference preserved

// Self-referencing object
const obj = { name: 'root' };
obj.self = obj; // Circular reference
const encoded2 = encode(obj);
const decoded2 = decode(encoded2);
console.log(decoded2.self === decoded2); // true - Reference preserved

// Shared references
const shared = { shared: 'data' };
const container = { first: shared, second: shared };
const encoded3 = encode(container);
const decoded3 = decode(encoded3);
// Both references point to the same object
console.log(decoded3.first === decoded3.second); // true

// Complex circular structure (tree with back-references)
const root = { name: 'root', children: [] };
const child = { name: 'child', parent: root };
root.children.push(child);
const encoded4 = encode(root);
const decoded4 = decode(encoded4);
console.log(decoded4.children[0].parent === decoded4); // true
```

### JSON/Lino Conversion

Convert between JSON and Links Notation format:

```javascript
import { jsonToLino, linoToJson, escapeReference } from 'link-notation-objects-codec';

// Convert JSON to Links Notation
const data = { name: 'Alice', age: 30 };
const lino = jsonToLino(data);
console.log(lino);
// Output: ((name Alice) (age 30))

// Convert Links Notation back to JSON
const json = linoToJson('((name Alice) (age 30))');
console.log(json);
// Output: { name: 'Alice', age: 30 }

// Escape strings for Links Notation
console.log(escapeReference('hello')); // hello
console.log(escapeReference('hello world')); // 'hello world'
console.log(escapeReference("it's")); // "it's"
console.log(escapeReference('key:value')); // "key:value"
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
} from 'link-notation-objects-codec';

// Calculate edit distance
const distance = levenshteinDistance('hello', 'hallo'); // 1

// Calculate similarity (0-1)
const similarity = stringSimilarity('hello', 'hallo'); // 0.8

// Normalize questions for comparison
const normalized = normalizeQuestion('What is your NAME?');
// Output: 'what is your name'

// Extract keywords (filtering stopwords)
const keywords = extractKeywords('What is the best programming language?');
// Output: Set { 'best', 'programming', 'language', 'progr' }

// Find best matching question in a database
const qaDatabase = new Map([
  ['What is your name?', 'Claude'],
  ['How old are you?', 'Unknown'],
]);

const match = findBestMatch('What is your age?', qaDatabase, { threshold: 0.3 });
// Returns: { question: 'How old are you?', answer: 'Unknown', score: 0.xx }

// Find all matches above threshold
const matches = findAllMatches('What is your name?', qaDatabase, { threshold: 0.3 });
```

## How It Works

The library uses the [links-notation](https://github.com/link-foundation/links-notation) format as the serialization target. Each JavaScript object is encoded as a Link with type information:

- Basic types are encoded with type markers: `(int 42)`, `(str "hello")`, `(bool true)`
- Strings are base64-encoded to handle special characters and newlines
- Collections include object IDs for reference tracking: `(array obj_0 item1 item2 ...)`
- Circular references use special `ref` links: `(ref obj_0)`

This approach allows for:
- Universal representation of object graphs
- Preservation of object identity
- Natural handling of circular references
- Human-readable (somewhat) output

## API Reference

### Typed Object Codec

#### `encode(obj)`

Encode a JavaScript object to Links Notation format with type markers.

**Parameters:**
- `obj` - The JavaScript object to encode

**Returns:**
- String representation in Links Notation format

**Throws:**
- `TypeError` - If the object type is not supported

#### `decode(notation)`

Decode Links Notation format to a JavaScript object.

**Parameters:**
- `notation` - String in Links Notation format

**Returns:**
- Reconstructed JavaScript object

#### `ObjectCodec`

The main codec class that performs encoding and decoding. The module-level `encode()` and `decode()` functions use a shared instance of this class.

```javascript
import { ObjectCodec } from 'link-notation-objects-codec';

const codec = new ObjectCodec();
const encoded = codec.encode({ data: [1, 2, 3] });
const decoded = codec.decode(encoded);
```

### JSON/Lino Conversion

#### `jsonToLino(json)`

Convert JSON data to Links Notation format.

**Parameters:**
- `json` - Any JSON-serializable value (object, array, string, number, boolean, null)

**Returns:**
- Links Notation string representation

```javascript
jsonToLino({ name: 'Alice', age: 30 });
// Returns: ((name Alice) (age 30))

jsonToLino([1, 2, 3]);
// Returns: (1 2 3)
```

#### `linoToJson(lino)`

Convert Links Notation to JSON.

**Parameters:**
- `lino` - Links Notation string

**Returns:**
- Parsed JSON value

```javascript
linoToJson('((name Alice) (age 30))');
// Returns: { name: 'Alice', age: 30 }
```

#### `escapeReference(value)`

Escape a value for safe use in Links Notation format.

**Parameters:**
- `value` - The value to escape (string, number, or boolean)

**Returns:**
- Escaped string suitable for Links Notation

```javascript
escapeReference('hello'); // 'hello'
escapeReference('hello world'); // "'hello world'"
escapeReference("it's"); // "\"it's\""
```

#### `unescapeReference(str)`

Unescape a Links Notation reference.

**Parameters:**
- `str` - The escaped reference string

**Returns:**
- Unescaped string

#### `formatAsLino(values)`

Format an array as Links Notation with proper indentation.

**Parameters:**
- `values` - Array of values

**Returns:**
- Formatted Links Notation string

### Fuzzy Matching Utilities

#### `levenshteinDistance(a, b)`

Calculate edit distance between two strings.

**Parameters:**
- `a`, `b` - Strings to compare

**Returns:**
- Number of edits (insertions, deletions, substitutions) needed

#### `stringSimilarity(a, b)`

Calculate normalized similarity score between two strings.

**Parameters:**
- `a`, `b` - Strings to compare

**Returns:**
- Score between 0 (completely different) and 1 (identical)

#### `normalizeQuestion(question)`

Normalize a question for comparison (lowercase, remove punctuation, standardize whitespace).

**Parameters:**
- `question` - Question string

**Returns:**
- Normalized string

#### `extractKeywords(question, options)`

Extract meaningful keywords from a question, filtering out stopwords.

**Parameters:**
- `question` - Question string
- `options.stopwords` - Custom stopwords set (default: combined Russian + English)
- `options.minWordLength` - Minimum word length (default: 2)
- `options.stemLength` - Length for word stemming (default: 5, 0 to disable)

**Returns:**
- Set of keywords

#### `keywordSimilarity(a, b, options)`

Calculate keyword overlap similarity (Jaccard index).

**Parameters:**
- `a`, `b` - Questions to compare
- `options` - Same as extractKeywords

**Returns:**
- Score between 0 and 1

#### `findBestMatch(question, database, options)`

Find the best matching question from a database.

**Parameters:**
- `question` - Question to match
- `database` - Map of questions to answers
- `options.threshold` - Minimum similarity threshold (default: 0.4)
- `options.editWeight` - Weight for edit distance similarity (default: 0.4)
- `options.keywordWeight` - Weight for keyword similarity (default: 0.6)

**Returns:**
- `{ question, answer, score }` or null if no match above threshold

#### `findAllMatches(question, database, options)`

Find all matches above a threshold, sorted by score.

**Parameters:**
- Same as findBestMatch

**Returns:**
- Array of `{ question, answer, score }` sorted by score descending

#### Stopwords

The library exports default stopword sets:

```javascript
import { DEFAULT_STOPWORDS_RU, DEFAULT_STOPWORDS_EN } from 'link-notation-objects-codec';
```

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/link-foundation/link-notation-objects-codec.git
cd link-notation-objects-codec/js

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

- [GitHub Repository](https://github.com/link-foundation/link-notation-objects-codec)
- [Links Notation Specification](https://github.com/link-foundation/links-notation)
- [npm Package](https://www.npmjs.com/package/link-notation-objects-codec/)
- [Python Implementation](../python/)

## Acknowledgments

This project is built on top of the [links-notation](https://github.com/link-foundation/links-notation) library.
