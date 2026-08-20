/**
 * Opt-in tracing for the codec.
 *
 * Tracing is off by default and writes nothing. It is turned on either by
 * setting the `LINO_CODEC_DEBUG` environment variable to a truthy value
 * (`1`, `true`, `yes`, `on`) or by calling {@link setDebugEnabled} from code.
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
 * Whether tracing is currently on.
 * @returns {boolean} True when trace messages are emitted
 */
export function isDebugEnabled() {
  if (overridden !== null) {
    return overridden;
  }
  const raw = process.env[DEBUG_ENV_VAR];
  return raw !== undefined && TRUTHY.has(raw.trim().toLowerCase());
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
  process.stderr.write(`[lino-codec] ${scope}: ${message()}\n`);
}
