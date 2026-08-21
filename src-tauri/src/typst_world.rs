use once_cell::sync::OnceCell;
use std::path::PathBuf;
use std::sync::Mutex;
use typst::diag::{FileError, FileResult};
use typst::foundations::{Bytes, Datetime, Duration};
use typst::syntax::{FileId, RootedPath, Source, VirtualPath, VirtualRoot};
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
        //
        // None of typst's bundled fonts cover Arabic, so Quran blocks in exported
        // .typ files rendered as tofu boxes. Ship Scheherazade New (SIL OFL, see
        // fonts/OFL.txt) — the same face the editor uses for Quran text.
        let bundled: Vec<Bytes> = typst_assets::fonts()
            .map(Bytes::new)
            .chain([
                Bytes::new(include_bytes!("../fonts/ScheherazadeNew-Regular.ttf").as_slice()),
                Bytes::new(include_bytes!("../fonts/ScheherazadeNew-Bold.ttf").as_slice()),
            ])
            .collect();
        for bytes in bundled {
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

        let main_id = FileId::new(RootedPath::new(
            VirtualRoot::Project,
            VirtualPath::new("main.typ").expect("valid virtual path"),
        ));

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
            .realize(&root)
            .map_err(|_| FileError::NotFound(root))
    }

    /// Resolve a `FileId` that belongs to a package to an absolute path in the
    /// local typst package cache.
    fn resolve_package_path(&self, id: FileId) -> FileResult<PathBuf> {
        let pkg = match id.root() {
            VirtualRoot::Package(pkg) => pkg,
            VirtualRoot::Project => {
                return Err(FileError::Other(Some("no package spec".into())))
            }
        };
        let root = self
            .packages_root
            .as_ref()
            .ok_or_else(|| FileError::Other(Some("cannot locate typst package cache".into())))?;

        let pkg_dir = root
            .join(pkg.namespace.as_str())
            .join(pkg.name.as_str())
            .join(pkg.version.to_string());

        id.vpath()
            .realize(&pkg_dir)
            .map_err(|_| FileError::NotFound(pkg_dir))
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
        if matches!(id.root(), VirtualRoot::Package(_)) {
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
        if matches!(id.root(), VirtualRoot::Package(_)) {
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
    fn today(&self, offset: Option<Duration>) -> Option<Datetime> {
        use std::time::{SystemTime, UNIX_EPOCH};
        let offset_secs = offset.map(|d| d.seconds() as i64).unwrap_or(0);
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

/// Serialises use of the shared world.
///
/// Building a world loads and indexes the bundled fonts, so there is one for
/// the whole process. But compiling means *mutating* it — set the project root,
/// set the source, compile, then read the source back to turn spans into
/// `file:line:column`. That sequence is only correct if nothing else changes the
/// world in the middle of it, and two overlapping compiles otherwise silently
/// render one caller's document from the other's source.
static WORLD_LOCK: Mutex<()> = Mutex::new(());

fn get_world() -> &'static MinimalWorld {
    WORLD.get_or_init(MinimalWorld::new)
}

/// Run `f` with exclusive use of the shared world.
///
/// Every compile goes through here; the world is deliberately not reachable
/// otherwise, so the critical section cannot be skipped by a new call site.
///
/// A panic inside `f` — typst does panic on some malformed input — poisons the
/// lock, so the poison is stepped over rather than propagated. Leaving it would
/// turn one bad document into a permanently broken previewer.
///
/// Not reentrant: `f` must not call back into `with_world`.
pub fn with_world<T>(f: impl FnOnce(&'static MinimalWorld) -> T) -> T {
    let _guard = WORLD_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    f(get_world())
}

#[cfg(test)]
mod tests {
    use super::*;

    // The lexical→typst exporter emits native citations tied to an inline
    // (bytes) BibTeX bibliography; make sure this app's compiler build
    // actually renders them (format sniffing for bytes sources, CSL styles).
    /// Two compiles running at once must each get their own document.
    ///
    /// This is the bug `with_world` exists to prevent: the world is shared and
    /// mutable, so an interleaved `set_source` used to make one caller render
    /// the other's source. It only appears under real concurrency, which is why
    /// it survived as a mysterious flake in the suite rather than a failing
    /// test — the two Typst tests were racing each other.
    #[test]
    fn concurrent_compiles_do_not_cross_sources() {
        let one = std::thread::spawn(|| {
            with_world(|world| {
                world.set_project_root(None);
                world.set_source("#set page(width: 8cm)\nALPHA\n".into());
                let doc = typst::compile::<typst_layout::PagedDocument>(world)
                    .output
                    .expect("alpha compiles");
                typst_svg::svg(&doc.pages()[0], &typst_svg::SvgOptions::default())
            })
        });
        let two = std::thread::spawn(|| {
            with_world(|world| {
                world.set_project_root(None);
                // Deliberately invalid, so a crossed source shows up as the
                // wrong *outcome* and not merely different glyphs.
                world.set_source("#set page(width: 8cm)\n$angle.nope$\n".into());
                typst::compile::<typst_layout::PagedDocument>(world)
                    .output
                    .err()
                    .map(|e| e.len())
            })
        });

        let svg = one.join().expect("alpha thread");
        let errors = two.join().expect("beta thread");

        assert!(!svg.is_empty(), "the valid document still rendered");
        assert!(
            errors.is_some_and(|n| n > 0),
            "the invalid document must still fail; if it compiled, it was \
             handed the other thread's source"
        );
    }

    #[test]
    fn bibliography_from_bytes_compiles() {
        with_world(|world| {
        world.set_project_root(None);
        world.set_source(String::from(
            "As Khan argues #cite(label(\"khan2020\")) and #cite(label(\"khan2020\"), form: \"prose\") elaborates.\n\n#bibliography(bytes(\"@book{khan2020,\\n  title = {Understanding the Quran},\\n  author = {Khan, A.},\\n  year = {2020}\\n}\"), style: \"apa\", title: \"References\", full: true)\n",
        ));
        let result = typst::compile::<typst_layout::PagedDocument>(world);
        let doc = match result.output {
            Ok(doc) => doc,
            Err(errors) => panic!("compile failed: {errors:?}"),
        };
        let svg = typst_svg::svg(&doc.pages()[0], &typst_svg::SvgOptions::default());
        assert!(!svg.is_empty());
        // The bibliography heading and entry should have been laid out.
        assert!(doc.pages().len() >= 1);
        });
    }
}
