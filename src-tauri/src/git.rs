use std::path::{Path, PathBuf};

use git2::{ObjectType, Repository, Status, StatusOptions};

/// A single changed entry in the working tree, reported relative to the
/// discovered repository's workdir but with an absolute `path` so the frontend
/// can match it directly against File Explorer node paths.
#[derive(serde::Serialize)]
pub struct GitFileStatus {
    /// Absolute path to the changed file (forward-slash separated).
    pub path: String,
    /// One of: "modified", "added", "untracked", "deleted", "renamed", "conflicted".
    pub status: String,
}

/// Lists the working-tree changes for the git repository that contains `folder`.
/// Returns an empty list when `folder` is not inside a git repository, so the
/// caller can treat "no VCS" and "no changes" identically.
#[tauri::command]
pub fn git_status(folder: String) -> Result<Vec<GitFileStatus>, String> {
    let base = PathBuf::from(&folder);
    if !base.is_absolute() {
        return Err("folder must be absolute".into());
    }

    let repo = match Repository::discover(&base) {
        Ok(r) => r,
        Err(_) => return Ok(vec![]),
    };
    let workdir = match repo.workdir() {
        Some(w) => w.to_path_buf(),
        None => return Ok(vec![]),
    };

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("git: {e}"))?;

    let mut out = Vec::new();
    for entry in statuses.iter() {
        let s = entry.status();
        let label = if s.contains(Status::CONFLICTED) {
            "conflicted"
        } else if s.intersects(Status::WT_DELETED | Status::INDEX_DELETED) {
            "deleted"
        } else if s.intersects(Status::WT_RENAMED | Status::INDEX_RENAMED) {
            "renamed"
        } else if s.contains(Status::WT_NEW) {
            "untracked"
        } else if s.contains(Status::INDEX_NEW) {
            "added"
        } else if s.intersects(
            Status::WT_MODIFIED
                | Status::INDEX_MODIFIED
                | Status::WT_TYPECHANGE
                | Status::INDEX_TYPECHANGE,
        ) {
            "modified"
        } else {
            continue;
        };

        let rel = match entry.path() {
            Some(p) => p,
            None => continue,
        };
        let abs = workdir.join(rel);
        out.push(GitFileStatus {
            path: abs.to_string_lossy().replace('\\', "/"),
            status: label.to_string(),
        });
    }

    Ok(out)
}

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
