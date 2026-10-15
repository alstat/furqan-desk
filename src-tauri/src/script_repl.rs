//! The R and Python REPL sessions.
//!
//! These run on pipes rather than on a PTY. A PTY would give the interpreter's
//! own readline — history, completion, colour — but the front end renders a
//! transcript with its own prompt, the way the Julia pane does, and a PTY is
//! the wrong shape for that: it echoes back everything written to it and wraps
//! the result in cursor-movement escapes meant for a terminal grid, so the
//! transcript would show every line twice and carry control sequences through.
//!
//! On a pipe the interpreter reads statements and writes results, which is
//! exactly the transcript's model. The cost is that the interpreter's own
//! line editing is gone — the pane supplies the prompt, history and editing
//! instead, again as Julia's does.

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};

/// One line of output, tagged with the stream it came from.
///
/// Both languages write prompts and warnings to stderr and results to stdout,
/// so the pane colours them differently rather than treating stderr as failure.
#[derive(Clone, serde::Serialize)]
struct ScriptOutput {
    id:     String,
    stream: String,
    text:   String,
}

#[derive(Clone, serde::Serialize)]
struct ScriptExit {
    id: String,
}

struct Session {
    child: Child,
    stdin: Option<ChildStdin>,
}

#[derive(Default)]
pub struct ScriptReplState {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}

impl ScriptReplState {
    pub fn new() -> Self {
        Self::default()
    }
}

/// Start an interpreter for `id`, or do nothing if one is already running.
///
/// `id` is the language, not the tab — one R session and one Python session
/// per window, shared by every file of that kind, so a second file runs where
/// the first one's definitions already live.
#[tauri::command]
pub async fn start_script_repl(
    app:     AppHandle,
    id:      String,
    program: String,
    args:    Vec<String>,
    cwd:     Option<String>,
    state:   tauri::State<'_, ScriptReplState>,
) -> Result<(), String> {
    {
        let g = state.sessions.lock().map_err(|e| e.to_string())?;
        if g.contains_key(&id) {
            return Ok(());
        }
    }

    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    // Unbuffered, or output sits in the interpreter's stdio buffer until it
    // fills — a `print` in a loop would arrive in one lump at the end instead
    // of streaming into the transcript.
    cmd.env("PYTHONUNBUFFERED", "1");
    // No colour: the transcript is HTML, and escape codes would show as
    // literal `[0m` noise rather than being interpreted.
    cmd.env("NO_COLOR", "1");
    cmd.env("TERM", "dumb");
    // matplotlib must not try to open a window: there is no display attached to
    // this child, and an interactive backend would either fail or block. Agg
    // renders to a file, which is what the plot hook then hands back.
    cmd.env("MPLBACKEND", "Agg");
    if let Some(dir) = cwd.filter(|p| !p.is_empty() && std::path::Path::new(p).is_dir()) {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window for the child.
        cmd.creation_flags(0x0800_0000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("could not start {program}: {e}"))?;

    let stdin = child.stdin.take();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    for (stream, pipe) in [("stdout", stdout.map(Either::Out)), ("stderr", stderr.map(Either::Err))] {
        let Some(pipe) = pipe else { continue };
        let app = app.clone();
        let id = id.clone();
        let stream = stream.to_string();
        tokio::spawn(async move {
            match pipe {
                Either::Out(p) => forward(app, id, stream, BufReader::new(p)).await,
                Either::Err(p) => forward(app, id, stream, BufReader::new(p)).await,
            }
        });
    }

    // Reap the child and tell the front end, so the pane can offer a restart
    // rather than silently accepting input nothing will ever answer.
    {
        let app = app.clone();
        let id_for_exit = id.clone();
        let sessions = state.sessions.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                let finished = {
                    let mut g = match sessions.lock() {
                        Ok(g) => g,
                        Err(_) => break,
                    };
                    match g.get_mut(&id_for_exit) {
                        Some(s) => matches!(s.child.try_wait(), Ok(Some(_)) | Err(_)),
                        None => true,
                    }
                };
                if finished {
                    if let Ok(mut g) = sessions.lock() {
                        g.remove(&id_for_exit);
                    }
                    let _ = app.emit("script-repl-exit", ScriptExit { id: id_for_exit });
                    break;
                }
            }
        });
    }

    state
        .sessions
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id, Session { child, stdin });
    Ok(())
}

/// Lets the two pipe types share one forwarding task without boxing them.
enum Either {
    Out(tokio::process::ChildStdout),
    Err(tokio::process::ChildStderr),
}

async fn forward<R>(app: AppHandle, id: String, stream: String, reader: BufReader<R>)
where
    R: tokio::io::AsyncRead + Unpin,
{
    let mut lines = reader.lines();
    while let Ok(Some(text)) = lines.next_line().await {
        let _ = app.emit(
            "script-repl-output",
            ScriptOutput {
                id:     id.clone(),
                stream: stream.clone(),
                text,
            },
        );
    }
}

/// Send a statement to the session. A trailing newline is added when missing,
/// because the interpreter only evaluates on one.
#[tauri::command]
pub async fn script_repl_write(
    id:    String,
    text:  String,
    state: tauri::State<'_, ScriptReplState>,
) -> Result<(), String> {
    let mut stdin = {
        let mut g = state.sessions.lock().map_err(|e| e.to_string())?;
        let session = g.get_mut(&id).ok_or("no session")?;
        session.stdin.take().ok_or("session stdin closed")?
    };

    let payload = if text.ends_with('\n') { text } else { format!("{text}\n") };
    let result = async {
        stdin.write_all(payload.as_bytes()).await?;
        stdin.flush().await
    }
    .await;

    // Put it back whatever happened, or the session becomes write-once.
    if let Ok(mut g) = state.sessions.lock() {
        if let Some(session) = g.get_mut(&id) {
            session.stdin = Some(stdin);
        }
    }
    result.map_err(|e| e.to_string())
}

/// Interrupt whatever the session is running, leaving the session itself alive.
///
/// SIGINT is what Ctrl-C sends: R returns to its prompt and Python raises
/// KeyboardInterrupt, both of which the interpreter survives. Windows has no
/// equivalent signal for a child on a pipe, so there it reports as unsupported
/// and the pane offers a restart instead.
#[tauri::command]
pub async fn script_repl_interrupt(
    id:    String,
    state: tauri::State<'_, ScriptReplState>,
) -> Result<(), String> {
    let pid = {
        let g = state.sessions.lock().map_err(|e| e.to_string())?;
        g.get(&id).and_then(|s| s.child.id()).ok_or("no session")?
    };

    #[cfg(unix)]
    {
        // Safety: `pid` came from a child this process spawned and is still
        // tracked, so the worst case is that it has just exited and the signal
        // goes nowhere.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGINT);
        }
        Ok(())
    }
    #[cfg(not(unix))]
    {
        let _ = pid;
        Err("interrupt is not supported on this platform".into())
    }
}

/// End the session. The exit watcher notices and emits `script-repl-exit`.
#[tauri::command]
pub async fn script_repl_kill(
    id:    String,
    state: tauri::State<'_, ScriptReplState>,
) -> Result<(), String> {
    let mut g = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = g.remove(&id) {
        let _ = session.child.start_kill();
    }
    Ok(())
}


/// Read a plot a session just wrote, as base64.
///
/// The session announces a finished plot by printing the path it wrote to, so
/// the bytes still have to be fetched. Going through Rust rather than the
/// webview's own file access keeps it to one path: the file lives in the
/// system temp directory, which the front end has no business reaching into
/// directly.
///
/// The file is removed once read. These accumulate at one per plot for the life
/// of the session, and the app has the bytes it needs by then.
#[tauri::command]
pub async fn read_plot_file(path: String) -> Result<String, String> {
    use base64::Engine;

    let p = std::path::Path::new(&path);
    // Only ever a file this app's own session just wrote, under the temp dir.
    let temp = std::env::temp_dir();
    let canonical = p.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.starts_with(temp.canonicalize().unwrap_or(temp.clone())) {
        return Err("plot file is outside the temp directory".into());
    }

    let bytes = std::fs::read(&canonical).map_err(|e| e.to_string())?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let _ = std::fs::remove_file(&canonical);
    Ok(encoded)
}
