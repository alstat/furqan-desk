use once_cell::sync::OnceCell;
use std::path::PathBuf;
use std::sync::Mutex;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime};
use typst::syntax::{FileId, Source, VirtualPath};
use typst::text::{Font, FontBook};
use typst::utils::LazyHash;
use typst::{Library, LibraryExt};

pub struct MinimalWorld {
    library: LazyHash<Library>,
    book: LazyHash<FontBook>,
    fonts: Vec<Font>,
    main_id: FileId,
    source_text: Mutex<String>,
    /// Filesystem directory used to resolve relative imports / includes
    /// from the main source. Set per-compile by the frontend.
    project_root: Mutex<Option<PathBuf>>,
    /// Root of the local typst package cache, e.g.
    ///   macOS  → ~/Library/Application Support/typst/packages
    ///   Linux  → ~/.local/share/typst/packages
    packages_root: Option<PathBuf>,
}

impl MinimalWorld {
    fn new() -> Self {
        let mut book = FontBook::new();
        let mut fonts: Vec<Font> = Vec::new();

        // Load only typst's bundled fonts (New Computer Modern, Linux Libertine, etc.)
        // Skipping system fonts avoids loading hundreds of MB of font data at startup.
        for font_data in typst_assets::fonts() {
            let bytes = Bytes::new(font_data);
            let mut i = 0;
            loop {
                match Font::new(bytes.clone(), i) {
                    Some(font) => {
                        book.push(font.info().clone());
                        fonts.push(font);
                        i += 1;
                    }
                    None => break,
                }
            }
        }

        let main_id = FileId::new(None, VirtualPath::new("main.typ"));

        // Resolve typst's local package cache directory.
        // typst stores packages at: <data_dir>/typst/packages/<namespace>/<name>/<version>/
        let packages_root = dirs::data_dir().map(|d| d.join("typst").join("packages"));

        Self {
            library: LazyHash::new(Library::builder().build()),
            book: LazyHash::new(book),
            fonts,
            main_id,
            source_text: Mutex::new(String::new()),
            project_root: Mutex::new(None),
            packages_root,
        }
    }

    pub fn set_source(&self, s: String) {
        *self.source_text.lock().unwrap() = s;
    }

    /// Configure the directory used to resolve relative `#import` / `#include`
    /// paths from the main source. Pass `None` to clear it.
    pub fn set_project_root(&self, root: Option<PathBuf>) {
        *self.project_root.lock().unwrap() = root;
    }

    /// Resolve a non-package `FileId` (a relative import/include from the main
    /// source) to an absolute path under the current project root.
    fn resolve_project_path(&self, id: FileId) -> FileResult<PathBuf> {
        let root = self
            .project_root
            .lock()
            .unwrap()
            .clone()
            .ok_or_else(|| FileError::NotFound(PathBuf::new()))?;
        id.vpath()
            .resolve(&root)
            .ok_or_else(|| FileError::NotFound(root))
    }

    /// Resolve a `FileId` that belongs to a package to an absolute path in the
    /// local typst package cache.
    fn resolve_package_path(&self, id: FileId) -> FileResult<PathBuf> {
        let pkg = id
            .package()
            .ok_or_else(|| FileError::Other(Some("no package spec".into())))?;
        let root = self
            .packages_root
            .as_ref()
            .ok_or_else(|| FileError::Other(Some("cannot locate typst package cache".into())))?;

        let pkg_dir = root
            .join(pkg.namespace.as_str())
            .join(pkg.name.as_str())
            .join(pkg.version.to_string());

        id.vpath()
            .resolve(&pkg_dir)
            .ok_or_else(|| FileError::NotFound(pkg_dir))
    }
}

impl typst::World for MinimalWorld {
    fn library(&self) -> &LazyHash<Library> {
        &self.library
    }

    fn book(&self) -> &LazyHash<FontBook> {
        &self.book
    }

    fn main(&self) -> FileId {
        self.main_id
    }

    fn source(&self, id: FileId) -> FileResult<Source> {
        if id == self.main_id {
            let text = self.source_text.lock().unwrap().clone();
            return Ok(Source::new(id, text));
        }
        // Package file (e.g. @preview/ilm:1.4.2)
        if id.package().is_some() {
            let path = self.resolve_package_path(id)?;
            let text = std::fs::read_to_string(&path)
                .map_err(|_| FileError::NotFound(path))?;
            return Ok(Source::new(id, text));
        }
        // Relative import/include from the main source.
        let path = self.resolve_project_path(id)?;
        let text = std::fs::read_to_string(&path)
            .map_err(|_| FileError::NotFound(path))?;
        Ok(Source::new(id, text))
    }

    fn file(&self, id: FileId) -> FileResult<Bytes> {
        if id.package().is_some() {
            let path = self.resolve_package_path(id)?;
            let data = std::fs::read(&path)
                .map_err(|_| FileError::NotFound(path))?;
            return Ok(Bytes::new(data));
        }
        let path = self.resolve_project_path(id)?;
        let data = std::fs::read(&path)
            .map_err(|_| FileError::NotFound(path))?;
        Ok(Bytes::new(data))
    }

    fn font(&self, index: usize) -> Option<Font> {
        self.fonts.get(index).cloned()
    }

    /// Return today's date derived from the system clock.
    fn today(&self, offset: Option<i64>) -> Option<Datetime> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let offset_secs = offset.unwrap_or(0) * 3600;
        let unix_secs = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .ok()?
            .as_secs() as i64
            + offset_secs;
        let (y, m, d) = unix_days_to_ymd(unix_secs / 86400);
        Datetime::from_ymd(y, m, d)
    }
}

/// Convert a count of days since the Unix epoch (1970-01-01) to (year, month, day).
/// Uses the algorithm from http://howardhinnant.github.io/date_algorithms.html
fn unix_days_to_ymd(z: i64) -> (i32, u8, u8) {
    let z = z + 719468;
    let era: i64 = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u8, d as u8)
}

static WORLD: OnceCell<MinimalWorld> = OnceCell::new();

pub fn get_world() -> &'static MinimalWorld {
    WORLD.get_or_init(MinimalWorld::new)
}
