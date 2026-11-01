/**
 * UTF-8 base64 helpers that work in Node.js and in browsers.
 *
 * Node.js has `Buffer`; a browser bundle (Vite, esbuild, Rollup) does not. The
 * codec therefore uses `Buffer` when it exists and otherwise falls back to a
 * small pure-JavaScript implementation built on `TextEncoder`/`TextDecoder`,
 * which are available in every modern browser and in Node.js.
 *
 * The fallback decoder follows the lenient rules of
 * `Buffer.from(text, 'base64')`, so a document decodes to the same string in
 * both environments:
 *
 * - both the standard (`+/`) and the URL-safe (`-_`) alphabets are accepted;
 * - characters outside the alphabets (whitespace, punctuation) are skipped;
 * - decoding stops at the first `=`;
 * - trailing bits that do not make a whole byte are dropped;
 * - invalid UTF-8 becomes U+FFFD, as with `buffer.toString('utf-8')`.
 *
 * @module base64
 */

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_TABLE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < ALPHABET.length; index += 1) {
    table[ALPHABET.charCodeAt(index)] = index;
  }
  // URL-safe alphabet, accepted by Buffer as well.
  table['-'.charCodeAt(0)] = 62;
  table['_'.charCodeAt(0)] = 63;
  return table;
})();

/**
 * The `Buffer` constructor when the runtime provides one (Node.js), otherwise
 * `undefined`. Looked up on every call so that the result follows the current
 * environment.
 * @returns {typeof Buffer|undefined}
 */
function nodeBuffer() {
  return typeof globalThis.Buffer === 'function'
    ? globalThis.Buffer
    : undefined;
}

/**
 * Encode bytes as standard, padded base64 without `Buffer` or `btoa`.
 * @param {Uint8Array} bytes - Bytes to encode
 * @returns {string} Base64 text
 */
export function bytesToBase64(bytes) {
  let out = '';
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const chunk =
      (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    out +=
      ALPHABET[(chunk >> 18) & 63] +
      ALPHABET[(chunk >> 12) & 63] +
      ALPHABET[(chunk >> 6) & 63] +
      ALPHABET[chunk & 63];
  }
  const rest = bytes.length - index;
  if (rest === 1) {
    const chunk = bytes[index] << 16;
    out += `${ALPHABET[(chunk >> 18) & 63]}${ALPHABET[(chunk >> 12) & 63]}==`;
  } else if (rest === 2) {
    const chunk = (bytes[index] << 16) | (bytes[index + 1] << 8);
    out += `${ALPHABET[(chunk >> 18) & 63]}${ALPHABET[(chunk >> 12) & 63]}${
      ALPHABET[(chunk >> 6) & 63]
    }=`;
  }
  return out;
}

/**
 * Decode base64 text to bytes without `Buffer` or `atob`, with the same
 * leniency as `Buffer.from(text, 'base64')`.
 * @param {string} text - Base64 text
 * @returns {Uint8Array} Decoded bytes
 */
export function base64ToBytes(text) {
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4) + 3);
  let length = 0;
  let bits = 0;
  let bitCount = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 61 /* '=' */) {
      break;
    }
    const value = code < 128 ? DECODE_TABLE[code] : -1;
    if (value === -1) {
      continue;
    }
    bits = ((bits << 6) | value) & 0xffffff;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes[length] = (bits >> bitCount) & 0xff;
      length += 1;
    }
  }
  return bytes.subarray(0, length);
}

/**
 * Encode a string as UTF-8, then as base64.
 * @param {string} text - Text to encode
 * @returns {string} Base64 text
 */
export function encodeUtf8Base64(text) {
  const NodeBuffer = nodeBuffer();
  if (NodeBuffer) {
    return NodeBuffer.from(text, 'utf-8').toString('base64');
  }
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * Decode base64 text and read the bytes as UTF-8.
 * @param {string} b64 - Base64 text
 * @returns {string} Decoded text
 */
export function decodeUtf8Base64(b64) {
  const NodeBuffer = nodeBuffer();
  if (NodeBuffer) {
    return NodeBuffer.from(b64, 'base64').toString('utf-8');
  }
  // ignoreBOM keeps a leading U+FEFF, as buffer.toString('utf-8') does.
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
    base64ToBytes(b64)
  );
}
