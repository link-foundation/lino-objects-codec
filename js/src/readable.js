/**
 * Readable, indented Links Notation representation.
 *
 * This module implements the default output of {@link encode}: a plain-text,
 * indented projection where keys and values are written as they are, so the file
 * can be read, grepped and reviewed without decoding anything.
 *
 * # Shape
 *
 * One construct — `( )` — is used for both objects and arrays, at every level
 * including the root. What distinguishes them is the content of the lines:
 * `key value` pairs make an object, bare values make an array.
 *
 * ```text
 * (
 *   type "RouterState"
 *   server (
 *     host "127.0.0.1"
 *     port 18878
 *   )
 *   models (
 *     "claude-haiku"
 *     "claude-opus"
 *   )
 * )
 * ```
 *
 * # Value mapping
 *
 * | JavaScript value               | Readable form                            |
 * | ------------------------------ | ---------------------------------------- |
 * | plain object                    | `( )` with one `key value` pair per line |
 * | `Array`                         | `( )` with one value per line            |
 * | `string`                        | quoted, never encoded                    |
 * | `number` / `boolean` / `null` / `undefined` | bare, so the type survives the round trip |
 *
 * Empty containers keep their type: an empty array is `()` on one line, while an
 * empty object is written as `(` and `)` on two lines.
 *
 * Only values that cannot be written as plain text are encoded: strings holding
 * control characters (including newlines and tabs, which line-based tooling and
 * CRLF normalisation would corrupt) are marked individually as
 * `(base64 "…")` instead of encoding the whole document.
 *
 * @module readable
 */

import { trace } from './debug.js';

/** Default indentation used by {@link encode}. */
export const DEFAULT_INDENT = '  ';

/** Marker used for values that cannot be represented as plain text. */
export const BASE64_MARKER = 'base64';

/** Literals that a bare reference decodes to instead of a string. */
const BARE_LITERALS = new Map([
  ['null', null],
  ['undefined', undefined],
  ['true', true],
  ['false', false],
  ['NaN', NaN],
  ['Infinity', Infinity],
  ['-Infinity', -Infinity],
]);

/** Characters that cannot appear in a bare (unquoted) reference. */
const QUOTE_CHARS = ['"', "'", '`'];

/** Characters that force an object key to be quoted. */
const KEY_NEEDS_QUOTES = /[\s()':`"]/;

/**
 * Raised when a value cannot be written because it refers back to itself.
 *
 * The readable form writes a plain tree and has no place to put the `obj_N`
 * definition ids that name a shared node, so a cycle cannot be represented.
 * `encodeCompact` handles cycles.
 */
export class CircularReferenceError extends TypeError {
  /** @param {string} message - Why the value could not be written */
  constructor(message) {
    super(message);
    this.name = 'CircularReferenceError';
  }
}

/**
 * Encode a value into the readable, indented Links Notation form.
 * @param {*} value - The value to encode
 * @param {string} [indent] - Indentation string used per nesting level
 * @returns {string} The readable Links Notation document
 * @throws {CircularReferenceError} If the value refers back to itself
 * @throws {TypeError} If the value holds a type this format cannot write
 */
export function encode(value, indent = DEFAULT_INDENT) {
  const out = [];
  writeValue(value, indent, 0, out, new Set());
  return out.join('');
}

/**
 * Decode the readable, indented Links Notation form back into a value.
 * @param {string} text - The readable Links Notation document
 * @returns {*} The reconstructed value
 */
export function decode(text) {
  const tokens = tokenize(text);
  trace('readable.decode', () => `${tokens.length} tokens`);
  const cursor = new Cursor(tokens);
  const rows = cursor.parseRows(true);

  if (cursor.pos < tokens.length) {
    throw new SyntaxError("unexpected ')' in readable notation");
  }

  // A document holding a single value (for example `42`) is that value.
  if (rows.length === 1 && rows[0].length === 1) {
    return nodeToValue(rows[0][0]);
  }

  return rowsToValue(rows, true);
}

// === Encoding ===

function writeValue(value, indent, level, out, path) {
  if (Array.isArray(value)) {
    enterPath(value, path);
    writeRows(value, indent, level, out, (item) =>
      writeValue(item, indent, level + 1, out, path)
    );
    path.delete(value);
    return;
  }

  if (isPlainContainer(value)) {
    enterPath(value, path);
    const entries = Object.entries(value);
    if (entries.length === 0) {
      // An empty object spans two lines; `()` on one line is an empty array.
      out.push('(\n');
      pushIndent(indent, level, out);
      out.push(')');
      path.delete(value);
      return;
    }
    writeRows(entries, indent, level, out, ([key, child]) => {
      out.push(formatKey(key));
      out.push(' ');
      writeValue(child, indent, level + 1, out, path);
    });
    path.delete(value);
    return;
  }

  out.push(formatScalar(value));
}

/**
 * Mark a container as being written, so a reference back to it is caught.
 *
 * Only the containers on the way down are tracked: the same object appearing
 * twice side by side is written twice, which reads back as two equal values.
 * @param {object} value - The container being entered
 * @param {Set<object>} path - Containers currently being written
 */
function enterPath(value, path) {
  if (path.has(value)) {
    throw new CircularReferenceError(
      'Cannot write a circular reference in the readable format; ' +
        'use encodeCompact, which names shared nodes with obj_N ids'
    );
  }
  path.add(value);
}

/**
 * Write a container as `(`, one indented line per item, then `)`.
 * An empty container collapses to `()`, which reads back as an empty array.
 * @param {Array} items - Items to write, one per line
 * @param {string} indent - Indentation string used per nesting level
 * @param {number} level - Current nesting level
 * @param {string[]} out - Output chunks, appended in place
 * @param {(item: *) => void} writeItem - Writes one item's line content
 */
function writeRows(items, indent, level, out, writeItem) {
  if (items.length === 0) {
    out.push('()');
    return;
  }

  out.push('(');
  for (const item of items) {
    out.push('\n');
    pushIndent(indent, level + 1, out);
    writeItem(item);
  }
  out.push('\n');
  pushIndent(indent, level, out);
  out.push(')');
}

function pushIndent(indent, level, out) {
  for (let i = 0; i < level; i += 1) {
    out.push(indent);
  }
}

/**
 * Whether a value is written as an object: a plain object, not a scalar and not
 * an array. Class instances are treated the same way as plain objects, which is
 * what the compact codec does as well.
 * @param {*} value - The value to classify
 * @returns {boolean} True when the value is written as `key value` lines
 */
function isPlainContainer(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Format a scalar value. Strings are quoted, everything else stays bare so that
 * its type is recoverable when reading the document back.
 * @param {*} value - The scalar to format
 * @returns {string} The formatted scalar
 */
function formatScalar(value) {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  if (typeof value === 'string') {
    return formatString(value);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  throw new TypeError(`Unsupported type: ${typeof value}`);
}

function formatNumber(value) {
  if (Number.isNaN(value)) {
    return 'NaN';
  }
  if (value === Infinity) {
    return 'Infinity';
  }
  if (value === -Infinity) {
    return '-Infinity';
  }
  return String(value);
}

/**
 * Format a string value: quoted plain text, or an individually marked base64
 * payload when the text cannot be written literally.
 * @param {string} value - The string to format
 * @returns {string} The formatted string
 */
function formatString(value) {
  if (needsEncoding(value)) {
    const payload = Buffer.from(value, 'utf-8').toString('base64');
    return `(${BASE64_MARKER} ${quote(payload)})`;
  }
  return quote(value);
}

/**
 * A value can be written as text unless it contains control characters:
 * newlines break the line structure and CRLF normalisation would rewrite them.
 * @param {string} value - The string to check
 * @returns {boolean} True when the string has to be encoded
 */
function needsEncoding(value) {
  for (const char of value) {
    const code = char.codePointAt(0);
    // Unicode category Cc: the C0 and C1 control ranges.
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
  }
  return false;
}

function quote(value) {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  // Both quote styles are present: double the double quotes, as the parser expects.
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Format an object key. Keys are bare when they read as plain identifiers.
 * @param {string} key - The key to format
 * @returns {string} The formatted key
 */
function formatKey(key) {
  const plain =
    key.length > 0 &&
    key !== BASE64_MARKER &&
    !needsEncoding(key) &&
    !KEY_NEEDS_QUOTES.test(key);

  return plain ? key : formatString(key);
}

// === Decoding ===

const TOKEN_OPEN = 'open';
const TOKEN_CLOSE = 'close';
const TOKEN_NEWLINE = 'newline';
const TOKEN_REF = 'ref';

/**
 * Split a document into tokens: parentheses, newlines and references.
 * A reference remembers whether it was quoted, which is what distinguishes a
 * string from a number when the document is read back.
 * @param {string} text - The document to tokenize
 * @returns {Array<{kind: string, value?: string, quoted?: boolean}>} The tokens
 */
function tokenize(text) {
  const chars = Array.from(text);
  const tokens = [];
  let i = 0;

  while (i < chars.length) {
    const c = chars[i];

    if (c === '\n') {
      tokens.push({ kind: TOKEN_NEWLINE });
      i += 1;
    } else if (/\s/.test(c)) {
      i += 1;
    } else if (c === '(') {
      tokens.push({ kind: TOKEN_OPEN });
      i += 1;
    } else if (c === ')') {
      tokens.push({ kind: TOKEN_CLOSE });
      i += 1;
    } else if (QUOTE_CHARS.includes(c)) {
      const [value, next] = readQuoted(chars, i, c);
      tokens.push({ kind: TOKEN_REF, value, quoted: true });
      i = next;
    } else {
      const start = i;
      while (
        i < chars.length &&
        !/\s/.test(chars[i]) &&
        chars[i] !== '(' &&
        chars[i] !== ')' &&
        !QUOTE_CHARS.includes(chars[i])
      ) {
        i += 1;
      }
      tokens.push({
        kind: TOKEN_REF,
        value: chars.slice(start, i).join(''),
        quoted: false,
      });
    }
  }

  return tokens;
}

/**
 * Read a quoted reference, where a doubled quote character means a literal one.
 * @param {string[]} chars - The document characters
 * @param {number} start - Index of the opening quote
 * @param {string} quoteChar - The quote character used
 * @returns {[string, number]} The value and the index after the closing quote
 */
function readQuoted(chars, start, quoteChar) {
  let value = '';
  let i = start + 1;

  while (i < chars.length) {
    if (chars[i] === quoteChar) {
      if (chars[i + 1] === quoteChar) {
        value += quoteChar;
        i += 2;
        continue;
      }
      return [value, i + 1];
    }
    value += chars[i];
    i += 1;
  }

  throw new SyntaxError(
    `unterminated quoted value starting at character ${start}`
  );
}

/** Cursor over the token stream, turning tokens into nodes and rows. */
class Cursor {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  /**
   * Parse rows until the matching `)` (or the end of input at the top level).
   * A row is one line: the values written between two newlines.
   * @param {boolean} topLevel - Whether this is the outermost context
   * @returns {Array<Array<object>>} The parsed rows
   */
  parseRows(topLevel) {
    const rows = [];
    let row = [];

    while (this.pos < this.tokens.length) {
      const token = this.tokens[this.pos];

      if (token.kind === TOKEN_CLOSE) {
        if (topLevel) {
          break;
        }
        this.pos += 1;
        if (row.length > 0) {
          rows.push(row);
        }
        return rows;
      }

      if (token.kind === TOKEN_NEWLINE) {
        this.pos += 1;
        if (row.length > 0) {
          rows.push(row);
          row = [];
        }
        continue;
      }

      row.push(this.parseNode());
    }

    if (!topLevel) {
      throw new SyntaxError("unterminated '(' in readable notation");
    }

    if (row.length > 0) {
      rows.push(row);
    }
    return rows;
  }

  /**
   * Parse a single node: a reference or a parenthesised link.
   * @returns {object} The parsed node
   */
  parseNode() {
    const token = this.tokens[this.pos];

    if (token.kind === TOKEN_REF) {
      this.pos += 1;
      return { ref: true, value: token.value, quoted: token.quoted };
    }

    if (token.kind === TOKEN_OPEN) {
      this.pos += 1;
      const multiline = this.linkIsMultiline();
      const rows = this.parseRows(false);
      return { ref: false, rows, multiline };
    }

    throw new SyntaxError('unexpected token in readable notation');
  }

  /**
   * Whether the link that just opened spans more than one line, which is what
   * tells an empty object (`(\n)`) from an empty array (`()`).
   * @returns {boolean} True when a newline appears before the closing `)`
   */
  linkIsMultiline() {
    for (let i = this.pos; i < this.tokens.length; i += 1) {
      if (this.tokens[i].kind === TOKEN_CLOSE) {
        return false;
      }
      if (this.tokens[i].kind === TOKEN_NEWLINE) {
        return true;
      }
    }
    return false;
  }
}

function nodeToValue(node) {
  return node.ref
    ? refToValue(node.value, node.quoted)
    : rowsToValue(node.rows, node.multiline);
}

function rowsToValue(rows, multiline) {
  if (rows.length === 0) {
    return multiline ? {} : [];
  }

  const marked = decodeMarkedValue(rows);
  if (marked !== undefined) {
    return marked.value;
  }

  // `key value` on every line makes an object; anything else is a list of values.
  const isObject = rows.every((row) => row.length === 2 && row[0].ref);

  if (isObject) {
    const result = {};
    for (const row of rows) {
      result[row[0].value] = nodeToValue(row[1]);
    }
    return result;
  }

  const items = [];
  for (const row of rows) {
    for (const node of row) {
      items.push(nodeToValue(node));
    }
  }
  return items;
}

/**
 * Recognise `(base64 "…")`, the individual marker for values that could not be
 * written as text. A quoted `base64` key is an ordinary object key, not a marker.
 * @param {Array<Array<object>>} rows - The rows of the link being decoded
 * @returns {{value: string}|undefined} The decoded string, wrapped so that an
 *   empty result is still distinguishable from "not a marker"
 */
function decodeMarkedValue(rows) {
  if (rows.length !== 1 || rows[0].length !== 2) {
    return undefined;
  }

  const [marker, payload] = rows[0];
  if (!marker.ref || marker.quoted || marker.value !== BASE64_MARKER) {
    return undefined;
  }
  if (!payload.ref || !payload.quoted) {
    return undefined;
  }

  const decoded = Buffer.from(payload.value, 'base64').toString('utf-8');
  return { value: decoded };
}

/**
 * Convert a reference to a value. Quoted references are always strings; bare
 * references keep the type they were written with.
 * @param {string} value - The reference text
 * @param {boolean} quoted - Whether the reference was quoted
 * @returns {*} The reconstructed value
 */
function refToValue(value, quoted) {
  if (quoted) {
    return value;
  }

  if (BARE_LITERALS.has(value)) {
    return BARE_LITERALS.get(value);
  }

  if (/^[+-]?\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
    return value;
  }

  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}
