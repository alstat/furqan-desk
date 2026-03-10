use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::mpsc;

// ── State ────────────────────────────────────────────────────────────────────

pub struct JuliaState {
    /// The running REPL process, if any.
    pub process: Mutex<Option<JuliaProcess>>,
    /// User-specified binary path, persisted across sessions.
    pub custom_path: Mutex<Option<PathBuf>>,
}

impl JuliaState {
    pub fn new(custom_path: Option<PathBuf>) -> Self {
        Self {
            process: Mutex::new(None),
            custom_path: Mutex::new(custom_path),
        }
    }
}

pub struct JuliaProcess {
    /// Wrapped in Arc<tokio::sync::Mutex> so we can clone the handle,
    /// drop the outer std::sync::MutexGuard, then await the write.
    stdin: Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    abort_tx: mpsc::Sender<()>,
}

// ── Custom-path persistence ───────────────────────────────────────────────────

/// Path to the small config file that stores the user-chosen Julia binary path.
pub fn julia_path_config(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("julia_path.txt"))
}

/// Load the persisted custom path at app startup (called from lib.rs setup).
pub fn load_persisted_path(app: &AppHandle) -> Option<PathBuf> {
    let cfg = julia_path_config(app)?;
    let s = std::fs::read_to_string(&cfg).ok()?;
    let trimmed = s.trim();
    if trimmed.is_empty() { None } else { Some(PathBuf::from(trimmed)) }
}

fn save_persisted_path(app: &AppHandle, path: &Path) {
    if let Some(cfg) = julia_path_config(app) {
        let _ = std::fs::write(cfg, path.to_string_lossy().as_bytes());
    }
}

fn clear_persisted_path(app: &AppHandle) {
    if let Some(cfg) = julia_path_config(app) {
        let _ = std::fs::write(cfg, b"");
    }
}

// ── Binary detection ─────────────────────────────────────────────────────────

/// Scan the system PATH directories for the julia binary without spawning a
/// subprocess.  Spawning `julia --version` on Windows can block for 1-3 s
/// (process startup + AV scanning), making the startup check feel frozen.
fn julia_in_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path_var) {
        #[cfg(windows)]
        let candidate = dir.join("julia.exe");
        #[cfg(not(windows))]
        let candidate = dir.join("julia");
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Try to locate the Julia binary. Priority:
///   1. User-supplied custom path (pre-validated on set)
///   2. System PATH — filesystem scan, no subprocess spawning
///   3. juliaup default install location (platform-specific)
///   4. Platform-specific common install directories
pub fn julia_binary_path(custom: Option<&Path>) -> Option<PathBuf> {
    // 1. Custom path supplied by the user
    if let Some(p) = custom {
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }

    // 2. System PATH — fast filesystem scan, no subprocess
    if let Some(p) = julia_in_path() {
        return Some(p);
    }

    // 3. juliaup default location — binary name differs on Windows
    if let Some(home) = dirs::home_dir() {
        #[cfg(windows)]
        let candidate = home.join(".juliaup").join("bin").join("julia.exe");
        #[cfg(not(windows))]
        let candidate = home.join(".juliaup").join("bin").join("julia");

        if candidate.exists() {
            return Some(candidate);
        }
    }

    // 4. Platform-specific common locations
    #[cfg(target_os = "macos")]
    {
        for p in &[
            "/usr/local/bin/julia",
            "/opt/homebrew/bin/julia",
            "/opt/homebrew/opt/julia/bin/julia",
        ] {
            let path = PathBuf::from(p);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for p in &["/usr/local/bin/julia", "/usr/bin/julia", "/snap/bin/julia"] {
            let path = PathBuf::from(p);
            if path.exists() {
                return Some(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // %LOCALAPPDATA%\Programs\Julia-x.y.z\bin\julia.exe
        // (official Windows installer puts it here)
        if let Some(local_app_data) = dirs::data_local_dir() {
            if let Ok(entries) = std::fs::read_dir(local_app_data.join("Programs")) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    if name.to_string_lossy().starts_with("Julia") {
                        let exe = entry.path().join("bin").join("julia.exe");
                        if exe.exists() {
                            return Some(exe);
                        }
                    }
                }
            }
        }

        // C:\Program Files\Julia*\bin\julia.exe
        for base in &[
            r"C:\Program Files",
            r"C:\Program Files (x86)",
        ] {
            if let Ok(entries) = std::fs::read_dir(base) {
                for entry in entries.flatten() {
                    if entry.file_name().to_string_lossy().starts_with("Julia") {
                        let exe = entry.path().join("bin").join("julia.exe");
                        if exe.exists() {
                            return Some(exe);
                        }
                    }
                }
            }
        }
    }

    None
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn check_julia(state: State<'_, JuliaState>) -> String {
    let custom = state.custom_path.lock().ok()
        .and_then(|g| g.clone());
    // Run on a blocking thread so directory/PATH scanning never stalls
    // the Tauri async runtime (especially noticeable on Windows at startup).
    tokio::task::spawn_blocking(move || {
        if julia_binary_path(custom.as_deref()).is_some() {
            "installed".to_string()
        } else {
            "not_installed".to_string()
        }
    })
    .await
    .unwrap_or_else(|_| "not_installed".to_string())
}

/// Return the currently saved custom Julia binary path (empty string if none).
#[tauri::command]
pub fn get_julia_path(state: State<'_, JuliaState>) -> String {
    state.custom_path.lock().ok()
        .and_then(|g| g.clone())
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Save a custom Julia binary path. Returns `"installed"` if the path is valid
/// and Julia can be found there, or an error string describing what went wrong.
#[tauri::command]
pub fn set_julia_path(
    path: String,
    app: AppHandle,
    state: State<'_, JuliaState>,
) -> Result<String, String> {
    let p = PathBuf::from(&path);

    if path.is_empty() {
        // Clear the custom path — fall back to auto-detection
        *state.custom_path.lock().map_err(|e| e.to_string())? = None;
        clear_persisted_path(&app);
        return Ok(check_julia(state));
    }

    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // Quick smoke-test: run `<path> --version`
    let ok = std::process::Command::new(&p)
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if !ok {
        return Err(format!("'{}' does not appear to be a valid Julia binary", path));
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
pub async fn install_julia(app: AppHandle) -> Result<(), String> {
    let emit = |msg: &str| {
        let _ = app.emit(
            "julia-install-progress",
            InstallProgress { message: msg.to_string() },
        );
    };

    // ── macOS / Linux: download juliaup CLI binary and run `juliaup add lts` ──
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        emit("Downloading juliaup installer…");

        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        let url = "https://install.julialang.org/juliaup-aarch64-apple-darwin";
        #[cfg(all(target_os = "macos", not(target_arch = "aarch64")))]
        let url = "https://install.julialang.org/juliaup-x86_64-apple-darwin";
        #[cfg(target_os = "linux")]
        let url = "https://install.julialang.org/juliaup-x86_64-unknown-linux-musl";

        let response = reqwest::get(url)
            .await
            .map_err(|e| format!("Network error: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("Download failed (HTTP {})", response.status()));
        }
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read download: {e}"))?;

        let app_data = app.path().app_data_dir()
            .map_err(|e| format!("Cannot find app data dir: {e}"))?;
        let juliaup_path = app_data.join("juliaup");

        std::fs::write(&juliaup_path, &bytes)
            .map_err(|e| format!("Failed to write juliaup binary: {e}"))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&juliaup_path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("chmod failed: {e}"))?;
        }

        emit("Installing Julia LTS via juliaup (this may take a few minutes)…");

        let status = std::process::Command::new(&juliaup_path)
            .arg("add")
            .arg("lts")
            .status()
            .map_err(|e| format!("Failed to run juliaup: {e}"))?;
        if !status.success() {
            return Err("juliaup add lts failed".to_string());
        }

        emit("Julia LTS installed successfully.");
    }

    // ── Windows: try winget; otherwise guide the user ─────────────────────────
    #[cfg(target_os = "windows")]
    {
        emit("Trying to install via winget…");

        let status = std::process::Command::new("winget")
            .args([
                "install",
                "--id", "Julialang.Juliaup",
                "--accept-package-agreements",
                "--accept-source-agreements",
                "--silent",
            ])
            .status();

        match status {
            Ok(s) if s.success() => {
                emit("Julia installed via winget. You may need to restart the app.");
            }
            _ => {
                return Err(
                    "winget is not available or installation failed. \
                     Please install Julia from https://julialang.org/downloads/ \
                     and use the 'Set path manually' field below."
                        .to_string(),
                );
            }
        }
    }

    Ok(())
}

// Boot script sent to the Julia process via -e
const BOOT_SCRIPT: &str = r#"
while true
  local buf = IOBuffer()
  while true
    line = readline(stdin)
    line == "__JULIA_EXEC__" && break
    println(buf, line)
  end
  code = String(take!(buf))
  try
    parsed = Meta.parseall(code)
    result = nothing
    for expr in parsed.args
      result = Core.eval(Main, expr)
    end
    result !== nothing && (show(stdout, MIME("text/plain"), result); println(stdout))
  catch e
    println(stderr, sprint(showerror, e))
  end
  println(stdout, "__JULIA_DONE__")
  flush(stdout)
  flush(stderr)
end
"#;

#[derive(Clone, serde::Serialize)]
struct JuliaOutput {
    chunk: String,
    is_done: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn start_julia_repl(
    app: AppHandle,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    // Check if already running (sync block — guard dropped before any await)
    {
        let guard = state.process.lock().map_err(|e| e.to_string())?;
        if guard.is_some() {
            return Ok(());
        }
    }

    let julia = {
        let custom = state.custom_path.lock().map_err(|e| e.to_string())?
            .clone();
        julia_binary_path(custom.as_deref())
            .ok_or("Julia is not installed. Please install it or set the path manually.")?
    };

    // spawn() on TokioCommand is synchronous — no await needed
    let mut child = TokioCommand::new(julia)
        .arg("--startup-file=no")
        .arg("-e")
        .arg(BOOT_SCRIPT)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Julia: {e}"))?;

    let stdin  = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let stdin_arc = Arc::new(tokio::sync::Mutex::new(stdin));

    let (abort_tx,  mut abort_rx)  = mpsc::channel::<()>(1);
    let (abort_tx2, mut abort_rx2) = mpsc::channel::<()>(1);

    // stdout reader task
    let app_stdout = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        let mut output_buf: Vec<String> = Vec::new();

        loop {
            tokio::select! {
                _ = abort_rx.recv() => break,
                result = lines.next_line() => {
                    match result {
                        Ok(Some(l)) => {
                            if l == "__JULIA_DONE__" {
                                let chunk = output_buf.join("\n");
                                output_buf.clear();
                                let _ = app_stdout.emit("julia-output", JuliaOutput {
                                    chunk,
                                    is_done: true,
                                    error: None,
                                });
                            } else {
                                output_buf.push(l);
                            }
                        }
                        _ => break,
                    }
                }
            }
        }
    });

    // stderr reader task
    let app_stderr = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        loop {
            tokio::select! {
                _ = abort_rx2.recv() => break,
                result = lines.next_line() => {
                    match result {
                        Ok(Some(l)) => {
                            let _ = app_stderr.emit("julia-output", JuliaOutput {
                                chunk: l.clone(),
                                is_done: true,
                                error: Some(l),
                            });
                        }
                        _ => break,
                    }
                }
            }
        }
    });

    // Store process — no await after this point
    {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
        *guard = Some(JuliaProcess { stdin: stdin_arc, abort_tx });
    }

    std::mem::forget(abort_tx2);

    tokio::spawn(async move {
        let _ = child.wait().await;
    });

    Ok(())
}

#[tauri::command]
pub async fn run_julia_code(
    code: String,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let stdin_arc = {
        let guard = state.process.lock().map_err(|e| e.to_string())?;
        let proc = guard.as_ref().ok_or("Julia REPL is not started")?;
        Arc::clone(&proc.stdin)
    }; // std::sync::MutexGuard dropped here

    let payload = format!("{}\n__JULIA_EXEC__\n", code);
    let mut stdin = stdin_arc.lock().await;
    stdin.write_all(payload.as_bytes()).await
        .map_err(|e| format!("Failed to write to Julia stdin: {e}"))?;
    stdin.flush().await
        .map_err(|e| format!("Failed to flush Julia stdin: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn stop_julia_repl(state: State<'_, JuliaState>) -> Result<(), String> {
    let proc = {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
        guard.take()
    }; // guard dropped here

    if let Some(proc) = proc {
        let _ = proc.abort_tx.send(()).await;
        // Dropping proc.stdin closes the pipe → Julia process exits naturally
    }

    Ok(())
}
