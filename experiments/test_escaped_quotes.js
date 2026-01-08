// Test parsing escaped quotes
import { Parser, Link, LinksGroup, formatLinks } from '../js/node_modules/links-notation/dist/index.js';

const parser = new Parser();

// Test escaped quotes in lino format
const escapedFormat = `test-id:
  message "He said ""hello"""`;

console.log("=== Testing escaped quotes ===");
console.log("Input:");
console.log(escapedFormat);

try {
  const result = parser.parse(escapedFormat);
  console.log("\nParsed result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Parse error:", e.message);
}

// Test with single quotes
const singleQuoteFormat = `test-id:
  message 'He said "hello"'`;

console.log("\n=== Testing single quotes wrapping double quotes ===");
console.log("Input:");
console.log(singleQuoteFormat);

try {
  const result = parser.parse(singleQuoteFormat);
  console.log("\nParsed result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Parse error:", e.message);
}
