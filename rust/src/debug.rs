//! Opt-in tracing for the codec.
//!
//! Tracing is off by default and writes nothing. It is turned on either by
//! setting the `LINO_CODEC_DEBUG` environment variable to a truthy value
//! (`1`, `true`, `yes`, `on`) or by calling [`set_debug_enabled`] from code.
//!
//! The same switch and the same environment variable exist in the JavaScript,
//! Python and C# implementations, so a problem can be traced the same way in
//! every language.

use std::sync::atomic::{AtomicU8, Ordering};

/// Name of the environment variable that turns tracing on.
pub const DEBUG_ENV_VAR: &str = "LINO_CODEC_DEBUG";

const TRUTHY: [&str; 4] = ["1", "true", "yes", "on"];

/// `0` = follow the environment, `1` = forced off, `2` = forced on.
static OVERRIDE: AtomicU8 = AtomicU8::new(0);

/// Whether tracing is currently on.
pub fn is_debug_enabled() -> bool {
    match OVERRIDE.load(Ordering::Relaxed) {
        1 => false,
        2 => true,
        _ => std::env::var(DEBUG_ENV_VAR)
            .is_ok_and(|raw| TRUTHY.contains(&raw.trim().to_ascii_lowercase().as_str())),
    }
}

/// Turn tracing on or off from code, overriding the environment variable.
///
/// # Arguments
///
/// * `enabled` - `Some(true)`/`Some(false)` to force, `None` to follow the environment
pub fn set_debug_enabled(enabled: Option<bool>) {
    let value = match enabled {
        None => 0,
        Some(false) => 1,
        Some(true) => 2,
    };
    OVERRIDE.store(value, Ordering::Relaxed);
}

/// Emit a trace message when tracing is on.
///
/// The message is built by a closure so that building it costs nothing while
/// tracing is off, which is the normal case.
///
/// # Arguments
///
/// * `scope` - Where the message comes from, for example `readable.decode`
/// * `message` - Builds the message text
pub fn trace<F: FnOnce() -> String>(scope: &str, message: F) {
    if !is_debug_enabled() {
        return;
    }
    eprintln!("[lino-codec] {}: {}", scope, message());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_turns_tracing_on_and_off() {
        set_debug_enabled(Some(true));
        assert!(is_debug_enabled());
        set_debug_enabled(Some(false));
        assert!(!is_debug_enabled());
        set_debug_enabled(None);
    }

    #[test]
    fn trace_builds_nothing_while_off() {
        set_debug_enabled(Some(false));
        trace("test", || panic!("must not be called while tracing is off"));
        set_debug_enabled(None);
    }
}
