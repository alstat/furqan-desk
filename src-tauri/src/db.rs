use rusqlite::{Connection, Result};
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

/// On desktop / iOS, the resource directory is a normal filesystem path.
#[cfg(not(target_os = "android"))]
fn copy_static_db(src: &Path, dest: &Path, _asset_relative_path: &str) -> Result<()> {
    std::fs::copy(src, dest)
        .map(|_| ())
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))
}

/// Must match DB_VERSION in src/bin/gen_db.rs.
/// Increment both when the static dataset changes.
const DB_VERSION: i64 = 1;

pub struct Database(pub Mutex<Connection>);

impl Database {
    /// Open (or initialise) the runtime database.
    ///
    /// On first launch `quran_static.db` is copied from the app bundle into
    /// `app_data_dir/quran.db`.  On subsequent launches the file already
    /// exists and we skip straight to opening it.  When the bundled DB has a
    /// newer version (i.e. a data update shipped with an app update) we
    /// preserve the user's bookmarks / highlights / last-read position, swap
    /// in the new static data, and restore those rows.
    pub fn new(static_db_path: PathBuf, app_data_dir: PathBuf) -> Result<Self> {
        let db_path = app_data_dir.join("quran.db");

        if db_path.exists() {
            let current_version = Self::read_db_version(&db_path).unwrap_or(0);
            if current_version != DB_VERSION {
                println!(
                    "DB version mismatch (have {}, need {}), migrating …",
                    current_version, DB_VERSION
                );
                // If the existing DB is corrupted (e.g. from a bad previous install),
                // fall back to empty user data rather than panicking.
                let user_data = Self::extract_user_data(&db_path).unwrap_or_default();
                copy_static_db(&static_db_path, &db_path, "data/quran_static.db")?;
                let conn = Connection::open(&db_path)?;
                Self::init_user_data_tables(&conn)?;
                Self::restore_user_data(&conn, &user_data)?;
                return Ok(Database(Mutex::new(conn)));
            }
        } else {
            println!("First launch — copying static database …");
            copy_static_db(&static_db_path, &db_path, "data/quran_static.db")?;
        }

        let conn = Connection::open(&db_path)?;
        Self::init_user_data_tables(&conn)?;
        Ok(Database(Mutex::new(conn)))
    }

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
            );",
        )
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
            let mut stmt = conn.prepare(
                "SELECT surah, ayah, text, created_at FROM highlights ORDER BY id",
            )?;
            let rows: Vec<_> = stmt.query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .collect();
            rows
        };

        Ok(UserData {
            bookmarks,
            last_read,
            highlights,
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
                "INSERT INTO highlights (surah, ayah, text, created_at) VALUES (?1, ?2, ?3, ?4)",
            )?;
            for (surah, ayah, text, created_at) in &data.highlights {
                stmt.execute(rusqlite::params![surah, ayah, text, created_at])?;
            }
        }
        tx.commit()
    }
}

#[derive(Default)]
struct UserData {
    bookmarks: Vec<(i64, i64, Option<String>, String)>,
    last_read: Option<(i64, i64, String)>,
    highlights: Vec<(i64, i64, String, String)>,
}
