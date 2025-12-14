/**
 * Tests for fuzzy matching utilities.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshteinDistance,
  stringSimilarity,
  normalizeQuestion,
  extractKeywords,
  keywordSimilarity,
  findBestMatch,
  findAllMatches,
} from '../src/index.js';

describe('levenshteinDistance', () => {
  test('should return 0 for identical strings', () => {
    assert.equal(levenshteinDistance({ a: 'hello', b: 'hello' }), 0);
    assert.equal(levenshteinDistance({ a: '', b: '' }), 0);
  });

  test('should return correct distance for single character difference', () => {
    assert.equal(levenshteinDistance({ a: 'hello', b: 'hallo' }), 1); // substitution
    assert.equal(levenshteinDistance({ a: 'hello', b: 'hell' }), 1); // deletion
    assert.equal(levenshteinDistance({ a: 'hello', b: 'helloo' }), 1); // insertion
  });

  test('should return length for completely different strings', () => {
    assert.equal(levenshteinDistance({ a: 'abc', b: 'xyz' }), 3);
  });

  test('should handle empty strings', () => {
    assert.equal(levenshteinDistance({ a: 'hello', b: '' }), 5);
    assert.equal(levenshteinDistance({ a: '', b: 'hello' }), 5);
  });

  test('should handle case-sensitive comparison', () => {
    assert.equal(levenshteinDistance({ a: 'Hello', b: 'hello' }), 1);
    assert.equal(levenshteinDistance({ a: 'HELLO', b: 'hello' }), 5);
  });
});

describe('stringSimilarity', () => {
  test('should return 1 for identical strings', () => {
    assert.equal(stringSimilarity({ a: 'hello', b: 'hello' }), 1.0);
    assert.equal(stringSimilarity({ a: '', b: '' }), 1.0);
  });

  test('should return 0 for completely different strings', () => {
    assert.equal(stringSimilarity({ a: 'abc', b: 'xyz' }), 0);
  });

  test('should return value between 0 and 1 for similar strings', () => {
    const similarity = stringSimilarity({ a: 'hello', b: 'hallo' });
    assert.ok(similarity > 0);
    assert.ok(similarity < 1);
    assert.equal(similarity, 0.8); // 4/5 characters match
  });

  test('should handle different length strings', () => {
    const similarity = stringSimilarity({ a: 'hello', b: 'hell' });
    assert.ok(similarity > 0);
    assert.ok(similarity < 1);
  });
});

describe('normalizeQuestion', () => {
  test('should convert to lowercase', () => {
    assert.equal(normalizeQuestion({ question: 'HELLO' }), 'hello');
    assert.equal(normalizeQuestion({ question: 'Hello World' }), 'hello world');
  });

  test('should remove punctuation', () => {
    assert.equal(normalizeQuestion({ question: 'Hello, World!' }), 'hello world');
    assert.equal(normalizeQuestion({ question: 'What?!' }), 'what');
    assert.equal(normalizeQuestion({ question: 'a.b.c' }), 'abc');
  });

  test('should standardize whitespace', () => {
    assert.equal(normalizeQuestion({ question: 'hello  world' }), 'hello world');
    assert.equal(normalizeQuestion({ question: '  hello  ' }), 'hello');
    assert.equal(normalizeQuestion({ question: 'a   b   c' }), 'a b c');
  });

  test('should handle combined normalization', () => {
    assert.equal(normalizeQuestion({ question: '  HELLO,  World! What?  ' }), 'hello world what');
  });
});

describe('extractKeywords', () => {
  test('should extract all keywords when no stopwords provided', () => {
    const keywords = extractKeywords({ question: 'What is the best way to learn programming?' });
    assert.ok(keywords.has('best'));
    assert.ok(keywords.has('way'));
    assert.ok(keywords.has('learn'));
    assert.ok(keywords.has('programming'));
    // With no stopwords, common words are also extracted
    // (words with length > minWordLength, which defaults to 2)
    assert.ok(keywords.has('the'));
    assert.ok(keywords.has('what'));
  });

  test('should filter out English stopwords when provided', () => {
    const stopwords = new Set(['the', 'and', 'or', 'is', 'are']);
    const keywords = extractKeywords({ question: 'the and or is are', stopwords });
    // All stopwords should be filtered out
    assert.equal(keywords.size, 0);
  });

  test('should filter out Russian stopwords when provided', () => {
    const stopwords = new Set(['как', 'что', 'это', 'в', 'на']);
    const keywords = extractKeywords({ question: 'как что это в на', stopwords });
    assert.equal(keywords.size, 0);
  });

  test('should add stems for longer words', () => {
    const keywords = extractKeywords({ question: 'programming' });
    assert.ok(keywords.has('programming'));
    assert.ok(keywords.has('progr')); // stem (first 5 chars)
  });

  test('should respect minWordLength option', () => {
    const keywords = extractKeywords({ question: 'a ab abc abcd', minWordLength: 3 });
    assert.ok(!keywords.has('a'));
    assert.ok(!keywords.has('ab'));
    assert.ok(!keywords.has('abc')); // length 3, not > 3
    assert.ok(keywords.has('abcd'));
  });

  test('should disable stemming when stemLength is 0', () => {
    const keywords = extractKeywords({ question: 'programming', stemLength: 0 });
    assert.ok(keywords.has('programming'));
    assert.ok(!keywords.has('progr'));
  });
});

describe('keywordSimilarity', () => {
  test('should return 1 for identical questions', () => {
    const similarity = keywordSimilarity({ a: 'What is programming?', b: 'What is programming?'
     });
    assert.equal(similarity, 1.0);
  });

  test('should return positive similarity for similar questions', () => {
    const similarity = keywordSimilarity({ a: 'What is programming?', b: 'What is computer programming?'
     });
    // Both questions share "programming" keyword, so similarity should be positive
    assert.ok(similarity > 0);
  });

  test('should return low similarity for different questions', () => {
    const similarity = keywordSimilarity({ a: 'What is programming?', b: 'How is the weather today?'
     });
    assert.ok(similarity < 0.5);
  });

  test('should return 0 for completely different questions', () => {
    const similarity = keywordSimilarity({ a: 'foo bar baz', b: 'xyz abc def' });
    assert.equal(similarity, 0);
  });
});

describe('findBestMatch', () => {
  const testDatabase = new Map([
    ['What is your name?', 'My name is Claude'],
    ['How old are you?', "I don't have an age"],
    ['What programming languages do you know?', 'I can help with many languages'],
    ['Как вас зовут?', 'Меня зовут Клод'],
  ]);

  test('should return exact match with score 1.0', () => {
    const result = findBestMatch({ question: 'What is your name?', qaDatabase: testDatabase });
    assert.equal(result.question, 'What is your name?');
    assert.equal(result.score, 1.0);
    assert.equal(result.answer, 'My name is Claude');
  });

  test('should find similar question with low threshold', () => {
    // Use a lower threshold since the similarity depends on keyword overlap
    const result = findBestMatch({ question: 'What is your age?', qaDatabase: testDatabase, threshold: 0.2 });
    assert.ok(result !== null);
    assert.ok(result.score > 0.2);
  });

  test('should return null when no match above threshold', () => {
    const result = findBestMatch({ question: 'Random unrelated question about weather', qaDatabase: testDatabase,
      threshold: 0.9
    });
    assert.equal(result, null);
  });

  test('should respect threshold option', () => {
    const result = findBestMatch({ question: 'name?', qaDatabase: testDatabase, threshold: 0.1 });
    assert.ok(result !== null);
  });

  test('should handle Russian questions', () => {
    const result = findBestMatch({ question: 'Как вас зовут?', qaDatabase: testDatabase });
    assert.equal(result.question, 'Как вас зовут?');
    assert.equal(result.score, 1.0);
  });
});

describe('findAllMatches', () => {
  const testDatabase = new Map([
    ['What is your name?', 'Claude'],
    ['What is your age?', 'Unknown'],
    ['What is your favorite color?', 'No preference'],
    ['How are you today?', 'I am fine'],
  ]);

  test('should return all matches above threshold', () => {
    const matches = findAllMatches({ question: 'What is your name?', qaDatabase: testDatabase, threshold: 0.3 });
    assert.ok(matches.length >= 1);
    assert.equal(matches[0].score, 1.0); // Exact match should be first
  });

  test('should sort matches by score descending', () => {
    const matches = findAllMatches({ question: 'What is your name?', qaDatabase: testDatabase, threshold: 0.1 });
    for (let i = 1; i < matches.length; i++) {
      assert.ok(matches[i - 1].score >= matches[i].score);
    }
  });

  test('should return empty array when no matches', () => {
    const matches = findAllMatches({ question: 'Completely unrelated question', qaDatabase: testDatabase,
      threshold: 0.9
    });
    assert.deepEqual(matches, []);
  });

  test('should include answer in results', () => {
    const matches = findAllMatches({ question: 'What is your name?', qaDatabase: testDatabase, threshold: 0.9 });
    assert.ok(matches.length > 0);
    assert.equal(matches[0].answer, 'Claude');
  });
});
