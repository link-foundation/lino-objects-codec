/**
 * Formatting utilities for Links Notation.
 *
 * These utilities provide core functions for converting between JSON and Links Notation,
 * as well as escaping strings for safe use in Links Notation format.
 *
 * These tools enable easy implementation of higher-level features like:
 * - LinksNotationManager (from https://github.com/konard/follow/blob/main/lino.lib.mjs)
 * - Q&A database (from https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs)
 *
 * @module lino-objects-codec/format
 */

import {
  Parser as LinoParser,
  decodeReferenceLiteral,
  encodeReferenceLiteral,
} from 'links-notation';
import { trace } from './debug.js';

// Shared parser instance
const parser = new LinoParser();

/**
 * Spelling of the empty string. The links-notation Parser reads a trailing
 * empty quote pair (`a ''`) as the start of a value that spans the following
 * lines (link-foundation/links-notation#443), so the empty string is written as
 * the lossless reference literal `~1{}` that every links-notation binding reads
 * back as an empty string (links-notation 0.24.0 and later).
 */
const EMPTY_REFERENCE = encodeReferenceLiteral('');

/**
 * A bare reference starting like this is a versioned reference literal
 * (`~1{}`), so a string with this prefix must be quoted to keep its spelling.
 */
const REFERENCE_LITERAL_PREFIX = /^~[0-9]+\{/;

/**
 * Check whether a string can be written as a bare reference that the
 * links-notation Parser reads back unchanged.
 *
 * @private
 * @param {string} str - Reference text
 * @returns {boolean} True when the text must be quoted (or written as a literal)
 */
function needsReferenceQuoting(str) {
  return (
    str === '' ||
    /[\s()'":`]/.test(str) ||
    // The Parser drops `#...` as a comment (link-foundation/links-notation#444).
    str.startsWith('#') ||
    REFERENCE_LITERAL_PREFIX.test(str)
  );
}

/**
 * Wrap text in quotes the links-notation Parser reads back unchanged.
 *
 * A text with only one kind of quote is wrapped in the other kind. A text with
 * both doubles the less frequent one inside it. The Parser reads a run of
 * quotes at the start of a reference as a wider delimiter, so doubling is only
 * used when the text does not begin or end with that quote; otherwise the other
 * quote, then a backtick, and finally the reference literal `~1{...}` is used.
 *
 * @private
 * @param {string} str - Text to quote
 * @returns {string} Quoted reference
 */
function quoteText(str) {
  if (str === '') {
    return EMPTY_REFERENCE;
  }

  const hasSingle = str.includes("'");
  const hasDouble = str.includes('"');

  if (hasSingle && !hasDouble) {
    return `"${str}"`;
  }

  if (!hasSingle) {
    return `'${str}'`;
  }

  // Both quotes: double the less frequent one to minimize escaping.
  const singleQuoteCount = str.split("'").length - 1;
  const doubleQuoteCount = str.split('"').length - 1;
  const candidates =
    doubleQuoteCount < singleQuoteCount ? ['"', "'"] : ["'", '"'];

  for (const quote of candidates) {
    if (!str.startsWith(quote) && !str.endsWith(quote)) {
      return `${quote}${str.replaceAll(quote, quote + quote)}${quote}`;
    }
  }

  if (!str.includes('`')) {
    return `\`${str}\``;
  }

  return encodeReferenceLiteral(str);
}

/**
 * Escape a reference for Links Notation.
 *
 * In Links Notation, we have only references and links:
 * - Reference: An identifier or value (string, number, boolean)
 * - Link: A parenthesized sequence of references or nested links
 *
 * References need escaping when they contain spaces, quotes, parentheses, colons, or newlines,
 * when they start with `#` (a comment) or look like a reference literal (`~1{...}`):
 * - The empty string is written as the reference literal `~1{}`
 * - Use single quotes '' if the string contains spaces or double quotes
 * - Use double quotes "" if the string contains single quotes
 * - Use double quotes "" if it contains both (escape internal double quotes)
 *
 * @param {Object} options - Options
 * @param {*} options.value - The value to escape
 * @returns {string} The escaped reference
 */
export function escapeReference(options = {}) {
  const { value } = options;
  // Numbers and booleans don't need escaping
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  const str = String(value);

  if (!needsReferenceQuoting(str)) {
    return str;
  }

  return quoteText(str);
}

/**
 * Unescape a reference from Links Notation format.
 *
 * Reverses the escaping done by escapeReference:
 * - Doubled quotes "" become single "
 * - Doubled quotes '' become single '
 *
 * @param {Object} options - Options
 * @param {string} options.str - The escaped reference
 * @returns {string} The unescaped string
 */
export function unescapeReference(options = {}) {
  const { str } = options;
  if (!str) {
    return str;
  }

  // Unescape doubled quotes (Links Notation escape sequences)
  return str.replaceAll('""', '"').replaceAll("''", "'");
}

/**
 * Convert JSON data to Links Notation recursively.
 *
 * Conversion rules:
 * - Primitives (number, boolean, string, null): Converted to references
 * - Array: Converted to a link (parenthesized sequence)
 * - Object: Converted to a link with key-value doublet pairs
 *   Each key-value pair becomes a nested link
 *
 * Example:
 *   { name: "John Doe", age: 30, active: true }
 * Becomes:
 *   ((name 'John Doe') (age 30) (active true))
 *
 * @param {Object} options - Options
 * @param {*} options.json - The JSON data to convert
 * @returns {string} Links Notation representation
 */
export function jsonToLino(options = {}) {
  const { json } = options;

  // Handle null and undefined
  if (json === null || json === undefined) {
    return 'null';
  }

  // Handle primitives
  if (typeof json === 'number' || typeof json === 'boolean') {
    return String(json);
  }

  if (typeof json === 'string') {
    return escapeReference({ value: json });
  }

  // Handle arrays - convert to link
  if (Array.isArray(json)) {
    if (json.length === 0) {
      return '()';
    }
    const elements = json.map((item) => jsonToLino({ json: item }));
    return `(${elements.join(' ')})`;
  }

  // Handle objects - convert to key-value doublet pairs
  // Objects are ALWAYS represented as a link of pairs: ((key1 value1) (key2 value2) ...)
  // This makes the structure unambiguous
  if (typeof json === 'object') {
    const entries = Object.entries(json);
    if (entries.length === 0) {
      return '()';
    }

    // Wrap each key-value pair in its own link
    // ((key1 value1) (key2 value2) ...)
    const pairs = entries.map(([key, value]) => {
      const escapedKey = escapeReference({ value: key });
      const convertedValue = jsonToLino({ json: value });
      return `(${escapedKey} ${convertedValue})`;
    });

    return `(${pairs.join(' ')})`;
  }

  // Fallback for unknown types
  return escapeReference({ value: String(json) });
}

/**
 * Parse a reference to its primitive value.
 * @private
 */
function parseReference(ref) {
  const str = String(ref);

  // Try boolean
  if (str === 'true') {
    return true;
  }
  if (str === 'false') {
    return false;
  }

  // Try null
  if (str === 'null') {
    return null;
  }

  // Try number
  const num = Number(str);
  if (!isNaN(num) && str.trim() !== '') {
    return num;
  }

  // Return as string
  return str;
}

/**
 * Internal helper to convert parsed Links Notation to JSON.
 * @private
 */
function convertParsedToJson(element) {
  // If element is a simple value (reference)
  if (typeof element === 'string' || typeof element === 'number') {
    return parseReference(element);
  }

  // If element has an id and empty values array, it's a reference/primitive or empty link
  if (element.values && element.values.length === 0) {
    // If id is null, it's an empty link ()
    if (element.id === null) {
      return [];
    }
    // Otherwise it's a primitive reference
    return parseReference(element.id);
  }

  // If element is a link (has non-empty values)
  if (
    element.values &&
    Array.isArray(element.values) &&
    element.values.length > 0
  ) {
    // Simple rule: If link contains pairs (all children are 2-element links), it's an object
    // Otherwise, it's an array

    const allPairs = element.values.every((child) => {
      // Must be a link with exactly 2 elements
      if (
        !child.values ||
        !Array.isArray(child.values) ||
        child.values.length !== 2
      ) {
        return false;
      }
      // First element (key) must be a primitive
      const keyElement = child.values[0];
      if (!(
        keyElement.id !== undefined &&
        keyElement.values &&
        keyElement.values.length === 0
      )) {
        return false;
      }
      // Key should be string-like (not a pure number)
      const keyValue = parseReference(keyElement.id);
      if (typeof keyValue === 'number') {
        return false;
      }
      return true;
    });

    if (allPairs) {
      // This is an object: ((key1 value1) (key2 value2) ...)
      const obj = {};
      for (const child of element.values) {
        const key = parseReference(child.values[0].id);
        const value = convertParsedToJson(child.values[1]);
        obj[key] = value;
      }
      return obj;
    }

    // Not pairs, so it's an array
    return element.values.map((v) => convertParsedToJson(v));
  }

  return null;
}

/**
 * Convert Links Notation to JSON recursively.
 *
 * Conversion rules:
 * - References are converted to primitives (try number, boolean, then string)
 * - Links are analyzed:
 *   - If all elements are 2-element links with string-like keys, parse as object
 *   - Otherwise, parse as array
 *
 * @param {Object} options - Options
 * @param {string} options.lino - The Links Notation string
 * @returns {*} JSON representation
 */
export function linoToJson(options = {}) {
  const { lino } = options;
  if (!lino || typeof lino !== 'string') {
    return null;
  }

  const parsed = parser.parse(lino);

  if (!parsed || parsed.length === 0) {
    return null;
  }

  const result = convertParsedToJson(parsed[0]);

  // If the parser wrapped a single primitive in an array, unwrap it
  if (
    Array.isArray(result) &&
    result.length === 1 &&
    (typeof result[0] === 'string' ||
      typeof result[0] === 'number' ||
      typeof result[0] === 'boolean' ||
      result[0] === null)
  ) {
    return result[0];
  }

  return result;
}

/**
 * Format an array as Links Notation with proper indentation.
 *
 * @param {Object} options - Options
 * @param {Array} options.values - Array of values to format
 * @returns {string} Formatted Links Notation string
 */
export function formatAsLino(options = {}) {
  const { values } = options;
  if (!values || values.length === 0) {
    return '()';
  }

  const formattedValues = values.map((value) => `  ${value}`).join('\n');
  return `(\n${formattedValues}\n)`;
}

/**
 * Quote a reference even when Links Notation would allow it to remain bare.
 *
 * @private
 * @param {string} value - The reference value to quote
 * @returns {string} Quoted reference
 */
function quoteReference(value) {
  return quoteText(String(value));
}

/**
 * Check whether a bare string would be parsed as a dynamic primitive.
 *
 * @private
 * @param {string} value - The string value to check
 * @returns {boolean} True when the string should be quoted to remain a string
 */
function isAmbiguousStringReference(value) {
  if (value === '') {
    return true;
  }

  if (value === 'true' || value === 'false' || value === 'null') {
    return true;
  }

  const num = Number(value);
  return !isNaN(num) && value.trim() !== '';
}

/**
 * Format a scalar value for display in indented Links Notation.
 *
 * @private
 * @param {*} value - The value to format
 * @param {Set<string>} [reservedReferences] - References that should remain unambiguous strings
 * @returns {string} Formatted scalar value
 */
function formatIndentedScalarValue(value, reservedReferences = new Set()) {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    if (reservedReferences.has(value) || isAmbiguousStringReference(value)) {
      return quoteReference(value);
    }
    reservedReferences.add(value);
    return escapeReference({ value });
  }

  return escapeReference({ value: String(value) });
}

/**
 * Sanitize an object key/path segment into a stable Links Notation id segment.
 *
 * @private
 * @param {*} value - Value to turn into an id segment
 * @returns {string} Sanitized id segment
 */
function sanitizeIdentifierPart(value) {
  const sanitized = String(value).replace(/[^A-Za-z0-9_-]+/g, '_');
  let start = 0;
  let end = sanitized.length;
  while (start < end && sanitized[start] === '_') {
    start += 1;
  }
  while (end > start && sanitized[end - 1] === '_') {
    end -= 1;
  }
  return sanitized.slice(start, end) || 'item';
}

/**
 * Create a unique child definition id for a nested object or array.
 *
 * @private
 * @param {string} parentId - Parent definition id
 * @param {string|number} key - Child key or array index
 * @param {Set<string>} usedIds - Already used definition ids
 * @returns {string} Unique child definition id
 */
function createChildId(parentId, key, usedIds) {
  const baseId = `${sanitizeIdentifierPart(parentId)}_${sanitizeIdentifierPart(key)}`;
  let candidate = baseId;
  let counter = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}_${counter}`;
    counter += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

/**
 * Check whether a value should be emitted as a separate indented definition.
 *
 * @private
 * @param {*} value - The value to check
 * @returns {boolean} True for non-null objects and non-empty arrays
 */
function shouldUseIndentedDefinition(value) {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
}

/**
 * Format a child value, creating a queued definition for nested objects/arrays.
 *
 * @private
 * @param {*} value - Child value
 * @param {string} parentId - Parent definition id
 * @param {string|number} key - Child key or array index
 * @param {Array<{ id: string, value: * }>} childDefinitions - Queued children
 * @param {Set<string>} usedIds - Already used definition ids
 * @returns {string} Formatted scalar value or child definition reference
 */
function formatIndentedChildValue(
  value,
  parentId,
  key,
  childDefinitions,
  usedIds
) {
  if (Array.isArray(value) && value.length === 0) {
    return '()';
  }

  if (shouldUseIndentedDefinition(value)) {
    const childId = createChildId(parentId, key, usedIds);
    childDefinitions.push({ id: childId, value });
    return escapeReference({ value: childId });
  }

  return formatIndentedScalarValue(value, usedIds);
}

/**
 * Format an object in indented Links Notation format.
 *
 * This format is designed for human readability, displaying objects as:
 * ```
 * <identifier>:
 *   <key> <value>
 *   <key> <nested-definition-id>
 *
 * <nested-definition-id>:
 *   <nested-key> <nested-value>
 *   ...
 * ```
 *
 * Example:
 *   formatIndented({
 *     id: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019',
 *     obj: { uuid: '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019', status: 'executed', command: 'echo test', exitCode: '0' }
 *   })
 *
 * Returns:
 *   6dcf4c1b-ff3f-482c-95ab-711ea7d1b019:
 *     uuid '6dcf4c1b-ff3f-482c-95ab-711ea7d1b019'
 *     status executed
 *     command 'echo test'
 *     exitCode '0'
 *
 * With `nested: true`, nested objects and arrays stay under their parent
 * instead of becoming separate sections with generated ids:
 * ```
 * hive_mind_state:
 *   tasks:
 *     q-1:
 *       args:
 *         --model
 *         ~1{}
 *         '#x'
 * ```
 * An array item that is itself a non-empty object or array is written under a
 * bare `-:` header. See {@link parseIndented} for reading it back.
 *
 * Every reference is written so that the plain links-notation `Parser` reads
 * it back unchanged: the empty string is the reference literal `~1{}`, and a
 * string starting with `#` or `~<digits>{` is quoted.
 *
 * @param {Object} options - Options
 * @param {string} options.id - The object identifier (displayed on first line)
 * @param {Object} options.obj - The object with key-value pairs to format
 * @param {string} [options.indent='  '] - The indentation string (default: 2 spaces)
 * @param {boolean} [options.nested=false] - Keep nested objects and arrays under their parent
 * @returns {string} Formatted indented Links Notation string
 */
export function formatIndented(options = {}) {
  const { id, obj, indent = '  ', nested = false } = options;

  if (!id) {
    throw new Error('id is required for formatIndented');
  }

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('obj must be a plain object for formatIndented');
  }

  if (nested) {
    return formatNestedIndented(String(id), obj, indent);
  }

  const rootId = String(id);
  const usedIds = new Set([rootId]);
  const sections = [];

  function formatDefinition(definitionId, value, ancestors = new Set()) {
    if (value !== null && typeof value === 'object') {
      if (ancestors.has(value)) {
        throw new Error(
          'formatIndented does not support circular references; use encode/decode for typed object graphs'
        );
      }
      ancestors = new Set([...ancestors, value]);
    }

    const childDefinitions = [];
    const lines = [`${escapeReference({ value: definitionId })}:`];

    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const formattedValue = formatIndentedChildValue(
          value[index],
          definitionId,
          index,
          childDefinitions,
          usedIds
        );
        lines.push(`${indent}${formattedValue}`);
      }
    } else {
      for (const [key, childValue] of Object.entries(value)) {
        const escapedKey = escapeReference({ value: key });
        const formattedValue = formatIndentedChildValue(
          childValue,
          definitionId,
          key,
          childDefinitions,
          usedIds
        );
        lines.push(`${indent}${escapedKey} ${formattedValue}`);
      }
    }

    sections.push(lines.join('\n'));

    for (const childDefinition of childDefinitions) {
      formatDefinition(childDefinition.id, childDefinition.value, ancestors);
    }
  }

  formatDefinition(rootId, obj);
  return sections.join('\n\n');
}

/**
 * Header written for an array item that is itself a non-empty container.
 * A key with the same text is always quoted (`'-':`), so a bare `-:` header
 * always marks an array item.
 */
const NESTED_ARRAY_ITEM = '-';

/**
 * Check whether a value is written as a header with indented children in the
 * nested form: any object, or an array with at least one item.
 *
 * @private
 * @param {*} value - The value to check
 * @returns {boolean} True when the value gets its own header line
 */
function isNestedContainer(value) {
  return shouldUseIndentedDefinition(value);
}

/**
 * Format an object key for the nested form.
 *
 * @private
 * @param {string} key - Object key
 * @returns {string} Escaped key
 */
function formatNestedKey(key) {
  return key === NESTED_ARRAY_ITEM
    ? quoteReference(key)
    : escapeReference({ value: key });
}

/**
 * Format an object in the nested indented form.
 *
 * @private
 * @param {string} rootId - Root identifier
 * @param {Object} obj - Root object
 * @param {string} indent - Indentation of one level
 * @returns {string} Nested indented Links Notation text
 */
function formatNestedIndented(rootId, obj, indent) {
  const lines = [];

  function writeChildren(value, level, ancestors) {
    if (ancestors.has(value)) {
      throw new Error(
        'formatIndented does not support circular references; use encode/decode for typed object graphs'
      );
    }
    ancestors.add(value);
    const pad = indent.repeat(level);
    const entries = Array.isArray(value)
      ? value.map((item) => [null, item])
      : Object.entries(value);

    for (const [key, child] of entries) {
      const head = key === null ? NESTED_ARRAY_ITEM : formatNestedKey(key);

      if (isNestedContainer(child)) {
        lines.push(`${pad}${head}:`);
        writeChildren(child, level + 1, ancestors);
        continue;
      }

      const formattedValue = Array.isArray(child)
        ? '()'
        : formatIndentedScalarValue(child);
      lines.push(
        key === null
          ? `${pad}${formattedValue}`
          : `${pad}${head} ${formattedValue}`
      );
    }
    ancestors.delete(value);
  }

  lines.push(`${escapeReference({ value: rootId })}:`);
  writeChildren(obj, 1, new Set());
  return lines.join('\n');
}

/**
 * Find a definition header colon outside quoted text.
 *
 * @private
 * @param {string} line - Header line
 * @returns {number} Colon index, or -1 when there is no header colon
 */
function findHeaderColon(line) {
  let quote = null;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (quote) {
      if (char === quote) {
        if (line[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }

    if (char === ':') {
      return index;
    }
  }

  return -1;
}

/**
 * Check whether a character starts/ends a quoted reference.
 *
 * @private
 * @param {string} char - Character to check
 * @returns {boolean} True for supported quote characters
 */
function isIndentedQuote(char) {
  return char === "'" || char === '"' || char === '`';
}

/**
 * Skip whitespace starting at index.
 *
 * @private
 * @param {string} line - Line to scan
 * @param {number} index - Starting index
 * @returns {number} First non-whitespace index
 */
function skipIndentedWhitespace(line, index) {
  while (index < line.length && /\s/.test(line[index])) {
    index += 1;
  }

  return index;
}

/**
 * Read a quoted indented reference.
 *
 * @private
 * @param {string} line - Line to scan
 * @param {number} index - Index of the opening quote
 * @returns {{ token: { value: string, quoted: boolean }, nextIndex: number }} Parsed token and next index
 */
function readQuotedIndentedReference(line, index) {
  const quote = line[index];
  let value = '';
  index += 1;

  while (index < line.length) {
    const char = line[index];

    if (char !== quote) {
      value += char;
      index += 1;
      continue;
    }

    if (line[index + 1] === quote) {
      value += quote;
      index += 2;
      continue;
    }

    index += 1;
    if (index < line.length && !/\s/.test(line[index])) {
      throw new Error(`Invalid quoted reference: ${line}`);
    }

    return {
      token: { value, quoted: true },
      nextIndex: index,
    };
  }

  throw new Error(`Unterminated quoted reference: ${line}`);
}

/**
 * Read a bare indented reference.
 *
 * @private
 * @param {string} line - Line to scan
 * @param {number} index - Starting index
 * @returns {{ token: { value: string, quoted: boolean }, nextIndex: number }} Parsed token and next index
 */
function readBareIndentedReference(line, index) {
  const start = index;

  while (index < line.length && !/\s/.test(line[index])) {
    index += 1;
  }

  const value = line.slice(start, index);

  // A reference literal (`~1{}`) always stands for a string, like a quoted one.
  if (REFERENCE_LITERAL_PREFIX.test(value)) {
    return {
      token: { value: decodeReferenceLiteral(value), quoted: true },
      nextIndex: index,
    };
  }

  return {
    token: { value, quoted: false },
    nextIndex: index,
  };
}

/**
 * Tokenize one indented Links Notation line into references while preserving
 * whether each reference was quoted.
 *
 * @private
 * @param {string} line - Line content without leading indentation
 * @returns {Array<{ value: string, quoted: boolean }>} Parsed references
 */
function tokenizeIndentedReferences(line) {
  const tokens = [];
  let index = 0;

  while (index < line.length) {
    index = skipIndentedWhitespace(line, index);

    if (index >= line.length) {
      break;
    }

    const result = isIndentedQuote(line[index])
      ? readQuotedIndentedReference(line, index)
      : readBareIndentedReference(line, index);
    tokens.push(result.token);
    index = result.nextIndex;
  }

  return tokens;
}

/**
 * Parse a definition header line.
 *
 * @private
 * @param {string} line - Header line without leading/trailing whitespace
 * @returns {string} Definition id
 */
function parseIndentedDefinitionId(line) {
  const colonIndex = findHeaderColon(line);
  const idText = colonIndex === -1 ? line : line.slice(0, colonIndex).trimEnd();

  if (colonIndex !== -1 && line.slice(colonIndex + 1).trim() !== '') {
    throw new Error(`Invalid definition header: ${line}`);
  }

  const tokens = tokenizeIndentedReferences(idText);

  if (tokens.length !== 1) {
    throw new Error(`Invalid definition header: ${line}`);
  }

  return tokens[0].value;
}

/**
 * Split indented Links Notation text into top-level definitions.
 *
 * @private
 * @param {string} text - Indented Links Notation text
 * @returns {Array<{ id: string, childLines: string[] }>} Parsed definitions
 */
function splitIndentedDefinitions(text) {
  const definitions = [];
  let currentDefinition = null;

  for (const rawLine of splitIndentedLines(text)) {
    if (!rawLine.trim()) {
      continue;
    }

    if (/^\s/.test(rawLine)) {
      if (!currentDefinition) {
        throw new Error('Indented value found before a definition header');
      }

      currentDefinition.childLines.push(rawLine.trim());
      continue;
    }

    currentDefinition = {
      id: parseIndentedDefinitionId(rawLine.trim()),
      childLines: [],
    };
    definitions.push(currentDefinition);
  }

  return definitions;
}

/**
 * Split at newlines outside quoted references. A continuation is value content,
 * including its blank lines, indentation and carriage returns, even when it
 * looks like a new definition. Keep doubled quotes in the same reference.
 *
 * @private
 * @param {string} text - Complete indented document
 * @returns {string[]} Logical lines, with quoted content preserved verbatim
 */
function splitIndentedLines(text) {
  const lines = [];
  let start = 0;
  let quote = null;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) {
        if (text[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
    } else if (
      isIndentedQuote(char) &&
      (index === 0 || /\s/.test(text[index - 1]))
    ) {
      quote = char;
    } else if (char === '\n') {
      lines.push(text.slice(start, index));
      start = index + 1;
    }
  }

  lines.push(text.slice(start));
  trace('format.parseIndented', () => `read ${lines.length} logical lines`);
  return lines;
}

/**
 * Parse a token into a dynamic scalar.
 *
 * @private
 * @param {{ value: string, quoted: boolean }} token - Token to parse
 * @returns {*} Parsed scalar value
 */
function parseIndentedScalarToken(token) {
  if (token.quoted) {
    return token.value;
  }

  if (token.value === '()') {
    return [];
  }

  return parseReference(token.value);
}

/**
 * Store a key on a decoded object as an own property, including `__proto__`.
 *
 * @private
 * @param {Object} target - Decoded object
 * @param {string} key - Key
 * @param {*} value - Value
 */
function setOwnProperty(target, key, value) {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/**
 * Read one logical line of the nested form.
 *
 * @private
 * @param {string} rawLine - Logical line, quoted continuations included
 * @returns {{ indent: number, header: boolean, tokens: Array<{ value: string, quoted: boolean }>, text: string }} Parsed line
 */
function readNestedLine(rawLine) {
  const text = rawLine.trim();
  const indent = rawLine.length - rawLine.trimStart().length;
  const colonIndex = findHeaderColon(text);

  if (colonIndex === -1) {
    const tokens = tokenizeIndentedReferences(text);
    if (tokens.length !== 1 && tokens.length !== 2) {
      throw new Error(`Invalid indented value line: ${text}`);
    }
    return { indent, header: false, tokens, text };
  }

  if (text.slice(colonIndex + 1).trim() !== '') {
    throw new Error(`Invalid definition header: ${text}`);
  }

  const tokens = tokenizeIndentedReferences(
    text.slice(0, colonIndex).trimEnd()
  );
  if (tokens.length !== 1) {
    throw new Error(`Invalid definition header: ${text}`);
  }
  return { indent, header: true, tokens, text };
}

/**
 * Turn the logical lines of the nested form into a tree of headers and the
 * lines indented under them.
 *
 * @private
 * @param {string} text - Nested indented text
 * @returns {{ line: Object, children: Array }} Root node
 */
function buildNestedTree(text) {
  let root = null;
  const stack = [];

  for (const rawLine of splitIndentedLines(text)) {
    if (!rawLine.trim()) {
      continue;
    }

    const node = { line: readNestedLine(rawLine), children: [] };
    const { indent } = node.line;

    if (!root) {
      if (indent !== 0) {
        throw new Error('Indented value found before a definition header');
      }
      root = node;
      stack.push(node);
      continue;
    }

    if (indent === 0) {
      throw new Error(
        `Nested indented text has more than one top-level definition: ${node.line.text}`
      );
    }

    while (stack.length > 1 && stack[stack.length - 1].line.indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (!parent.line.header) {
      throw new Error(`Unexpected indentation: ${node.line.text}`);
    }
    const siblings = parent.children;
    if (siblings.length > 0 && siblings[0].line.indent !== indent) {
      throw new Error(`Inconsistent indentation: ${node.line.text}`);
    }

    siblings.push(node);
    stack.push(node);
  }

  if (!root) {
    throw new Error(
      'text must have at least one non-empty line (the identifier)'
    );
  }

  return root;
}

/**
 * Check whether a node is an array item of the nested form.
 *
 * @private
 * @param {{ line: Object }} node - Tree node
 * @returns {boolean} True for scalar items and bare `-:` headers
 */
function isNestedArrayItem(node) {
  const { header, tokens } = node.line;
  if (header) {
    return !tokens[0].quoted && tokens[0].value === NESTED_ARRAY_ITEM;
  }
  return tokens.length === 1;
}

/**
 * Decode the children of a header in the nested form.
 *
 * @private
 * @param {{ line: Object, children: Array }} node - Header node
 * @returns {Object|Array} Decoded object or array
 */
function decodeNestedChildren(node) {
  const { children } = node;
  const itemCount = children.filter(isNestedArrayItem).length;

  if (itemCount > 0 && itemCount !== children.length) {
    throw new Error(
      `Cannot mix array items and object pairs in ${node.line.text}`
    );
  }

  if (itemCount > 0) {
    return children.map((child) =>
      child.line.header
        ? decodeNestedChildren(child)
        : parseIndentedScalarToken(child.line.tokens[0])
    );
  }

  const result = {};
  for (const child of children) {
    const [keyToken, valueToken] = child.line.tokens;
    if (child.line.header) {
      setOwnProperty(result, keyToken.value, decodeNestedChildren(child));
    } else {
      if (child.children.length > 0) {
        throw new Error(`Unexpected indentation under ${child.line.text}`);
      }
      setOwnProperty(
        result,
        keyToken.value,
        parseIndentedScalarToken(valueToken)
      );
    }
  }
  return result;
}

/**
 * Parse the nested indented form written by `formatIndented({ nested: true })`.
 *
 * @private
 * @param {string} text - Nested indented text
 * @returns {{ id: string, obj: Object }} Root id and decoded object
 */
function parseNestedIndented(text) {
  const root = buildNestedTree(text);
  const { tokens } = root.line;

  if (tokens.length !== 1) {
    throw new Error(`Invalid definition header: ${root.line.text}`);
  }

  trace(
    'format.parseIndented',
    () => `nested root ${tokens[0].value} with ${root.children.length} children`
  );

  return { id: tokens[0].value, obj: decodeNestedChildren(root) };
}

/**
 * Parse an indented Links Notation string back to an object.
 *
 * This parser handles the recursive definition format emitted by
 * formatIndented. Quoted references may span lines and retain their contents
 * verbatim, including blank lines and indentation. They stay strings, while
 * unquoted references are parsed dynamically as numbers, booleans, null,
 * definition references, or strings.
 *
 * Parses strings like:
 * ```
 * <identifier>:
 *   <key> <value>
 *   <key> <nested-definition-id>
 *
 * <nested-definition-id>:
 *   <nested-key> <nested-value>
 *   ...
 * ```
 *
 * The legacy flat format without a colon after the root identifier is also
 * accepted.
 *
 * With `nested: true`, reads the nested form written by
 * `formatIndented({ nested: true })`: a single root header whose nested
 * objects and arrays are indented under their keys. A line `key value` is an
 * object entry, a line with one value is an array item, `key:` opens a nested
 * object or array, and a bare `-:` opens a nested container inside an array.
 * A `key:` header without indented lines is an empty object.
 *
 * Both forms read the reference literal `~1{}` as the empty string.
 *
 * @param {Object} options - Options
 * @param {string} options.text - The indented Links Notation string to parse
 * @param {boolean} [options.nested=false] - Read the nested form
 * @returns {{ id: string, obj: Object }} Object with id and parsed key-value pairs
 */
export function parseIndented(options = {}) {
  const { text, nested = false } = options;

  if (!text || typeof text !== 'string') {
    throw new Error('text is required for parseIndented');
  }

  return nested ? parseNestedIndented(text) : parseSectionedIndented(text);
}

/**
 * Parse the sectioned form, where nested values are separate definitions.
 *
 * @private
 * @param {string} text - Indented text
 * @returns {{ id: string, obj: Object }} Root id and decoded object
 */
function parseSectionedIndented(text) {
  const definitions = splitIndentedDefinitions(text);

  if (definitions.length === 0) {
    throw new Error(
      'text must have at least one non-empty line (the identifier)'
    );
  }

  const definitionMap = new Map();
  for (const definition of definitions) {
    if (definitionMap.has(definition.id)) {
      throw new Error(`Duplicate indented definition id: ${definition.id}`);
    }
    definitionMap.set(definition.id, definition);
  }

  const parsedDefinitions = new Map();
  for (const definition of definitions) {
    const childTokens = definition.childLines.map((line) =>
      tokenizeIndentedReferences(line)
    );

    for (const tokens of childTokens) {
      if (tokens.length !== 1 && tokens.length !== 2) {
        throw new Error(`Invalid indented value line in ${definition.id}`);
      }
    }

    const isArray =
      childTokens.length > 0 &&
      childTokens.every((tokens) => tokens.length === 1);
    const isObject = childTokens.every((tokens) => tokens.length === 2);

    if (!isArray && !isObject) {
      throw new Error(
        `Cannot mix array items and object pairs in ${definition.id}`
      );
    }

    parsedDefinitions.set(definition.id, {
      isArray,
      childTokens,
    });
  }

  const decodedDefinitions = new Map();

  function decodeToken(token) {
    if (!token.quoted && definitionMap.has(token.value)) {
      return decodeDefinition(token.value);
    }

    return parseIndentedScalarToken(token);
  }

  function decodeDefinition(definitionId) {
    if (decodedDefinitions.has(definitionId)) {
      return decodedDefinitions.get(definitionId);
    }

    const parsedDefinition = parsedDefinitions.get(definitionId);
    const result = parsedDefinition.isArray ? [] : {};
    decodedDefinitions.set(definitionId, result);

    if (parsedDefinition.isArray) {
      for (const tokens of parsedDefinition.childTokens) {
        result.push(decodeToken(tokens[0]));
      }
      return result;
    }

    for (const tokens of parsedDefinition.childTokens) {
      const key = tokens[0].value;
      result[key] = decodeToken(tokens[1]);
    }

    return result;
  }

  const rootId = definitions[0].id;
  return { id: rootId, obj: decodeDefinition(rootId) };
}
