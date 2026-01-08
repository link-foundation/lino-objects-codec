// Test using links-notation parser for indented format
import { Parser, Link, LinksGroup, formatLinks } from '../js/node_modules/links-notation/dist/index.js';

const parser = new Parser();

// The issue format (without colon after identifier)
const issueFormat = `6dcf4c1b-ff3f-482c-95ab-711ea7d1b019
  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
  status "executed"
  command "echo test"
  exitCode "0"`;

// Convert to standard lino format by adding colon after first line
function convertToLinoFormat(text) {
  const lines = text.split('\n');
  if (lines.length === 0) return text;
  // Add colon to first line if not present
  if (!lines[0].trim().endsWith(':')) {
    lines[0] = lines[0].trim() + ':';
  }
  return lines.join('\n');
}

console.log("=== Original format from issue ===");
console.log(issueFormat);

const linoFormat = convertToLinoFormat(issueFormat);
console.log("\n=== Converted to standard lino format ===");
console.log(linoFormat);

console.log("\n=== Parsing converted format ===");
try {
  const result = parser.parse(linoFormat);
  console.log("Parsed result:", JSON.stringify(result, null, 2));

  // Extract id and obj from parsed result
  if (result.length > 0) {
    const mainLink = result[0];
    const id = mainLink.id;
    const obj = {};

    for (const child of mainLink.values || []) {
      if (child.values && child.values.length === 2) {
        const key = child.values[0].id;
        const value = child.values[1].id;
        obj[key] = value;
      }
    }

    console.log("\n=== Extracted data ===");
    console.log("ID:", id);
    console.log("Object:", JSON.stringify(obj, null, 2));
  }
} catch (e) {
  console.log("Parse error:", e.message);
}

// Now test formatting back
console.log("\n=== Formatting with links-notation ===");
const link = new Link('6dcf4c1b-ff3f-482c-95ab-711ea7d1b019', [
  new Link(null, [new Link('uuid'), new Link('6dcf4c1b-ff3f-482c-95ab-711ea7d1b019')]),
  new Link(null, [new Link('status'), new Link('executed')]),
  new Link(null, [new Link('command'), new Link('echo test')]),
  new Link(null, [new Link('exitCode'), new Link('0')]),
]);

console.log("Format as standard lino:", link.format(true));
console.log("Format as lino with parens:", link.format(false));
