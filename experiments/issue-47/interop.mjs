#!/usr/bin/env node

/** JavaScript side of the cross-implementation round trip (issue #47). */

import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { encodeLine, decodeLine } from '../../js/src/index.js';

/** The record every implementation writes. */
const RECORD = {
  phase: 'stream_end',
  bytes: 2827,
  complete: true,
  server: { host: '127.0.0.1', port: 18878 },
  models: ['claude-haiku', 'claude-opus'],
};

const [mode, target] = process.argv.slice(2);

if (mode === 'write') {
  writeFileSync(target, `${encodeLine({ obj: RECORD })}\n`);
} else if (mode === 'read') {
  for (const name of readdirSync(target).sort()) {
    if (!name.endsWith('.lino')) continue;
    const notation = readFileSync(join(target, name), 'utf-8').trim();
    console.log(`js reading ${name}: ${encodeLine({ obj: decodeLine({ notation }) })}`);
  }
} else {
  console.error('usage: interop.mjs write <path> | read <dir>');
  process.exit(2);
}
