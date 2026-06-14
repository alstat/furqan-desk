use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::mpsc;

// ── State ────────────────────────────────────────────────────────────────────

/// Default kernel name when a command doesn't specify one.
const DEFAULT_KERNEL: &str = "repl";

pub struct JuliaState {
    /// Running Julia processes, keyed by kernel name. There are two:
    /// `"repl"` backs the REPL pane, `"cell"` backs the notebook code cells,
    /// so the two have independent variables and loaded packages.
    pub processes: Mutex<HashMap<String, JuliaProcess>>,
    /// User-specified binary path, persisted across sessions.
    pub custom_path: Mutex<Option<PathBuf>>,
}

impl JuliaState {
    pub fn new(custom_path: Option<PathBuf>) -> Self {
        Self {
            processes: Mutex::new(HashMap::new()),
            custom_path: Mutex::new(custom_path),
        }
    }
}

/// Bonito server port for interactive WGLMakie plots — distinct per kernel so
/// two kernels loading WGLMakie don't fight over the same socket.
fn bonito_port(kernel: &str) -> u16 {
    match kernel {
        "cell" => 9182,
        _ => 9181,
    }
}

pub struct JuliaProcess {
    /// Wrapped in Arc<tokio::sync::Mutex> so we can clone the handle,
    /// drop the outer std::sync::MutexGuard, then await the write.
    stdin: Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    /// OS process id of the kernel — used to deliver SIGINT for `interrupt_julia`.
    pid: Option<u32>,
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
pub async fn install_julia(
    app: AppHandle,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let emit = |msg: &str| {
        let _ = app.emit(
            "julia-install-progress",
            InstallProgress { message: msg.to_string() },
        );
    };

    // juliaup ships as a portable .tar.gz on GitHub releases whose root holds
    // two binaries: `juliaup`/`juliaup.exe` (the version manager) and
    // `julia`/`julia.exe` (the launcher that dispatches to the selected
    // channel). The same flow — download, extract, `juliaup add lts`, then
    // point the app at the extracted launcher — works on macOS, Linux and
    // Windows, so we keep it unified rather than per-platform.
    use std::io::Read;

    emit("Downloading juliaup…");

    // Resolve the latest stable juliaup so the URL doesn't go stale, falling
    // back to a known-good pin if the GitHub lookup fails.
    let juliaup_version = get_latest_stable_release("JuliaLang/juliaup")
        .await
        .unwrap_or_else(|_| "1.20.4".to_string());

    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let target = "aarch64-apple-darwin";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let target = "x86_64-apple-darwin";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    let target = "aarch64-unknown-linux-musl";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    let target = "x86_64-unknown-linux-musl";
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    let target = "x86_64-pc-windows-gnu";
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    let target = "i686-pc-windows-gnu";
    // Any other platform/arch (e.g. Windows on ARM) has no portable build.
    #[cfg(not(any(
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "x86"),
    )))]
    let target = "";

    if target.is_empty() {
        return Err(
            "Automatic install isn't available for this platform. Please install Julia \
             from https://julialang.org/downloads/ and set the path manually."
                .to_string(),
        );
    }

    #[cfg(windows)]
    let exe = ".exe";
    #[cfg(not(windows))]
    let exe = "";

    let url = format!(
        "https://github.com/JuliaLang/juliaup/releases/download/v{juliaup_version}/\
         juliaup-{juliaup_version}-{target}-portable.tar.gz"
    );

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Download failed (HTTP {})", response.status()));
    }
    let bytes = response.bytes().await
        .map_err(|e| format!("Failed to read download: {e}"))?;

    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Cannot find app data dir: {e}"))?;
    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Cannot create app data dir: {e}"))?;
    let juliaup_path = app_data.join(format!("juliaup{exe}"));
    let julia_launcher = app_data.join(format!("julia{exe}"));

    emit("Extracting juliaup…");

    // Unpack just the two binaries we need from the archive root.
    let juliaup_name = format!("juliaup{exe}");
    let julia_name = format!("julia{exe}");
    let decoder = flate2::read::GzDecoder::new(std::io::Cursor::new(&bytes[..]));
    let mut archive = tar::Archive::new(decoder);
    let (mut got_juliaup, mut got_julia) = (false, false);
    for entry in archive.entries().map_err(|e| format!("Bad archive: {e}"))? {
        let mut entry = entry.map_err(|e| format!("Bad archive entry: {e}"))?;
        let name = entry
            .path()
            .ok()
            .and_then(|p| p.file_name().and_then(|n| n.to_str()).map(str::to_string));
        let dest = if name.as_deref() == Some(juliaup_name.as_str()) {
            got_juliaup = true;
            &juliaup_path
        } else if name.as_deref() == Some(julia_name.as_str()) {
            got_julia = true;
            &julia_launcher
        } else {
            continue;
        };
        let mut buf = Vec::new();
        entry.read_to_end(&mut buf)
            .map_err(|e| format!("Failed to read archive: {e}"))?;
        std::fs::write(dest, &buf)
            .map_err(|e| format!("Failed to write binary: {e}"))?;
    }
    if !got_juliaup || !got_julia {
        return Err("juliaup archive did not contain the expected binaries".to_string());
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for p in [&juliaup_path, &julia_launcher] {
            std::fs::set_permissions(p, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("chmod failed: {e}"))?;
        }
    }

    emit("Installing Julia LTS (this may take a few minutes)…");

    let run_juliaup = |args: &[&str]| -> Result<(), String> {
        let mut cmd = std::process::Command::new(&juliaup_path);
        cmd.args(args);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let status = cmd.status().map_err(|e| format!("Failed to run juliaup: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err(format!("juliaup {} failed", args.join(" ")))
        }
    };
    run_juliaup(&["add", "lts"])?;
    // Ensure the launcher resolves `julia` to the channel we just installed.
    let _ = run_juliaup(&["default", "lts"]);

    // The portable install doesn't create ~/.juliaup/bin/julia or touch PATH,
    // so point the app directly at the launcher we extracted and persist it.
    if let Ok(mut guard) = state.custom_path.lock() {
        *guard = Some(julia_launcher.clone());
    }
    save_persisted_path(&app, &julia_launcher);

    emit("Julia LTS installed successfully.");

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

# ── Interactive (WGLMakie + Bonito) plotting ─────────────────────────────────
# When the user has loaded WGLMakie, Makie figures are served as an interactive
# WebGL page by a Bonito server running inside this kernel; the cell embeds that
# page in an <iframe>. GLMakie and CairoMakie figures instead fall through to
# the PNG/SVG path below — GLMakie cannot embed in a webview, so the best it can
# do here is a static frame rendered offscreen via show(MIME"image/png").
const _AL_BONITO_PORT = parse(Int, get(ENV, "AL_BONITO_PORT", "9181"))
const _al_bonito_server = Ref{Any}(nothing)
const _al_bonito_seq = Ref(0)

# Look up an already-loaded module by name WITHOUT triggering a package load,
# so probing never force-imports Makie/WGLMakie/Bonito.
function _al_loaded(name::Symbol)
  isdefined(Main, name) && return getfield(Main, name)
  for m in values(Base.loaded_modules)
    try; nameof(m) === name && return m; catch; end
  end
  return nothing
end

function _al_is_makie(x)
  M = _al_loaded(:Makie)
  M === nothing && return false
  try
    return x isa M.Figure || x isa M.FigureAxisPlot ||
           x isa M.Scene  || x isa M.AbstractPlot
  catch
    return false
  end
end

# Render a PlotlyJS plot as a self-contained interactive HTML document.
# Returns the HTML string, or nothing when PlotlyJS isn't loaded or `x` is
# not a PlotlyJS plot — so non-plot objects (DataFrames, etc.) never get
# routed here even though they may also define a text/html show method.
function _al_plotly_html(x)
  P = _al_loaded(:PlotlyJS)
  P === nothing && return nothing
  isplotly = try
    (isdefined(P, :Plot) && x isa P.Plot) ||
    (isdefined(P, :SyncPlot) && x isa P.SyncPlot)
  catch
    false
  end
  isplotly || return nothing
  # PlotlyJS `plot(...)` returns a SyncPlot wrapping a Plot; `to_html`/show
  # for text/html is defined on the inner Plot.
  plt = x
  try
    if isdefined(P, :SyncPlot) && x isa P.SyncPlot
      plt = x.plot
    end
  catch
  end
  io = IOBuffer()
  ok = try
    Base.invokelatest(show, io, MIME("text/html"), plt)
    true
  catch
    false
  end
  ok && position(io) > 0 ? String(take!(io)) : nothing
end

# Render a Gadfly plot as a self-contained interactive HTML document.
# Returns the HTML string, or nothing when Gadfly isn't loaded or `x` is not a
# Gadfly Plot. Gadfly's `show(MIME"text/html", ::Plot)` writes an SVGJS-backed
# interactive SVG with embedded JavaScript (hover tooltips, pan, zoom). We wrap
# it in a minimal HTML page so the iframe srcdoc executes the embedded scripts.
function _al_gadfly_html(x)
  G = _al_loaded(:Gadfly)
  G === nothing && return nothing
  # Accept both Gadfly.Plot and Compose.Context — the latter is what
  # vstack/hstack/gridstack/title return, and Compose's text/html show method
  # also routes through the interactive SVGJS backend.
  C = _al_loaded(:Compose)
  isgadfly = try
    (isdefined(G, :Plot) && x isa G.Plot) ||
    (C !== nothing && isdefined(C, :Context) && x isa C.Context)
  catch
    false
  end
  isgadfly || return nothing
  io = IOBuffer()
  ok = try
    Base.invokelatest(show, io, MIME("text/html"), x)
    true
  catch
    false
  end
  (ok && position(io) > 0) || return nothing
  svg_html = String(take!(io))
  # Strip a leading XML declaration — we're embedding in HTML, not standalone XML.
  svg_html = replace(svg_html, r"^\s*<\?xml[^>]*\?>\s*" => "")
  return string(
    "<!doctype html><html><head><meta charset=\"utf-8\">",
    "<style>html,body{margin:0;padding:0;background:#fff;}",
    "svg{display:block;max-width:100%;height:auto;}</style>",
    "</head><body>",
    svg_html,
    "</body></html>",
  )
end

# Serve `x` as an interactive Bonito page; returns its localhost URL, or
# nothing when WGLMakie/Bonito are unavailable or serving fails.
function _al_try_interactive(x)
  Bonito   = _al_loaded(:Bonito)
  WGLMakie = _al_loaded(:WGLMakie)
  (Bonito === nothing || WGLMakie === nothing) && return nothing
  _al_is_makie(x) || return nothing
  try
    if _al_bonito_server[] === nothing
      _al_bonito_server[] =
        Base.invokelatest(Bonito.Server, "127.0.0.1", _AL_BONITO_PORT)
    end
    _al_bonito_seq[] += 1
    route = "/cell/" * string(_al_bonito_seq[])
    app = Base.invokelatest(Bonito.App, x)
    Base.invokelatest(Bonito.route!, _al_bonito_server[], route => app)
    return "http://127.0.0.1:" * string(_AL_BONITO_PORT) * route
  catch
    return nothing
  end
end

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
    # Interactive WGLMakie page takes precedence when available.
    url = _al_try_interactive(x)
    if url !== nothing
      esc = replace(url, "\"" => "\\\"")
      println(stdout, "__AL_CMD__:{\"type\":\"plot\",\"format\":\"html\",\"url\":\"" * esc * "\"}")
      flush(stdout)
      ret = :ok
    end
    # Interactive PlotlyJS figure — emit a self-contained HTML page the cell
    # embeds in an <iframe>. Tried before the PNG path so a static image
    # (via Kaleido) doesn't pre-empt the interactive version.
    if ret === :text
      phtml = _al_plotly_html(x)
      if phtml !== nothing
        b64 = Base64.base64encode(phtml)
        println(stdout, "__AL_CMD__:{\"type\":\"plot\",\"format\":\"plotly\",\"data\":\"" * b64 * "\"}")
        flush(stdout)
        ret = :ok
      end
    end
    # Gadfly: route to its interactive SVGJS HTML before the PNG path so a
    # Cairo-rendered static image doesn't pre-empt the interactive version.
    if ret === :text
      ghtml = _al_gadfly_html(x)
      if ghtml !== nothing
        b64 = Base64.base64encode(ghtml)
        println(stdout, "__AL_CMD__:{\"type\":\"plot\",\"format\":\"plotly\",\"data\":\"" * b64 * "\"}")
        flush(stdout)
        ret = :ok
      end
    end
    if ret === :text
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
  elseif startswith(code, "__JULIA_DEFINITION__:")
    sym = strip(code[length("__JULIA_DEFINITION__:")+1:end])
    print(stdout, "__JULIA_COMPLETE_START__\n")
    try
      val = Base.invokelatest(Core.eval, Main, Meta.parse(sym))
      for m in methods(val)
        loc = try; functionloc(m); catch; (nothing, 0); end
        if loc[1] !== nothing
          f = string(loc[1])
          if !isempty(f) && isfile(f)
            println(stdout, f * ":" * string(loc[2]))
          end
        end
      end
    catch
    end
  elseif startswith(code, "__JULIA_FORMAT__:")
    # Payload: "<indent>\n<base64 source>". Reply through the completion
    # channel with a single "OK:<base64>" / "ERR:<base64>" line.
    rest = code[length("__JULIA_FORMAT__:")+1:end]
    print(stdout, "__JULIA_COMPLETE_START__\n")
    try
      nl = findfirst('\n', rest)
      indent = parse(Int, strip(rest[1:prevind(rest, nl)]))
      src = String(Base64.base64decode(strip(rest[nextind(rest, nl):end])))
      JF = try
        @eval Main import JuliaFormatter
        Main.JuliaFormatter
      catch
        error("JuliaFormatter.jl is not installed. In the Julia REPL run: import Pkg; Pkg.add(\"JuliaFormatter\")")
      end
      formatted = Base.invokelatest(JF.format_text, src; indent=indent)
      println(stdout, "OK:" * Base64.base64encode(formatted))
    catch e
      msg = try; sprint(showerror, e); catch; string(e); end
      println(stdout, "ERR:" * Base64.base64encode(msg))
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
      # Guard with a nested try/catch: showerror itself can throw (e.g. world-age
      # issues when displaying types from recently-loaded packages), which would
      # otherwise escape this catch block and prevent __JULIA_DONE__ from printing.
      # Try progressively simpler renderings so the user always sees something useful.
      try
        buf = IOBuffer()
        Base.invokelatest(showerror, buf, e, catch_backtrace())
        println(stderr, String(take!(buf)))
      catch _
        try
          buf = IOBuffer()
          Base.invokelatest(showerror, buf, e)
          println(stderr, String(take!(buf)))
        catch _
          try
            println(stderr, "ERROR: " * string(e))
          catch _
            try; println(stderr, "ERROR: $(typeof(e))"); catch; end
          end
        end
      end
    end
    # Surface the (possibly new) active env after each user command — this
    # is how `Pkg.activate(".")` changes get reflected in the input prompt.
    try; _al_emit_env(); catch; end
  end
  print(stdout, "\n__JULIA_DONE__\n")
  flush(stdout)
  flush(stderr)
end
"#;

#[derive(Clone, serde::Serialize)]
struct JuliaOutput {
    /// Which kernel produced this output — frontends filter on it so the
    /// REPL pane and the notebook cells only see their own kernel's output.
    kernel: String,
    chunk: String,
    is_done: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn start_julia_repl(
    app: AppHandle,
    cwd: Option<String>,
    kernel: Option<String>,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());

    // Check if this kernel is already running (guard dropped before any await)
    {
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        if guard.contains_key(&kernel) {
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
        // Cap the GC heap target. Without this, Julia 1.10's GC sizes its heap
        // relative to *total* physical RAM and is slow to return memory to the
        // OS, so each kernel can balloon toward ~half of RAM. We run up to two
        // kernels concurrently ("repl" + "cell"), so hint each to 25% of
        // physical memory (≤50% combined). It's a hint, not a hard cap, so
        // genuinely large workloads can still exceed it, but idle/typical RSS
        // drops dramatically. Julia 1.10+ accepts the percentage form.
        .arg("--heap-size-hint=25%")
        .arg("-e")
        .arg(BOOT_SCRIPT)
        .env("AL_BONITO_PORT", bonito_port(&kernel).to_string())
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

    let pid = child.id();

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
    let kernel_stdout = kernel.clone();
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
                                        kernel: kernel_stdout.clone(),
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
    let kernel_stderr = kernel.clone();
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
                                kernel: kernel_stderr.clone(),
                                chunk: l.clone(),
                                is_done: false,
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
        let mut guard = state.processes.lock().map_err(|e| e.to_string())?;
        guard.insert(
            kernel,
            JuliaProcess { stdin: stdin_arc, pid, abort_tx, completion_tx: completion_tx_arc },
        );
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
    kernel: Option<String>,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());
    let stdin_arc = {
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        let proc = guard.get(&kernel).ok_or("Julia REPL is not started")?;
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

/// Interrupt the cell currently running in the Julia kernel.
///
/// Delivers SIGINT to the kernel process, which Julia turns into an
/// `InterruptException` in the evaluating task. The kernel's eval loop catches
/// it, reports the error and emits `__JULIA_DONE__`, so the cell finishes
/// normally while the kernel stays alive (variables and loaded packages are
/// preserved). On non-Unix platforms per-process console interrupts aren't
/// reliably available — callers should restart the kernel instead.
#[tauri::command]
pub async fn interrupt_julia(
    kernel: Option<String>,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());
    let pid = {
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        let proc = guard.get(&kernel).ok_or("Julia REPL is not started")?;
        proc.pid.ok_or("Julia process id is unavailable")?
    };

    #[cfg(unix)]
    {
        // SAFETY: kill(2) with a valid pid and a standard signal number.
        let rc = unsafe { libc::kill(pid as libc::pid_t, libc::SIGINT) };
        if rc != 0 {
            return Err(format!(
                "Failed to interrupt Julia (pid {pid}): {}",
                std::io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Err("Interrupting a running cell is not supported on this platform; restart the kernel instead.".into())
    }
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
        // Completions / definitions / formatting always target the REPL kernel,
        // which backs the standalone Julia (.jl) editor.
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        let proc = guard.get(DEFAULT_KERNEL).ok_or("Julia REPL is not started")?;
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

/// Resolve the source location(s) of a Julia symbol via the running REPL.
/// Returns a list of "file:line" strings (one per method) for use by the
/// editor's go-to-definition; covers library/module functions (e.g. `mean`
/// from Statistics). Errors if the REPL is not running or the request times
/// out. The response reuses the completion channel — its first line is the
/// `__JULIA_COMPLETE_START__` sentinel — so it shares `completion_tx`.
#[tauri::command]
pub async fn julia_definition(
    symbol: String,
    state: State<'_, JuliaState>,
) -> Result<Vec<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<String>>();

    let stdin_arc = {
        // Completions / definitions / formatting always target the REPL kernel,
        // which backs the standalone Julia (.jl) editor.
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        let proc = guard.get(DEFAULT_KERNEL).ok_or("Julia REPL is not started")?;
        {
            let mut slot = proc.completion_tx.lock().unwrap();
            *slot = Some(tx);
        }
        Arc::clone(&proc.stdin)
    }; // std::sync::MutexGuard dropped here

    let payload = format!("__JULIA_DEFINITION__:{}\n__JULIA_EXEC__\n", symbol);
    let mut stdin = stdin_arc.lock().await;
    stdin.write_all(payload.as_bytes()).await
        .map_err(|e| format!("Failed to write to Julia stdin: {e}"))?;
    stdin.flush().await
        .map_err(|e| format!("Failed to flush Julia stdin: {e}"))?;
    drop(stdin);

    tokio::time::timeout(std::time::Duration::from_secs(5), rx)
        .await
        .map_err(|_| "definition request timed out".to_string())?
        .map_err(|_| "definition channel closed".to_string())
}

/// Format Julia source via JuliaFormatter.jl in the running REPL.
/// `code_b64` is the base64-encoded source; `indent` the spaces per level.
/// Returns the single response line — "OK:<base64 formatted>" or
/// "ERR:<base64 message>" — which the caller decodes. Errors only on
/// transport problems (REPL not running, timeout). Shares the completion
/// channel: the reply begins with the `__JULIA_COMPLETE_START__` sentinel.
#[tauri::command]
pub async fn julia_format(
    code_b64: String,
    indent: u32,
    kernel: Option<String>,
    state: State<'_, JuliaState>,
) -> Result<String, String> {
    let (tx, rx) = tokio::sync::oneshot::channel::<Vec<String>>();
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());

    let stdin_arc = {
        // Formatting targets whichever kernel the caller specified — the REPL
        // kernel for the standalone .jl editor, the cell kernel for notebooks.
        let guard = state.processes.lock().map_err(|e| e.to_string())?;
        let proc = guard.get(&kernel).ok_or("Julia REPL is not started")?;
        {
            let mut slot = proc.completion_tx.lock().unwrap();
            *slot = Some(tx);
        }
        Arc::clone(&proc.stdin)
    }; // std::sync::MutexGuard dropped here

    let payload = format!(
        "__JULIA_FORMAT__:{}\n{}\n__JULIA_EXEC__\n",
        indent, code_b64,
    );
    let mut stdin = stdin_arc.lock().await;
    stdin.write_all(payload.as_bytes()).await
        .map_err(|e| format!("Failed to write to Julia stdin: {e}"))?;
    stdin.flush().await
        .map_err(|e| format!("Failed to flush Julia stdin: {e}"))?;
    drop(stdin);

    // Generous timeout: the first format triggers JuliaFormatter precompilation.
    let lines = tokio::time::timeout(std::time::Duration::from_secs(180), rx)
        .await
        .map_err(|_| "format request timed out".to_string())?
        .map_err(|_| "format channel closed".to_string())?;

    lines
        .into_iter()
        .next()
        .ok_or_else(|| "empty format response".to_string())
}

#[tauri::command]
pub async fn stop_julia_repl(
    kernel: Option<String>,
    state: State<'_, JuliaState>,
) -> Result<(), String> {
    let kernel = kernel.unwrap_or_else(|| DEFAULT_KERNEL.to_string());
    let proc = {
        let mut guard = state.processes.lock().map_err(|e| e.to_string())?;
        guard.remove(&kernel)
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
