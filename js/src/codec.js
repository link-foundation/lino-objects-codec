/**
 * Object encoder/decoder for Links Notation format.
 *
 * `encode()` writes the readable, indented form documented in `readable.js`:
 * keys and values appear as plain text, so a stored document can be read,
 * grepped and reviewed directly. The previous single-line, fully base64-encoded
 * form stays available under the explicit names `encodeCompact()` /
 * `encodeObfuscated()`, and `decode()` accepts both, so documents written by
 * earlier versions keep working and migrate on the next write.
 */

import { Parser, Link } from 'links-notation';
import * as readable from './readable.js';
import { trace } from './debug.js';

/**
 * Codec for encoding/decoding JavaScript objects to/from Links Notation.
 */
export class ObjectCodec {
  // Type identifiers
  static TYPE_NULL = 'null';
  static TYPE_UNDEFINED = 'undefined';
  static TYPE_BOOL = 'bool';
  static TYPE_INT = 'int';
  static TYPE_FLOAT = 'float';
  static TYPE_STR = 'str';
  static TYPE_ARRAY = 'array';
  static TYPE_OBJECT = 'object';

  constructor() {
    this.parser = new Parser();
    // For tracking object identity during encoding
    this._encodeMemo = new Map();
    this._encodeCounter = 0;
    // For tracking which objects need IDs (referenced multiple times or circularly)
    this._needsId = new Set();
    // For tracking references during decoding
    this._decodeMemo = new Map();
  }

  /**
   * Create a Link from string parts.
   * @param {...string} parts - String parts to include in the link
   * @returns {Link} Link object with parts as Link values
   */
  _makeLink(...parts) {
    // Each part becomes a Link with that id
    const values = parts.map((part) => new Link(part));
    return new Link(undefined, values);
  }

  /**
   * First pass: identify which objects need IDs (referenced multiple times or circularly).
   * @param {*} obj - The object to analyze
   * @param {Map} seen - Map tracking how many times we've seen each object
   */
  _findObjectsNeedingIds(obj, seen = new Map()) {
    // Only track mutable objects (arrays and objects)
    if (obj === null || typeof obj !== 'object') {
      return;
    }

    // If we've seen this object before, it needs an ID
    if (seen.has(obj)) {
      this._needsId.add(obj);
      return; // Don't recurse again
    }

    // Mark as seen
    seen.set(obj, 1);

    // Recurse into structure
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this._findObjectsNeedingIds(item, seen);
      }
    } else if (typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        this._findObjectsNeedingIds(key, seen);
        this._findObjectsNeedingIds(value, seen);
      }
    }
  }

  /**
   * Encode a JavaScript object to the readable, indented Links Notation format.
   *
   * This is the default representation: keys and values are written as plain
   * text, one per line, so the result can be read and reviewed directly.
   * See `readable.js` for the exact shape.
   *
   * @param {Object} options - Options
   * @param {*} options.obj - The JavaScript object to encode
   * @param {string} [options.indent] - Indentation string used per nesting level
   * @returns {string} String representation in readable Links Notation format
   */
  encode(options = {}) {
    const { obj, indent = readable.DEFAULT_INDENT } = options;
    return readable.encode(obj, indent);
  }

  /**
   * Encode a JavaScript object to the readable, single-line Links Notation
   * format.
   *
   * The result never contains a newline, so one value is one line: an
   * append-only log written this way stays greppable, tailable and countable by
   * `wc -l`. See `readable.js` for the exact shape.
   *
   * @param {Object} options - Options
   * @param {*} options.obj - The JavaScript object to encode
   * @returns {string} One line of readable Links Notation
   */
  encodeLine(options = {}) {
    const { obj } = options;
    return readable.encodeLine(obj);
  }

  /**
   * Decode one line of the readable, single-line Links Notation format.
   *
   * This is the exact inverse of {@link ObjectCodec#encodeLine}. Input spanning
   * more than one line is rejected, so two log records never merge into one
   * value.
   *
   * @param {Object} options - Options
   * @param {string} options.notation - One line of readable Links Notation
   * @returns {*} Reconstructed JavaScript object
   */
  decodeLine(options = {}) {
    const { notation } = options;
    return readable.decodeLine(notation);
  }

  /**
   * Encode a JavaScript object to the compact, single-line Links Notation format.
   *
   * Every value is tagged with its type and every string is base64-encoded, so
   * the whole document fits on one line and carries no readable text. This was
   * the default before the readable format; callers now opt into it explicitly.
   *
   * @param {Object} options - Options
   * @param {*} options.obj - The JavaScript object to encode
   * @returns {string} String representation in compact Links Notation format
   */
  encodeCompact(options = {}) {
    const { obj } = options;
    // Reset state for each encode operation
    this._encodeMemo = new Map();
    this._encodeCounter = 0;
    this._needsId = new Set();

    // First pass: identify which objects need IDs (referenced multiple times or circularly)
    this._findObjectsNeedingIds(obj);

    // Encode the object
    const link = this._encodeValue(obj);

    // Return formatted link
    return link.format();
  }

  /**
   * Encode a JavaScript object to the compact, base64 form.
   *
   * Alias of {@link ObjectCodec#encodeCompact}, named after what the form does to
   * its content: nothing in the output can be read without decoding it.
   *
   * @param {Object} options - Options
   * @param {*} options.obj - The JavaScript object to encode
   * @returns {string} String representation in compact Links Notation format
   */
  encodeObfuscated(options = {}) {
    return this.encodeCompact(options);
  }

  /**
   * Decode Links Notation format to a JavaScript object.
   *
   * Both the readable format and the compact (base64) format are accepted, so
   * documents written by earlier versions keep working and migrate on next write.
   *
   * @param {Object} options - Options
   * @param {string} options.notation - String in Links Notation format
   * @returns {*} Reconstructed JavaScript object
   */
  decode(options = {}) {
    const { notation } = options;

    if (notation === undefined || notation === null || notation.trim() === '') {
      return null;
    }

    if (isCompactNotation(notation)) {
      trace('codec.decode', () => 'compact notation detected');
      return this.decodeCompact({ notation });
    }

    trace('codec.decode', () => 'readable notation detected');
    return readable.decode(notation);
  }

  /**
   * Decode the compact (base64) Links Notation format.
   * @param {Object} options - Options
   * @param {string} options.notation - String in compact Links Notation format
   * @returns {*} Reconstructed JavaScript object
   */
  decodeCompact(options = {}) {
    const { notation } = options;
    // Reset memo for each decode operation
    this._decodeMemo = new Map();
    this._allLinks = [];

    const links = this.parser.parse(notation);
    if (!links || links.length === 0) {
      return null;
    }

    // If there are multiple links, store them all for forward reference resolution
    if (links.length > 1) {
      this._allLinks = links;
      // Decode the first link (this will be the main result)
      // Forward references will be resolved automatically
      return this._decodeLink(links[0]);
    }

    let link = links[0];

    // Handle case where format() creates output like (obj_0) which parser wraps
    // The parser returns a wrapper Link with no ID, containing the actual Link as first value
    if (
      !link.id &&
      link.values &&
      link.values.length === 1 &&
      link.values[0].id &&
      link.values[0].id.startsWith('obj_')
    ) {
      // Extract the actual Link
      link = link.values[0];
    }

    return this._decodeLink(link);
  }

  /**
   * Assign a fresh `obj_N` id to a mutable value and memoise it.
   * @param {object} obj - The value to identify
   * @returns {string} The assigned reference id
   */
  _assignEncodeId(obj) {
    const refId = `obj_${this._encodeCounter}`;
    this._encodeCounter += 1;
    this._encodeMemo.set(obj, refId);
    return refId;
  }

  /**
   * Resolve the memoisation state of a value before it is encoded.
   *
   * @param {*} obj - The value about to be encoded
   * @param {Set} visited - Objects currently being encoded on this branch
   * @returns {{ref: (Link|null), visited: Set}} `ref` is a direct reference link
   *   when the value was already encoded (shared value or cycle), in which case
   *   the caller must return it instead of encoding the value again. `visited`
   *   is the set to pass down to nested values.
   */
  _prepareEncodeReference(obj, visited) {
    if (obj === null || typeof obj !== 'object') {
      return { ref: null, visited };
    }

    if (this._encodeMemo.has(obj)) {
      // Return a direct reference using the object's ID
      return { ref: new Link(this._encodeMemo.get(obj)), visited };
    }

    if (!this._needsId.has(obj)) {
      return { ref: null, visited };
    }

    if (visited.has(obj)) {
      // We're in a cycle, create a direct reference
      return { ref: new Link(this._assignEncodeId(obj)), visited };
    }

    const nested = new Set([...visited, obj]);
    this._assignEncodeId(obj);
    return { ref: null, visited: nested };
  }

  /**
   * Encode a number, including the special float values.
   * @param {number} value - The number to encode
   * @returns {Link} Link object
   */
  _encodeNumber(value) {
    if (Number.isNaN(value)) {
      return this._makeLink(ObjectCodec.TYPE_FLOAT, 'NaN');
    }
    if (!Number.isFinite(value)) {
      return this._makeLink(
        ObjectCodec.TYPE_FLOAT,
        value > 0 ? 'Infinity' : '-Infinity'
      );
    }
    if (Number.isInteger(value)) {
      return this._makeLink(ObjectCodec.TYPE_INT, String(value));
    }
    return this._makeLink(ObjectCodec.TYPE_FLOAT, String(value));
  }

  /**
   * Wrap encoded collection members in a type marker link, using the
   * self-reference format `(obj_id: type ...)` when the collection has an id.
   *
   * @param {object} obj - The collection being encoded
   * @param {string} typeMarker - Type marker for the collection
   * @param {Link[]} parts - Encoded members
   * @returns {Link} Link object
   */
  _wrapEncodedCollection(obj, typeMarker, parts) {
    const marker = new Link(typeMarker);
    if (this._encodeMemo.has(obj)) {
      return new Link(this._encodeMemo.get(obj), [marker, ...parts]);
    }
    return new Link(undefined, [marker, ...parts]);
  }

  /**
   * Encode an array into a Link.
   * @param {Array} obj - The array to encode
   * @param {Set} visited - Objects currently being encoded on this branch
   * @returns {Link} Link object
   */
  _encodeArray(obj, visited) {
    const parts = obj.map((item) => this._encodeValue(item, visited));
    return this._wrapEncodedCollection(obj, ObjectCodec.TYPE_ARRAY, parts);
  }

  /**
   * Encode a plain object into a Link.
   * @param {object} obj - The object to encode
   * @param {Set} visited - Objects currently being encoded on this branch
   * @returns {Link} Link object
   */
  _encodeObject(obj, visited) {
    const parts = Object.entries(obj).map(
      ([key, value]) =>
        new Link(undefined, [
          this._encodeValue(key, visited),
          this._encodeValue(value, visited),
        ])
    );
    return this._wrapEncodedCollection(obj, ObjectCodec.TYPE_OBJECT, parts);
  }

  /**
   * Encode a value into a Link.
   * @param {*} obj - The value to encode
   * @param {Set} visited - Set of object references currently being processed (for cycle detection)
   * @returns {Link} Link object
   */
  _encodeValue(obj, visited = new Set()) {
    // Check if we've seen this object before (for circular references and
    // shared objects). Only objects and arrays (mutable types) are tracked.
    const prepared = this._prepareEncodeReference(obj, visited);
    if (prepared.ref) {
      return prepared.ref;
    }
    const nested = prepared.visited;

    // Encode based on type
    if (obj === null) {
      return this._makeLink(ObjectCodec.TYPE_NULL);
    }
    if (obj === undefined) {
      return this._makeLink(ObjectCodec.TYPE_UNDEFINED);
    }
    if (typeof obj === 'boolean') {
      return this._makeLink(ObjectCodec.TYPE_BOOL, String(obj));
    }
    if (typeof obj === 'number') {
      return this._encodeNumber(obj);
    }
    if (typeof obj === 'string') {
      // Encode strings as base64 to handle special characters, newlines, etc.
      const b64Encoded = Buffer.from(obj, 'utf-8').toString('base64');
      return this._makeLink(ObjectCodec.TYPE_STR, b64Encoded);
    }
    if (Array.isArray(obj)) {
      return this._encodeArray(obj, nested);
    }
    if (typeof obj === 'object') {
      return this._encodeObject(obj, nested);
    }

    throw new TypeError(`Unsupported type: ${typeof obj}`);
  }

  /**
   * Decode a link that carries no values: an id, a forward reference or an
   * empty document.
   *
   * @param {Link} link - Link object to decode
   * @returns {*} Decoded JavaScript value
   */
  _decodeEmptyLink(link) {
    if (!link.id) {
      return null;
    }

    // If it's in memo, return the cached object
    if (this._decodeMemo.has(link.id)) {
      return this._decodeMemo.get(link.id);
    }

    // Otherwise it's just a string ID
    if (!link.id.startsWith('obj_') || this._allLinks.length === 0) {
      return link.id;
    }

    // Look for this ID in the remaining links (forward reference)
    for (const otherLink of this._allLinks) {
      if (otherLink.id === link.id) {
        return this._decodeLink(otherLink);
      }
    }

    // Not found in links - create empty array as fallback
    const result = [];
    this._decodeMemo.set(link.id, result);
    return result;
  }

  /**
   * Parse the textual payload of an encoded float, including the special
   * values that JSON cannot represent.
   *
   * @param {string} raw - The encoded payload
   * @returns {number} The decoded number
   */
  static _parseEncodedFloat(raw) {
    if (raw === 'NaN') {
      return NaN;
    }
    if (raw === 'Infinity') {
      return Infinity;
    }
    if (raw === '-Infinity') {
      return -Infinity;
    }
    return parseFloat(raw);
  }

  /**
   * Decode a base64 payload, falling back to the raw value when it is not
   * valid base64.
   *
   * @param {string} raw - The encoded payload
   * @returns {string} The decoded string
   */
  static _decodeBase64Payload(raw) {
    try {
      return Buffer.from(raw, 'base64').toString('utf-8');
    } catch {
      // If decode fails, return the raw value
      return raw;
    }
  }

  /**
   * Read the payload of a scalar link, i.e. the value after the type marker.
   *
   * @param {Link} link - Link object to read
   * @returns {(string|null)} The payload, or null when the link carries none
   */
  static _scalarPayload(link) {
    const payload = link.values.length > 1 ? link.values[1] : null;
    return payload && payload.id ? payload.id : null;
  }

  /**
   * Decode a scalar link (null, undefined, bool, int, float or string).
   *
   * @param {string} typeMarker - The type marker of the link
   * @param {Link} link - Link object to decode
   * @returns {*} Decoded JavaScript value
   */
  static _decodeScalar(typeMarker, link) {
    const raw = ObjectCodec._scalarPayload(link);

    switch (typeMarker) {
      case ObjectCodec.TYPE_NULL:
        return null;
      case ObjectCodec.TYPE_UNDEFINED:
        return undefined;
      case ObjectCodec.TYPE_BOOL:
        return raw === null ? false : raw.toLowerCase() === 'true';
      case ObjectCodec.TYPE_INT:
        return raw === null ? 0 : parseInt(raw, 10);
      case ObjectCodec.TYPE_FLOAT:
        return raw === null ? 0.0 : ObjectCodec._parseEncodedFloat(raw);
      case ObjectCodec.TYPE_STR:
        return raw === null ? '' : ObjectCodec._decodeBase64Payload(raw);
      default:
        // Unknown type marker
        throw new Error(`Unknown type marker: ${typeMarker}`);
    }
  }

  /**
   * Locate the id and the first member index of an encoded collection.
   *
   * Supports the current self-reference format `(obj_0: type item ...)` and the
   * legacy format `(type obj_0 item ...)`.
   *
   * @param {Link} link - Link object to inspect
   * @param {(string|null)} selfRefId - Id taken from the link itself, if any
   * @returns {{id: (string|null), startIdx: number}} Collection id and offset
   */
  static _collectionStart(link, selfRefId) {
    if (selfRefId) {
      return { id: selfRefId, startIdx: 1 };
    }

    const second = link.values.length > 1 ? link.values[1] : null;
    if (second && second.id && second.id.startsWith('obj_')) {
      return { id: second.id, startIdx: 2 };
    }

    return { id: null, startIdx: 1 };
  }

  /**
   * Decode an encoded array.
   * @param {Link} link - Link object to decode
   * @param {(string|null)} selfRefId - Self-reference id of the link, if any
   * @returns {Array} Decoded array
   */
  _decodeArray(link, selfRefId) {
    const { id, startIdx } = ObjectCodec._collectionStart(link, selfRefId);

    const resultArray = [];
    // Memoise before decoding members so cycles resolve to this same array.
    if (id) {
      this._decodeMemo.set(id, resultArray);
    }

    for (let i = startIdx; i < link.values.length; i++) {
      resultArray.push(this._decodeLink(link.values[i]));
    }
    return resultArray;
  }

  /**
   * Decode an encoded object.
   * @param {Link} link - Link object to decode
   * @param {(string|null)} selfRefId - Self-reference id of the link, if any
   * @returns {object} Decoded object
   */
  _decodeObject(link, selfRefId) {
    const { id, startIdx } = ObjectCodec._collectionStart(link, selfRefId);

    const resultObject = {};
    // Memoise before decoding members so cycles resolve to this same object.
    if (id) {
      this._decodeMemo.set(id, resultObject);
    }

    for (let i = startIdx; i < link.values.length; i++) {
      const pairLink = link.values[i];
      if (pairLink.values && pairLink.values.length >= 2) {
        const decodedKey = this._decodeLink(pairLink.values[0]);
        const decodedValue = this._decodeLink(pairLink.values[1]);
        resultObject[decodedKey] = decodedValue;
      }
    }
    return resultObject;
  }

  /**
   * Decode a Link into a JavaScript value.
   * @param {Link} link - Link object to decode
   * @returns {*} Decoded JavaScript value
   */
  _decodeLink(link) {
    // Check if this is a direct reference to a previously decoded object
    // Direct references have an id but no values, or the id refers to an existing object
    if (link.id && this._decodeMemo.has(link.id)) {
      return this._decodeMemo.get(link.id);
    }

    // Empty link - this might be a simple id, reference, or empty collection
    if (!link.values || link.values.length === 0) {
      return this._decodeEmptyLink(link);
    }

    // Check if this link has a self-reference ID (format: obj_0: type ...)
    const selfRefId = link.id && link.id.startsWith('obj_') ? link.id : null;

    // Get the type marker from the first value
    const firstValue = link.values[0];
    if (!firstValue || !firstValue.id) {
      // Not a type marker we recognize
      return null;
    }
    const typeMarker = firstValue.id;

    if (typeMarker === ObjectCodec.TYPE_ARRAY) {
      return this._decodeArray(link, selfRefId);
    }
    if (typeMarker === ObjectCodec.TYPE_OBJECT) {
      return this._decodeObject(link, selfRefId);
    }
    return ObjectCodec._decodeScalar(typeMarker, link);
  }
}

/**
 * Type markers that can open a compact document.
 *
 * The set is the union of the markers used by every implementation, so a
 * document written by the Python (`None`, `list`, `dict`) or C# (`list`, `dict`)
 * codec is recognised here as well.
 */
const COMPACT_TYPE_MARKERS = new Set([
  ObjectCodec.TYPE_NULL,
  ObjectCodec.TYPE_UNDEFINED,
  ObjectCodec.TYPE_BOOL,
  ObjectCodec.TYPE_INT,
  ObjectCodec.TYPE_FLOAT,
  ObjectCodec.TYPE_STR,
  ObjectCodec.TYPE_ARRAY,
  ObjectCodec.TYPE_OBJECT,
  'None',
  'list',
  'dict',
]);

/**
 * Markers a compact document writes without a payload, so `(null)` is a compact
 * null while `(null 1)` is a readable line holding two values.
 */
const EMPTY_BODY_MARKERS = new Set([
  ObjectCodec.TYPE_NULL,
  ObjectCodec.TYPE_UNDEFINED,
  'None',
]);

/**
 * Whether a document is in the compact (base64) format rather than the readable
 * one. The compact format always opens with `(` followed by a type marker,
 * optionally preceded by an `obj_N:` definition id.
 *
 * @param {string} notation - The document to classify
 * @returns {boolean} True when the document is in the compact format
 */
export function isCompactNotation(notation) {
  const firstLine = notation
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine || !firstLine.startsWith('(')) {
    return false;
  }

  // A compact document names the type of its value first, so a link that opens
  // another link straight away is the readable form, whose links nest.
  let [marker, rest] = splitToken(firstLine.slice(1).trimStart());

  // Skip the `obj_N:` definition id, if present.
  if (marker.endsWith(':')) {
    if (!marker.startsWith('obj_')) {
      return false;
    }
    [marker, rest] = splitToken(rest.trimStart());
  }

  if (!COMPACT_TYPE_MARKERS.has(marker)) {
    return false;
  }

  // A compact null is the whole link: `(null)`. A link that holds more than the
  // marker is a readable line whose first value happens to be null.
  if (EMPTY_BODY_MARKERS.has(marker)) {
    return rest.trimStart().startsWith(')');
  }

  return true;
}

/**
 * Split off the first token of a link body: the text up to the next whitespace
 * or parenthesis. A body that opens with a parenthesis has no token of its own.
 * @param {string} input - The link body
 * @returns {[string, string]} The token and the text after it
 */
function splitToken(input) {
  const end = input.search(/[\s()]/);
  return end === -1 ? [input, ''] : [input.slice(0, end), input.slice(end)];
}

// Convenience functions
const _defaultCodec = new ObjectCodec();

/**
 * Encode a JavaScript object to the readable, indented Links Notation format.
 * @param {Object} options - Options
 * @param {*} options.obj - The JavaScript object to encode
 * @param {string} [options.indent] - Indentation string used per nesting level
 * @returns {string} String representation in readable Links Notation format
 */
export function encode(options = {}) {
  return _defaultCodec.encode(options);
}

/**
 * Encode a JavaScript object to the readable, single-line Links Notation format.
 *
 * The result never contains a newline, so one value is one line of an
 * append-only log.
 *
 * @param {Object} options - Options
 * @param {*} options.obj - The JavaScript object to encode
 * @returns {string} One line of readable Links Notation
 */
export function encodeLine(options = {}) {
  return _defaultCodec.encodeLine(options);
}

/**
 * Decode one line of the readable, single-line Links Notation format.
 *
 * The exact inverse of {@link encodeLine}.
 *
 * @param {Object} options - Options
 * @param {string} options.notation - One line of readable Links Notation
 * @returns {*} Reconstructed JavaScript object
 */
export function decodeLine(options = {}) {
  return _defaultCodec.decodeLine(options);
}

/**
 * Encode a JavaScript object to the compact, single-line Links Notation format.
 *
 * Every string is base64-encoded and the whole document is written on one line.
 * {@link decode} reads this form as well, so stored documents remain readable by
 * the library after switching to the default readable output.
 *
 * @param {Object} options - Options
 * @param {*} options.obj - The JavaScript object to encode
 * @returns {string} String representation in compact Links Notation format
 */
export function encodeCompact(options = {}) {
  return _defaultCodec.encodeCompact(options);
}

/**
 * Encode a JavaScript object to the compact, base64 form.
 *
 * Alias of {@link encodeCompact}, named after what the form does to its content.
 *
 * @param {Object} options - Options
 * @param {*} options.obj - The JavaScript object to encode
 * @returns {string} String representation in compact Links Notation format
 */
export function encodeObfuscated(options = {}) {
  return _defaultCodec.encodeObfuscated(options);
}

/**
 * Decode Links Notation format to a JavaScript object.
 *
 * Both the readable format and the compact (base64) format are accepted.
 *
 * @param {Object} options - Options
 * @param {string} options.notation - String in Links Notation format
 * @returns {*} Reconstructed JavaScript object
 */
export function decode(options = {}) {
  return _defaultCodec.decode(options);
}

/**
 * Decode the compact (base64) Links Notation format.
 * @param {Object} options - Options
 * @param {string} options.notation - String in compact Links Notation format
 * @returns {*} Reconstructed JavaScript object
 */
export function decodeCompact(options = {}) {
  return _defaultCodec.decodeCompact(options);
}
