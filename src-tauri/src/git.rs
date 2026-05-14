use std::path::{Path, PathBuf};

use git2::{Repository, ObjectType};

/// Returns the contents of `file_path` at the repository's HEAD, or `None` if
/// the file is not tracked / not inside a git repository / repository has no
/// commits yet. Errors (other than the above) surface as `Err`.
#[tauri::command]
pub fn git_head_content(file_path: String) -> Result<Option<String>, String> {
    let abs = PathBuf::from(&file_path);
    if !abs.is_absolute() {
        return Err("file_path must be absolute".into());
    }

    let parent = match abs.parent() {
        Some(p) => p,
        None => return Ok(None),
    };

    let repo = match Repository::discover(parent) {
        Ok(r) => r,
        Err(_) => return Ok(None),
    };

    let workdir = match repo.workdir() {
        Some(w) => w.to_path_buf(),
        None => return Ok(None),
    };

    let rel = match pathdiff(&abs, &workdir) {
        Some(p) => p,
        None => return Ok(None),
    };

    let head = match repo.head() {
        Ok(h) => h,
        Err(_) => return Ok(None),
    };
    let commit = match head.peel_to_commit() {
        Ok(c) => c,
        Err(_) => return Ok(None),
    };
    let tree = match commit.tree() {
        Ok(t) => t,
        Err(_) => return Ok(None),
    };

    let entry = match tree.get_path(&rel) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };

    if entry.kind() != Some(ObjectType::Blob) {
        return Ok(None);
    }

    let object = entry
        .to_object(&repo)
        .map_err(|e| format!("git: {e}"))?;
    let blob = match object.as_blob() {
        Some(b) => b,
        None => return Ok(None),
    };

    match std::str::from_utf8(blob.content()) {
        Ok(s) => Ok(Some(s.to_string())),
        Err(_) => Ok(None),
    }
}

fn pathdiff(file: &Path, base: &Path) -> Option<PathBuf> {
    let file = file.canonicalize().ok()?;
    let base = base.canonicalize().ok()?;
    file.strip_prefix(&base).ok().map(|p| p.to_path_buf())
}
