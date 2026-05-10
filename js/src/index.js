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

// Typed object codec (preserves types with markers like (int 42), (str base64))
export { ObjectCodec, encode, decode } from './codec.js';

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
