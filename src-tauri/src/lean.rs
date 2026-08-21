//! Lean 4 support: toolchain detection/installation and file compilation.
//!
//! Unlike Julia — which is driven as a long-lived REPL process the app writes
//! statements into — Lean 4 is a batch compiler. The natural analogue of
//! VS Code's Lean Infoview is therefore "compile the current buffer and show
//! the elaborator's messages", which is exactly what `lean --json <file>`
//! produces: one JSON diagnostic per line, each carrying a severity, a source
//! range and the rendered message (including `#eval` / `#check` output, which
//! Lean reports as `information` diagnostics).
//!
//! Two independent *runtimes* exist, keyed by kernel name:
//!   * `"repl"` — backs the standalone `.lean` editor's infoview
//!   * `"cell"` — backs the Lean code cells embedded in the Lexical editor
//! Each gets its own scratch directory and its own in-flight process, so a
//! compile in one never cancels or contaminates the other. This mirrors the
//! two-kernel split in `julia.rs`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

/// Default kernel name when a command doesn't specify one.
const DEFAULT_KERNEL: &str = "repl";

/// Upper bound on a single compile.
///
/// Deliberately generous rather than snappy: `lean` is an elan *shim*, and when
/// the resolved toolchain isn't installed locally elan downloads it first —
/// hundreds of megabytes, several minutes, and nothing on stdout until it
/// finishes. A short timeout would make that state look like a broken editor
/// and abort the download on every retry. This bound exists to stop a genuine
/// hang (a non-terminating `#eval`, a runaway `decide`), not to police latency.
const COMPILE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

// ── State ────────────────────────────────────────────────────────────────────

/// A compile that is currently running for one kernel.
struct RunningCompile {
    /// OS process id, so a newer request can kill the one it supersedes.
    pid: Option<u32>,
    /// Monotonic request id. A finished compile only reports its result if it
    /// is still the newest request for its kernel — otherwise it was cancelled
    /// mid-flight by a keystroke and its diagnostics are already stale.
    generation: u64,
}

pub struct LeanState {
    /// User-specified `lean` binary path, persisted across sessions.
    pub custom_path: Mutex<Option<PathBuf>>,
    /// In-flight compile per kernel (`"repl"` / `"cell"`).
    running: Mutex<HashMap<String, RunningCompile>>,
    /// Next generation number, shared across kernels (uniqueness is all we need).
    next_generation: Mutex<u64>,
}

impl LeanState {
    pub fn new(custom_path: Option<PathBuf>) -> Self {
        Self {
            custom_path: Mutex::new(custom_path),
            running: Mutex::new(HashMap::new()),
            next_generation: Mutex::new(1),
        }
    }
}

// ── Custom-path persistence ──────────────────────────────────────────────────

pub fn lean_path_config(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("lean_path.txt"))
}

/// Load the persisted custom path at app startup (called from lib.rs setup).
pub fn load_persisted_path(app: &AppHandle) -> Option<PathBuf> {
    let cfg = lean_path_config(app)?;
    let s = std::fs::read_to_string(&cfg).ok()?;
    let trimmed = s.trim();
    if trimmed.is_empty() { None } else { Some(PathBuf::from(trimmed)) }
}

fn save_persisted_path(app: &AppHandle, path: &Path) {
    if let Some(cfg) = lean_path_config(app) {
        let _ = std::fs::write(cfg, path.to_string_lossy().as_bytes());
    }
}

fn clear_persisted_path(app: &AppHandle) {
    if let Some(cfg) = lean_path_config(app) {
        let _ = std::fs::write(cfg, b"");
    }
}

// ── Binary detection ─────────────────────────────────────────────────────────

/// Scan the system PATH directories for the `lean` binary without spawning a
/// subprocess — same reasoning as `julia.rs`: spawning `lean --version` on
/// Windows can stall for seconds behind process creation and AV scanning.
fn lean_in_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        #[cfg(windows)]
        let candidate = dir.join("lean.exe");
        #[cfg(not(windows))]
        let candidate = dir.join("lean");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Try to locate the `lean` binary. Priority:
///   1. User-supplied custom path (also what `install_lean` persists)
///   2. System PATH — filesystem scan, no subprocess spawning
///   3. elan's default install location (`~/.elan/bin/lean`)
///   4. Platform-specific common install directories
pub fn lean_binary_path(custom: Option<&Path>) -> Option<PathBuf> {
    if let Some(p) = custom {
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }

    if let Some(p) = lean_in_path() {
        return Some(p);
    }

    if let Some(home) = dirs::home_dir() {
        #[cfg(windows)]
        let candidate = home.join(".elan").join("bin").join("lean.exe");
        #[cfg(not(windows))]
        let candidate = home.join(".elan").join("bin").join("lean");
        if candidate.exists() {
            return Some(candidate);
        }
    }

    #[cfg(target_os = "macos")]
    {
        for p in &["/usr/local/bin/lean", "/opt/homebrew/bin/lean"] {
            let path = PathBuf::from(p);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for p in &["/usr/local/bin/lean", "/usr/bin/lean"] {
            let path = PathBuf::from(p);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(local_app_data) = dirs::data_local_dir() {
            let exe = local_app_data.join("elan").join("bin").join("lean.exe");
            if exe.exists() {
                return Some(exe);
            }
        }
    }

    None
}

/// `elan` resolves which toolchain a `lean` shim should dispatch to through
/// `ELAN_HOME`. A binary at `<root>/bin/lean` is such a shim, so hand the
/// spawned process `ELAN_HOME=<root>` — that keeps a toolchain installed into
/// the app's own data directory working without touching the user's PATH or
/// their `~/.elan`. Returns `None` for a plain (non-elan) `lean` binary.
fn elan_home_for(lean: &Path) -> Option<PathBuf> {
    let bin_dir = lean.parent()?;
    if bin_dir.file_name()? != "bin" {
        return None;
    }
    let root = bin_dir.parent()?;
    // Only claim it's an elan root if elan's own binary sits beside the shim.
    #[cfg(windows)]
    let elan_exe = bin_dir.join("elan.exe");
    #[cfg(not(windows))]
    let elan_exe = bin_dir.join("elan");
    if elan_exe.exists() {
        Some(root.to_path_buf())
    } else {
        None
    }
}

/// Apply the no-console-window flag on Windows. Every Lean subprocess goes
/// through this so a compile never flashes a terminal over the app.
macro_rules! no_window {
    ($cmd:expr) => {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            $cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
    };
}

// ── Detection commands ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_lean(state: State<'_, LeanState>) -> Result<String, String> {
    let custom = state.custom_path.lock().ok().and_then(|g| g.clone());
    let result = tokio::task::spawn_blocking(move || {
        if lean_binary_path(custom.as_deref()).is_some() {
            "installed".to_string()
        } else {
            "not_installed".to_string()
        }
    })
    .await
    .unwrap_or_else(|_| "not_installed".to_string());
    Ok(result)
}

/// Return the currently saved custom Lean binary path (empty string if none).
#[tauri::command]
pub fn get_lean_path(state: State<'_, LeanState>) -> String {
    state
        .custom_path
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Save a custom `lean` binary path. Returns `"installed"` when the path holds
/// a working Lean, or an error string describing what went wrong.
#[tauri::command]
pub fn set_lean_path(
    path: String,
    app: AppHandle,
    state: State<'_, LeanState>,
) -> Result<String, String> {
    let p = PathBuf::from(&path);

    if path.is_empty() {
        *state.custom_path.lock().map_err(|e| e.to_string())? = None;
        clear_persisted_path(&app);
        let custom = state.custom_path.lock().ok().and_then(|g| g.clone());
        return Ok(if lean_binary_path(custom.as_deref()).is_some() {
            "installed".to_string()
        } else {
            "not_installed".to_string()
        });
    }

    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let ok = {
        let mut cmd = std::process::Command::new(&p);
        cmd.arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        if let Some(home) = elan_home_for(&p) {
            cmd.env("ELAN_HOME", home);
        }
        no_window!(cmd);
        cmd.status().map(|s| s.success()).unwrap_or(false)
    };

    if !ok {
        return Err(format!("'{}' does not appear to be a valid Lean binary", path));
    }

    *state.custom_path.lock().map_err(|e| e.to_string())? = Some(p.clone());
    save_persisted_path(&app, &p);

    Ok("installed".to_string())
}

#[derive(Clone, serde::Serialize)]
struct InstallProgress {
    message: String,
}

#[tauri::command]
pub async fn get_lean_version(state: State<'_, LeanState>) -> Result<String, String> {
    let custom = state.custom_path.lock().ok().and_then(|g| g.clone());
    tokio::task::spawn_blocking(move || {
        let lean = lean_binary_path(custom.as_deref())
            .ok_or_else(|| "Lean is not installed".to_string())?;
        let mut cmd = std::process::Command::new(&lean);
        cmd.arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        if let Some(home) = elan_home_for(&lean) {
            cmd.env("ELAN_HOME", home);
        }
        no_window!(cmd);
        let output = cmd.output().map_err(|e| format!("Failed to run lean: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(parse_lean_version(&stdout))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Extract the bare version from `lean --version` output, which looks like
/// `Lean (version 4.33.0, arm64-apple-darwin24.6.0, commit abc…, Release)`.
/// Falls back to the whole string if the shape is unfamiliar, so the settings
/// panel shows *something* rather than an empty field.
fn parse_lean_version(raw: &str) -> String {
    raw.split("version ")
        .nth(1)
        .and_then(|rest| rest.split(|c: char| c == ',' || c == ')').next())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| raw.to_string())
}

/// Latest stable Lean 4 release tag from GitHub (e.g. `"4.15.0"`).
#[tauri::command]
pub async fn get_latest_lean_version() -> Result<String, String> {
    latest_stable_release("leanprover/lean4").await
}

/// List releases for `owner/repo` and return the first non-pre-release tag.
async fn latest_stable_release(repo: &str) -> Result<String, String> {
    let url = format!("https://api.github.com/repos/{repo}/releases");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "AyahLab/1.0")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;
    let releases = json.as_array().ok_or("Expected array of releases")?;
    for release in releases {
        if !release
            .get("prerelease")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            if let Some(tag) = release.get("tag_name").and_then(|v| v.as_str()) {
                return Ok(tag.trim_start_matches('v').to_string());
            }
        }
    }
    Err(format!("No stable release found for {repo}"))
}

// ── Installation (via elan) ──────────────────────────────────────────────────

/// Where the app keeps its own elan installation, so installing Lean never
/// requires admin rights, a shell profile edit, or a PATH change.
fn app_elan_home(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot find app data dir: {e}"))?
        .join("elan");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create elan dir: {e}"))?;
    Ok(dir)
}

/// elan's release asset for this platform, or `None` where elan publishes no
/// portable build (e.g. Windows on ARM).
fn elan_target() -> Option<&'static str> {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return Some("aarch64-apple-darwin");
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return Some("x86_64-apple-darwin");
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return Some("aarch64-unknown-linux-gnu");
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return Some("x86_64-unknown-linux-gnu");
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    return Some("x86_64-pc-windows-msvc");
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
    )))]
    return None;
}

/// Download elan's portable archive and unpack the single binary it contains
/// (named `elan-init` in every published archive) into `dest_dir`.
///
/// macOS/Linux ship `.tar.gz`; Windows ships `.zip`, which is expanded through
/// PowerShell rather than adding a zip crate to the dependency graph — the
/// archive is unpacked exactly once, at install time.
async fn fetch_elan_init(version: &str, dest_dir: &Path) -> Result<PathBuf, String> {
    use std::io::Read;

    let target = elan_target().ok_or_else(|| {
        "Automatic install isn't available for this platform. Please install Lean \
         from https://lean-lang.org/install/ and set the path manually."
            .to_string()
    })?;

    #[cfg(windows)]
    let (ext, exe) = ("zip", ".exe");
    #[cfg(not(windows))]
    let (ext, exe) = ("tar.gz", "");

    let url = format!(
        "https://github.com/leanprover/elan/releases/download/v{version}/elan-{target}.{ext}"
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed (HTTP {})", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read download: {e}"))?;

    let elan_init = dest_dir.join(format!("elan-init{exe}"));

    #[cfg(windows)]
    {
        let archive = dest_dir.join("elan.zip");
        std::fs::write(&archive, &bytes[..])
            .map_err(|e| format!("Failed to write archive: {e}"))?;
        let mut cmd = std::process::Command::new("powershell");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            &format!(
                "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                archive.display(),
                dest_dir.display()
            ),
        ]);
        no_window!(cmd);
        let status = cmd
            .status()
            .map_err(|e| format!("Failed to extract elan: {e}"))?;
        let _ = std::fs::remove_file(&archive);
        if !status.success() {
            return Err("Failed to extract the elan archive".to_string());
        }
    }

    #[cfg(not(windows))]
    {
        let decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(&bytes[..]));
        let mut archive = tar::Archive::new(decoder);
        let mut found = false;
        for entry in archive.entries().map_err(|e| format!("Bad archive: {e}"))? {
            let mut entry = entry.map_err(|e| format!("Bad archive entry: {e}"))?;
            let name = entry
                .path()
                .ok()
                .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string));
            // The archive root holds one binary; accept either name it has
            // shipped under rather than pinning to today's spelling.
            if !matches!(name.as_deref(), Some("elan-init") | Some("elan")) {
                continue;
            }
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read archive: {e}"))?;
            std::fs::write(&elan_init, &buf)
                .map_err(|e| format!("Failed to write elan binary: {e}"))?;
            found = true;
            break;
        }
        if !found {
            return Err("elan archive did not contain the expected binary".to_string());
        }
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&elan_init, std::fs::Permissions::from_mode(0o755))
            .map_err(|e| format!("chmod failed: {e}"))?;
    }

    if !elan_init.exists() {
        return Err("elan binary was not found after extraction".to_string());
    }
    Ok(elan_init)
}

/// Install Lean 4 by way of elan, into the app's own data directory.
/// Emits progress messages on `lean-install-progress`.
#[tauri::command]
pub async fn install_lean(app: AppHandle, state: State<'_, LeanState>) -> Result<(), String> {
    install_toolchain(app, state, "stable").await
}

/// Switch the managed elan install to a specific toolchain (`"stable"`,
/// `"4.15.0"`, `"leanprover/lean4:v4.15.0"`, …), installing elan first if the
/// app has never done so.
#[tauri::command]
pub async fn set_lean_toolchain(
    app: AppHandle,
    state: State<'_, LeanState>,
    version: String,
) -> Result<(), String> {
    let toolchain = if version.trim().is_empty() {
        "stable".to_string()
    } else {
        version.trim().to_string()
    };
    install_toolchain(app, state, &toolchain).await
}

/// Re-run the install against `stable`, which is how "update" is expressed for
/// an elan-managed toolchain: elan fetches the newest stable release and makes
/// it the default.
#[tauri::command]
pub async fn update_lean(app: AppHandle, state: State<'_, LeanState>) -> Result<(), String> {
    install_toolchain(app, state, "stable").await
}

/// Run an installer subprocess, forwarding its output to the UI as progress.
///
/// elan reports a multi-minute toolchain download on its own stdout/stderr,
/// redrawing a percentage in place with carriage returns. A GUI build has no
/// console for that to land in, so without this the install toast would sit on
/// one unchanging line for the whole download. Splitting on `\r` as well as
/// `\n` turns the redrawn bar into a stream of progress messages.
async fn run_streaming(
    app: &AppHandle,
    program: &Path,
    args: &[&str],
    elan_home: &Path,
) -> Result<(), String> {
    use tokio::io::AsyncReadExt;

    let mut cmd = tokio::process::Command::new(program);
    cmd.args(args)
        .env("ELAN_HOME", elan_home)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to run {}: {e}", program.display()))?;

    let mut stdout = child.stdout.take();
    let mut stderr = child.stderr.take();

    // Both streams are pumped concurrently: elan writes the progress bar to one
    // and diagnostics to the other, and letting either pipe fill would deadlock
    // the child.
    let pump = |mut reader: Option<tokio::process::ChildStdout>,
                app: AppHandle| async move {
        let Some(reader) = reader.take() else { return };
        emit_segments(reader, app).await;
    };
    let pump_err = |mut reader: Option<tokio::process::ChildStderr>,
                    app: AppHandle| async move {
        let Some(reader) = reader.take() else { return };
        emit_segments(reader, app).await;
    };

    async fn emit_segments<R>(mut reader: R, app: AppHandle)
    where
        R: tokio::io::AsyncRead + Unpin,
    {
        let mut buf = [0u8; 4096];
        let mut pending = String::new();
        loop {
            match reader.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    pending.push_str(&String::from_utf8_lossy(&buf[..n]));
                    // Emit every completed segment, keeping the partial tail.
                    while let Some(idx) = pending.find(['\n', '\r']) {
                        let segment = pending[..idx].trim().to_string();
                        pending.drain(..=idx);
                        if segment.is_empty() {
                            continue;
                        }
                        let _ = app.emit(
                            "lean-install-progress",
                            InstallProgress { message: segment },
                        );
                    }
                }
            }
        }
    }

    let app_out = app.clone();
    let app_err = app.clone();
    let (_, _, status) = tokio::join!(
        pump(stdout.take(), app_out),
        pump_err(stderr.take(), app_err),
        child.wait(),
    );

    let status = status.map_err(|e| format!("Failed to wait for elan: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("elan {} failed", args.join(" ")))
    }
}

async fn install_toolchain(
    app: AppHandle,
    state: State<'_, LeanState>,
    toolchain: &str,
) -> Result<(), String> {
    let emit = |msg: &str| {
        let _ = app.emit(
            "lean-install-progress",
            InstallProgress { message: msg.to_string() },
        );
    };

    let elan_home = app_elan_home(&app)?;

    #[cfg(windows)]
    let exe = ".exe";
    #[cfg(not(windows))]
    let exe = "";

    let elan_bin = elan_home.join("bin").join(format!("elan{exe}"));
    let lean_shim = elan_home.join("bin").join(format!("lean{exe}"));

    // `elan-init` bootstraps elan itself *and* installs a default toolchain in
    // one go, so it is only needed the first time. Afterwards the installed
    // `elan` binary handles toolchain changes.
    if !elan_bin.exists() {
        emit("Downloading elan (Lean version manager)…");
        let elan_version = latest_stable_release("leanprover/elan")
            .await
            .unwrap_or_else(|_| "4.1.2".to_string());
        let elan_init = fetch_elan_init(&elan_version, &elan_home).await?;

        emit(&format!("Installing Lean {toolchain} (this may take a few minutes)…"));
        run_streaming(
            &app,
            &elan_init,
            &["-y", "--no-modify-path", "--default-toolchain", toolchain],
            &elan_home,
        )
        .await
        .map_err(|e| format!("elan-init failed to install Lean: {e}"))?;
        let _ = std::fs::remove_file(&elan_init);
    } else {
        emit(&format!("Installing Lean {toolchain} (this may take a few minutes)…"));
        run_streaming(
            &app,
            &elan_bin,
            &["toolchain", "install", toolchain],
            &elan_home,
        )
        .await?;
        // Not fatal: the toolchain is installed either way, it just may not be
        // the one a bare `lean` resolves to.
        let _ = run_streaming(&app, &elan_bin, &["default", toolchain], &elan_home).await;
    }

    if !lean_shim.exists() {
        return Err(
            "Lean was installed but its launcher could not be found. Set the path \
             manually in Settings → Lean."
                .to_string(),
        );
    }

    // Point the app at the shim we just produced and persist it, exactly as the
    // Julia installer does — the portable install touches neither PATH nor the
    // user's home directory.
    if let Ok(mut guard) = state.custom_path.lock() {
        *guard = Some(lean_shim.clone());
    }
    save_persisted_path(&app, &lean_shim);

    emit(&format!("Lean {toolchain} installed successfully."));
    Ok(())
}

// ── Compilation ──────────────────────────────────────────────────────────────

/// One elaborator message, mapped onto the shape the infoview renders.
#[derive(Clone, serde::Serialize)]
pub struct LeanDiagnostic {
    /// `"error"` | `"warning"` | `"information"`
    severity: String,
    /// 1-based line, 0-based column — Lean's own convention, kept as-is so the
    /// infoview can print `line:col` matching what `lean` prints on a terminal.
    line: u32,
    column: u32,
    end_line: u32,
    end_column: u32,
    message: String,
}

#[derive(Clone, serde::Serialize)]
pub struct LeanCompileResult {
    diagnostics: Vec<LeanDiagnostic>,
    /// Anything the process wrote that wasn't a diagnostic (panics, usage
    /// errors, `IO.println` from a `main`). Shown verbatim in the infoview.
    raw: String,
    /// True when Lean reported no errors (warnings and info are fine).
    ok: bool,
    /// Wall-clock duration of the compile, for the infoview's status line.
    elapsed_ms: u64,
    /// True when a newer request for the same kernel superseded this one; the
    /// caller should discard the result rather than render it.
    cancelled: bool,
    /// True when the compile was killed for exceeding `COMPILE_TIMEOUT`.
    timed_out: bool,
}

/// Turn one `lean --json` output line into a diagnostic.
///
/// The JSON shape is `{"severity":…,"pos":{"line":…,"column":…},"endPos":…,
/// "data":…}`. `endPos` is null for a point message, and `caption` is usually
/// empty but is prepended when present (that's how `#check` labels its output).
fn parse_json_diagnostic(line: &str) -> Option<LeanDiagnostic> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    let pos = v.get("pos")?;
    let get_line = |p: &serde_json::Value| p.get("line").and_then(|n| n.as_u64()).unwrap_or(1) as u32;
    let get_col = |p: &serde_json::Value| p.get("column").and_then(|n| n.as_u64()).unwrap_or(0) as u32;

    let start_line = get_line(pos);
    let start_col = get_col(pos);
    let (end_line, end_column) = match v.get("endPos") {
        Some(p) if !p.is_null() => (get_line(p), get_col(p)),
        _ => (start_line, start_col),
    };

    let caption = v.get("caption").and_then(|c| c.as_str()).unwrap_or("").trim();
    let data = v.get("data").and_then(|d| d.as_str()).unwrap_or("").trim();
    let message = if caption.is_empty() {
        data.to_string()
    } else if data.is_empty() {
        caption.to_string()
    } else {
        format!("{caption}\n{data}")
    };

    Some(LeanDiagnostic {
        severity: v
            .get("severity")
            .and_then(|s| s.as_str())
            .unwrap_or("information")
            .to_string(),
        line: start_line,
        column: start_col,
        end_line,
        end_column,
        message,
    })
}

/// Fallback parser for Lean's plain-text diagnostics, used for any line that
/// isn't JSON — `lean` falls back to this format for a handful of front-end
/// errors that are emitted before `--json` takes effect.
///
/// Both `file:line:col: severity: message` and the range form
/// `file:line:col-line:col: severity: message` are recognised.
fn parse_text_diagnostic(line: &str) -> Option<LeanDiagnostic> {
    // Find the severity marker first — it bounds the position prefix and is
    // unambiguous, whereas a Windows path contains its own colons.
    let (head, severity, rest) = ["error: ", "warning: ", "information: ", "info: "]
        .iter()
        .find_map(|marker| {
            let idx = line.find(marker)?;
            let sev = marker.trim_end_matches(": ");
            let sev = if sev == "info" { "information" } else { sev };
            Some((&line[..idx], sev.to_string(), line[idx + marker.len()..].to_string()))
        })?;

    // head looks like "…/Main.lean:3:0: " — take the numeric tail.
    let head = head.trim_end().trim_end_matches(':');
    let mut nums: Vec<u32> = Vec::new();
    for part in head.rsplit(|c| c == ':' || c == '-') {
        match part.parse::<u32>() {
            Ok(n) => nums.push(n),
            Err(_) => break,
        }
    }
    nums.reverse();
    let (line_no, col, end_line, end_col) = match nums.as_slice() {
        [l, c] => (*l, *c, *l, *c),
        [l1, c1, l2, c2] => (*l1, *c1, *l2, *c2),
        _ => return None,
    };

    Some(LeanDiagnostic {
        severity,
        line: line_no,
        column: col,
        end_line,
        end_column: end_col,
        message: rest,
    })
}

/// Scratch directory for one kernel. Keeping it stable (rather than a fresh
/// temp dir per compile) means Lean's `.olean` output and any `lakefile` the
/// user drops in survive between runs, and the two kernels can never see each
/// other's files.
fn work_dir(app: &AppHandle, kernel: &str) -> Result<PathBuf, String> {
    // Kernel names come from our own call sites, but this path is joined into a
    // filesystem path — reject anything that isn't a plain identifier.
    if kernel.is_empty() || !kernel.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err(format!("Invalid kernel name: {kernel}"));
    }
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Cannot find app data dir: {e}"))?
        .join("lean-work")
        .join(kernel);
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create work dir: {e}"))?;
    Ok(dir)
}

/// Kill whatever compile is currently running for `kernel`, if any.
fn kill_running(state: &LeanState, kernel: &str) {
    let pid = {
        let guard = match state.running.lock() {
            Ok(g) => g,
            Err(_) => return,
        };
        guard.get(kernel).and_then(|r| r.pid)
    };
    let Some(pid) = pid else { return };

    #[cfg(unix)]
    {
        // SAFETY: kill(2) with a pid we spawned and a standard signal number.
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
    }
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        no_window!(cmd);
        let _ = cmd.status();
    }
}

/// Cancel the in-flight compile for a kernel without starting a new one —
/// used when the editor turns live compilation off, or unmounts.
#[tauri::command]
pub fn cancel_lean_compile(kernel: Option<String>, state: State<'_, LeanState>) {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());
    kill_running(&state, &kernel);
    if let Ok(mut guard) = state.running.lock() {
        guard.remove(&kernel);
    }
}

/// Compile a Lean 4 source buffer and return its elaborator messages.
///
/// Each call supersedes any compile still running for the same kernel, which
/// is what makes live (type-as-you-go) compilation viable: the newest keystroke
/// always wins and the stale process is killed rather than left to finish.
#[tauri::command]
pub async fn lean_compile(
    app: AppHandle,
    code: String,
    kernel: Option<String>,
    state: State<'_, LeanState>,
) -> Result<LeanCompileResult, String> {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());

    let lean = {
        let custom = state.custom_path.lock().map_err(|e| e.to_string())?.clone();
        lean_binary_path(custom.as_deref())
            .ok_or("Lean is not installed. Please install it or set the path manually.")?
    };

    let dir = work_dir(&app, &kernel)?;
    let file = dir.join("Main.lean");

    // Claim a generation and stop the compile this one replaces.
    let generation = {
        let mut next = state.next_generation.lock().map_err(|e| e.to_string())?;
        let g = *next;
        *next += 1;
        g
    };
    kill_running(&state, &kernel);
    {
        let mut guard = state.running.lock().map_err(|e| e.to_string())?;
        guard.insert(kernel.clone(), RunningCompile { pid: None, generation });
    }

    std::fs::write(&file, code.as_bytes())
        .map_err(|e| format!("Failed to write Lean source: {e}"))?;

    let started = std::time::Instant::now();

    let mut cmd = tokio::process::Command::new(&lean);
    cmd.arg("--json")
        .arg(&file)
        .current_dir(&dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(home) = elan_home_for(&lean) {
        cmd.env("ELAN_HOME", home);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Lean: {e}"))?;

    // Record the pid so a newer request (or an explicit cancel) can kill it.
    // If we were already superseded between the spawn and here, stop now.
    {
        let mut guard = state.running.lock().map_err(|e| e.to_string())?;
        match guard.get_mut(&kernel) {
            Some(entry) if entry.generation == generation => entry.pid = child.id(),
            _ => {
                return Ok(LeanCompileResult {
                    diagnostics: Vec::new(),
                    raw: String::new(),
                    ok: false,
                    elapsed_ms: 0,
                    cancelled: true,
                    timed_out: false,
                })
            }
        }
    }

    let output = match tokio::time::timeout(COMPILE_TIMEOUT, child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| format!("Lean process failed: {e}"))?,
        Err(_) => {
            // Dropping the future does not reap the process, so kill it by pid.
            kill_running(&state, &kernel);
            if let Ok(mut guard) = state.running.lock() {
                guard.remove(&kernel);
            }
            return Ok(LeanCompileResult {
                diagnostics: Vec::new(),
                raw: format!(
                    "Lean did not finish within {}s and was stopped.\n\n\
                     If this is the first compile after installing or changing \
                     toolchains, elan may have been downloading the Lean \
                     toolchain in the background — run `elan toolchain list` to \
                     check that the default toolchain is installed. Otherwise a \
                     definition here is likely not terminating.",
                    COMPILE_TIMEOUT.as_secs()
                ),
                ok: false,
                elapsed_ms: started.elapsed().as_millis() as u64,
                cancelled: false,
                timed_out: true,
            });
        }
    };

    // Superseded while compiling — the caller must not render this.
    {
        let mut guard = state.running.lock().map_err(|e| e.to_string())?;
        match guard.get(&kernel) {
            Some(entry) if entry.generation == generation => {
                guard.remove(&kernel);
            }
            _ => {
                return Ok(LeanCompileResult {
                    diagnostics: Vec::new(),
                    raw: String::new(),
                    ok: false,
                    elapsed_ms: started.elapsed().as_millis() as u64,
                    cancelled: true,
                    timed_out: false,
                })
            }
        }
    }

    let mut diagnostics = Vec::new();
    let mut raw = String::new();

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    for line in stdout.lines().chain(stderr.lines()) {
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(diag) = parse_json_diagnostic(trimmed) {
            diagnostics.push(diag);
        } else if let Some(diag) = parse_text_diagnostic(trimmed) {
            diagnostics.push(diag);
        } else {
            if !raw.is_empty() {
                raw.push('\n');
            }
            raw.push_str(trimmed);
        }
    }

    let ok = !diagnostics.iter().any(|d| d.severity == "error") && output.status.success();

    Ok(LeanCompileResult {
        diagnostics,
        raw,
        ok,
        elapsed_ms: started.elapsed().as_millis() as u64,
        cancelled: false,
        timed_out: false,
    })
}

/// Stop every in-flight compile across all kernels. Called when the window is
/// destroyed so a long elaboration can't outlive the app as an orphan process.
pub fn kill_all(state: &LeanState) {
    let kernels: Vec<String> = state
        .running
        .lock()
        .map(|g| g.keys().cloned().collect())
        .unwrap_or_default();
    for kernel in kernels {
        kill_running(state, &kernel);
    }
    if let Ok(mut guard) = state.running.lock() {
        guard.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verbatim `lean --json` output. Lean emits more fields than we read
    /// (`isSilent`, `keepFullRange`, `kind`), so the parser is checked against
    /// the real line rather than a trimmed-down stand-in.
    const EVAL_LINE: &str = r#"{"caption":"","data":"42","endPos":{"column":5,"line":3},"fileName":"Main.lean","isSilent":false,"keepFullRange":false,"kind":"[anonymous]","pos":{"column":0,"line":3},"severity":"information"}"#;
    const ERROR_LINE: &str = r#"{"caption":"","data":"Unknown identifier `undefinedThing`","endPos":{"column":28,"line":11},"fileName":"Main.lean","isSilent":false,"keepFullRange":false,"kind":"lean.unknownIdentifier._namedError","pos":{"column":14,"line":11},"severity":"error"}"#;
    const SORRY_LINE: &str = r#"{"caption":"","data":"declaration uses `sorry`","endPos":{"column":7,"line":9},"fileName":"Main.lean","isSilent":false,"keepFullRange":false,"kind":"hasSorry","pos":{"column":0,"line":9},"severity":"warning"}"#;

    #[test]
    fn parses_eval_output_as_information() {
        let d = parse_json_diagnostic(EVAL_LINE).expect("should parse");
        assert_eq!(d.severity, "information");
        assert_eq!(d.message, "42");
        assert_eq!((d.line, d.column), (3, 0));
        assert_eq!((d.end_line, d.end_column), (3, 5));
    }

    #[test]
    fn parses_error_position_and_message() {
        let d = parse_json_diagnostic(ERROR_LINE).expect("should parse");
        assert_eq!(d.severity, "error");
        assert_eq!(d.message, "Unknown identifier `undefinedThing`");
        assert_eq!((d.line, d.column), (11, 14));
    }

    #[test]
    fn parses_sorry_warning() {
        let d = parse_json_diagnostic(SORRY_LINE).expect("should parse");
        assert_eq!(d.severity, "warning");
        assert_eq!(d.message, "declaration uses `sorry`");
    }

    #[test]
    fn caption_is_prepended_when_present() {
        let line = r#"{"caption":"foo","data":"Nat","pos":{"line":1,"column":0},"severity":"information"}"#;
        let d = parse_json_diagnostic(line).expect("should parse");
        assert_eq!(d.message, "foo\nNat");
    }

    #[test]
    fn null_end_pos_collapses_to_the_start() {
        let line = r#"{"data":"x","endPos":null,"pos":{"line":7,"column":3},"severity":"error"}"#;
        let d = parse_json_diagnostic(line).expect("should parse");
        assert_eq!((d.end_line, d.end_column), (7, 3));
    }

    #[test]
    fn non_json_is_rejected_so_it_falls_through_to_raw() {
        assert!(parse_json_diagnostic("info: downloading https://example/lean.tar.zst").is_none());
        // Valid JSON without a `pos` is not a diagnostic either.
        assert!(parse_json_diagnostic(r#"{"hello":"world"}"#).is_none());
    }

    #[test]
    fn text_fallback_reads_point_positions() {
        let d = parse_text_diagnostic("/tmp/w/Main.lean:3:0: error: unknown identifier 'foo'")
            .expect("should parse");
        assert_eq!(d.severity, "error");
        assert_eq!((d.line, d.column), (3, 0));
        assert_eq!(d.message, "unknown identifier 'foo'");
    }

    #[test]
    fn text_fallback_reads_range_positions() {
        let d = parse_text_diagnostic("Main.lean:3:0-3:12: warning: declaration uses `sorry`")
            .expect("should parse");
        assert_eq!(d.severity, "warning");
        assert_eq!((d.line, d.column), (3, 0));
        assert_eq!((d.end_line, d.end_column), (3, 12));
    }

    #[test]
    fn text_fallback_survives_a_windows_path() {
        // A drive letter adds a colon that is not part of the position.
        let d = parse_text_diagnostic(r"C:\work\Main.lean:5:2: error: boom").expect("should parse");
        assert_eq!((d.line, d.column), (5, 2));
        assert_eq!(d.message, "boom");
    }

    #[test]
    fn text_fallback_normalises_info_to_information() {
        let d = parse_text_diagnostic("Main.lean:1:0: info: hello").expect("should parse");
        assert_eq!(d.severity, "information");
    }

    #[test]
    fn text_fallback_rejects_lines_without_a_position() {
        assert!(parse_text_diagnostic("error: no position here").is_none());
        assert!(parse_text_diagnostic("just some output").is_none());
    }

    #[test]
    fn parses_the_real_lean_version_banner() {
        // Verbatim output of `lean --version` from an elan-managed toolchain.
        let raw = "Lean (version 4.33.0, arm64-apple-darwin24.6.0, \
                   commit d8b18978322de05a8f3dba51ef03cf5461676c17, Release)";
        assert_eq!(parse_lean_version(raw), "4.33.0");
    }

    #[test]
    fn unfamiliar_version_output_is_passed_through() {
        assert_eq!(parse_lean_version("something else"), "something else");
    }

    #[test]
    fn elan_home_is_only_claimed_for_a_real_shim() {
        // A bare /usr/bin/lean must not get an ELAN_HOME pointing at /usr.
        assert_eq!(elan_home_for(Path::new("/usr/bin/lean")), None);
        // …nor should a path whose parent isn't `bin`.
        assert_eq!(elan_home_for(Path::new("/opt/lean")), None);
    }
}
