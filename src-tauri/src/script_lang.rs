//! Finding R and Python on the user's machine.
//!
//! Julia and Lean are toolchains this app can install itself, through juliaup
//! and elan, so they get modules that manage a download, a version and an
//! update. R and Python are different: on every platform they are either
//! already present or installed through the system's own package manager, and
//! a copy this app downloaded into its own directory would be the wrong one —
//! it would miss the user's site-packages, their virtualenv, their CRAN
//! library. So this module only *locates* them and reads their version; the
//! front end points the user at the right installer when there is nothing to
//! find.

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::{AppHandle, Manager};

/// Where a language's interpreter was found, and what version it reports.
#[derive(serde::Serialize)]
pub struct ScriptBinary {
    /// Absolute path to the executable.
    pub path:    String,
    /// The name it was found under — `python3` and `python` are both common,
    /// and the front end shows which one a session is actually running.
    pub name:    String,
    /// Whatever `<bin> --version` printed, trimmed. Empty if it would not run.
    pub version: String,
}

/// First match for `name` on PATH, without spawning anything.
fn on_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        #[cfg(windows)]
        let candidates = [
            dir.join(format!("{name}.exe")),
            dir.join(format!("{name}.bat")),
            dir.join(format!("{name}.cmd")),
        ];
        #[cfg(not(windows))]
        let candidates = [dir.join(name)];

        for candidate in candidates {
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Run `<bin> <arg>` and return its output, stdout or stderr.
///
/// Both streams are read because the two languages disagree: `python --version`
/// printed to stderr until 3.4, and `R --version` writes a multi-line banner to
/// stdout. Only the first line is kept — that is the version line in both.
fn version_of(path: &Path, arg: &str) -> String {
    let Ok(out) = Command::new(path).arg(arg).output() else {
        return String::new();
    };
    let stdout = String::from_utf8_lossy(&out.stdout);
    let stderr = String::from_utf8_lossy(&out.stderr);
    let text = if stdout.trim().is_empty() { stderr } else { stdout };
    text.lines().next().unwrap_or("").trim().to_string()
}

/// Directories the platform installs these languages into, outside PATH.
///
/// PATH alone is not enough. A GUI app on macOS is launched by the window
/// server, not by a shell, so it inherits the system PATH and never sees the
/// one the user's `.zshrc` builds — which is where Homebrew, pyenv and conda
/// put themselves, so a machine with a perfectly good `python3` looks empty.
/// Windows is worse: neither the R installer nor the python.org installer adds
/// itself to PATH by default, so the usual case is that nothing is on it.
///
/// Entries ending in `*` match a versioned directory by prefix, newest first —
/// `R-4.4.1`, `Python312`, and so on.
fn well_known_dirs(language: &str) -> Vec<String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();

    #[cfg(target_os = "macos")]
    let dirs: Vec<String> = match language {
        "r" => vec![
            // The CRAN installer's framework layout, then the two Homebrew
            // prefixes — Apple silicon and Intel.
            "/Library/Frameworks/R.framework/Resources/bin".into(),
            "/opt/homebrew/bin".into(),
            "/usr/local/bin".into(),
        ],
        _ => vec![
            "/Library/Frameworks/Python.framework/Versions/*/bin".into(),
            "/opt/homebrew/bin".into(),
            "/usr/local/bin".into(),
            format!("{home}/.pyenv/shims"),
            format!("{home}/miniconda3/bin"),
            format!("{home}/anaconda3/bin"),
            format!("{home}/Library/Python/*/bin"),
        ],
    };

    #[cfg(target_os = "windows")]
    let dirs: Vec<String> = {
        let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let files = std::env::var("ProgramFiles").unwrap_or_else(|_| "C:\\Program Files".into());
        match language {
            "r" => vec![
                // The installer keeps a versioned directory per release, and
                // 64-bit builds nest one level deeper.
                format!("{files}\\R\\*\\bin\\x64"),
                format!("{files}\\R\\*\\bin"),
                format!("{local}\\Programs\\R\\*\\bin\\x64"),
                format!("{local}\\Programs\\R\\*\\bin"),
            ],
            _ => vec![
                format!("{local}\\Programs\\Python\\*"),
                format!("{local}\\Programs\\Python\\*\\Scripts"),
                "C:\\Python*".into(),
                format!("{local}\\Microsoft\\WindowsApps"),
                format!("{home}\\miniconda3"),
                format!("{home}\\anaconda3"),
            ],
        }
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let dirs: Vec<String> = match language {
        "r" => vec![
            "/usr/lib/R/bin".into(),
            "/usr/local/lib/R/bin".into(),
            "/usr/local/bin".into(),
        ],
        _ => vec![
            "/usr/local/bin".into(),
            format!("{home}/.pyenv/shims"),
            format!("{home}/miniconda3/bin"),
            format!("{home}/anaconda3/bin"),
            format!("{home}/.local/bin"),
        ],
    };

    dirs
}

/// Expand one `well_known_dirs` entry, resolving a trailing `*` segment.
///
/// Versioned directories are returned newest first by name, which for
/// `Python312` / `Python39` and `R-4.4.1` / `R-4.3.2` alike puts the most
/// recent install ahead of the others.
fn expand_dir(pattern: &str) -> Vec<PathBuf> {
    let Some(star) = pattern.find('*') else {
        return vec![PathBuf::from(pattern)];
    };

    // Split around the segment holding the star: parent / prefix* / rest.
    let (head, tail) = pattern.split_at(star);
    let sep = |c: char| c == '/' || c == '\\';
    let prefix_start = head.rfind(sep).map(|i| i + 1).unwrap_or(0);
    let parent = PathBuf::from(&head[..prefix_start.saturating_sub(1).max(0)]);
    let prefix = &head[prefix_start..];
    let rest = tail.strip_prefix('*').unwrap_or("");
    let rest = rest.trim_start_matches(sep);

    let Ok(entries) = std::fs::read_dir(&parent) else {
        return Vec::new();
    };
    let mut matches: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter(|e| e.file_name().to_string_lossy().starts_with(prefix))
        .map(|e| e.path())
        .collect();
    // Newest first, as far as the name tells us.
    matches.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    if rest.is_empty() {
        matches
    } else {
        matches.into_iter().map(|m| m.join(rest)).collect()
    }
}

/// Look for `name` in the platform's well-known install directories.
fn in_well_known(language: &str, name: &str) -> Option<PathBuf> {
    for pattern in well_known_dirs(language) {
        for dir in expand_dir(&pattern) {
            #[cfg(windows)]
            let candidate = dir.join(format!("{name}.exe"));
            #[cfg(not(windows))]
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Locate the first of `names` that exists, and read its version.
///
/// `names` is ordered by preference — for Python that is `python3`, `python`,
/// `py`, because a bare `python` is still Python 2 on some systems and the `py`
/// launcher is Windows-only. Returns `None` when the language is not installed,
/// which is what drives the install prompt.
#[tauri::command]
pub async fn find_script_binary(
    app:         AppHandle,
    language:    String,
    names:       Vec<String>,
    version_arg: String,
) -> Result<Option<ScriptBinary>, String> {
    // A path the user set in Settings wins over anything on PATH — that is the
    // whole point of setting it, usually to pick one particular virtualenv or
    // a build that is not first on PATH.
    if let Some(chosen) = load_override(&app, &language) {
        if chosen.is_file() {
            let version = version_of(&chosen, &version_arg);
            if !version.is_empty() {
                return Ok(Some(ScriptBinary {
                    path: chosen.to_string_lossy().into_owned(),
                    name: chosen
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_else(|| language.clone()),
                    version,
                }));
            }
        }
        // A stored path that has stopped working (an environment deleted, say)
        // falls through to auto-detection rather than leaving the language
        // broken until the user notices the setting.
    }

    // PATH first — it is what the user's own shell would find — then the
    // places each platform installs these languages when PATH says nothing.
    for name in &names {
        let Some(path) = on_path(name).or_else(|| in_well_known(&language, name)) else {
            continue;
        };
        let version = version_of(&path, &version_arg);
        // A binary that will not report a version is almost always a broken
        // shim — a `python3` stub on Windows that opens the Store, say — so
        // keep looking rather than handing back something that cannot run.
        if version.is_empty() {
            continue;
        }
        return Ok(Some(ScriptBinary {
            path: path.to_string_lossy().into_owned(),
            name: name.clone(),
            version,
        }));
    }
    Ok(None)
}


// ── A path the user chose themselves ─────────────────────────────────────────

/// Where the override for `language` is remembered, one small file each.
fn override_config(app: &AppHandle, language: &str) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|d| d.join(format!("{language}_path.txt")))
}

/// The interpreter the user pointed at, if any. Empty file = auto-detect.
fn load_override(app: &AppHandle, language: &str) -> Option<PathBuf> {
    let cfg = override_config(app, language)?;
    let text = std::fs::read_to_string(&cfg).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(PathBuf::from(trimmed))
    }
}

/// Read the stored override, for the settings panel to show.
#[tauri::command]
pub async fn get_script_path(app: AppHandle, language: String) -> Result<String, String> {
    Ok(load_override(&app, &language)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default())
}

/// Point a language at a particular interpreter, or clear it to auto-detect.
///
/// The path is validated before it is stored: a saved setting that silently
/// does not work is worse than a refusal, because the failure then surfaces
/// later as "the REPL will not start" with nothing pointing at the cause.
#[tauri::command]
pub async fn set_script_path(
    app:         AppHandle,
    language:    String,
    path:        String,
    version_arg: String,
) -> Result<Option<ScriptBinary>, String> {
    let trimmed = path.trim().to_string();
    let cfg = override_config(&app, &language).ok_or("no config directory")?;
    if let Some(parent) = cfg.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // Empty clears the override and hands the language back to auto-detection.
    if trimmed.is_empty() {
        let _ = std::fs::write(&cfg, b"");
        return Ok(None);
    }

    let candidate = PathBuf::from(&trimmed);
    if !candidate.is_file() {
        return Err(format!("{trimmed} is not a file"));
    }
    let version = version_of(&candidate, &version_arg);
    if version.is_empty() {
        return Err(format!("{trimmed} did not report a version — is it the right binary?"));
    }

    std::fs::write(&cfg, trimmed.as_bytes()).map_err(|e| e.to_string())?;
    Ok(Some(ScriptBinary {
        path:    trimmed,
        name:    candidate
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| language.clone()),
        version,
    }))
}
