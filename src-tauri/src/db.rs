use rusqlite::{Connection, OptionalExtension, Result};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

// ── Platform-specific asset copy ────────────────────────────────────────────

/// On Android, APK assets are not accessible as regular filesystem paths.
/// Use the Android NDK AssetManager (via JNI) to stream the file into `dest`.
#[cfg(target_os = "android")]
fn copy_static_db(
    _src: &Path,
    dest: &Path,
    asset_relative_path: &str,
) -> Result<()> {
    use std::io::Write;
    use jni::{objects::JObject, JavaVM};

    let ctx = ndk_context::android_context();
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(android_err)?;
    let mut env = vm.attach_current_thread()
        .map_err(android_err)?;
    let activity = unsafe { JObject::from_raw(ctx.context().cast()) };

    // activity.getAssets() -> Java AssetManager object
    let asset_manager_obj = env
        .call_method(&activity, "getAssets", "()Landroid/content/res/AssetManager;", &[])
        .and_then(|v| v.l())
        .map_err(android_err)?;

    // Bridge the Java AssetManager to the native AAssetManager pointer.
    // ndk_sys re-exports JNIEnv/jobject from jni_sys, so the types are identical —
    // no cast needed between jni::sys::* and ndk_sys::* values.
    let raw_am = unsafe {
        ndk_sys::AAssetManager_fromJava(
            env.get_native_interface(),
            asset_manager_obj.as_raw(),
        )
    };
    let am = unsafe {
        ndk::asset::AssetManager::from_ptr(
            std::ptr::NonNull::new(raw_am)
                .ok_or_else(|| android_err("AAssetManager_fromJava returned null"))?,
        )
    };

    let c_path = std::ffi::CString::new(asset_relative_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let mut asset = am.open(&c_path)
        .ok_or_else(|| rusqlite::Error::ToSqlConversionFailure(Box::new(
            std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Android asset not found: {}", asset_relative_path),
            ),
        )))?;

    let mut out = std::fs::File::create(dest)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    std::io::copy(&mut asset, &mut out)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    out.flush()
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    Ok(())
}

#[cfg(target_os = "android")]
fn android_err<E: std::fmt::Display>(e: E) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(
        std::io::Error::new(std::io::ErrorKind::Other, e.to_string()),
    ))
}

/// Must match DB_VERSION in gen-db/src/main.rs (`cargo run -p gen-db --release`).
/// Increment both when the static dataset changes.
///
/// Every platform checks this against the dataset it actually opened (see
/// `verify_static_version`); Android additionally uses it to decide when to
/// refresh its local copy, since APK assets aren't attachable in place.
const DB_VERSION: i64 = 16;

/// Wrap a diagnostic message as a `rusqlite::Error` so it travels out through
/// `Database::new` and into the startup crash report.
fn db_err(message: String) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
        std::io::ErrorKind::Other,
        message,
    )))
}

pub struct Database(pub Mutex<Connection>);

impl Database {
    /// Open (or initialise) the runtime database.
    ///
    /// User data (bookmarks, highlights, …) lives in a small
    /// `app_data_dir/user.db`, which is the connection's `main` schema.  The
    /// bundled `quran_static.db` is ATTACHed read-only straight from the app
    /// bundle — it is never copied, so the ~400 MB dataset exists on disk only
    /// once.  Unqualified table names in queries resolve to `main` first and
    /// then fall through to the attached schema, so command SQL is agnostic to
    /// the split.  Data updates need no migration: the attached file always
    /// matches the app build it shipped with.
    pub fn new(static_db_path: PathBuf, app_data_dir: PathBuf) -> Result<Self> {
        let static_db_path = Self::resolve_static_db(&static_db_path, &app_data_dir)?;
        let user_db_path = app_data_dir.join("user.db");

        let conn = Connection::open(&user_db_path)?;
        Self::apply_pragmas(&conn)?;
        Self::init_user_data_tables(&conn)?;
        Self::migrate_legacy_db(&conn, &app_data_dir)?;
        Self::attach_static(&conn, &static_db_path)?;
        Self::verify_static_version(&conn, &static_db_path)?;
        Ok(Database(Mutex::new(conn)))
    }

    /// On desktop / iOS the bundled static DB is attachable in place.
    #[cfg(not(target_os = "android"))]
    fn resolve_static_db(bundle_path: &Path, _app_data_dir: &Path) -> Result<PathBuf> {
        Ok(bundle_path.to_path_buf())
    }

    /// On Android, APK assets aren't filesystem paths, so SQLite can't attach
    /// the bundled file directly; keep a copy in app data, refreshed whenever
    /// the shipped dataset version changes.
    #[cfg(target_os = "android")]
    fn resolve_static_db(bundle_path: &Path, app_data_dir: &Path) -> Result<PathBuf> {
        let dest = app_data_dir.join("quran_static.db");
        if !dest.exists() || Self::read_db_version(&dest).unwrap_or(0) != DB_VERSION {
            println!("Copying static database from APK assets …");
            copy_static_db(bundle_path, &dest, "data/quran_static.db")?;
        }
        Ok(dest)
    }

    fn attach_static(conn: &Connection, path: &Path) -> Result<()> {
        conn.execute(
            "ATTACH DATABASE ?1 AS static_db",
            [Self::read_only_uri(path)],
        )?;
        conn.execute_batch("PRAGMA static_db.cache_size = -1024;")?;
        Ok(())
    }

    /// Reject a bundled dataset that doesn't match this build.
    ///
    /// Attaching a stale `quran_static.db` succeeds silently — the failure only
    /// shows up much later, deep inside a query, as something like "no such
    /// table: reciters", which points nowhere near the real cause.  Checking
    /// here turns that into one clear error at startup, which the panic hook
    /// then surfaces in a dialog and the crash log.
    fn verify_static_version(conn: &Connection, path: &Path) -> Result<()> {
        let found: i64 = conn
            .query_row("SELECT version FROM static_db.db_version LIMIT 1", [], |row| {
                row.get(0)
            })
            .map_err(|e| {
                db_err(format!(
                    "bundled dataset at {} has no readable db_version ({e}); it predates \
                     version {DB_VERSION}. Regenerate it with `cargo run -p gen-db \
                     --release` from the workspace root.",
                    path.display()
                ))
            })?;

        if found != DB_VERSION {
            return Err(db_err(format!(
                "bundled dataset at {} is version {found}, but this build requires \
                 {DB_VERSION}. Regenerate it with `cargo run -p gen-db --release` from \
                 the workspace root, then rebuild the package so it ships the new file.",
                path.display()
            )));
        }
        Ok(())
    }

    /// Build a `file:` URI that forces read-only access, so attaching never
    /// writes journal/WAL files next to the bundled resource.
    fn read_only_uri(path: &Path) -> String {
        let s = path.to_string_lossy();
        // Strip Windows verbatim prefixes (\\?\C:\… and \\?\UNC\server\…):
        // their '?' would otherwise be read by SQLite as a URI authority.
        let s: String = if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{rest}")
        } else if let Some(rest) = s.strip_prefix(r"\\?\") {
            rest.to_string()
        } else {
            s.into_owned()
        };
        let mut p = s.replace('\\', "/");
        // '%', '#' and '?' carry meaning inside SQLite URIs.
        p = p.replace('%', "%25").replace('#', "%23").replace('?', "%3F");
        if p.starts_with("//") {
            // UNC path: keep the URI authority empty → file:////server/share/…
            p.insert_str(0, "//");
        } else if !p.starts_with('/') {
            p.insert(0, '/'); // e.g. Windows "C:/…" → "/C:/…"
        }
        format!("file:{p}?mode=ro")
    }

    /// One-time migration away from the pre-1.4.4 layout, where the full
    /// static DB was copied to `app_data_dir/quran.db` with the user tables
    /// inside it (and version migrations left a `quran.db.bak` behind) —
    /// roughly 400 MB each.  Pull the user rows into `user.db`, then delete
    /// the legacy files.  Deletion is best-effort and retried every launch;
    /// the `app_meta` marker keeps the row copy itself from running twice.
    fn migrate_legacy_db(conn: &Connection, app_data_dir: &Path) -> Result<()> {
        let legacy = app_data_dir.join("quran.db");
        let mut migrated = conn
            .query_row(
                "SELECT 1 FROM app_meta WHERE key = 'legacy_db_migrated'",
                [],
                |_| Ok(()),
            )
            .is_ok();

        if legacy.exists() && !migrated {
            println!("Migrating user data out of legacy quran.db …");
            let data = match Self::extract_user_data(&legacy) {
                Ok(data) => data,
                Err(e) => {
                    // Leave the legacy DB untouched so nothing is lost; the
                    // migration is retried on next launch.
                    eprintln!("Warning: failed to read user data from legacy quran.db: {e}");
                    return Ok(());
                }
            };
            Self::restore_user_data(conn, &data)?;
            conn.execute(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES ('legacy_db_migrated', '1')",
                [],
            )?;
            migrated = true;
        }

        if migrated || !legacy.exists() {
            for name in ["quran.db", "quran.db-wal", "quran.db-shm", "quran.db.bak"] {
                let _ = std::fs::remove_file(app_data_dir.join(name));
            }
        }
        Ok(())
    }

    fn apply_pragmas(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA cache_size = -1024;",
        )
    }

    #[cfg(target_os = "android")]
    fn read_db_version(db_path: &PathBuf) -> Result<i64> {
        let conn = Connection::open_with_flags(
            db_path,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        conn.query_row(
            "SELECT version FROM db_version LIMIT 1",
            [],
            |row| row.get(0),
        )
    }

    fn init_user_data_tables(conn: &Connection) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS bookmarks (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                surah       INTEGER NOT NULL,
                ayah        INTEGER NOT NULL,
                note        TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS last_read (
                id          INTEGER PRIMARY KEY CHECK (id = 1),
                surah       INTEGER NOT NULL,
                ayah        INTEGER NOT NULL,
                updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS highlights (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                surah       INTEGER NOT NULL,
                ayah        INTEGER NOT NULL,
                text        TEXT NOT NULL,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS blog_posts (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                title    TEXT NOT NULL,
                date     TEXT NOT NULL,
                author   TEXT NOT NULL,
                post_url TEXT NOT NULL,
                seen_at  TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS app_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS verse_of_day (
                day      TEXT PRIMARY KEY,
                surah    INTEGER NOT NULL,
                ayah     INTEGER NOT NULL,
                shown_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS take_home_messages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                source_label TEXT NOT NULL,
                context      TEXT NOT NULL,
                result       TEXT NOT NULL,
                locale       TEXT NOT NULL DEFAULT 'en',
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS arabic_study_profile (
                id                 INTEGER PRIMARY KEY CHECK (id = 1),
                proficiency_level  TEXT NOT NULL,
                onboarded_at       TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS arabic_study_letter_progress (
                letter        TEXT PRIMARY KEY,
                practiced_at  TEXT,
                mastered      INTEGER NOT NULL DEFAULT 0,
                mastered_at   TEXT
            );
            CREATE TABLE IF NOT EXISTS arabic_study_topic_content (
                topic_id      TEXT NOT NULL,
                content       TEXT NOT NULL,
                locale        TEXT NOT NULL DEFAULT 'en',
                generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (topic_id, locale)
            );
            -- Every version of a grammar lesson: the shipped English one and
            -- each AI regeneration after it. The lesson on screen is a choice
            -- among these, so regenerating never destroys what came before.
            CREATE TABLE IF NOT EXISTS arabic_study_topic_versions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                topic_id      TEXT NOT NULL,
                locale        TEXT NOT NULL DEFAULT 'en',
                content       TEXT NOT NULL,
                -- 'premade' (ships with the app) or 'ai' (generated here)
                source        TEXT NOT NULL DEFAULT 'ai',
                created_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_topic_versions_topic
                ON arabic_study_topic_versions (topic_id, locale, id);
            -- What the reader has actually worked through, one row per item:
            -- a letter+vowel pair, a tajwīd rule, an Alif form, a built word.
            -- The lessons write here as they are used, so progress reporting
            -- describes real activity rather than an inferred score.
            CREATE TABLE IF NOT EXISTS arabic_study_activity (
                area          TEXT NOT NULL,
                item          TEXT NOT NULL,
                seen_count    INTEGER NOT NULL DEFAULT 1,
                first_seen    TEXT NOT NULL DEFAULT (datetime('now')),
                last_seen     TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (area, item)
            );
            -- Sections a reader adds to a lesson themselves: their own title
            -- and brief, and whatever the AI wrote from them. Separate from
            -- arabic_study_topic_content, which holds one AI-authored lesson
            -- per topic — these are the reader's, and there can be several.
            CREATE TABLE IF NOT EXISTS arabic_study_topic_sections (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                topic_id      TEXT NOT NULL,
                locale        TEXT NOT NULL DEFAULT 'en',
                position      INTEGER NOT NULL DEFAULT 0,
                title         TEXT NOT NULL DEFAULT '',
                brief         TEXT NOT NULL DEFAULT '',
                content       TEXT NOT NULL DEFAULT '',
                expanded      INTEGER NOT NULL DEFAULT 0,
                updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_topic_sections_topic
                ON arabic_study_topic_sections (topic_id, locale, position);",
        )?;
        // Idempotent column migration — ignored if column already exists
        conn.execute("ALTER TABLE highlights ADD COLUMN note TEXT", []).ok();
        Self::widen_topic_content_key(conn)?;
        Ok(())
    }

    /// Older builds keyed `arabic_study_topic_content` by topic alone, so
    /// generating a lesson in a second language overwrote the first and the
    /// reader lost work they had already paid for. Rebuild the table with the
    /// composite key, keeping every row that is already there.
    fn widen_topic_content_key(conn: &Connection) -> Result<()> {
        let ddl: Option<String> = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'table'
                 AND name = 'arabic_study_topic_content'",
                [],
                |row| row.get(0),
            )
            .optional()?;
        let Some(ddl) = ddl else { return Ok(()) };
        if ddl.contains("PRIMARY KEY (topic_id, locale)") {
            return Ok(());
        }

        conn.execute_batch(
            "BEGIN;
             CREATE TABLE arabic_study_topic_content_new (
                topic_id      TEXT NOT NULL,
                content       TEXT NOT NULL,
                locale        TEXT NOT NULL DEFAULT 'en',
                generated_at  TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (topic_id, locale)
             );
             INSERT OR REPLACE INTO arabic_study_topic_content_new
                (topic_id, content, locale, generated_at)
                SELECT topic_id, content, locale, generated_at
                FROM arabic_study_topic_content;
             DROP TABLE arabic_study_topic_content;
             ALTER TABLE arabic_study_topic_content_new
                RENAME TO arabic_study_topic_content;
             COMMIT;",
        )?;
        Ok(())
    }

    // ── User-data migration helpers ─────────────────────────────────────────

    fn extract_user_data(db_path: &PathBuf) -> Result<UserData> {
        let conn = Connection::open(db_path)?;

        let bookmarks = {
            let mut stmt = conn.prepare(
                "SELECT surah, ayah, note, created_at FROM bookmarks ORDER BY id",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        };

        let last_read = conn
            .query_row(
                "SELECT surah, ayah, updated_at FROM last_read WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .ok();

        let highlights = {
            // The `note` column was added in a later release; older databases
            // won't have it.  Use PRAGMA to detect presence so we don't fail
            // (and lose all highlights) when migrating from an old install.
            let has_note = conn
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('highlights') WHERE name='note'",
                    [],
                    |r| r.get::<_, i64>(0),
                )
                .unwrap_or(0)
                > 0;
            let query = if has_note {
                "SELECT surah, ayah, text, note, created_at FROM highlights ORDER BY id"
            } else {
                "SELECT surah, ayah, text, NULL, created_at FROM highlights ORDER BY id"
            };
            let mut stmt = conn.prepare(query)?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        };

        // Tables introduced after the first release may be absent in the old
        // DB; check existence so migration doesn't fail (and lose everything).
        let has_table = |name: &str| -> bool {
            conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?1",
                [name],
                |r| r.get::<_, i64>(0),
            )
            .unwrap_or(0)
                > 0
        };

        let verse_of_day = if has_table("verse_of_day") {
            let mut stmt = conn.prepare(
                "SELECT day, surah, ayah, shown_at FROM verse_of_day ORDER BY day",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        } else {
            Vec::new()
        };

        let take_home_messages = if has_table("take_home_messages") {
            let mut stmt = conn.prepare(
                "SELECT source_label, context, result, locale, created_at FROM take_home_messages ORDER BY id",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        } else {
            Vec::new()
        };

        let arabic_study_profile = if has_table("arabic_study_profile") {
            conn.query_row(
                "SELECT proficiency_level, onboarded_at, updated_at FROM arabic_study_profile WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .ok()
        } else {
            None
        };

        let arabic_study_letter_progress = if has_table("arabic_study_letter_progress") {
            let mut stmt = conn.prepare(
                "SELECT letter, practiced_at, mastered, mastered_at FROM arabic_study_letter_progress",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        } else {
            Vec::new()
        };

        let arabic_study_topic_content = if has_table("arabic_study_topic_content") {
            let mut stmt = conn.prepare(
                "SELECT topic_id, content, locale, generated_at FROM arabic_study_topic_content",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        } else {
            Vec::new()
        };

        let app_meta = if has_table("app_meta") {
            let mut stmt = conn.prepare("SELECT key, value FROM app_meta")?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        } else {
            Vec::new()
        };

        let arabic_study_topic_sections = if has_table("arabic_study_topic_sections") {
            let mut stmt = conn.prepare(
                "SELECT topic_id, locale, position, title, brief, content, expanded, updated_at
                 FROM arabic_study_topic_sections",
            )?;
            let rows: Vec<_> = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                        row.get::<_, i64>(6)?,
                        row.get::<_, String>(7)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        } else {
            Vec::new()
        };

        let arabic_study_topic_versions = if has_table("arabic_study_topic_versions") {
            let mut stmt = conn.prepare(
                "SELECT topic_id, locale, content, source, created_at
                 FROM arabic_study_topic_versions",
            )?;
            let rows: Vec<_> = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        } else {
            Vec::new()
        };

        let arabic_study_activity = if has_table("arabic_study_activity") {
            let mut stmt = conn.prepare(
                "SELECT area, item, seen_count, first_seen, last_seen FROM arabic_study_activity",
            )?;
            let rows: Vec<_> = stmt
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                    ))
                })?
                .filter_map(|r| r.ok())
                .collect();
            rows
        } else {
            Vec::new()
        };

        Ok(UserData {
            bookmarks,
            last_read,
            highlights,
            verse_of_day,
            take_home_messages,
            arabic_study_profile,
            arabic_study_letter_progress,
            arabic_study_topic_content,
            arabic_study_topic_sections,
            arabic_study_topic_versions,
            arabic_study_activity,
            app_meta,
        })
    }

    fn restore_user_data(conn: &Connection, data: &UserData) -> Result<()> {
        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = conn.prepare(
                "INSERT INTO bookmarks (surah, ayah, note, created_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (surah, ayah, note, created_at) in &data.bookmarks {
                stmt.execute(rusqlite::params![surah, ayah, note, created_at])?;
            }
        }
        if let Some((surah, ayah, updated_at)) = &data.last_read {
            conn.execute(
                "INSERT OR REPLACE INTO last_read (id, surah, ayah, updated_at) VALUES (1, ?1, ?2, ?3)",
                rusqlite::params![surah, ayah, updated_at],
            )?;
        }
        {
            let mut stmt = conn.prepare(
                "INSERT INTO highlights (surah, ayah, text, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (surah, ayah, text, note, created_at) in &data.highlights {
                stmt.execute(rusqlite::params![surah, ayah, text, note, created_at])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT OR REPLACE INTO verse_of_day (day, surah, ayah, shown_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (day, surah, ayah, shown_at) in &data.verse_of_day {
                stmt.execute(rusqlite::params![day, surah, ayah, shown_at])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT INTO take_home_messages (source_label, context, result, locale, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (source_label, context, result, locale, created_at) in &data.take_home_messages {
                stmt.execute(rusqlite::params![source_label, context, result, locale, created_at])?;
            }
        }
        if let Some((proficiency_level, onboarded_at, updated_at)) = &data.arabic_study_profile {
            conn.execute(
                "INSERT OR REPLACE INTO arabic_study_profile (id, proficiency_level, onboarded_at, updated_at) VALUES (1, ?1, ?2, ?3)",
                rusqlite::params![proficiency_level, onboarded_at, updated_at],
            )?;
        }
        {
            let mut stmt = conn.prepare(
                "INSERT OR REPLACE INTO arabic_study_letter_progress (letter, practiced_at, mastered, mastered_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (letter, practiced_at, mastered, mastered_at) in &data.arabic_study_letter_progress {
                stmt.execute(rusqlite::params![letter, practiced_at, mastered, mastered_at])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT OR REPLACE INTO arabic_study_topic_content (topic_id, content, locale, generated_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (topic_id, content, locale, generated_at) in &data.arabic_study_topic_content {
                stmt.execute(rusqlite::params![topic_id, content, locale, generated_at])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT INTO arabic_study_topic_sections
                 (topic_id, locale, position, title, brief, content, expanded, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            )?;
            for (topic_id, locale, position, title, brief, content, expanded, updated_at) in
                &data.arabic_study_topic_sections
            {
                stmt.execute(rusqlite::params![
                    topic_id, locale, position, title, brief, content, expanded, updated_at
                ])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT INTO arabic_study_topic_versions
                 (topic_id, locale, content, source, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (topic_id, locale, content, source, created_at) in
                &data.arabic_study_topic_versions
            {
                stmt.execute(rusqlite::params![topic_id, locale, content, source, created_at])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT OR REPLACE INTO arabic_study_activity
                 (area, item, seen_count, first_seen, last_seen) VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (area, item, seen_count, first_seen, last_seen) in &data.arabic_study_activity {
                stmt.execute(rusqlite::params![area, item, seen_count, first_seen, last_seen])?;
            }
        }
        {
            let mut stmt = conn.prepare(
                "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?1, ?2)",
            )?;
            for (key, value) in &data.app_meta {
                stmt.execute(rusqlite::params![key, value])?;
            }
        }
        tx.commit()
    }
}

#[derive(Default)]
struct UserData {
    bookmarks: Vec<(i64, i64, Option<String>, String)>,
    last_read: Option<(i64, i64, String)>,
    highlights: Vec<(i64, i64, String, Option<String>, String)>,
    verse_of_day: Vec<(String, i64, i64, String)>,
    take_home_messages: Vec<(String, String, String, String, String)>,
    arabic_study_profile: Option<(String, String, String)>,
    arabic_study_letter_progress: Vec<(String, Option<String>, i64, Option<String>)>,
    arabic_study_topic_content: Vec<(String, String, String, String)>,
    arabic_study_topic_sections: Vec<(String, String, i64, String, String, String, i64, String)>,
    arabic_study_topic_versions: Vec<(String, String, String, String, String)>,
    arabic_study_activity: Vec<(String, String, i64, String, String)>,
    app_meta: Vec<(String, String)>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ayahlab-db-test-{tag}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Minimal stand-in for the bundled quran_static.db, at the version this
    /// build expects.  Derived from DB_VERSION rather than hard-coded so a
    /// version bump can't leave the fixtures behind.
    fn make_static_db(path: &Path) {
        make_static_db_at_version(path, DB_VERSION);
    }

    fn make_static_db_at_version(path: &Path, version: i64) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(&format!(
            "CREATE TABLE db_version (version INTEGER PRIMARY KEY);
             INSERT INTO db_version (version) VALUES ({version});
             CREATE TABLE quran_text (surah INTEGER, ayah INTEGER, text TEXT);
             INSERT INTO quran_text VALUES (1, 1, 'bismillah');"
        ))
        .unwrap();
    }

    /// A dataset with no db_version table at all — what a pre-versioning build
    /// shipped.
    fn make_unversioned_static_db(path: &Path) {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch(
            "CREATE TABLE quran_text (surah INTEGER, ayah INTEGER, text TEXT);
             INSERT INTO quran_text VALUES (1, 1, 'bismillah');",
        )
        .unwrap();
    }

    /// Legacy layout: static data and user tables mixed in one quran.db.
    fn make_legacy_db(path: &Path) {
        let conn = Connection::open(path).unwrap();
        Database::init_user_data_tables(&conn).unwrap();
        conn.execute_batch(
            "INSERT INTO bookmarks (surah, ayah, note) VALUES (2, 255, 'ayat al-kursi');
             CREATE TABLE quran_text (surah INTEGER, ayah INTEGER, text TEXT);",
        )
        .unwrap();
    }

    #[test]
    fn read_only_uri_handles_platform_path_forms() {
        let uri = |s: &str| Database::read_only_uri(Path::new(s));
        // Unix absolute path (spaces stay literal — SQLite accepts them).
        assert_eq!(uri("/a b/c.db"), "file:/a b/c.db?mode=ro");
        // Plain Windows drive path.
        assert_eq!(uri(r"C:\x\y.db"), "file:/C:/x/y.db?mode=ro");
        // Windows verbatim path, as returned by Tauri's resource_dir() in
        // dev — the \\?\ prefix must not leak into the URI as %3F.
        assert_eq!(
            uri(r"\\?\C:\Users\Al Asaad\data\quran_static.db"),
            "file:/C:/Users/Al Asaad/data/quran_static.db?mode=ro"
        );
        // Verbatim UNC path → empty URI authority, path carries the share.
        assert_eq!(
            uri(r"\\?\UNC\server\share\q.db"),
            "file:////server/share/q.db?mode=ro"
        );
        // URI metacharacters in the file name are escaped.
        assert_eq!(uri("/a/100%#?.db"), "file:/a/100%25%23%3F.db?mode=ro");
    }

    #[test]
    fn fresh_install_attaches_static_and_writes_user_data() {
        let dir = temp_dir("fresh");
        let static_db = dir.join("quran_static.db");
        make_static_db(&static_db);

        let db = Database::new(static_db, dir.clone()).unwrap();
        let conn = db.0.lock().unwrap();
        // Static tables resolve through the attached schema …
        let text: String = conn
            .query_row("SELECT text FROM quran_text WHERE surah = 1", [], |r| r.get(0))
            .unwrap();
        assert_eq!(text, "bismillah");
        // … but stay read-only.
        assert!(conn.execute("INSERT INTO quran_text VALUES (1, 2, 'x')", []).is_err());
        // User tables live in main (user.db) and are writable.
        conn.execute("INSERT INTO bookmarks (surah, ayah, note) VALUES (1, 1, 'a')", [])
            .unwrap();
        assert!(dir.join("user.db").exists());
    }

    /// The generator lives in a sibling crate, so nothing in the type system
    /// ties its DB_VERSION to this one.  They silently drifted to 12 vs 13
    /// once already, which shipped a dataset the app never validated.  Read the
    /// constant straight out of the source and fail the build here instead.
    #[test]
    fn db_version_matches_generator() {
        let generator = concat!(env!("CARGO_MANIFEST_DIR"), "/../gen-db/src/main.rs");
        let src = std::fs::read_to_string(generator)
            .unwrap_or_else(|e| panic!("cannot read {generator}: {e}"));

        let literal = src
            .lines()
            .find_map(|l| l.trim().strip_prefix("const DB_VERSION: i64 = "))
            .and_then(|rest| rest.trim_end_matches(';').trim().parse::<i64>().ok())
            .expect("gen-db/src/main.rs must declare `const DB_VERSION: i64 = N;`");

        assert_eq!(
            literal, DB_VERSION,
            "gen-db/src/main.rs has DB_VERSION {literal} but db.rs expects {DB_VERSION}; \
             bump both together or the app rejects the dataset the generator writes"
        );
    }

    #[test]
    fn rejects_a_stale_static_dataset() {
        let dir = temp_dir("stale");
        let static_db = dir.join("quran_static.db");
        make_static_db_at_version(&static_db, DB_VERSION - 1);

        let err = Database::new(static_db, dir)
            .err()
            .expect("a stale dataset must be rejected")
            .to_string();
        // Names both versions and how to fix it — this is what reaches the
        // crash log, so the numbers matter more than the phrasing.
        assert!(err.contains(&(DB_VERSION - 1).to_string()), "got: {err}");
        assert!(err.contains(&DB_VERSION.to_string()), "got: {err}");
        assert!(err.contains("gen-db"), "got: {err}");
    }

    #[test]
    fn rejects_a_static_dataset_with_no_version_table() {
        let dir = temp_dir("unversioned");
        let static_db = dir.join("quran_static.db");
        make_unversioned_static_db(&static_db);

        let err = Database::new(static_db, dir)
            .err()
            .expect("an unversioned dataset must be rejected")
            .to_string();
        assert!(err.contains("db_version"), "got: {err}");
        assert!(err.contains("gen-db"), "got: {err}");
    }

    #[test]
    fn migrates_legacy_db_once_and_deletes_it() {
        let dir = temp_dir("migrate");
        let static_db = dir.join("resources").join("quran_static.db");
        std::fs::create_dir_all(static_db.parent().unwrap()).unwrap();
        make_static_db(&static_db);
        make_legacy_db(&dir.join("quran.db"));
        std::fs::write(dir.join("quran.db.bak"), b"old backup").unwrap();

        {
            let db = Database::new(static_db.clone(), dir.clone()).unwrap();
            let conn = db.0.lock().unwrap();
            let note: String = conn
                .query_row("SELECT note FROM bookmarks", [], |r| r.get(0))
                .unwrap();
            assert_eq!(note, "ayat al-kursi");
        }
        assert!(dir.join("user.db").exists());
        assert!(!dir.join("quran.db").exists());
        assert!(!dir.join("quran.db.bak").exists());

        // If a legacy file reappears (e.g. its deletion had failed), the
        // marker prevents a second row copy — no duplicated bookmarks — and
        // the file is cleaned up again.
        make_legacy_db(&dir.join("quran.db"));
        let db = Database::new(static_db, dir.clone()).unwrap();
        let conn = db.0.lock().unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM bookmarks", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
        assert!(!dir.join("quran.db").exists());
    }
}
