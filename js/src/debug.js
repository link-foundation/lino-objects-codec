/**
 * Opt-in tracing for the codec.
 *
 * Tracing is off by default and writes nothing. It is turned on either by
 * setting the `LINO_CODEC_DEBUG` environment variable to a truthy value
 * (`1`, `true`, `yes`, `on`) or by calling {@link setDebugEnabled} from code.
 *
 * The module also runs where there is no `process` global, such as a browser
 * bundle: there the environment variable is treated as unset, and trace lines
 * go to `console.debug` instead of `process.stderr`.
 *
 * The same switch and the same environment variable exist in the Python, Rust
 * and C# implementations, so a problem can be traced the same way in every
 * language.
 *
 * @module debug
 */

/** Name of the environment variable that turns tracing on. */
export const DEBUG_ENV_VAR = 'LINO_CODEC_DEBUG';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

let overridden = null;

/**
 * The Node.js `process` object, or `undefined` where there is none (a browser
 * bundle built by Vite, esbuild or Rollup has no `process` global).
 * @returns {NodeJS.Process|undefined}
 */
function nodeProcess() {
  return typeof globalThis.process === 'object' && globalThis.process !== null
    ? globalThis.process
    : undefined;
}

/**
 * Read an environment variable, or `undefined` when the runtime has no
 * environment.
 * @param {string} name - Variable name
 * @returns {string|undefined} The value
 */
function readEnv(name) {
  const env = nodeProcess()?.env;
  return env ? env[name] : undefined;
}

/**
 * Whether tracing is currently on.
 * @returns {boolean} True when trace messages are emitted
 */
export function isDebugEnabled() {
  if (overridden !== null) {
    return overridden;
  }
  const raw = readEnv(DEBUG_ENV_VAR);
  return typeof raw === 'string' && TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Turn tracing on or off from code, overriding the environment variable.
 * @param {boolean|null} enabled - True/false to force, null to follow the environment
 */
export function setDebugEnabled(enabled) {
  overridden = enabled === null ? null : Boolean(enabled);
}

/**
 * Emit a trace message when tracing is on.
 *
 * The message is passed as a function so that building it costs nothing while
 * tracing is off, which is the normal case.
 *
 * @param {string} scope - Where the message comes from, for example `readable.decode`
 * @param {() => string} message - Builds the message text
 */
export function trace(scope, message) {
  if (!isDebugEnabled()) {
    return;
  }
  const line = `[lino-codec] ${scope}: ${message()}`;
  const stderr = nodeProcess()?.stderr;
  if (stderr && typeof stderr.write === 'function') {
    stderr.write(`${line}\n`);
  } else {
    console.debug(line);
  }
}
