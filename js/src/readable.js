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
 * | `string`                        | quoted text, never base64                |
 * | `number` / `boolean` / `null` / `undefined` | bare, so the type survives the round trip |
 *
 * Empty containers keep their type: an empty array is `()` on one line, while an
 * empty object is written as `(` and `)` on two lines.
 *
 * Text is written as text. A string keeps every character a reader would grep
 * for, including newlines and tabs, and is quoted with a run of delimiters —
 * `"""say "hi""""` — when it holds the delimiter itself. Only the characters a
 * form cannot carry are escaped, and only they: the value is then written as
 * `(escaped "…")`, where `%XX` stands for one escaped byte. The indented form
 * escapes the carriage return, which CRLF normalisation would otherwise rewrite,
 * and the other control characters; the single-line form escapes the newline as
 * well, because there a record ends at the end of the line. Nothing else is
 * encoded: base64 lives in `encodeCompact`, which a caller asks for by name.
 *
 * # Single-line form
 *
 * {@link encodeLine} writes the same document on one line, so one record is one
 * line and an append-only log stays greppable, tailable and countable by
 * `wc -l`. Rows can no longer be told apart by line breaks there, so an object
 * names itself with the `o` link id the notation already has, and its pairs are
 * written as their own links:
 *
 * ```text
 * (o: (type "RouterState") (server (o: (host "127.0.0.1") (port 18878))) (models ("claude-haiku" "claude-opus")))
 * ```
 *
 * | Value            | Single-line form                |
 * | ---------------- | ------------------------------- |
 * | plain object     | `(o: (key value) …)`            |
 * | empty object     | `(o:)`                          |
 * | `Array`          | `(value …)`                     |
 * | empty `Array`    | `()`                            |
 * | scalars          | exactly as in the indented form |
 *
 * The marker is what answers the ambiguity a flat layout otherwise has: without
 * it `((key value))` reads both as the one-pair object and as the array holding
 * the two-element array, and an empty key makes it worse. With it, a bare `( )`
 * is always an array and a marked one is always an object, so every value —
 * empty key included — survives the round trip. Consequently a *hand-written*
 * one-line link such as `(a 1)` is the two-element array, not the one-pair
 * object: on one line, objects say so.
 *
 * @module readable
 */

import { trace } from './debug.js';

/** Default indentation used by {@link encode}. */
export const DEFAULT_INDENT = '  ';

/**
 * Marker of a base64 payload. Written by `encodeCompact` and by versions up to
 * 0.6.0 of the readable form, which is why it is still read.
 */
export const BASE64_MARKER = 'base64';

/**
 * Marker of a string whose unwritable characters are percent-escaped.
 *
 * It reads as `(escaped "line one%0Aline two")`. Only those characters change;
 * the rest of the text is written as it is, so the value stays readable and
 * greppable.
 */
export const ESCAPED_MARKER = 'escaped';

/** The indented form, where a value may hold a line break of its own. */
const FORM_INDENTED = 'indented';

/** The single-line form, where a record ends at the end of the line. */
const FORM_LINE = 'line';

/** Link id naming an object in the single-line form, written as `(o: …)`. */
export const OBJECT_MARKER = 'o';

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
// eslint-disable-next-line no-control-regex
const KEY_NEEDS_QUOTES = /[\s()':`"\u0000-\u001f\u007f-\u009f]/;

/** Encoder used to write one character as the bytes its escapes stand for. */
const UTF8_ENCODER = new TextEncoder();

/** Decoder used to read an escaped payload back, rejecting invalid UTF-8. */
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

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
 * Encode a value into the readable, single-line Links Notation form.
 *
 * The result never contains a newline, so one value is one line of an
 * append-only log. See the module documentation for the shape.
 * @param {*} value - The value to encode
 * @returns {string} The readable Links Notation document, on one line
 * @throws {CircularReferenceError} If the value refers back to itself
 * @throws {TypeError} If the value holds a type this format cannot write
 */
export function encodeLine(value) {
  const out = [];
  writeLineValue(value, out, new Set());
  return out.join('');
}

/**
 * Strip the line breaks framing a record, without a regular expression.
 *
 * A regular expression anchored at the end backtracks over a run of newlines,
 * so a long run of them costs more than linear time. Scanning from both ends
 * costs one pass over the framing characters.
 * @param {string} text - The text to trim
 * @returns {string} The text without leading or trailing newlines
 */
function trimLineBreaks(text) {
  let start = 0;
  let end = text.length;
  while (start < end && (text[start] === '\n' || text[start] === '\r')) {
    start += 1;
  }
  while (end > start && (text[end - 1] === '\n' || text[end - 1] === '\r')) {
    end -= 1;
  }
  return text.slice(start, end);
}

/**
 * Decode the readable, single-line Links Notation form back into a value.
 *
 * This is the exact inverse of {@link encodeLine}. Input spanning more than one
 * line is rejected: a line-based reader hands over one record at a time, and
 * silently accepting several would merge two records into one value.
 * @param {string} text - One line of a readable Links Notation document
 * @returns {*} The reconstructed value
 * @throws {SyntaxError} If the input holds more than one line
 */
export function decodeLine(text) {
  const line = trimLineBreaks(text);
  if (line.includes('\n') || line.includes('\r')) {
    throw new SyntaxError('a single-line document cannot contain a line break');
  }
  return decode(line);
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

  return rowsToValue(rows, true, false);
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
      out.push(formatKey(key, FORM_INDENTED));
      out.push(' ');
      writeValue(child, indent, level + 1, out, path);
    });
    path.delete(value);
    return;
  }

  out.push(formatScalar(value, FORM_INDENTED));
}

/**
 * Write a value on one line. Objects name themselves with the `o` link id and
 * write each pair as its own link, so nothing depends on where lines break.
 * @param {*} value - The value to write
 * @param {string[]} out - Output chunks, appended in place
 * @param {Set<object>} path - Containers currently being written
 */
function writeLineValue(value, out, path) {
  if (Array.isArray(value)) {
    enterPath(value, path);
    out.push('(');
    value.forEach((item, index) => {
      if (index > 0) {
        out.push(' ');
      }
      writeLineValue(item, out, path);
    });
    out.push(')');
    path.delete(value);
    return;
  }

  if (isPlainContainer(value)) {
    enterPath(value, path);
    const entries = Object.entries(value);
    if (entries.length === 0) {
      // `()` is the empty array, so the empty object keeps its marker.
      out.push(`(${OBJECT_MARKER}:)`);
      path.delete(value);
      return;
    }
    out.push(`(${OBJECT_MARKER}:`);
    for (const [key, child] of entries) {
      out.push(` (${formatKey(key, FORM_LINE)} `);
      writeLineValue(child, out, path);
      out.push(')');
    }
    out.push(')');
    path.delete(value);
    return;
  }

  out.push(formatScalar(value, FORM_LINE));
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
 * @param {string} form - The form being written, indented or single-line
 * @returns {string} The formatted scalar
 */
function formatScalar(value, form) {
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
    return formatString(value, form);
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
 * Format a string value. The text is written as text; when it holds characters
 * this form cannot carry, those characters — and only those — are
 * percent-escaped and the value is marked, so the rest of it stays readable and
 * greppable.
 * @param {string} value - The string to format
 * @param {string} form - The form being written, indented or single-line
 * @returns {string} The formatted string
 */
function formatString(value, form) {
  const escaped = escapeUnwritable(value, form);
  if (escaped === undefined) {
    return quote(value);
  }
  return `(${ESCAPED_MARKER} ${quote(escaped)})`;
}

/**
 * Percent-escape the characters this form cannot carry, or `undefined` when the
 * text can be written as it is. `%` is escaped too, so escaping is reversible.
 * @param {string} value - The string to escape
 * @param {string} form - The form being written, indented or single-line
 * @returns {string|undefined} The escaped text, or undefined when none is needed
 */
function escapeUnwritable(value, form) {
  let unwritable = false;
  for (const char of value) {
    if (isUnwritable(char, form)) {
      unwritable = true;
      break;
    }
  }
  if (!unwritable) {
    return undefined;
  }

  let out = '';
  for (const char of value) {
    if (char !== '%' && !isUnwritable(char, form)) {
      out += char;
      continue;
    }
    for (const byte of UTF8_ENCODER.encode(char)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/**
 * Whether a character has to be escaped in this form. A tab is text a reader can
 * see, and so is a newline in the indented form, where a value may span lines.
 * A carriage return is escaped because CRLF normalisation rewrites it, and the
 * remaining control characters because they are not text at all.
 * @param {string} char - The character to classify
 * @param {string} form - The form being written, indented or single-line
 * @returns {boolean} True when the character cannot be written as it is
 */
function isUnwritable(char, form) {
  const code = char.codePointAt(0);
  // Unicode category Cc: the C0 and C1 control ranges.
  if (!(code <= 0x1f || (code >= 0x7f && code <= 0x9f))) {
    return false;
  }
  if (char === '\t') {
    return false;
  }
  if (char === '\n') {
    return form === FORM_LINE;
  }
  return true;
}

/**
 * Quote a value so that both this reader and the notation's own parser read it
 * back unchanged. One delimiter is enough while the text holds none of that
 * kind; when it holds both kinds, a run of at least three opens the notation's
 * n-quote form, where the text is literal and only a run at least as long closes
 * it. A value starting with the delimiter would lengthen the opening run, so the
 * other delimiter is used for it.
 * @param {string} value - The text to quote
 * @returns {string} The quoted text
 */
function quote(value) {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }

  const delimiter = value.startsWith('"') ? "'" : '"';
  // A run of two delimiters is the empty value, so the n-quote form starts at
  // three; beyond that the run only has to outrun the longest one inside.
  const count = Math.max(longestRun(value, delimiter) + 1, 3);
  const run = delimiter.repeat(count);
  return `${run}${value}${run}`;
}

/**
 * The length of the longest run of a character in a text.
 * @param {string} value - The text to scan
 * @param {string} char - The character to count
 * @returns {number} The length of the longest run
 */
function longestRun(value, char) {
  let longest = 0;
  let current = 0;
  for (const candidate of value) {
    current = candidate === char ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

/**
 * Format an object key. Keys are bare when they read as plain identifiers.
 * @param {string} key - The key to format
 * @param {string} form - The form being written, indented or single-line
 * @returns {string} The formatted key
 */
function formatKey(key, form) {
  const plain =
    key.length > 0 &&
    key !== BASE64_MARKER &&
    key !== ESCAPED_MARKER &&
    !KEY_NEEDS_QUOTES.test(key);

  return plain ? key : formatString(key, form);
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
 * Read a quoted reference. The opening run of delimiters says how it is read,
 * which is what the notation's own parser does:
 *
 * * one delimiter — the text is literal and a doubled delimiter is one literal
 *   delimiter, which is how versions up to 0.6.0 wrote such values;
 * * two — the empty value;
 * * three or more — the n-quote form: the text is literal, and the value ends at
 *   the first run at least as long, whose last delimiters close it. A longer run
 *   therefore belongs to the text, so a value may end with a delimiter.
 * @param {string[]} chars - The document characters
 * @param {number} start - Index of the opening quote
 * @param {string} quoteChar - The quote character used
 * @returns {[string, number]} The value and the index after the closing quote
 */
function readQuoted(chars, start, quoteChar) {
  const opening = runLength(chars, start, quoteChar);

  if (opening === 2) {
    return ['', start + 2];
  }

  if (opening === 1) {
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

    throw unterminatedQuote(start);
  }

  let i = start + opening;
  while (i < chars.length) {
    if (chars[i] !== quoteChar) {
      i += 1;
      continue;
    }

    const run = runLength(chars, i, quoteChar);
    if (run >= opening) {
      const value = chars.slice(start + opening, i + run - opening).join('');
      return [value, i + run];
    }
    i += run;
  }

  throw unterminatedQuote(start);
}

/**
 * The length of the run of a character that starts at an index.
 * @param {string[]} chars - The document characters
 * @param {number} start - Index the run starts at
 * @param {string} char - The character to count
 * @returns {number} The length of the run
 */
function runLength(chars, start, char) {
  let i = start;
  while (i < chars.length && chars[i] === char) {
    i += 1;
  }
  return i - start;
}

/**
 * The error a quoted value that never closes raises.
 * @param {number} start - Index of the opening quote
 * @returns {SyntaxError} The error to throw
 */
function unterminatedQuote(start) {
  return new SyntaxError(
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
      const object = this.takeObjectMarker();
      const multiline = this.linkIsMultiline();
      const rows = this.parseRows(false);
      return { ref: false, rows, multiline, object };
    }

    throw new SyntaxError('unexpected token in readable notation');
  }

  /**
   * Consume the `o:` marker if the link that just opened carries one, which is
   * how the single-line form says "this link is an object, not an array".
   * @returns {boolean} True when the marker was there and was consumed
   */
  takeObjectMarker() {
    const token = this.tokens[this.pos];
    const isMarker =
      token !== undefined &&
      token.kind === TOKEN_REF &&
      !token.quoted &&
      token.value === `${OBJECT_MARKER}:`;
    if (isMarker) {
      this.pos += 1;
    }
    return isMarker;
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
    : rowsToValue(node.rows, node.multiline, node.object);
}

function rowsToValue(rows, multiline, objectMarker) {
  if (objectMarker) {
    return markedObjectToValue(rows);
  }

  if (rows.length === 0) {
    return multiline ? {} : [];
  }

  const marked = decodeMarkedValue(rows);
  if (marked !== undefined) {
    return marked.value;
  }

  // Written on one line, a link is a list of values: an object on one line says
  // so with the `o:` marker, which is what keeps `(key value)` unambiguous.
  if (!multiline) {
    return rows.flatMap((row) => row.map(nodeToValue));
  }

  // `key value` on every line makes an object; anything else is a list of values.
  const isObject = rows.every(
    (row) => row.length === 2 && nodeToKey(row[0]) !== undefined
  );

  if (isObject) {
    const result = {};
    for (const row of rows) {
      result[nodeToKey(row[0])] = nodeToValue(row[1]);
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
 * Build the object a `(o: (key value) …)` link describes. Every value in it is
 * a pair, so anything else is a malformed document rather than a silent array.
 * @param {Array<Array<object>>} rows - The rows of the marked link
 * @returns {object} The reconstructed object
 * @throws {SyntaxError} If the link holds anything that is not a pair
 */
function markedObjectToValue(rows) {
  const result = {};

  for (const node of rows.flat()) {
    if (node.ref || node.object) {
      throw new SyntaxError(
        `an object marked '${OBJECT_MARKER}:' holds (key value) pairs, ` +
          'found a value that is not a pair'
      );
    }
    if (node.rows.length !== 1) {
      throw new SyntaxError(
        `an object marked '${OBJECT_MARKER}:' holds (key value) pairs, ` +
          `found a link of ${node.rows.length} lines`
      );
    }
    const [row] = node.rows;
    if (row.length !== 2) {
      throw new SyntaxError(
        `an object marked '${OBJECT_MARKER}:' holds (key value) pairs, ` +
          `found a link of ${row.length} values`
      );
    }
    const key = nodeToKey(row[0]);
    if (key === undefined) {
      throw new SyntaxError(
        `an object marked '${OBJECT_MARKER}:' holds (key value) pairs, ` +
          'found a pair whose key is not text'
      );
    }
    result[key] = nodeToValue(row[1]);
  }

  return result;
}

/**
 * The key a node in key position spells: a reference is the key itself, and a
 * marked link is the text its marker escapes, which is how a key holding a
 * character the form cannot carry stays a key instead of turning its object into
 * an array.
 * @param {object} node - The node standing in key position
 * @returns {string|undefined} The key, or undefined when the node is not one
 */
function nodeToKey(node) {
  if (node.ref) {
    return node.value;
  }
  if (node.object) {
    return undefined;
  }
  try {
    const marked = decodeMarkedValue(node.rows);
    return marked === undefined ? undefined : marked.value;
  } catch {
    return undefined;
  }
}

/**
 * Recognise a marked value: `(escaped "…")`, whose text is written as it is
 * except for the percent-escaped characters this form cannot carry, and
 * `(base64 "…")`, which versions up to 0.6.0 wrote and which is still read. A
 * quoted marker is an ordinary object key, not a marker.
 * @param {Array<Array<object>>} rows - The rows of the link being decoded
 * @returns {{value: string}|undefined} The decoded string, wrapped so that an
 *   empty result is still distinguishable from "not a marker"
 */
function decodeMarkedValue(rows) {
  if (rows.length !== 1 || rows[0].length !== 2) {
    return undefined;
  }

  const [marker, payload] = rows[0];
  if (!marker.ref || marker.quoted) {
    return undefined;
  }
  if (!payload.ref || !payload.quoted) {
    return undefined;
  }

  if (marker.value === ESCAPED_MARKER) {
    return { value: unescape(payload.value) };
  }

  if (marker.value === BASE64_MARKER) {
    return { value: Buffer.from(payload.value, 'base64').toString('utf-8') };
  }

  return undefined;
}

/**
 * Undo the percent-escaping of an `(escaped "…")` payload. Escapes stand for
 * bytes, so a character outside ASCII is written as its UTF-8 bytes and read
 * back from them.
 * @param {string} payload - The escaped text
 * @returns {string} The text the payload stands for
 * @throws {SyntaxError} If an escape is truncated, malformed or not UTF-8
 */
function unescape(payload) {
  const chars = Array.from(payload);
  const bytes = [];
  let i = 0;

  while (i < chars.length) {
    if (chars[i] !== '%') {
      for (const byte of UTF8_ENCODER.encode(chars[i])) {
        bytes.push(byte);
      }
      i += 1;
      continue;
    }

    const escape = chars.slice(i + 1, i + 3).join('');
    if (escape.length !== 2) {
      throw new SyntaxError(
        `truncated escape at character ${i} of an escaped value`
      );
    }
    if (!/^[0-9a-fA-F]{2}$/.test(escape)) {
      throw new SyntaxError(`invalid escape '%${escape}' in an escaped value`);
    }
    bytes.push(Number.parseInt(escape, 16));
    i += 3;
  }

  try {
    return UTF8_DECODER.decode(Uint8Array.from(bytes));
  } catch {
    throw new SyntaxError('invalid UTF-8 escaped value');
  }
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
