//! Startup crash diagnostics.
//!
//! Release builds set `windows_subsystem = "windows"` (see `main.rs`), so the
//! process has no console attached: a panic before the window opens kills the
//! app with no output and no window at all.  From a packaged build every cause
//! then looks identical — an MSIX that "launches and closes immediately" tells
//! you nothing about whether a bundled resource was dropped, the data dir was
//! unwritable, or the database failed to open.
//!
//! `install_panic_hook` makes those failures self-reporting: the panic message,
//! its source location and a backtrace are appended to a log file in the temp
//! directory, and a native dialog points the user at that file.

use std::io::Write as _;
use std::panic::PanicHookInfo;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Where crash reports are appended: `%TEMP%` on Windows, `$TMPDIR` on Unix.
///
/// Deliberately *not* the app data dir — failing to create that directory is
/// itself one of the startup failures this needs to report, and under MSIX the
/// install dir is read-only.  The temp dir is writable in every packaging mode.
pub fn crash_log_path() -> PathBuf {
    std::env::temp_dir().join("AyahLab-crash.log")
}

/// Install the reporting panic hook.  Call once, as early in startup as
/// possible; the previous hook still runs afterwards so `cargo run` keeps its
/// usual stderr output.
pub fn install_panic_hook() {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let report = build_report(info);
        let log = crash_log_path();
        let written = append_report(&log, &report).is_ok();
        alert(summary(&report), if written { Some(&log) } else { None });
        previous(info);
    }));
}

fn build_report(info: &PanicHookInfo<'_>) -> String {
    let location = info
        .location()
        .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
        .unwrap_or_else(|| "<unknown location>".to_string());
    let exe = std::env::current_exe()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "<unknown>".to_string());

    format!(
        "[{}] AyahLab panicked during startup\n  {}\n  at {}\n  exe: {}\n\nbacktrace:\n{}\n\n",
        utc_timestamp(SystemTime::now()),
        panic_message(info),
        location,
        exe,
        std::backtrace::Backtrace::force_capture(),
    )
}

fn panic_message(info: &PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "<non-string panic payload>".to_string()
    }
}

/// The report minus the backtrace — short enough for a dialog box.
fn summary(report: &str) -> &str {
    match report.find("\nbacktrace:") {
        Some(i) => &report[..i],
        None => report,
    }
}

fn append_report(path: &Path, report: &str) -> std::io::Result<()> {
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    file.write_all(report.as_bytes())
}

fn utc_timestamp(now: SystemTime) -> String {
    let secs = match now.duration_since(UNIX_EPOCH) {
        Ok(d) => d.as_secs() as i64,
        Err(_) => return "<clock before epoch>".to_string(),
    };
    let (year, month, day) = civil_from_days(secs.div_euclid(86_400));
    let tod = secs.rem_euclid(86_400);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        tod / 3600,
        (tod % 3600) / 60,
        tod % 60,
    )
}

/// Howard Hinnant's `civil_from_days`: days since 1970-01-01 → (year, month,
/// day).  Inlined rather than pulling in a date crate for one log line.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

#[cfg(target_os = "windows")]
fn alert(summary: &str, log: Option<&Path>) {
    use std::os::windows::ffi::OsStrExt as _;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, MB_ICONERROR, MB_OK, MB_SETFOREGROUND,
    };

    fn wide(s: &str) -> Vec<u16> {
        std::ffi::OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
    }

    let body = match log {
        Some(path) => format!("{summary}\nFull report: {}", path.display()),
        None => summary.to_string(),
    };
    let text = wide(&body);
    let caption = wide("AyahLab failed to start");

    // SAFETY: both buffers are NUL-terminated and live until the call returns.
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR | MB_SETFOREGROUND,
        );
    }
}

/// A double-clicked `.app` has no console either, so surface the same report.
#[cfg(target_os = "macos")]
fn alert(summary: &str, log: Option<&Path>) {
    let body = match log {
        Some(path) => format!("{summary}\nFull report: {}", path.display()),
        None => summary.to_string(),
    };
    // AppleScript string literals escape only backslash and double quote.
    let escaped = body.replace('\\', r"\\").replace('"', "\\\"");
    let script = format!(
        "display dialog \"{escaped}\" with title \"AyahLab failed to start\" \
         buttons {{\"OK\"}} default button \"OK\" with icon stop"
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status();
}

/// Linux desktop launchers surface stderr in the journal, so the log file plus
/// the default hook is enough; no dialog dependency is worth adding.
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn alert(_summary: &str, _log: Option<&Path>) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn at(secs: u64) -> String {
        utc_timestamp(UNIX_EPOCH + Duration::from_secs(secs))
    }

    #[test]
    fn formats_the_epoch() {
        assert_eq!(at(0), "1970-01-01 00:00:00 UTC");
    }

    #[test]
    fn formats_a_known_instant() {
        // 2026-08-12T03:25:45Z
        assert_eq!(at(1_786_505_145), "2026-08-12 03:25:45 UTC");
    }

    #[test]
    fn handles_leap_days() {
        // 2024-02-29T12:00:00Z
        assert_eq!(at(1_709_208_000), "2024-02-29 12:00:00 UTC");
    }

    #[test]
    fn summary_drops_the_backtrace() {
        let report = "boom\n  at src/lib.rs:1:1\n\nbacktrace:\n   0: foo\n";
        assert_eq!(summary(report), "boom\n  at src/lib.rs:1:1\n");
    }

    #[test]
    fn summary_survives_a_missing_backtrace() {
        assert_eq!(summary("boom"), "boom");
    }
}
