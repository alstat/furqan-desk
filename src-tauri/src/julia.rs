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
    /// One-shot channel slot: set by `julia_complete`, consumed by the stdout reader.
    completion_tx: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<Vec<String>>>>>,
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
pub async fn check_julia(state: State<'_, JuliaState>) -> Result<String, String> {
    let custom = state.custom_path.lock().ok()
        .and_then(|g| g.clone());
    // Run on a blocking thread so directory/PATH scanning never stalls
    // the Tauri async runtime (especially noticeable on Windows at startup).
    let result = tokio::task::spawn_blocking(move || {
        if julia_binary_path(custom.as_deref()).is_some() {
            "installed".to_string()
        } else {
            "not_installed".to_string()
        }
    })
    .await
    .unwrap_or_else(|_| "not_installed".to_string());
    Ok(result)
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
        let custom = state.custom_path.lock().ok().and_then(|g| g.clone());
        return Ok(if julia_binary_path(custom.as_deref()).is_some() {
            "installed".to_string()
        } else {
            "not_installed".to_string()
        });
    }

    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    // Quick smoke-test: run `<path> --version`
    let ok = {
        let mut cmd = std::process::Command::new(&p);
        cmd.arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.status().map(|s| s.success()).unwrap_or(false)
    };

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
try; import REPL; catch; end
import Base64
module AL
  struct SurahRef; surahs::Vector{Int}; end
  struct AyahRef; surahs::Vector{Int}; ayahs::Vector{Int}; end

  surah(n::Integer) = SurahRef([Int(n)])
  surah(ns::AbstractVector) = SurahRef([Int(x) for x in ns])
  ayah(s::SurahRef, n::Integer) = AyahRef(s.surahs, [Int(n)])
  ayah(s::SurahRef, ns::AbstractVector) = AyahRef(s.surahs, [Int(x) for x in ns])

  _ja(v) = "[" * join(v, ",") * "]"

  Base.show(io::IO, ::MIME"text/plain", s::SurahRef) =
    print(io, "__AL_CMD__:{\"type\":\"display\",\"surahs\":", _ja(s.surahs), ",\"ayahs\":null}")
  Base.show(io::IO, ::MIME"text/plain", a::AyahRef) =
    print(io, "__AL_CMD__:{\"type\":\"display\",\"surahs\":", _ja(a.surahs), ",\"ayahs\":", _ja(a.ayahs), "}")
  Base.show(io::IO, ::MIME"text/plain", v::Vector{AyahRef}) = begin
    all_surahs = unique(reduce(vcat, [r.surahs for r in v]; init=Int[]))
    all_ayahs  = unique(reduce(vcat, [r.ayahs  for r in v]; init=Int[]))
    print(io, "__AL_CMD__:{\"type\":\"display\",\"surahs\":", _ja(all_surahs), ",\"ayahs\":", _ja(all_ayahs), "}")
  end

  Base.show(io::IO, s::SurahRef) = length(s.surahs) == 1 ?
    print(io, "AL.surah(", s.surahs[1], ")") :
    print(io, "AL.surah([", join(s.surahs, ", "), "])")
  Base.show(io::IO, a::AyahRef) = begin
    length(a.surahs) == 1 ? print(io, "AL.ayah(AL.surah(", a.surahs[1], "), ") :
      print(io, "AL.ayah(AL.surah([", join(a.surahs, ", "), "]), ")
    length(a.ayahs) == 1 ? print(io, a.ayahs[1], ")") :
      print(io, "[", join(a.ayahs, ", "), "])")
  end
end
# ── Plot display backend ──────────────────────────────────────────────────────
# Re-entrancy guard: prevents recursive display calls (e.g. when a show method
# internally calls display(), which would loop back here).
const _al_rendering = Ref(false)
# Returns :ok (rendered), :skip (re-entrant — caller does nothing),
#         or :text (no image support — caller may use text display).
# Does NOT use showable(): CairoMakie defines show for Figure but not always
# for FigureAxisPlot, so showable() returns false even when rendering works.
# Instead we attempt show() directly and treat MethodError as "not an image".
function _al_try_plot(x)
  _al_rendering[] && return :skip
  _al_rendering[] = true
  ret = :text
  # Try x directly, then x.figure (FigureAxisPlot → Figure fallback for CairoMakie
  # versions where show(MIME"image/png") is only defined on Figure/Scene)
  local cands = Any[x]
  try; hasproperty(x, :figure) && push!(cands, x.figure); catch; end
  try
    for obj in cands
      io = IOBuffer()
      ok = try; Base.invokelatest(show, io, MIME("image/png"), obj); true; catch; false; end
      if ok && position(io) > 0
        b64 = Base64.base64encode(take!(io))
        println(stdout, "__AL_CMD__:{\"type\":\"plot\",\"format\":\"png\",\"data\":\"" * b64 * "\"}")
        flush(stdout)
        ret = :ok
        break
      end
    end
    if ret === :text
      for obj in cands
        io = IOBuffer()
        ok = try; Base.invokelatest(show, io, MIME("image/svg+xml"), obj); true; catch; false; end
        if ok && position(io) > 0
          b64 = Base64.base64encode(String(take!(io)))
          println(stdout, "__AL_CMD__:{\"type\":\"plot\",\"format\":\"svg\",\"data\":\"" * b64 * "\"}")
          flush(stdout)
          ret = :ok
          break
        end
      end
    end
  finally
    _al_rendering[] = false
  end
  ret
end
struct _ALDisplay <: AbstractDisplay end
function Base.display(::_ALDisplay, x)
  r = _al_try_plot(x)
  r === :text || return  # :ok rendered or :skip re-entrant — nothing more to do
  # Only reach here for non-image types; guard with summary() in case text
  # repr itself overflows (e.g. deeply-nested objects without custom show).
  lim = IOContext(stdout, :limit => true, :compact => true)
  try; show(lim, MIME("text/plain"), x); println(stdout)
  catch; println(stdout, summary(x)); end
end
Base.displayable(::_ALDisplay, ::MIME"image/png") = true
Base.displayable(::_ALDisplay, ::MIME"image/svg+xml") = true
pushdisplay(_ALDisplay())
# ── Active project / environment name ────────────────────────────────────────
# Resolves the display name of the active project. Returns "" for the default
# global env (e.g. `~/.julia/environments/v1.10`) so the UI can show a plain
# `julia>` prompt for it. For an activated project, returns the `name` field
# from Project.toml when present, otherwise the project folder's basename.
function _al_env_name()
  path = try; Base.active_project(); catch; nothing; end
  path === nothing && return ""
  # Detect the default global env, which lives under any depot's
  # `environments/` directory — show no name for those.
  for d in DEPOT_PATH
    if startswith(path, joinpath(d, "environments"))
      return ""
    end
  end
  name = ""
  try
    for line in eachline(path)
      m = match(r"^\s*name\s*=\s*\"(.+?)\"\s*$", line)
      if m !== nothing
        name = String(m.captures[1])
        break
      end
    end
  catch
  end
  isempty(name) && (name = basename(dirname(path)))
  return name
end
function _al_emit_env()
  n = _al_env_name()
  # Escape backslashes and quotes for safe JSON embedding.
  esc = replace(replace(n, "\\" => "\\\\"), "\"" => "\\\"")
  println(stdout, "__AL_CMD__:{\"type\":\"env\",\"name\":\"" * esc * "\"}")
end
_al_emit_env()
# ── Semicolon suppression (mirrors Julia REPL behaviour) ─────────────────────
# Checks the last non-empty, non-comment line of the submitted code block.
# If it ends with ';', the result of the expression is not displayed.
function _al_ends_with_semicolon(code::String)
  for line in Iterators.reverse(split(code, '\n'))
    stripped = rstrip(line)
    isempty(stripped) && continue
    # Remove trailing line comment (naive but sufficient for common cases)
    ci = findfirst('#', stripped)
    if ci !== nothing
      stripped = rstrip(stripped[begin:prevind(stripped, ci)])
    end
    isempty(stripped) && continue
    return last(stripped) == ';'
  end
  return false
end
# ─────────────────────────────────────────────────────────────────────────────
while true
  local buf = IOBuffer()
  while true
    line = readline(stdin)
    line == "__JULIA_EXEC__" && break
    println(buf, line)
  end
  code = String(take!(buf))
  if startswith(code, "__JULIA_COMPLETE__:")
    prefix = strip(code[length("__JULIA_COMPLETE__:")+1:end])
    print(stdout, "__JULIA_COMPLETE_START__\n")
    try
      completions_list, _, _ = REPL.REPLCompletions.completions(prefix, lastindex(prefix))
      for c in completions_list
        println(stdout, REPL.REPLCompletions.completion_text(c))
      end
    catch
    end
  else
    try
      parsed = Meta.parseall(code)
      result = nothing
      for expr in parsed.args
        result = Base.invokelatest(Core.eval, Main, expr)
      end
      # Display result unless the code block ended with ';' (REPL suppression)
      if result !== nothing && !_al_ends_with_semicolon(code)
        # Route through display() so Julia's full display stack is used.
        # _ALDisplay (top of stack) handles plots via PNG/SVG and falls back
        # to show(MIME"text/plain") for everything else (DataFrames, etc.).
        Base.invokelatest(display, result)
      end
    catch e
      # Include the backtrace so the user sees the full stacktrace, not just
      # the error message. catch_backtrace() captures the trace from the
      # most recent exception in this try-block.
      println(stderr, sprint(showerror, e, catch_backtrace()))
    end
    # Surface the (possibly new) active env after each user command — this
    # is how `Pkg.activate(".")` changes get reflected in the input prompt.
    _al_emit_env()
  end
  print(stdout, "\n__JULIA_DONE__\n")
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
    cwd: Option<String>,
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
    let mut cmd = TokioCommand::new(julia);
    cmd.arg("--startup-file=no")
        .arg("-e")
        .arg(BOOT_SCRIPT)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    if let Some(dir) = cwd.as_deref().filter(|p| !p.is_empty() && std::path::Path::new(p).is_dir()) {
        cmd.current_dir(dir);
    }
    // Prevent julialauncher from opening a visible console window on Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn Julia: {e}"))?;

    let stdin  = child.stdin.take().ok_or("No stdin")?;
    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let stdin_arc = Arc::new(tokio::sync::Mutex::new(stdin));

    let (abort_tx,  mut abort_rx)  = mpsc::channel::<()>(1);
    let (abort_tx2, mut abort_rx2) = mpsc::channel::<()>(1);

    // Shared slot for pending completion oneshot senders
    let completion_tx_arc: Arc<std::sync::Mutex<Option<tokio::sync::oneshot::Sender<Vec<String>>>>> =
        Arc::new(std::sync::Mutex::new(None));
    let completion_tx_for_reader = Arc::clone(&completion_tx_arc);

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
                                // Check if this is a completion response
                                if output_buf.first().map(|s| s == "__JULIA_COMPLETE_START__").unwrap_or(false) {
                                    let completions: Vec<String> = output_buf[1..]
                                        .iter()
                                        .filter(|s| !s.is_empty())
                                        .cloned()
                                        .collect();
                                    output_buf.clear();
                                    if let Ok(mut slot) = completion_tx_for_reader.lock() {
                                        if let Some(tx) = slot.take() {
                                            let _ = tx.send(completions);
                                        }
                                    }
                                } else {
                                    // Strip the leading empty line produced by the
                                    // sentinel's leading '\n' when output already
                                    // ended with a newline (println case).
                                    let start = if output_buf.first().map(|s| s.is_empty()).unwrap_or(false) { 1 } else { 0 };
                                    let chunk = output_buf[start..].join("\n");
                                    output_buf.clear();
                                    let _ = app_stdout.emit("julia-output", JuliaOutput {
                                        chunk,
                                        is_done: true,
                                        error: None,
                                    });
                                }
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
        *guard = Some(JuliaProcess { stdin: stdin_arc, abort_tx, completion_tx: completion_tx_arc });
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

/// Request tab-completions from the running Julia REPL for the given prefix.
/// Returns the list of completion strings, or an error if the REPL is not
/// running or the request times out.
#[tauri::command]
pub async fn julia_complete(
    prefix: String,
    state: State<'_, JuliaState>,
) -> Result<Vec<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<String>>();

    let stdin_arc = {
        let guard = state.process.lock().map_err(|e| e.to_string())?;
        let proc = guard.as_ref().ok_or("Julia REPL is not started")?;
        {
            let mut slot = proc.completion_tx.lock().unwrap();
            *slot = Some(tx);
        }
        Arc::clone(&proc.stdin)
    }; // std::sync::MutexGuard dropped here

    let payload = format!("__JULIA_COMPLETE__:{}\n__JULIA_EXEC__\n", prefix);
    let mut stdin = stdin_arc.lock().await;
    stdin.write_all(payload.as_bytes()).await
        .map_err(|e| format!("Failed to write to Julia stdin: {e}"))?;
    stdin.flush().await
        .map_err(|e| format!("Failed to flush Julia stdin: {e}"))?;
    drop(stdin);

    tokio::time::timeout(std::time::Duration::from_secs(5), rx)
        .await
        .map_err(|_| "completion request timed out".to_string())?
        .map_err(|_| "completion channel closed".to_string())
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

/// Return the currently installed Julia version as a bare semver string (e.g. "1.10.4").
/// Runs `julia --version` on a blocking thread to avoid stalling the async runtime.
#[tauri::command]
pub async fn get_julia_version(state: State<'_, JuliaState>) -> Result<String, String> {
    let custom = state.custom_path.lock().ok().and_then(|g| g.clone());
    tokio::task::spawn_blocking(move || {
        let julia = julia_binary_path(custom.as_deref())
            .ok_or_else(|| "Julia is not installed".to_string())?;
        let mut cmd = std::process::Command::new(&julia);
        cmd.arg("--version")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let output = cmd.output().map_err(|e| format!("Failed to run julia: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        // "julia version 1.10.0" → "1.10.0"
        Ok(stdout.strip_prefix("julia version ").unwrap_or(&stdout).to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Fetch the latest stable Julia release tag from GitHub.
/// Falls back to listing all releases if `/releases/latest` returns a pre-release.
#[tauri::command]
pub async fn get_latest_julia_version() -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client
        .get("https://api.github.com/repos/JuliaLang/julia/releases/latest")
        .header("User-Agent", "AyahLab/1.0")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;

    // Safety net: if endpoint returns a pre-release, fall back to listing
    if json.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false) {
        return get_latest_stable_release("JuliaLang/julia").await;
    }

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing tag_name in response".to_string())?;
    Ok(tag.trim_start_matches('v').to_string())
}

/// Helper: list all releases for `owner/repo` and return the first non-pre-release tag.
async fn get_latest_stable_release(repo: &str) -> Result<String, String> {
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
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
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

/// Run `juliaup update`, emitting progress on `julia-install-progress`.
/// Searches `app_data_dir/juliaup` first, then falls back to PATH.
#[tauri::command]
pub async fn update_julia(app: AppHandle) -> Result<(), String> {
    let emit = |msg: &str| {
        let _ = app.emit(
            "julia-install-progress",
            InstallProgress { message: msg.to_string() },
        );
    };

    let juliaup = {
        // Prefer the system juliaup (the one that actually manages the Julia
        // installation) over our bundled copy, which was only used for first-run
        // install and may not share the same channel/install configuration.
        let from_path = {
            let path_var = std::env::var_os("PATH");
            let mut found = None;
            if let Some(path_var) = path_var {
                for dir in std::env::split_paths(&path_var) {
                    #[cfg(windows)]
                    let candidate = dir.join("juliaup.exe");
                    #[cfg(not(windows))]
                    let candidate = dir.join("juliaup");
                    if candidate.exists() {
                        found = Some(candidate);
                        break;
                    }
                }
            }
            found
        };
        if let Some(p) = from_path {
            p
        } else {
            // Fall back to the binary we bundled for installation
            let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let bundled = app_data.join("juliaup");
            if bundled.exists() {
                bundled
            } else {
                return Err("juliaup not found in PATH or app data".to_string());
            }
        }
    };

    emit("Updating Julia via juliaup…");

    let mut cmd = std::process::Command::new(&juliaup);
    cmd.arg("update");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let status = cmd.status().map_err(|e| format!("Failed to run juliaup: {e}"))?;
    if !status.success() {
        return Err("juliaup update failed".to_string());
    }
    emit("Julia updated successfully.");
    Ok(())
}

/// Install a specific Julia version via juliaup and switch the default to it.
/// `version` is a bare semver string like "1.10.4" (no leading "v").
/// Emits progress on `julia-install-progress`.
#[tauri::command]
pub async fn set_julia_version(app: AppHandle, version: String) -> Result<(), String> {
    let version = version.trim().trim_start_matches('v').to_string();
    if version.is_empty()
        || !version
            .chars()
            .all(|c| c.is_ascii_digit() || c == '.' || c == '-' || c.is_ascii_alphanumeric())
    {
        return Err("Invalid version string".to_string());
    }

    let emit = |msg: &str| {
        let _ = app.emit(
            "julia-install-progress",
            InstallProgress {
                message: msg.to_string(),
            },
        );
    };

    let juliaup = {
        let from_path = {
            let path_var = std::env::var_os("PATH");
            let mut found = None;
            if let Some(path_var) = path_var {
                for dir in std::env::split_paths(&path_var) {
                    #[cfg(windows)]
                    let candidate = dir.join("juliaup.exe");
                    #[cfg(not(windows))]
                    let candidate = dir.join("juliaup");
                    if candidate.exists() {
                        found = Some(candidate);
                        break;
                    }
                }
            }
            found
        };
        if let Some(p) = from_path {
            p
        } else {
            let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
            let bundled = app_data.join("juliaup");
            if bundled.exists() {
                bundled
            } else {
                return Err("juliaup not found in PATH or app data".to_string());
            }
        }
    };

    emit(&format!("Adding Julia {version} via juliaup…"));
    let mut add = std::process::Command::new(&juliaup);
    add.arg("add").arg(&version);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        add.creation_flags(0x08000000);
    }
    let status = add
        .status()
        .map_err(|e| format!("Failed to run juliaup: {e}"))?;
    if !status.success() {
        return Err(format!("juliaup add {version} failed"));
    }

    emit(&format!("Setting Julia {version} as default…"));
    let mut def = std::process::Command::new(&juliaup);
    def.arg("default").arg(&version);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        def.creation_flags(0x08000000);
    }
    let status = def
        .status()
        .map_err(|e| format!("Failed to run juliaup: {e}"))?;
    if !status.success() {
        return Err(format!("juliaup default {version} failed"));
    }

    emit(&format!("Julia {version} is now the default."));
    Ok(())
}
