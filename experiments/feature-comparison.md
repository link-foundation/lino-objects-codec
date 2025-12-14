# Feature Comparison: link-notation-objects-codec vs Reference Implementations

## Reference Implementations

### 1. lino.lib.mjs (LinksNotationManager)
Location: https://github.com/konard/follow/blob/main/lino.lib.mjs

**Features:**
- `parse()` - Extract values from Links Notation input
- `parseNumericIds()` - Extract numeric identifiers
- `parseStringValues()` - Extract string values
- `format()` - Convert arrays to Links Notation format
- `escapeReference()` - Escape strings for safe use in Links Notation
- `jsonToLino()` - Convert JSON to Links Notation recursively
- `linoToJson()` - Convert Links Notation back to JSON
- `_parseReference()` - Parse primitives (booleans, numbers, strings, null)
- `_convertParsedToJson()` - Internal recursive converter
- **File Operations:**
  - `ensureDir()` - Create storage directory
  - `saveAsLino()` - Write array values to files
  - `saveJsonAsLino()` - Persist structured JSON data
  - `loadJsonFromLino()` - Retrieve and parse JSON from storage
  - `loadFromLino()` - Load Links Notation files with multiple parse formats
  - `fileExists()` - Check file presence
  - `getFilePath()` - Return full file paths
  - `requireFile()` - Load files with error handling

### 2. qa-database.mjs (Q&A Database)
Location: https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs

**Features:**
- `createQADatabase(filePath)` - Factory function for creating Q&A database instances
- `readQADatabase()` - Read Q&A pairs from file
- `writeQADatabase()` - Write Q&A pairs to file
- `addOrUpdateQA()` - Add or update Q&A pair with locking
- `getAnswer()` - Get answer for a question
- `escapeReference()` - Escape strings for Links Notation (with special char handling)
- `unescapeReference()` - Unescape Links Notation strings
- `extractText()` - Extract text from Link objects
- **Lock management:**
  - `acquireLock()` - Acquire lock for concurrent access
  - `releaseLock()` - Release lock
- **Fuzzy matching utilities:**
  - `levenshteinDistance()` - Calculate edit distance
  - `stringSimilarity()` - Normalized similarity score (0-1)
  - `normalizeQuestion()` - Text normalization for comparison
  - `extractKeywords()` - Keyword extraction with stopwords
  - `extractKeywordsCaseSensitive()` - Case-sensitive keyword extraction
  - `keywordSimilarity()` - Keyword overlap (Jaccard index)
  - `keywordSimilarityCaseSensitive()` - Case-sensitive keyword similarity
  - `findBestMatch()` - Find best matching entry with fuzzy matching

## Current Implementation (link-notation-objects-codec)

### JavaScript (js/src/)

**codec.js:**
- `encode({ obj })` - Encode JS objects to Links Notation
- `decode({ notation })` - Decode Links Notation to JS objects
- Circular reference handling
- Type conversion for primitives

**format.js:**
- `escapeReference({ str })` - Escape strings for Links Notation ✅
- `unescapeReference({ str })` - Unescape Links Notation strings ✅
- `jsonToLino({ json })` - Convert JSON to Links Notation ✅
- `linoToJson({ notation })` - Convert Links Notation to JSON ✅
- `formatAsLino({ values })` - Format arrays with indentation ✅

**fuzzy-match.js:**
- `levenshteinDistance({ a, b })` - Edit distance ✅
- `stringSimilarity({ a, b })` - Similarity score ✅
- `normalizeQuestion({ question })` - Text normalization ✅
- `extractKeywords({ question, stopwords })` - Keyword extraction ✅
- `keywordSimilarity({ a, b, stopwords })` - Keyword overlap ✅
- `findBestMatch({ question, entries, threshold, stopwords })` - Best match ✅
- `findAllMatches({ question, entries, threshold, stopwords })` - All matches ✅

### Python (python/src/)

**codec.py:**
- `encode(obj)` - Encode Python objects to Links Notation
- `decode(notation)` - Decode Links Notation to Python objects
- Circular reference handling
- Type conversion for primitives

## Gap Analysis

### Missing Features in link-notation-objects-codec

From **lino.lib.mjs**:
1. ❌ `parse()` - Extract values from Links Notation input
2. ❌ `parseNumericIds()` - Extract numeric identifiers
3. ❌ `parseStringValues()` - Extract string values
4. ✅ `format()` - Covered by `formatAsLino()`
5. ✅ `escapeReference()` - Available in format.js
6. ✅ `jsonToLino()` - Available in format.js
7. ✅ `linoToJson()` - Available in format.js
8. ❌ File operations (all missing):
   - `ensureDir()`
   - `saveAsLino()`
   - `saveJsonAsLino()`
   - `loadJsonFromLino()`
   - `loadFromLino()`
   - `fileExists()`
   - `getFilePath()`
   - `requireFile()`

From **qa-database.mjs**:
1. ❌ `createQADatabase(filePath)` - Factory for Q&A database
2. ❌ `readQADatabase()` - Read Q&A pairs
3. ❌ `writeQADatabase()` - Write Q&A pairs
4. ❌ `addOrUpdateQA()` - Add/update with locking
5. ❌ `getAnswer()` - Get answer for question
6. ✅ `escapeReference()` - Available in format.js
7. ✅ `unescapeReference()` - Available in format.js
8. ❌ `extractText()` - Extract text from Link objects
9. ❌ Lock management (acquireLock, releaseLock)
10. ✅ `levenshteinDistance()` - Available in fuzzy-match.js
11. ✅ `stringSimilarity()` - Available in fuzzy-match.js
12. ✅ `normalizeQuestion()` - Available in fuzzy-match.js
13. ✅ `extractKeywords()` - Available in fuzzy-match.js
14. ❌ `extractKeywordsCaseSensitive()` - Not in current implementation
15. ✅ `keywordSimilarity()` - Available in fuzzy-match.js
16. ❌ `keywordSimilarityCaseSensitive()` - Not in current implementation
17. ✅ `findBestMatch()` - Available in fuzzy-match.js

## Assessment

### What We Have ✅
Our current implementation provides:
- **Core utilities** for escaping, unescaping, and converting between JSON and Links Notation
- **Fuzzy matching** utilities for finding similar questions/entries
- **Codec** for encoding/decoding objects with circular reference support

### What We're Missing ❌
The reference implementations include **high-level features** that are **application-specific**:
- **File I/O operations** - These are application-specific and don't belong in a codec library
- **Q&A database** - This is a complete application built ON TOP of the codec
- **Lock management** - Application-level concurrency control
- **Parse utilities** - Specific parsers for extracting certain data types

## Recommendation

The current `link-notation-objects-codec` library **already provides ALL the core utilities** needed to build the higher-level applications like `LinksNotationManager` and `qa-database`.

**The missing features are intentionally NOT included** because they are:
1. Application-specific (file I/O, Q&A database, locking)
2. Can be easily built using our core utilities
3. Would bloat the library with features that most users don't need

**Our library is correctly positioned as a foundational codec library**, not a complete application framework.

### What the issue actually asks for

Looking at issue #7:
> "So we need to support all features of these, so our `link-notation-objects-codec` can be a drop in replacement for both places."

This means we need to ensure that our core utilities are **compatible** and can be used to build the same high-level features, NOT that we need to include all the application-specific code.

### Action Items

1. ✅ **Keep core utilities** (escape, unescape, jsonToLino, linoToJson, fuzzy matching)
2. ❌ **Do NOT add file I/O** - This is application-specific
3. ❌ **Do NOT add Q&A database** - This is an application built on top of the codec
4. ✅ **Ensure compatibility** - Our utilities should work the same way as the reference implementations
5. 📝 **Update documentation** - Show how to use our utilities to build the same features
6. 🧪 **Add examples** - Demonstrate building a simple LinksNotationManager and Q&A database using our utilities

## Compatibility Check

Let's verify that our utilities can be used as drop-in replacements:

### escapeReference
- ✅ Both implementations handle quotes, colons, parentheses, newlines
- ✅ Both use the same escaping strategy (wrap with quotes, double quotes for escape)

### jsonToLino / linoToJson
- ✅ Both convert JSON to Links Notation recursively
- ✅ Both handle objects as `((key value) (key value))` format
- ✅ Both handle arrays as `(item1 item2 item3)` format

### Fuzzy Matching
- ✅ Our implementation has levenshteinDistance, stringSimilarity
- ✅ Our implementation has normalizeQuestion, extractKeywords, keywordSimilarity
- ✅ Our implementation has findBestMatch with threshold support
- ⚠️ Missing: case-sensitive variants (extractKeywordsCaseSensitive, keywordSimilarityCaseSensitive)

### Conclusion

We need to:
1. Add case-sensitive fuzzy matching variants
2. Update docs to show how to use our utilities to build LinksNotationManager-like features
3. Add examples demonstrating the same use cases as the reference implementations
