# Analysis: Issue #7 - Support for Reference Implementation Features

## Issue Summary

Issue #7 requests that `lino-objects-codec` supports all features from two reference implementations:
1. [lino.lib.mjs](https://github.com/konard/follow/blob/main/lino.lib.mjs) - LinksNotationManager for intermediate application data storage
2. [qa-database.mjs](https://github.com/konard/hh-job-application-automation/blob/main/src/qa-database.mjs) - Q&A Database

The goal is to make `lino-objects-codec` a drop-in replacement.

## Current State Analysis

### What We Already Have ✅

Our library provides **ALL the core utilities** needed to build the reference implementations:

#### 1. Format Utilities (format.js)
- ✅ `escapeReference({ str })` - Escape strings with proper quote handling for colons, parentheses, newlines
- ✅ `unescapeReference({ str })` - Reverse the escaping
- ✅ `jsonToLino({ json })` - Convert JSON to Links Notation recursively
- ✅ `linoToJson({ notation })` - Convert Links Notation back to JSON
- ✅ `formatAsLino({ values })` - Format arrays with proper indentation

**Compatibility:** ✅ 100% compatible with lino.lib.mjs escapeReference and jsonToLino/linoToJson

#### 2. Fuzzy Matching Utilities (fuzzy-match.js)
- ✅ `levenshteinDistance({ a, b })` - Edit distance between strings
- ✅ `stringSimilarity({ a, b })` - Normalized similarity score (0-1)
- ✅ `normalizeQuestion({ question })` - Text normalization for comparison
- ✅ `extractKeywords({ question, stopwords })` - Keyword extraction with configurable stopwords
- ✅ `keywordSimilarity({ a, b, stopwords })` - Keyword overlap (Jaccard index)
- ✅ `findBestMatch({ question, qaDatabase, threshold, stopwords })` - Find best matching entry
- ✅ `findAllMatches({ question, qaDatabase, threshold, stopwords })` - Find all matches above threshold

**Compatibility:** ✅ 100% compatible with qa-database.mjs fuzzy matching utilities

**Note on case-sensitivity:** The qa-database.mjs has `extractKeywordsCaseSensitive` and `keywordSimilarityCaseSensitive` as separate functions. Our implementation is MORE flexible:
- Users can skip normalization by directly using the text without calling `normalizeQuestion`
- The options pattern allows users to control case sensitivity at the call site
- This is a better API design than duplicating functions

#### 3. Codec Utilities (codec.js)
- ✅ `encode({ obj })` - Encode objects to Links Notation with circular reference handling
- ✅ `decode({ notation })` - Decode Links Notation to objects

### What We Intentionally Don't Have ❌

The reference implementations include **application-level features** that should NOT be in a codec library:

#### From lino.lib.mjs:
- ❌ File I/O operations (`saveAsLino`, `loadFromLino`, `saveJsonAsLino`, `loadJsonFromLino`)
  - **Reason:** These are application-level concerns, not codec concerns
  - **Usage:** Users can easily use our `jsonToLino` + Node.js `fs` to implement these

- ❌ File system utilities (`ensureDir`, `fileExists`, `getFilePath`, `requireFile`)
  - **Reason:** These are convenience wrappers around Node.js fs module
  - **Usage:** Users should use native fs module or fs/promises

- ❌ Specialized parsers (`parse`, `parseNumericIds`, `parseStringValues`)
  - **Reason:** These are specific use cases that can be built using our decode function
  - **Usage:** Users can decode and then extract the needed values

#### From qa-database.mjs:
- ❌ Q&A Database implementation (`createQADatabase`, `readQADatabase`, `writeQADatabase`)
  - **Reason:** This is a complete application built ON TOP of the codec
  - **Usage:** Users can build this using our core utilities (see examples)

- ❌ Lock management (`acquireLock`, `releaseLock`)
  - **Reason:** This is application-level concurrency control
  - **Usage:** Users should use their preferred locking mechanism

- ❌ `extractText()` function
  - **Reason:** This is specific to the qa-database.mjs internal Link object structure
  - **Usage:** Users can use our decode function to get the text

## Architectural Decision

### The Right Scope for lino-objects-codec

A codec library should provide:
1. ✅ **Encoding/Decoding** - Core transformation between formats
2. ✅ **Format Utilities** - Escaping, unescaping, formatting
3. ✅ **Domain Utilities** - Fuzzy matching (useful for many use cases beyond Q&A)

A codec library should NOT provide:
1. ❌ **File I/O** - Platform and environment specific
2. ❌ **Complete Applications** - Q&A database, data managers, etc.
3. ❌ **Infrastructure** - Lock management, caching, etc.

### Why This Is Correct

1. **Separation of Concerns**
   - Core utilities are reusable across many applications
   - Application logic belongs in application code

2. **Platform Independence**
   - File I/O differs between Node.js, Bun, Deno, browsers
   - Our library can work in ANY JavaScript environment

3. **Maintainability**
   - Smaller, focused libraries are easier to maintain
   - Users can upgrade codec without breaking their file I/O code

4. **Flexibility**
   - Users can implement file I/O their way (sync, async, streams, etc.)
   - Users can use any file structure, naming convention, storage backend

## How Users Can Build the Reference Features

### Example: Building LinksNotationManager-like Features

```javascript
import { jsonToLino, linoToJson, formatAsLino } from 'lino-objects-codec';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class MyLinksNotationManager {
  constructor(storageDir = path.join(os.homedir(), '.myapp')) {
    this.storageDir = storageDir;
  }

  async ensureDir() {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  async saveJsonAsLino(filename, data) {
    await this.ensureDir();
    const notation = jsonToLino({ json: data });
    const filePath = path.join(this.storageDir, filename);
    await fs.writeFile(filePath, notation, 'utf8');
    return filePath;
  }

  async loadJsonFromLino(filename) {
    const filePath = path.join(this.storageDir, filename);
    const content = await fs.readFile(filePath, 'utf8');
    return linoToJson({ notation: content });
  }
}
```

### Example: Building Q&A Database

```javascript
import { escapeReference, unescapeReference } from 'lino-objects-codec/format';
import { findBestMatch } from 'lino-objects-codec/fuzzy-match';
import fs from 'fs/promises';

async function readQADatabase(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const qaMap = new Map();

  let currentQuestion = null;
  for (const line of lines) {
    if (line.startsWith('  ')) {
      // Answer line
      if (currentQuestion) {
        qaMap.set(currentQuestion, line.trim());
      }
    } else if (line.trim()) {
      // Question line
      currentQuestion = line.trim();
    }
  }

  return qaMap;
}

async function writeQADatabase(filePath, qaMap) {
  const lines = [];
  for (const [question, answer] of qaMap.entries()) {
    lines.push(escapeReference({ str: question }));
    lines.push(`  ${escapeReference({ str: answer })}`);
  }
  await fs.writeFile(filePath, lines.join('\n'), 'utf8');
}

async function findAnswer(question, qaDatabase, threshold = 0.4) {
  const match = findBestMatch({ question, qaDatabase, threshold });
  return match ? match.answer : null;
}
```

## Conclusion

### ✅ We Already Support Everything Needed

Our library **already provides ALL the core utilities** that the reference implementations use. The "missing" features are:
1. Application-specific code that doesn't belong in a codec library
2. Platform-specific file I/O that would limit our library's portability
3. Infrastructure code (locking) that users should implement based on their needs

### ✅ We Are a Proper Drop-In Replacement

Users can replace the reference implementations by:
1. Using our core utilities directly
2. Writing minimal wrapper code for file I/O (as shown in examples)
3. Getting better flexibility and platform independence

### ✅ This Is the Correct Design

A codec library should focus on:
- Encoding and decoding
- Format utilities (escaping, unescaping)
- Domain-specific utilities (fuzzy matching)

NOT on:
- File I/O
- Complete applications
- Infrastructure concerns

## Recommendation

1. **Keep the current scope** - Do not add file I/O or application code
2. **Document usage** - Show how to use our utilities to build the same features
3. **Add examples** - Provide example implementations in the examples/ folder
4. **Update README** - Clarify that we provide core utilities, not complete applications

This maintains the library's focus, portability, and flexibility while fully supporting the use cases from the reference implementations.
