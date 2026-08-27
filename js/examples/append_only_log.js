/**
 * Writing an append-only log with one record per line (issue #43).
 *
 * `encodeLine` keeps a record on one line, so appending is one write, a
 * compactor can cut the file at any newline, and `grep`, `tail -f` and `wc -l`
 * all treat one line as one event. `decodeLine` reads a line back exactly.
 */

import assert from 'node:assert';
import { encodeLine, decodeLine } from '../src/index.js';

const record = (phase, bytes, complete) => ({ phase, bytes, complete });

function main() {
  console.log('=== Append-only log, one record per line ===\n');

  // Appending: each record becomes exactly one line of the file.
  const entries = [
    record('stream_start', 0, false),
    record('stream_chunk', 1024, false),
    record('stream_end', 2827, true),
  ];
  const log = entries
    .map((entry) => `${encodeLine({ obj: entry })}\n`)
    .join('');
  process.stdout.write(log);

  // Counting: one line is one event, so `wc -l` answers how many there were.
  const lines = log.trimEnd().split('\n');
  console.log(`\nrecords: ${lines.length}`);

  // Reading: a line reader hands over one record at a time.
  const decoded = decodeLine({ notation: lines[lines.length - 1] });
  console.log(`last record: ${JSON.stringify(decoded)}`);
  assert.deepStrictEqual(decoded, record('stream_end', 2827, true));

  // Filtering: the text stays readable, so plain string tools still work.
  const finished = lines.filter((line) => line.includes('(complete true)'));
  console.log(`finished records: ${finished.length}`);
}

main();
