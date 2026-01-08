// Test what links-notation can parse and format
import { Parser, Link, LinksGroup, formatLinks } from '../js/node_modules/links-notation/dist/index.js';

const parser = new Parser();

// Test the requested indented format from issue #17
const indentedFormat = `6dcf4c1b-ff3f-482c-95ab-711ea7d1b019
  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
  status "executed"
  command "echo test"
  exitCode "0"`;

console.log("=== Testing parsing of indented format ===");
console.log("Input:");
console.log(indentedFormat);
console.log("\n--- Parser output ---");
try {
  const result = parser.parse(indentedFormat);
  console.log("Parsed result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Parse error:", e.message);
}

// Test similar format with colon (standard lino indented syntax)
const linoIndented = `myId:
  uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
  status "executed"`;

console.log("\n=== Testing parsing of standard lino indented format ===");
console.log("Input:");
console.log(linoIndented);
console.log("\n--- Parser output ---");
try {
  const result = parser.parse(linoIndented);
  console.log("Parsed result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Parse error:", e.message);
}

// Test simple doublet format
const doublets = `uuid "6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"
status "executed"
command "echo test"
exitCode "0"`;

console.log("\n=== Testing parsing of doublets ===");
console.log("Input:");
console.log(doublets);
console.log("\n--- Parser output ---");
try {
  const result = parser.parse(doublets);
  console.log("Parsed result:", JSON.stringify(result, null, 2));
} catch (e) {
  console.log("Parse error:", e.message);
}

// Test formatting with Link
console.log("\n=== Testing Link formatting ===");
try {
  const link = new Link('myId', [
    new Link('uuid', [new Link('"6dcf4c1b-ff3f-482c-95ab-711ea7d1b019"')]),
    new Link('status', [new Link('"executed"')]),
  ]);
  console.log("Link toString:", link.toString());
  console.log("Link format(true):", link.format(true));
  console.log("Link format(false):", link.format(false));
} catch (e) {
  console.log("Format error:", e.message);
}
