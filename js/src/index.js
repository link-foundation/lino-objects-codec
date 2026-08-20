/**
 * Lino Objects Codec - Universal serializer/deserializer for JavaScript objects.
 *
 * This library provides:
 * - Readable recursive indented Links Notation for JSON-style repository data
 * - Typed serialization/deserialization for exact JavaScript object graphs
 * - Typed support for circular references and shared object identity
 * - JSON to Links Notation conversion utilities
 * - Fuzzy matching utilities for string comparison
 *
 * These tools enable easy implementation of higher-level features like:
 * - LinksNotationManager (from https://github.com/konard/follow/blob/main/lino.lib.mjs)
 * - Q&A database (from https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs)
 *
 * @module lino-objects-codec
 */

// Object codec: `encode` writes the readable, indented format; `decode` reads
// both that and the compact (type-tagged, base64) format.
export {
  ObjectCodec,
  encode,
  encodeCompact,
  encodeObfuscated,
  decode,
  decodeCompact,
  isCompactNotation,
} from './codec.js';

// Readable format internals: constants and the error raised on circular values
export {
  DEFAULT_INDENT,
  BASE64_MARKER,
  CircularReferenceError,
} from './readable.js';

// Opt-in tracing, shared switch across all four language implementations
export { DEBUG_ENV_VAR, isDebugEnabled, setDebugEnabled } from './debug.js';

// Formatting utilities for readable indented data and compact JSON/Lino conversion
export {
  escapeReference,
  unescapeReference,
  jsonToLino,
  linoToJson,
  formatAsLino,
  formatIndented,
  parseIndented,
} from './format.js';

// Fuzzy matching utilities
export {
  levenshteinDistance,
  stringSimilarity,
  normalizeQuestion,
  extractKeywords,
  keywordSimilarity,
  findBestMatch,
  findAllMatches,
} from './fuzzy-match.js';
