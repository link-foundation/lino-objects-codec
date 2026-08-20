import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MAX_LINES,
  WARN_LINES,
  checkDirectory,
  classifyLineCount,
  exitCodeForResult,
  main,
  warningAnnotation,
} from './check-file-size.mjs';

function makeRepo() {
  return mkdtempSync(path.join(tmpdir(), 'check-file-size-'));
}

function writeCSharpFileWithLines(filePath, lineCount) {
  const content = Array.from(
    { length: lineCount },
    (_, index) => `// line ${index + 1}`
  ).join('\n');
  writeFileSync(filePath, content);
}

function captureConsoleLog(callback) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.join(' '));
  };

  try {
    return { result: callback(), output: lines.join('\n') };
  } finally {
    console.log = originalLog;
  }
}

test('classifies the warning band without blocking', () => {
  assert.equal(classifyLineCount(WARN_LINES), 'within-limit');
  assert.equal(classifyLineCount(WARN_LINES + 1), 'warning');
  assert.equal(classifyLineCount(MAX_LINES), 'warning');
  assert.equal(
    exitCodeForResult({
      warnings: [{ file: 'src/near_limit.cs', lines: WARN_LINES + 1 }],
      violations: [],
    }),
    0
  );
});

test('classifies hard limit violations as failures', () => {
  assert.equal(classifyLineCount(MAX_LINES + 1), 'violation');
  assert.equal(
    exitCodeForResult({
      warnings: [],
      violations: [{ file: 'src/over_limit.cs', lines: MAX_LINES + 1 }],
    }),
    1
  );
});

test('reports warnings and violations separately', () => {
  const repo = makeRepo();
  try {
    const srcDir = path.join(repo, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeCSharpFileWithLines(path.join(srcDir, 'near_limit.cs'), WARN_LINES + 1);
    writeCSharpFileWithLines(path.join(srcDir, 'over_limit.cs'), MAX_LINES + 1);
    writeCSharpFileWithLines(path.join(srcDir, 'small.cs'), WARN_LINES);

    const result = checkDirectory(repo);

    assert.equal(result.files, 3);
    assert.deepEqual(result.warnings, [
      { file: 'src/near_limit.cs', lines: WARN_LINES + 1 },
    ]);
    assert.deepEqual(result.violations, [
      { file: 'src/over_limit.cs', lines: MAX_LINES + 1 },
    ]);
  } finally {
    rmSync(repo, { force: true, recursive: true });
  }
});

test('warning annotation uses the GitHub Actions format', () => {
  assert.equal(
    warningAnnotation({ file: 'src/near_limit.cs', lines: WARN_LINES + 1 }),
    `::warning file=src/near_limit.cs::File has ${WARN_LINES + 1} lines ` +
      `(approaching limit of ${MAX_LINES}). Consider extracting code to keep ` +
      `at or below ${WARN_LINES} lines and prevent concurrent PR merge limit ` +
      'violations.'
  );
});

test('main emits warning annotations without failing warning-only files', () => {
  const repo = makeRepo();
  try {
    const srcDir = path.join(repo, 'src');
    mkdirSync(srcDir, { recursive: true });
    writeCSharpFileWithLines(path.join(srcDir, 'near_limit.cs'), WARN_LINES + 1);

    const { result, output } = captureConsoleLog(() => main(repo));

    assert.equal(result, 0);
    assert.match(output, /::warning file=src\/near_limit\.cs::/);
    assert.match(output, /Checked 1 file\(s\) - all within the line limit/);
  } finally {
    rmSync(repo, { force: true, recursive: true });
  }
});
