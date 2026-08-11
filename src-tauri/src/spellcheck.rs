//! Hunspell-backed spell checking (via the pure-Rust `spellbook` crate).
//!
//! Dictionaries are resolved from two places, downloaded copies taking
//! precedence over the ones bundled with the app:
//!   1. `<app_data_dir>/dictionaries/<code>.{aff,dic}` — downloaded on demand
//!   2. `<resource_dir>/dictionaries/<code>.{aff,dic}`  — bundled at build time
//!
//! Word offsets returned to the frontend are **UTF-16 code-unit** offsets so
//! they line up with JavaScript string indices and CodeMirror document
//! positions without any conversion on the JS side.

use serde::Serialize;
use spellbook::Dictionary;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager, State};

use crate::commands::HttpClient;

/// Languages shipped with the app (available offline immediately). The name is
/// an English label; the frontend localizes the picker separately if needed.
const BUNDLED: &[(&str, &str)] = &[
    ("en-US", "English (US)"),
    ("en-GB", "English (UK)"),
    ("fr", "French"),
    ("de", "German"),
    ("es", "Spanish"),
    ("it", "Italian"),
    ("ar", "Arabic"),
];

/// Extra languages that can be fetched on demand from the `wooorm/dictionaries`
/// repository. `code` is our canonical code; `repo` is the folder name there.
const DOWNLOADABLE: &[(&str, &str, &str)] = &[
    // (code, display name, wooorm repo folder)
    ("nl", "Dutch", "nl"),
    ("pt", "Portuguese", "pt"),
    ("pt-PT", "Portuguese (Portugal)", "pt-PT"),
    ("ru", "Russian", "ru"),
    ("pl", "Polish", "pl"),
    ("sv", "Swedish", "sv"),
    ("da", "Danish", "da"),
    ("nb", "Norwegian Bokmål", "nb"),
    ("cs", "Czech", "cs"),
    ("ro", "Romanian", "ro"),
    ("tr", "Turkish", "tr"),
    ("uk", "Ukrainian", "uk"),
    ("el", "Greek", "el"),
    ("hu", "Hungarian", "hu"),
    ("fa", "Persian", "fa"),
    ("he", "Hebrew", "he"),
];

// ── Dictionary cache ────────────────────────────────────────────────────────

/// Process-wide cache of parsed dictionaries keyed by language code. Parsing a
/// dictionary is expensive (the Arabic list is ~7 MB), so we keep each one for
/// the lifetime of the process and hand out cheap `Arc` clones.
static CACHE: OnceLock<Mutex<HashMap<String, Arc<Dictionary>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Arc<Dictionary>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Locate a language's `.aff`/`.dic` pair, preferring a downloaded copy in the
/// app data directory over the bundled resource copy.
fn dict_paths(app: &AppHandle, code: &str) -> Option<(PathBuf, PathBuf)> {
    let candidates = [
        app.path().app_data_dir().ok(),
        app.path().resource_dir().ok(),
    ];
    for base in candidates.into_iter().flatten() {
        let dir = base.join("dictionaries");
        let aff = dir.join(format!("{code}.aff"));
        let dic = dir.join(format!("{code}.dic"));
        if aff.is_file() && dic.is_file() {
            return Some((aff, dic));
        }
    }
    None
}

/// Load (or fetch from cache) the dictionary for `code`.
fn load(app: &AppHandle, code: &str) -> Result<Arc<Dictionary>, String> {
    if let Some(d) = cache().lock().unwrap().get(code) {
        return Ok(d.clone());
    }
    let (aff_path, dic_path) = dict_paths(app, code)
        .ok_or_else(|| format!("dictionary not installed: {code}"))?;
    let aff = std::fs::read_to_string(&aff_path).map_err(|e| e.to_string())?;
    let dic = std::fs::read_to_string(&dic_path).map_err(|e| e.to_string())?;
    let dict = Dictionary::new(&aff, &dic)
        .map_err(|e| format!("failed to parse dictionary {code}: {e:?}"))?;
    let arc = Arc::new(dict);
    cache().lock().unwrap().insert(code.to_string(), arc.clone());
    Ok(arc)
}

// ── Tokenizer ───────────────────────────────────────────────────────────────

/// A word extracted from the text, with UTF-16 offsets into the original
/// string.
struct Token {
    word: String,
    start: usize,
    end: usize,
}

/// Arabic combining marks (harakat, etc.) that are part of a word rather than a
/// boundary.
fn is_word_mark(c: char) -> bool {
    matches!(c,
        '\u{0610}'..='\u{061A}'
        | '\u{064B}'..='\u{065F}'
        | '\u{0670}'
        | '\u{06D6}'..='\u{06ED}'
    )
}

/// The "core" of a word — a letter or a mark attached to one. Apostrophes and
/// hyphens are allowed *inside* a word but trimmed from its edges.
fn is_core(c: char) -> bool {
    c.is_alphabetic() || is_word_mark(c)
}

fn is_word_char(c: char) -> bool {
    is_core(c) || matches!(c, '\'' | '\u{2019}' | '-')
}

/// Split text into candidate words with UTF-16 offsets. Runs shorter than two
/// letters, or containing digits, are dropped so we don't flag `x2` or `a`.
fn tokenize(text: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    // (char, start_utf16, end_utf16)
    let mut run: Vec<(char, usize, usize)> = Vec::new();
    let mut u16_pos = 0usize;

    let flush = |run: &mut Vec<(char, usize, usize)>, tokens: &mut Vec<Token>| {
        if run.is_empty() {
            return;
        }
        // Trim leading/trailing joiners (apostrophes / hyphens).
        let mut lo = 0;
        let mut hi = run.len();
        while lo < hi && !is_core(run[lo].0) {
            lo += 1;
        }
        while hi > lo && !is_core(run[hi - 1].0) {
            hi -= 1;
        }
        let slice = &run[lo..hi];
        let letters = slice.iter().filter(|(c, _, _)| c.is_alphabetic()).count();
        if letters >= 2 {
            tokens.push(Token {
                word: slice.iter().map(|(c, _, _)| *c).collect(),
                start: slice[0].1,
                end: slice[slice.len() - 1].2,
            });
        }
        run.clear();
    };

    for c in text.chars() {
        let w = c.len_utf16();
        if c.is_numeric() {
            // A digit anywhere in the run disqualifies the whole run.
            run.clear();
            // Skip until the current word boundary.
            u16_pos += w;
            continue;
        }
        if is_word_char(c) {
            run.push((c, u16_pos, u16_pos + w));
        } else {
            flush(&mut run, &mut tokens);
        }
        u16_pos += w;
    }
    flush(&mut run, &mut tokens);
    tokens
}

// ── Commands ────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct Misspelling {
    pub word: String,
    /// UTF-16 start offset (inclusive).
    pub start: usize,
    /// UTF-16 end offset (exclusive).
    pub end: usize,
}

/// Check `text` against the dictionary for `lang`, returning every misspelled
/// word with its UTF-16 range. Suggestions are fetched separately (on demand)
/// via [`spell_suggest`] to keep this fast on large documents.
#[tauri::command]
pub fn spell_check(
    app: AppHandle,
    text: String,
    lang: String,
) -> Result<Vec<Misspelling>, String> {
    let dict = load(&app, &lang)?;
    let mut out = Vec::new();
    for t in tokenize(&text) {
        if !dict.check(&t.word) {
            out.push(Misspelling {
                word: t.word,
                start: t.start,
                end: t.end,
            });
        }
    }
    Ok(out)
}

/// Correction suggestions for a single misspelled `word`.
#[tauri::command]
pub fn spell_suggest(
    app: AppHandle,
    word: String,
    lang: String,
) -> Result<Vec<String>, String> {
    let dict = load(&app, &lang)?;
    let mut suggestions = Vec::new();
    dict.suggest(&word, &mut suggestions);
    suggestions.truncate(8);
    Ok(suggestions)
}

#[derive(Serialize)]
pub struct LangInfo {
    pub code: String,
    pub name: String,
    /// The dictionary files are present (bundled or downloaded).
    pub installed: bool,
    /// Shipped with the app (always installed, cannot be removed).
    pub bundled: bool,
}

/// List every language the picker can offer: bundled ones plus the
/// downloadable set, with an `installed` flag reflecting what is on disk.
#[tauri::command]
pub fn spell_languages(app: AppHandle) -> Vec<LangInfo> {
    let mut out = Vec::new();
    for (code, name) in BUNDLED {
        out.push(LangInfo {
            code: (*code).to_string(),
            name: (*name).to_string(),
            installed: true,
            bundled: true,
        });
    }
    for (code, name, _repo) in DOWNLOADABLE {
        out.push(LangInfo {
            code: (*code).to_string(),
            name: (*name).to_string(),
            installed: dict_paths(&app, code).is_some(),
            bundled: false,
        });
    }
    out
}

/// Best-effort auto-detection of the writing language from the OS locale.
/// Returns a code we can actually offer, falling back to `en-US`.
#[tauri::command]
pub fn spell_detect_language(app: AppHandle) -> String {
    let locale = sys_locale::get_locale().unwrap_or_default().to_lowercase();
    let primary = locale.split(['-', '_']).next().unwrap_or("").to_string();

    // English variants: distinguish US vs the various UK-style locales.
    if primary == "en" {
        let uk = ["gb", "uk", "au", "nz", "ie", "za"]
            .iter()
            .any(|r| locale.contains(r));
        return if uk { "en-GB" } else { "en-US" }.to_string();
    }

    // Prefer an installed language whose primary subtag matches.
    let installed: Vec<String> = spell_languages(app)
        .into_iter()
        .filter(|l| l.installed)
        .map(|l| l.code)
        .collect();
    if let Some(hit) = installed
        .iter()
        .find(|c| c.to_lowercase().split(['-']).next() == Some(primary.as_str()))
    {
        return hit.clone();
    }
    if !primary.is_empty() {
        return primary;
    }
    "en-US".to_string()
}

/// Download a dictionary from `wooorm/dictionaries` into the app data dir so it
/// becomes available for checking. No-op for already-installed languages.
#[tauri::command]
pub async fn install_spell_language(
    app: AppHandle,
    http: State<'_, HttpClient>,
    code: String,
) -> Result<(), String> {
    if dict_paths(&app, &code).is_some() {
        return Ok(());
    }
    let repo = DOWNLOADABLE
        .iter()
        .find(|(c, _, _)| *c == code)
        .map(|(_, _, repo)| *repo)
        .ok_or_else(|| format!("unknown language: {code}"))?;

    let base = format!(
        "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/{repo}"
    );
    let aff = http
        .client
        .get(format!("{base}/index.aff"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;
    let dic = http
        .client
        .get(format!("{base}/index.dic"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("dictionaries");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(dir.join(format!("{code}.aff")), aff)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(dir.join(format!("{code}.dic")), dic)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizer_extracts_words_with_utf16_offsets() {
        // "café" has an accented char; ensure offsets are code-unit based.
        let toks = tokenize("hi café x2 don't");
        let words: Vec<_> = toks.iter().map(|t| t.word.as_str()).collect();
        assert_eq!(words, vec!["hi", "café", "don't"]);
        // "hi" occupies UTF-16 units 0..2.
        assert_eq!((toks[0].start, toks[0].end), (0, 2));
    }

    #[test]
    fn tokenizer_drops_digits_and_short_runs() {
        let toks = tokenize("a 123 ok4 be");
        let words: Vec<_> = toks.iter().map(|t| t.word.as_str()).collect();
        // "a" too short, "123" numeric, "ok4" has a digit → only "be".
        assert_eq!(words, vec!["be"]);
    }

    // Verify the bundled en-US dictionary actually parses with spellbook and
    // that check/suggest behave — catches a bad download or an API mismatch.
    #[test]
    fn bundled_en_us_dictionary_parses_and_checks() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries");
        let aff = std::fs::read_to_string(dir.join("en-US.aff")).unwrap();
        let dic = std::fs::read_to_string(dir.join("en-US.dic")).unwrap();
        let dict = Dictionary::new(&aff, &dic).expect("en-US dictionary should parse");
        assert!(dict.check("hello"), "'hello' should be a valid word");
        assert!(!dict.check("helllo"), "'helllo' should be misspelled");
        let mut sug = Vec::new();
        dict.suggest("helllo", &mut sug);
        assert!(
            sug.iter().any(|s| s == "hello"),
            "expected 'hello' among suggestions, got {sug:?}"
        );
    }
}
