use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::mpsc;

const TERM_DONE: &str = "!!TERM_DONE!!";

// ── State ────────────────────────────────────────────────────────────────────

pub struct TerminalState {
    processes: Mutex<HashMap<String, TermProcess>>,
}

impl TerminalState {
    pub fn new() -> Self {
        Self { processes: Mutex::new(HashMap::new()) }
    }
}

struct TermProcess {
    stdin:   Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    kill_tx: mpsc::Sender<()>,
}

// ── Event payloads ────────────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct TermOutput { id: String, line: String, is_stderr: bool }

#[derive(Clone, serde::Serialize)]
struct TermDone { id: String }

#[derive(Clone, serde::Serialize)]
struct TermExit { id: String }

// ── Commands ──────────────────────────────────────────────────────────────────

/// Spawn a persistent shell for the given terminal `id`.
/// Emits `terminal-output {id, line, is_stderr}` as output arrives,
/// `terminal-done {id}` when a command finishes, and
/// `terminal-exit  {id}` when the shell process exits.
#[tauri::command]
pub async fn start_terminal(
    app:   AppHandle,
    id:    String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    {
        let g = state.processes.lock().map_err(|e| e.to_string())?;
        if g.contains_key(&id) { return Ok(()); }
    }

    #[cfg(not(windows))]
    let mut cmd = TokioCommand::new("sh");

    #[cfg(windows)]
    let mut cmd = {
        let mut c = TokioCommand::new("powershell");
        c.args(["-NoProfile", "-NonInteractive"]);
        c
    };

    cmd.stdin(std::process::Stdio::piped())
       .stdout(std::process::Stdio::piped())
       .stderr(std::process::Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start terminal: {e}"))?;

    let stdin  = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    let stdin_arc = Arc::new(tokio::sync::Mutex::new(stdin));
    let (kill_tx,  mut kill_rx)  = mpsc::channel::<()>(1);
    let (kill_tx2, mut kill_rx2) = mpsc::channel::<()>(1);

    // ── stdout reader: emit each line, detect TERM_DONE sentinel ──────────────
    let app_o = app.clone();
    let id_o  = id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
            tokio::select! {
                _ = kill_rx.recv() => break,
                r = lines.next_line() => match r {
                    Ok(Some(l)) => {
                        if l.trim() == TERM_DONE {
                            let _ = app_o.emit("terminal-done", TermDone { id: id_o.clone() });
                        } else {
                            let _ = app_o.emit("terminal-output", TermOutput {
                                id: id_o.clone(), line: l, is_stderr: false,
                            });
                        }
                    }
                    _ => break,
                }
            }
        }
        let _ = app_o.emit("terminal-exit", TermExit { id: id_o });
    });

    // ── stderr reader: emit each line immediately ─────────────────────────────
    let app_e = app.clone();
    let id_e  = id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        loop {
            tokio::select! {
                _ = kill_rx2.recv() => break,
                r = lines.next_line() => match r {
                    Ok(Some(l)) => {
                        let _ = app_e.emit("terminal-output", TermOutput {
                            id: id_e.clone(), line: l, is_stderr: true,
                        });
                    }
                    _ => break,
                }
            }
        }
    });

    {
        let mut g = state.processes.lock().map_err(|e| e.to_string())?;
        g.insert(id, TermProcess { stdin: stdin_arc, kill_tx });
    }

    // keep kill_rx2 alive until the process exits on its own
    std::mem::forget(kill_tx2);
    tokio::spawn(async move { let _ = child.wait().await; });

    Ok(())
}

/// Send a command to a running terminal.  The sentinel is automatically
/// appended so the frontend knows when the command has finished.
#[tauri::command]
pub async fn send_terminal_input(
    id:      String,
    command: String,
    state:   tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let stdin_arc = {
        let g = state.processes.lock().map_err(|e| e.to_string())?;
        let p = g.get(&id).ok_or("terminal not running")?;
        Arc::clone(&p.stdin)
    };

    #[cfg(not(windows))]
    let payload = format!("{}\necho '{}'\n", command.trim_end(), TERM_DONE);
    #[cfg(windows)]
    let payload = format!("{}\nWrite-Output '{}'\n", command.trim_end(), TERM_DONE);

    let mut stdin = stdin_arc.lock().await;
    stdin.write_all(payload.as_bytes()).await
        .map_err(|e| format!("write error: {e}"))?;
    stdin.flush().await
        .map_err(|e| format!("flush error: {e}"))?;
    Ok(())
}

/// Kill a running terminal process.
#[tauri::command]
pub async fn close_terminal(
    id:    String,
    state: tauri::State<'_, TerminalState>,
) -> Result<(), String> {
    let proc = {
        let mut g = state.processes.lock().map_err(|e| e.to_string())?;
        g.remove(&id)
    };
    if let Some(p) = proc {
        let _ = p.kill_tx.send(()).await;
        // dropping p.stdin closes the pipe → shell gets EOF → exits
    }
    Ok(())
}
