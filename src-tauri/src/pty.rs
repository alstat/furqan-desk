use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};

// ── State ────────────────────────────────────────────────────────────────────

pub struct PtyState {
    inner: Mutex<HashMap<String, PtyHandle>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }
}

struct PtyHandle {
    master: Box<dyn MasterPty + Send>,
    writer: Mutex<Box<dyn Write + Send>>,
    child:  Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

// ── Event payloads ───────────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct PtyOutput { id: String, data_b64: String }

#[derive(Clone, serde::Serialize)]
struct PtyExit { id: String }

// ── Commands ─────────────────────────────────────────────────────────────────

/// Spawn the user's default shell inside a real PTY. Streams raw bytes via the
/// `pty-output` event (base64-encoded) and emits `pty-exit` when the shell ends.
#[tauri::command]
pub async fn start_pty(
    app:   AppHandle,
    id:    String,
    cols:  u16,
    rows:  u16,
    cwd:   Option<String>,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    {
        let g = state.inner.lock().map_err(|e| e.to_string())?;
        if g.contains_key(&id) { return Ok(()); }
    }

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("openpty: {e}"))?;

    // Pick a sensible shell.
    #[cfg(not(windows))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".into());
    #[cfg(windows)]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into());

    let mut cmd = CommandBuilder::new(&shell);
    // Run as a login/interactive shell so users get their normal prompt + rc files.
    #[cfg(not(windows))]
    {
        if shell.ends_with("zsh") || shell.ends_with("bash") || shell.ends_with("/sh") {
            cmd.arg("-l");
        }
    }
    cmd.env("TERM", "xterm-256color");
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    // Prefer the explicit cwd (e.g. open folder from file explorer); fall back to $HOME.
    let chosen_cwd = cwd
        .as_deref()
        .filter(|p| !p.is_empty() && std::path::Path::new(p).is_dir())
        .map(|p| p.to_string())
        .or_else(|| std::env::var("HOME").ok());
    if let Some(dir) = chosen_cwd {
        cmd.cwd(&dir);
    }
    for var in ["PATH", "LANG", "LC_ALL", "USER", "LOGNAME"] {
        if let Ok(v) = std::env::var(var) {
            cmd.env(var, v);
        }
    }

    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("spawn: {e}"))?;
    // Slave fd is held by the child; we don't need our copy anymore.
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("clone reader: {e}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("take writer: {e}"))?;

    // Blocking reader thread → emits base64 chunks until EOF.
    {
        let app_clone = app.clone();
        let id_clone  = id.clone();
        std::thread::spawn(move || {
            let mut buf = vec![0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data_b64 = B64.encode(&buf[..n]);
                        let _ = app_clone.emit(
                            "pty-output",
                            PtyOutput { id: id_clone.clone(), data_b64 },
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app_clone.emit("pty-exit", PtyExit { id: id_clone });
        });
    }

    {
        let mut g = state.inner.lock().map_err(|e| e.to_string())?;
        g.insert(
            id,
            PtyHandle {
                master: pair.master,
                writer: Mutex::new(writer),
                child:  Mutex::new(child),
            },
        );
    }

    Ok(())
}

/// Forward raw bytes (base64-encoded) to the PTY's stdin.
#[tauri::command]
pub async fn pty_write(
    id:       String,
    data_b64: String,
    state:    tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let bytes = B64
        .decode(data_b64.as_bytes())
        .map_err(|e| format!("base64: {e}"))?;
    let g = state.inner.lock().map_err(|e| e.to_string())?;
    let h = g.get(&id).ok_or("pty not running")?;
    let mut w = h.writer.lock().map_err(|e| e.to_string())?;
    w.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
    let _ = w.flush();
    Ok(())
}

/// Notify the PTY that its window size changed.
#[tauri::command]
pub async fn pty_resize(
    id:    String,
    cols:  u16,
    rows:  u16,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let g = state.inner.lock().map_err(|e| e.to_string())?;
    let h = g.get(&id).ok_or("pty not running")?;
    h.master
        .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("resize: {e}"))
}

/// Kill the shell behind the PTY and drop all state for `id`.
#[tauri::command]
pub async fn pty_kill(
    id:    String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let removed = {
        let mut g = state.inner.lock().map_err(|e| e.to_string())?;
        g.remove(&id)
    };
    if let Some(h) = removed {
        if let Ok(mut child) = h.child.lock() {
            let _ = child.kill();
        }
    }
    Ok(())
}
