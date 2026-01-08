#!/usr/bin/env node

// Test lino-arguments library parsing

console.log('process.argv:', process.argv);

const { use } = eval(
  await (await fetch('https://unpkg.com/use-m/use.js')).text()
);

const { makeConfig } = await use('lino-arguments');

const config = makeConfig({
  yargs: ({ yargs, getenv }) =>
    yargs
      .option('version', {
        type: 'string',
        default: getenv('VERSION', ''),
        describe: 'Version number',
      })
      .option('repository', {
        type: 'string',
        default: getenv('REPOSITORY', ''),
        describe: 'GitHub repository',
      })
      .option('tag-prefix', {
        type: 'string',
        default: getenv('TAG_PREFIX', 'rust-v'),
        describe: 'Tag prefix for the release',
      }),
});

console.log('Parsed config:', JSON.stringify(config, null, 2));
console.log('version:', config.version);
console.log('repository:', config.repository);
console.log('tagPrefix:', config.tagPrefix);
