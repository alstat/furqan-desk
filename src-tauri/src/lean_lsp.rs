//! A minimal LSP client for `lean --server`.
//!
//! `lean --json` re-imports the world on every invocation and exits; the
//! language server keeps imports resident and elaborates incrementally. Measured
//! against Lean 4.29.0, an edit to a file with `import Lean` costs ~750–850 ms
//! through the batch path and ~205 ms here, and the server's cost stays flat as
//! imports grow. A file that imports nothing sees no difference — the entire
//! mechanism is amortising import work the batch path repeats every time.
//!
//! No LSP crate is vendored, so the client is written directly on `serde_json`
//! and `tokio`, which are already dependencies. Only what the infoview needs is
//! implemented: lifecycle, document sync, and diagnostics.
//!
//! ## Knowing when a document is finished
//!
//! This is the one genuinely subtle part, and the protocol does not make it
//! obvious. Lean streams diagnostics as it elaborates, so a `publishDiagnostics`
//! is not a completion signal. `$/lean/fileProgress` reporting an empty
//! `processing` array is — but the two races: after a `didChange` the empty
//! progress notification was observed arriving *before* the final diagnostics
//! for that edit. Completing on progress alone therefore returns the previous
//! edit's messages.
//!
//! What makes it deterministic is that Lean stamps `publishDiagnostics` with the
//! document version it is describing. A compile is done when the file is idle
//! *and* diagnostics stamped with this request's version have arrived. A short
//! grace period covers the case where a version produces no publish of its own.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Notify;

use crate::lean::LeanDiagnostic;

/// How long to wait after a document goes idle for version-stamped diagnostics.
///
/// Covers the ordering hazard above. Kept short because it is only reached when
/// a version publishes nothing of its own, and it is pure added latency there.
const VERSION_GRACE: Duration = Duration::from_millis(250);

/// Cap on a single document elaboration, and on the initialize handshake.
///
/// The handshake needs one too, not just the compile: `lean --server` runs
/// behind the same elan shim as `lean --json`, so if the resolved toolchain is
/// not installed elan silently downloads it — minutes with no output — and the
/// stall lands in `initialize` where a compile timeout would never see it.
const LSP_TIMEOUT: Duration = Duration::from_secs(300);

// ── Wire format ──────────────────────────────────────────────────────────────

/// Convert a filesystem path to a `file://` URI.
///
/// Hand-rolled because the alternative is a URL crate for one function. The
/// Windows cases are the reason this is not a string concatenation: a path there
/// is `C:\dir\Main.lean`, which has to become `file:///C:/dir/Main.lean` — an
/// extra leading slash before the drive letter, and backslashes flipped. Spaces
/// and other characters that are not URI-safe are percent-encoded on every
/// platform, since app-data paths routinely contain them (`Application Support`).
pub fn path_to_uri(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    let mut out = String::from("file://");
    // A Windows path starts with a drive letter rather than a slash, and needs
    // the authority-empty third slash inserted before it.
    if !raw.starts_with('/') {
        out.push('/');
    }
    for ch in raw.chars() {
        match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '.' | '_' | '~' | '/' | ':' => out.push(ch),
            _ => {
                let mut buf = [0u8; 4];
                for byte in ch.encode_utf8(&mut buf).as_bytes() {
                    out.push_str(&format!("%{byte:02X}"));
                }
            }
        }
    }
    out
}

fn frame(payload: &str) -> Vec<u8> {
    let mut out = format!("Content-Length: {}\r\n\r\n", payload.len()).into_bytes();
    out.extend_from_slice(payload.as_bytes());
    out
}

/// Pull one complete message out of `buf`, returning its JSON body.
///
/// `Content-Length` counts bytes, not characters, so the split is done on the
/// byte buffer and only the extracted slice is treated as UTF-8.
fn take_message(buf: &mut Vec<u8>) -> Option<Vec<u8>> {
    const SEP: &[u8] = b"\r\n\r\n";
    let header_end = buf.windows(SEP.len()).position(|w| w == SEP)?;
    let header = std::str::from_utf8(&buf[..header_end]).ok()?;

    let len: usize = header
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse().ok())?
        })
        .unwrap_or(0);

    let body_start = header_end + SEP.len();
    if buf.len() < body_start + len {
        return None;
    }
    let body = buf[body_start..body_start + len].to_vec();
    buf.drain(..body_start + len);
    Some(body)
}

// ── Per-document state ───────────────────────────────────────────────────────

#[derive(Default)]
struct DocEntry {
    /// Version stamped on the most recent `publishDiagnostics`, or 0.
    published_version: i64,
    diagnostics: Vec<LeanDiagnostic>,
    /// True when the last `$/lean/fileProgress` reported nothing processing.
    idle: bool,
    /// Version this client last sent; used to open vs. change.
    sent_version: i64,
    opened: bool,
}

pub struct LeanLsp {
    stdin: tokio::sync::Mutex<tokio::process::ChildStdin>,
    next_id: AtomicI64,
    /// Documents keyed by URI. One server hosts every kernel's document, which
    /// halves resident import memory versus a process per kernel.
    docs: Mutex<HashMap<String, DocEntry>>,
    /// Woken on every inbound message so waiters re-check their condition.
    changed: Notify,
    alive: AtomicBool,
    /// Id of the `initialize` request, so its response is recognised precisely
    /// rather than by assuming it is the only one in flight.
    init_id: AtomicI64,
    handshake_done: AtomicBool,
}

impl LeanLsp {
    /// Whether the server process is still running.
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }

    async fn send(&self, msg: &serde_json::Value) -> Result<(), String> {
        let text = msg.to_string();
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(&frame(&text))
            .await
            .map_err(|e| format!("Lean server write failed: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("Lean server flush failed: {e}"))
    }

    async fn notify(&self, method: &str, params: serde_json::Value) -> Result<(), String> {
        self.send(&serde_json::json!({
            "jsonrpc": "2.0", "method": method, "params": params
        }))
        .await
    }

    /// Start `lean --server` and complete the handshake.
    pub async fn start(
        lean: &Path,
        cwd: &Path,
        elan_home: Option<std::path::PathBuf>,
    ) -> Result<Arc<Self>, String> {
        let mut cmd = tokio::process::Command::new(lean);
        cmd.arg("--server")
            .current_dir(cwd)
            .kill_on_drop(true)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        if let Some(home) = elan_home {
            cmd.env("ELAN_HOME", home);
        }
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to start Lean server: {e}"))?;

        let stdin = child.stdin.take().ok_or("Lean server has no stdin")?;
        let stdout = child.stdout.take().ok_or("Lean server has no stdout")?;
        let stderr = child.stderr.take().ok_or("Lean server has no stderr")?;

        let server = Arc::new(Self {
            stdin: tokio::sync::Mutex::new(stdin),
            next_id: AtomicI64::new(1),
            docs: Mutex::new(HashMap::new()),
            changed: Notify::new(),
            alive: AtomicBool::new(true),
            init_id: AtomicI64::new(0),
            handshake_done: AtomicBool::new(false),
        });

        // stderr must be drained for as long as the process lives. A long-lived
        // child is a different discipline from a short-lived one: nothing reads
        // this pipe otherwise, and once its buffer fills the server blocks on
        // write and never responds again.
        tokio::spawn(async move {
            let mut reader = stderr;
            let mut sink = [0u8; 4096];
            while let Ok(n) = reader.read(&mut sink).await {
                if n == 0 {
                    break;
                }
            }
        });

        // Reader task: owns stdout for the life of the server.
        {
            let server = Arc::clone(&server);
            tokio::spawn(async move {
                let mut reader = stdout;
                let mut buf: Vec<u8> = Vec::with_capacity(16 * 1024);
                let mut chunk = [0u8; 8192];
                loop {
                    match reader.read(&mut chunk).await {
                        Ok(0) | Err(_) => break,
                        Ok(n) => buf.extend_from_slice(&chunk[..n]),
                    }
                    while let Some(body) = take_message(&mut buf) {
                        if let Ok(msg) = serde_json::from_slice::<serde_json::Value>(&body) {
                            server.dispatch(msg).await;
                        }
                    }
                }
                // stdout closed — the process is gone.
                server.alive.store(false, Ordering::Relaxed);
                server.changed.notify_waiters();
            });
        }

        // Reap the child so it cannot linger as a zombie.
        tokio::spawn(async move {
            let _ = child.wait().await;
        });

        server.handshake(cwd).await?;
        Ok(server)
    }

    async fn handshake(&self, cwd: &Path) -> Result<(), String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.init_id.store(id, Ordering::Relaxed);
        // Deliberately advertising almost nothing. Announcing `refreshSupport`
        // makes the server issue inlayHint/semanticTokens refresh *requests*
        // that would then need answering; we render neither, so the quietest
        // client is the correct one.
        self.send(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "initialize",
            "params": {
                "processId": std::process::id(),
                "rootUri": path_to_uri(cwd),
                "capabilities": {
                    "textDocument": {
                        "publishDiagnostics": { "versionSupport": true },
                        "synchronization": { "dynamicRegistration": false }
                    }
                }
            }
        }))
        .await?;

        // The handshake completing is what proves the toolchain resolved; see
        // LSP_TIMEOUT on why this cannot be left unbounded.
        let deadline = Instant::now() + LSP_TIMEOUT;
        loop {
            // Registered *now*, not on first await: a notification arriving
            // between the check below and the await would otherwise be lost.
            let waker = self.changed.notified();
            tokio::pin!(waker);
            waker.as_mut().enable();

            if self.handshake_done.load(Ordering::Relaxed) {
                break;
            }
            if !self.is_alive() {
                return Err("Lean server exited during startup".to_string());
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(format!(
                    "The Lean server did not start within {}s. If the toolchain was just \
                     installed or changed, elan may be downloading it in the background — \
                     run `elan toolchain list` to check the default toolchain is installed.",
                    LSP_TIMEOUT.as_secs()
                ));
            }
            let _ = tokio::time::timeout(remaining, waker).await;
        }

        self.notify("initialized", serde_json::json!({})).await
    }

    async fn dispatch(&self, msg: serde_json::Value) {
        let method = msg.get("method").and_then(|m| m.as_str());
        let id = msg.get("id");

        match (method, id) {
            // A response to something we sent. `initialize` is the only one
            // anything waits on.
            (None, Some(id)) => {
                if id.as_i64() == Some(self.init_id.load(Ordering::Relaxed)) {
                    self.handshake_done.store(true, Ordering::Relaxed);
                }
            }
            // A *request* from the server. Lean sends `client/registerCapability`
            // unprompted, and a request left unanswered is a request the server
            // may still be waiting on — so everything unhandled gets a null
            // result rather than silence.
            (Some(_), Some(id)) => {
                let _ = self
                    .send(&serde_json::json!({
                        "jsonrpc": "2.0", "id": id, "result": serde_json::Value::Null
                    }))
                    .await;
                return;
            }
            (Some(method), None) => self.handle_notification(method, &msg),
            _ => {}
        }
        self.changed.notify_waiters();
    }

    fn handle_notification(&self, method: &str, msg: &serde_json::Value) {
        let Some(params) = msg.get("params") else { return };
        // The two notifications this client cares about disagree on where the
        // URI sits: `publishDiagnostics` puts it at the top level, while
        // `$/lean/fileProgress` nests it under `textDocument`. Reading only one
        // shape silently drops the other — and dropping fileProgress means no
        // document is ever marked idle, so every compile waits forever.
        let Some(uri) = params
            .get("uri")
            .or_else(|| params.get("textDocument").and_then(|d| d.get("uri")))
            .and_then(|u| u.as_str())
        else {
            return;
        };

        match method {
            "textDocument/publishDiagnostics" => {
                let version = params.get("version").and_then(|v| v.as_i64()).unwrap_or(0);
                let diagnostics = params
                    .get("diagnostics")
                    .and_then(|d| d.as_array())
                    .map(|items| items.iter().filter_map(convert_diagnostic).collect())
                    .unwrap_or_default();
                if let Ok(mut docs) = self.docs.lock() {
                    let entry = docs.entry(uri.to_string()).or_default();
                    entry.published_version = version;
                    entry.diagnostics = diagnostics;
                }
            }
            "$/lean/fileProgress" => {
                let idle = params
                    .get("processing")
                    .and_then(|p| p.as_array())
                    .is_some_and(|items| items.is_empty());
                if let Ok(mut docs) = self.docs.lock() {
                    docs.entry(uri.to_string()).or_default().idle = idle;
                }
            }
            _ => {}
        }
    }

    /// Sync `code` into the document for `uri` and wait for its diagnostics.
    pub async fn compile(&self, uri: &str, code: &str) -> Result<Vec<LeanDiagnostic>, String> {
        if !self.is_alive() {
            return Err("Lean server is not running".to_string());
        }

        let (version, first_open) = {
            let mut docs = self.docs.lock().map_err(|e| e.to_string())?;
            let entry = docs.entry(uri.to_string()).or_default();
            entry.sent_version += 1;
            // Clearing idle before the edit goes out is what stops the wait
            // below from immediately accepting the *previous* edit's state.
            entry.idle = false;
            let first_open = !entry.opened;
            entry.opened = true;
            (entry.sent_version, first_open)
        };

        if first_open {
            self.notify(
                "textDocument/didOpen",
                serde_json::json!({
                    "textDocument": {
                        "uri": uri, "languageId": "lean4",
                        "version": version, "text": code
                    }
                }),
            )
            .await?;
        } else {
            // Full-text sync: simpler than incremental ranges, and the server
            // does its own change analysis regardless.
            self.notify(
                "textDocument/didChange",
                serde_json::json!({
                    "textDocument": { "uri": uri, "version": version },
                    "contentChanges": [{ "text": code }]
                }),
            )
            .await?;
        }

        self.await_diagnostics(uri, version).await
    }

    async fn await_diagnostics(
        &self,
        uri: &str,
        version: i64,
    ) -> Result<Vec<LeanDiagnostic>, String> {
        let deadline = Instant::now() + LSP_TIMEOUT;
        // Set when the document first reports idle, to bound the extra wait for
        // version-stamped diagnostics that may never come.
        let mut idle_since: Option<Instant> = None;

        loop {
            // Registered before reading state, so an update landing in between
            // cannot be missed. `enable()` is what performs the registration —
            // merely constructing the future does not.
            let waker = self.changed.notified();
            tokio::pin!(waker);
            waker.as_mut().enable();

            {
                let docs = self.docs.lock().map_err(|e| e.to_string())?;
                if let Some(entry) = docs.get(uri) {
                    if entry.idle {
                        if entry.published_version >= version {
                            return Ok(entry.diagnostics.clone());
                        }
                        match idle_since {
                            Some(since) if since.elapsed() >= VERSION_GRACE => {
                                // Idle, but this version never published. Report
                                // what the document currently shows rather than
                                // stalling on a message that is not coming.
                                return Ok(entry.diagnostics.clone());
                            }
                            None => idle_since = Some(Instant::now()),
                            _ => {}
                        }
                    } else {
                        idle_since = None;
                    }
                }
            }

            if !self.is_alive() {
                return Err("Lean server exited while compiling".to_string());
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err(format!(
                    "Lean did not finish within {}s and was stopped. A definition here \
                     is likely not terminating.",
                    LSP_TIMEOUT.as_secs()
                ));
            }
            // Wake on the grace deadline too, so a version that never publishes
            // still resolves promptly instead of waiting for unrelated traffic.
            let wait = idle_since
                .map(|since| {
                    VERSION_GRACE
                        .saturating_sub(since.elapsed())
                        .min(remaining)
                })
                .unwrap_or(remaining);
            let _ = tokio::time::timeout(wait, waker).await;
        }
    }

    /// Ask the server to exit cleanly, then let the handle drop.
    pub async fn shutdown(&self) {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let _ = self
            .send(&serde_json::json!({
                "jsonrpc": "2.0", "id": id, "method": "shutdown", "params": null
            }))
            .await;
        let _ = self.notify("exit", serde_json::json!(null)).await;
        self.alive.store(false, Ordering::Relaxed);
    }
}

/// Map one LSP diagnostic onto the shape the infoview already renders.
///
/// Two conversions matter. LSP counts lines from zero while the batch `--json`
/// path counts from one, and the frontend contract is the batch one — so the
/// line is shifted by one here and nothing downstream changes. Severity arrives
/// as an integer and leaves as the string the existing type uses, with `Hint`
/// folded into information since the panel has no weaker category.
fn convert_diagnostic(raw: &serde_json::Value) -> Option<LeanDiagnostic> {
    let range = raw.get("range")?;
    let start = range.get("start")?;
    let end = range.get("end").unwrap_or(start);
    let num = |v: &serde_json::Value, key: &str| v.get(key).and_then(|n| n.as_u64()).unwrap_or(0);

    let severity = match raw.get("severity").and_then(|s| s.as_u64()) {
        Some(1) => "error",
        Some(2) => "warning",
        _ => "information",
    };

    Some(LeanDiagnostic {
        severity: severity.to_string(),
        line: num(start, "line") as u32 + 1,
        column: num(start, "character") as u32,
        end_line: num(end, "line") as u32 + 1,
        end_column: num(end, "character") as u32,
        message: raw
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or_default()
            .trim()
            .to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_carry_a_byte_length_not_a_char_count() {
        // "π" is one char but two bytes; a char count here would desync the
        // stream permanently on the first non-ASCII message — and Lean's
        // messages are full of unicode.
        let framed = frame("{\"a\":\"π\"}");
        let text = String::from_utf8_lossy(&framed);
        assert!(text.starts_with("Content-Length: 10\r\n\r\n"), "{text}");
    }

    #[test]
    fn reads_one_message_and_leaves_the_remainder() {
        let mut buf = Vec::new();
        buf.extend_from_slice(&frame(r#"{"id":1}"#));
        buf.extend_from_slice(&frame(r#"{"id":2}"#));

        let first = take_message(&mut buf).expect("first message");
        assert_eq!(first, br#"{"id":1}"#);
        let second = take_message(&mut buf).expect("second message");
        assert_eq!(second, br#"{"id":2}"#);
        assert!(take_message(&mut buf).is_none());
        assert!(buf.is_empty());
    }

    #[test]
    fn a_partial_message_is_left_for_the_next_read() {
        let full = frame(r#"{"id":1}"#);
        let mut buf = full[..full.len() - 3].to_vec();
        assert!(take_message(&mut buf).is_none(), "must not consume");
        buf.extend_from_slice(&full[full.len() - 3..]);
        assert_eq!(take_message(&mut buf).expect("now complete"), br#"{"id":1}"#);
    }

    #[test]
    fn header_name_is_matched_case_insensitively() {
        let mut buf = b"content-length: 8\r\n\r\n{\"id\":1}".to_vec();
        assert_eq!(take_message(&mut buf).expect("parsed"), br#"{"id":1}"#);
    }

    #[test]
    fn unicode_payload_survives_a_split_read() {
        // The exact failure a char-based length would cause: a body split
        // mid-multibyte must still reassemble.
        let payload = r#"{"m":"∀ x, x = x"}"#;
        let full = frame(payload);
        let cut = full.len() - 5;
        let mut buf = full[..cut].to_vec();
        assert!(take_message(&mut buf).is_none());
        buf.extend_from_slice(&full[cut..]);
        let body = take_message(&mut buf).expect("reassembled");
        assert_eq!(String::from_utf8(body).unwrap(), payload);
    }

    #[test]
    fn lsp_zero_based_lines_become_the_one_based_contract() {
        let raw = serde_json::json!({
            "range": { "start": { "line": 2, "character": 14 },
                       "end":   { "line": 2, "character": 28 } },
            "severity": 1,
            "message": "Unknown identifier `undefinedThing`"
        });
        let d = convert_diagnostic(&raw).expect("converted");
        assert_eq!(d.line, 3, "LSP line 2 is source line 3");
        assert_eq!(d.column, 14, "columns stay zero-based");
        assert_eq!(d.severity, "error");
    }

    #[test]
    fn severities_map_and_hint_folds_into_information() {
        let at = |sev: u64| {
            let raw = serde_json::json!({
                "range": { "start": { "line": 0, "character": 0 },
                           "end":   { "line": 0, "character": 1 } },
                "severity": sev, "message": "m"
            });
            convert_diagnostic(&raw).unwrap().severity
        };
        assert_eq!(at(1), "error");
        assert_eq!(at(2), "warning");
        assert_eq!(at(3), "information");
        assert_eq!(at(4), "information", "Hint has no weaker category here");
    }

    /// End-to-end against a real `lean --server`.
    ///
    /// Ignored by default because it needs an installed toolchain; run with
    /// `cargo test --lib lean_lsp -- --ignored --nocapture`. It is the only
    /// thing that actually exercises the part of this module worth doubting —
    /// the completion protocol, where an empty `fileProgress` can arrive before
    /// the diagnostics of the edit that produced it.
    #[tokio::test]
    #[ignore = "requires an installed Lean toolchain"]
    async fn drives_a_real_server_through_two_edits() {
        let lean = crate::lean::lean_binary_path(None)
            .or_else(|| {
                let home = std::env::var("HOME").ok()?;
                let p = std::path::PathBuf::from(home).join(".elan/bin/lean");
                p.exists().then_some(p)
            })
            .expect("no lean binary found");

        let dir = std::env::temp_dir().join(format!("lean-lsp-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("Main.lean");
        let uri = path_to_uri(&file);

        let elan = lean.parent().and_then(|b| b.parent()).map(|p| p.to_path_buf());
        let t0 = Instant::now();
        let server = LeanLsp::start(&lean, &dir, elan).await.expect("server start");
        println!("handshake: {} ms", t0.elapsed().as_millis());

        // First edit: an #eval and a deliberate error.
        let src = |n: u32| {
            format!("def double (k : Nat) : Nat := 2 * k\n\n#eval double {n}\n\ndef broken := undefinedThing\n")
        };

        let t1 = Instant::now();
        let first = server.compile(&uri, &src(21)).await.expect("first compile");
        println!("didOpen -> diagnostics: {} ms", t1.elapsed().as_millis());

        let eval = first
            .iter()
            .find(|d| d.severity == "information")
            .expect("#eval result should arrive as an information diagnostic");
        assert_eq!(eval.message, "42");
        assert_eq!(eval.line, 3, "#eval is on source line 3 (1-based)");

        let err = first
            .iter()
            .find(|d| d.severity == "error")
            .expect("the unknown identifier should be an error");
        assert_eq!(err.line, 5, "the bad definition is on source line 5");
        assert!(err.message.contains("undefinedThing"), "{}", err.message);

        // Second edit through didChange. This is the case where the empty
        // fileProgress was observed landing *before* the new diagnostics: if the
        // version gate were wrong, this would still read 42.
        let t2 = Instant::now();
        let second = server.compile(&uri, &src(50)).await.expect("second compile");
        let ms = t2.elapsed().as_millis();
        println!("didChange -> diagnostics: {ms} ms");

        let eval2 = second
            .iter()
            .find(|d| d.severity == "information")
            .expect("second #eval result");
        assert_eq!(eval2.message, "100", "must be this edit's result, not the previous one");
        assert!(second.iter().any(|d| d.severity == "error"), "error should persist");

        server.shutdown().await;
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn unix_paths_become_file_uris_with_spaces_encoded() {
        assert_eq!(
            path_to_uri(Path::new("/Users/a/Application Support/lean-work/Main.lean")),
            "file:///Users/a/Application%20Support/lean-work/Main.lean"
        );
    }

    #[test]
    fn a_windows_style_path_gains_the_third_slash() {
        // Exercised on every platform: the transform is pure string work, and
        // getting it wrong only shows up on Windows where it cannot be tested.
        let raw = "C:/Users/a/AppData/lean-work/Main.lean";
        let uri = path_to_uri(Path::new(raw));
        assert_eq!(uri, "file:///C:/Users/a/AppData/lean-work/Main.lean");
    }
}
