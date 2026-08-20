/**
 * Basic usage examples for lino-objects-codec.
 */

import {
  encode,
  encodeCompact,
  decode,
  formatIndented,
  parseIndented,
} from '../src/index.js';

function runReadableIndentedExample() {
  console.log('1. Readable Indented Data:');
  const repositoryData = {
    title: 'Indian Law',
    defaultLanguage: 'en',
    maxLines: 1500,
    nested: { ok: true },
    items: ['a', 1],
  };
  const readableLino = formatIndented({
    id: 'obj_root',
    obj: repositoryData,
  });
  console.log(readableLino);
  const parsedReadable = parseIndented({ text: readableLino });
  console.log(
    `  Parsed match: ${JSON.stringify(parsedReadable.obj) === JSON.stringify(repositoryData)}`
  );
}

function runTypedBasicValuesExample() {
  console.log('\n2. Typed Basic Values:');
  const basicExamples = [
    null,
    undefined,
    true,
    false,
    42,
    3.14,
    'Hello, World!',
    'Unicode: 你好世界 🌍',
  ];

  for (const obj of basicExamples) {
    const encoded = encode({ obj });
    const decoded = decode({ notation: encoded });
    const encodedPreview = encoded.substring(0, 50);
    console.log(
      `  ${String(obj).padEnd(30)} -> ${encodedPreview.padEnd(50)} -> ${decoded}`
    );
    // Handle NaN case (NaN !== NaN)
    const isEqual = (obj !== obj && decoded !== decoded) || decoded === obj;
    if (!isEqual) {
      console.error(`  ERROR: Mismatch for ${obj}`);
    }
  }
}

function runTypedCollectionsExample() {
  console.log('\n3. Typed Collections:');
  const arrayExample = [1, 2, 3, 'hello', true];
  const objectExample = { name: 'Alice', age: 30, active: true };

  console.log(`  Array: ${JSON.stringify(arrayExample)}`);
  const encodedArray = encode({ obj: arrayExample });
  console.log(`  Encoded: ${encodedArray}`);
  const decodedArray = decode({ notation: encodedArray });
  console.log(`  Decoded: ${JSON.stringify(decodedArray)}`);
  console.log(
    `  Match: ${JSON.stringify(decodedArray) === JSON.stringify(arrayExample)}`
  );

  console.log(`\n  Object: ${JSON.stringify(objectExample)}`);
  const encodedObject = encode({ obj: objectExample });
  console.log(`  Encoded: ${encodedObject}`);
  const decodedObject = decode({ notation: encodedObject });
  console.log(`  Decoded: ${JSON.stringify(decodedObject)}`);
  console.log(
    `  Match: ${JSON.stringify(decodedObject) === JSON.stringify(objectExample)}`
  );
}

function runTypedNestedStructuresExample() {
  console.log('\n4. Typed Nested Structures:');
  const nested = {
    users: [
      { id: 1, name: 'Alice', admin: true },
      { id: 2, name: 'Bob', admin: false },
    ],
    metadata: { version: 1, count: 2 },
  };
  console.log(`  Original: ${JSON.stringify(nested)}`);
  const encodedNested = encode({ obj: nested });
  console.log(`  Encoded length: ${encodedNested.length} characters`);
  const decodedNested = decode({ notation: encodedNested });
  console.log(`  Decoded: ${JSON.stringify(decodedNested)}`);
  console.log(
    `  Match: ${JSON.stringify(decodedNested) === JSON.stringify(nested)}`
  );
}

function runCircularReferencesExample() {
  console.log('\n5. Circular References:');
  // Object identity is a property of the compact format, which names shared
  // nodes with `obj_N` ids. The readable format writes a plain tree, so it
  // rejects a cycle instead of silently unrolling it.

  // Self-referencing array
  const arr = [1, 2, 3];
  arr.push(arr);
  console.log('  Created self-referencing array');
  const encodedCircular = encodeCompact({ obj: arr });
  console.log(`  Encoded: ${encodedCircular}`);
  const decodedCircular = decode({ notation: encodedCircular });
  console.log(
    `  Decoded correctly: ${JSON.stringify(decodedCircular.slice(0, 3)) === '[1,2,3]'}`
  );
  console.log(
    `  Circular reference preserved: ${decodedCircular[3] === decodedCircular}`
  );
  if (decodedCircular[3] !== decodedCircular) {
    console.error('  ERROR: Circular reference not preserved!');
  }

  // Self-referencing object
  const obj = { name: 'root' };
  obj.self = obj;
  console.log('\n  Created self-referencing object');
  const encodedObjectCircular = encodeCompact({ obj });
  console.log(`  Encoded: ${encodedObjectCircular}`);
  const decodedObjectCircular = decode({ notation: encodedObjectCircular });
  console.log(`  Decoded correctly: ${decodedObjectCircular.name === 'root'}`);
  console.log(
    `  Circular reference preserved: ${decodedObjectCircular.self === decodedObjectCircular}`
  );
  if (decodedObjectCircular.self !== decodedObjectCircular) {
    console.error('  ERROR: Circular reference not preserved!');
  }
}

function runSharedReferencesExample() {
  console.log('\n6. Shared Object References:');
  // Also a compact-format property, for the same reason.
  const shared = { shared: 'data', value: 42 };
  const container = { first: shared, second: shared, third: shared };
  console.log('  Created container with 3 references to same object');
  const encodedShared = encodeCompact({ obj: container });
  console.log(`  Encoded: ${encodedShared}`);
  const decodedShared = decode({ notation: encodedShared });
  const allSame =
    decodedShared.first === decodedShared.second &&
    decodedShared.second === decodedShared.third;
  console.log(`  All three references point to same object: ${allSame}`);
  if (!allSame) {
    console.error('  ERROR: Shared references not preserved!');
  }

  // Modify through one reference
  decodedShared.first.modified = true;
  console.log(
    `  Modified through 'first', visible in 'second': ${decodedShared.second.modified === true}`
  );
  if (decodedShared.second.modified !== true) {
    console.error(
      '  ERROR: Modification not visible through shared reference!'
    );
  }
}

function runOutputFormatsExample() {
  console.log('\n7. Output Formats:');
  const data = {
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
    count: 2,
  };

  // The default output is readable: values are written as they are.
  const readable = encode({ obj: data });
  console.log('  Readable (default):');
  console.log(readable);

  // The compact form carries a type marker per value and base64 encodes strings.
  const compact = encodeCompact({ obj: data });
  console.log(`  Compact: ${compact}`);

  // `decode` recognises both.
  const fromReadable = JSON.stringify(decode({ notation: readable }));
  const fromCompact = JSON.stringify(decode({ notation: compact }));
  console.log(
    `  Both decode back to the same value: ${fromReadable === JSON.stringify(data) && fromCompact === JSON.stringify(data)}`
  );

  // A cycle has no readable form; use the compact one.
  const cyclic = {};
  cyclic.self = cyclic;
  try {
    encode({ obj: cyclic });
    console.error('  ERROR: a cycle should not be writable as readable text!');
  } catch (error) {
    console.log(`  Readable format rejects a cycle: ${error.name}`);
  }
}

function main() {
  console.log('=== Link Notation Objects Codec Examples ===\n');

  runReadableIndentedExample();
  runTypedBasicValuesExample();
  runTypedCollectionsExample();
  runTypedNestedStructuresExample();
  runCircularReferencesExample();
  runSharedReferencesExample();
  runOutputFormatsExample();

  console.log('\n=== All examples completed successfully! ===');
}

main();
