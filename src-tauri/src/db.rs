use crate::buckwalter::buckwalter_to_arabic;
use rusqlite::{Connection, Result};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database(pub Mutex<Connection>);

impl Database {
    pub fn new(
        db_path: PathBuf,
        sql_path: PathBuf,
        morph_path: PathBuf,
        recitation_paths: Vec<(i64, PathBuf)>,
    ) -> Result<Self> {
        let conn = Connection::open(&db_path)?;

        // Initialize tables and load data
        Self::init_quran_db(&conn, &sql_path)?;
        Self::init_morphology_db(&conn, &morph_path)?;
        Self::init_user_data_tables(&conn)?;
        Self::init_recitation_tables(&conn, &recitation_paths)?;
        Ok(Database(Mutex::new(conn)))
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
        )?;
        Ok(())
    }

    fn init_quran_db(conn: &Connection, sql_path: &PathBuf) -> Result<()> {
        // Create the quran_text table (SQLite syntax)
        conn.execute(
            "CREATE TABLE IF NOT EXISTS quran_text (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sura INTEGER NOT NULL,
                aya INTEGER NOT NULL,
                text TEXT NOT NULL
            )",
            [],
        )?;

        // Check if table is already populated
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM quran_text",
            [],
            |row| row.get(0),
        )?;

        if count > 0 {
            // Data already exists, skip loading
            return Ok(());
        }

        // Load data from SQL file
        Self::load_sql_data(conn, sql_path)?;

        Ok(())
    }

    fn load_sql_data(conn: &Connection, sql_path: &PathBuf) -> Result<()> {
        println!("Loading Quran data from SQL file...");

        // Read the SQL file
        let sql_content = fs::read_to_string(sql_path)
            .map_err(|e| {
                eprintln!("Failed to read SQL file: {}", e);
                rusqlite::Error::ToSqlConversionFailure(Box::new(e))
            })?;

        println!("SQL file loaded, parsing and inserting data...");

        // Begin transaction for better performance
        conn.execute("BEGIN TRANSACTION", [])?;

        // Process the SQL file line by line
        let mut current_statement = String::new();
        let mut in_create_table = false;
        let mut insert_count = 0;

        for line in sql_content.lines() {
            let trimmed = line.trim();

            // Skip comments and MySQL-specific commands
            if trimmed.is_empty()
                || trimmed.starts_with("--")
                || trimmed.starts_with("#")
                || trimmed.starts_with("CREATE DATABASE")
                || trimmed.starts_with("USE ")
                || trimmed.starts_with("DROP TABLE")
                || trimmed.starts_with("SET ") {
                continue;
            }

            // Skip the CREATE TABLE statement from the SQL file (we already created it)
            if trimmed.starts_with("CREATE TABLE") {
                in_create_table = true;
                continue;
            }

            if in_create_table {
                if trimmed.contains(";") {
                    in_create_table = false;
                }
                continue;
            }

            // Accumulate INSERT statements
            if trimmed.starts_with("INSERT INTO") || !current_statement.is_empty() {
                current_statement.push_str(line);
                current_statement.push('\n');

                // If the statement is complete (ends with semicolon)
                if trimmed.ends_with(";") {
                    // Convert MySQL backticks to SQLite (or remove them)
                    let sqlite_statement = current_statement
                        .replace("`quran_text`", "quran_text")
                        .replace("`index`", "id")
                        .replace("`sura`", "sura")
                        .replace("`aya`", "aya")
                        .replace("`text`", "text");

                    // Execute the statement
                    conn.execute(&sqlite_statement, [])?;
                    insert_count += 1;

                    if insert_count % 100 == 0 {
                        println!("Inserted {} statements...", insert_count);
                    }

                    current_statement.clear();
                }
            }
        }

        // Commit transaction
        conn.execute("COMMIT", [])?;

        println!("Successfully loaded {} insert statements", insert_count);

        Ok(())
    }

    fn init_morphology_db(conn: &Connection, morph_path: &PathBuf) -> Result<()> {
        // Create the morphology table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS morphology (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                surah INTEGER NOT NULL,
                ayah INTEGER NOT NULL,
                word INTEGER NOT NULL,
                token INTEGER NOT NULL,
                form_buckwalter TEXT NOT NULL,
                form_arabic TEXT NOT NULL,
                tag TEXT NOT NULL,
                features TEXT NOT NULL
            )",
            [],
        )?;

        // Create indexes for efficient queries
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_morph_surah ON morphology(surah)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_morph_location ON morphology(surah, ayah, word)",
            [],
        )?;

        // Check if table is already populated
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM morphology", [], |row| row.get(0))?;

        if count > 0 {
            // Data already exists, skip loading
            return Ok(());
        }

        // Load data from morphology file
        Self::load_morphology_data(conn, morph_path)?;

        Ok(())
    }

    fn init_recitation_tables(conn: &Connection, recitation_paths: &[(i64, PathBuf)]) -> Result<()> {
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS recitations (
                reciter_id    INTEGER NOT NULL,
                surah_number  INTEGER NOT NULL,
                ayah_number   INTEGER NOT NULL,
                audio_url     TEXT    NOT NULL,
                duration      INTEGER,
                segments      TEXT,
                PRIMARY KEY (reciter_id, surah_number, ayah_number)
            );",
        )?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM recitations",
            [],
            |row| row.get(0),
        )?;

        if count > 0 {
            // Check if ayah_number was incorrectly imported as global (surah 2 should start at 1)
            let valid: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM recitations WHERE surah_number=2 AND ayah_number=1)",
                [],
                |row| row.get(0),
            )?;
            if valid {
                return Ok(()); // data is correct, skip
            }
            // Wrong numbering — wipe and re-import
            conn.execute("DELETE FROM recitations", [])?;
            println!("Recitation data had incorrect ayah numbering, clearing for re-import...");
        }

        for (reciter_id, path) in recitation_paths {
            if !path.exists() {
                eprintln!("Recitation DB not found: {:?}", path);
                continue;
            }
            let src = Connection::open(path)?;
            let mut src_stmt = src.prepare(
                "SELECT surah_number,
                        ROW_NUMBER() OVER (PARTITION BY surah_number ORDER BY ayah_number) AS ayah_num,
                        audio_url, duration, segments
                 FROM verses
                 ORDER BY surah_number, ayah_number",
            )?;

            let tx = conn.unchecked_transaction()?;
            {
                let mut ins = conn.prepare(
                    "INSERT OR IGNORE INTO recitations (reciter_id, surah_number, ayah_number, audio_url, duration, segments)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                )?;
                let rows = src_stmt.query_map([], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, Option<i64>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                })?;
                for row in rows {
                    let (surah, ayah, url, duration, segments) = row?;
                    ins.execute(rusqlite::params![reciter_id, surah, ayah, url, duration, segments])?;
                }
            }
            tx.commit()?;
            println!("Imported recitation data for reciter {}", reciter_id);
        }

        Ok(())
    }

    fn load_morphology_data(conn: &Connection, morph_path: &PathBuf) -> Result<()> {
        println!("Loading morphology data from corpus file...");

        // Read the morphology file
        let content = fs::read_to_string(morph_path).map_err(
            |e| {
                eprintln!("Failed to read morphology file: {}", e);
                rusqlite::Error::ToSqlConversionFailure(Box::new(e))
            },
        )?;

        println!("Morphology file loaded, parsing and inserting data...");

        // Begin transaction for better performance
        conn.execute("BEGIN TRANSACTION", [])?;

        let mut stmt = conn.prepare(
            "INSERT INTO morphology (surah, ayah, word, token, form_buckwalter, form_arabic, tag, features)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;

        let mut insert_count = 0;

        for line in content.lines() {
            let trimmed = line.trim();

            // Skip comments, header, and empty lines
            if trimmed.is_empty()
                || trimmed.starts_with('#')
                || trimmed.starts_with("LOCATION")
            {
                continue;
            }

            let parts: Vec<&str> = trimmed.split('\t').collect();
            if parts.len() < 4 {
                continue;
            }

            // Parse location: (surah:ayah:word:token)
            let location = parts[0].trim_matches(|c| c == '(' || c == ')');
            let loc_parts: Vec<&str> = location.split(':').collect();
            if loc_parts.len() < 4 {
                continue;
            }

            let surah: i64 = loc_parts[0].parse().unwrap_or(0);
            let ayah: i64 = loc_parts[1].parse().unwrap_or(0);
            let word: i64 = loc_parts[2].parse().unwrap_or(0);
            let token: i64 = loc_parts[3].parse().unwrap_or(0);

            if surah == 0 || ayah == 0 || word == 0 || token == 0 {
                continue;
            }

            let form_bw = parts[1];
            let form_arabic = buckwalter_to_arabic(form_bw);
            let tag = parts[2];
            let features = parts[3];

            stmt.execute(rusqlite::params![
                surah,
                ayah,
                word,
                token,
                form_bw,
                form_arabic,
                tag,
                features
            ])?;

            insert_count += 1;

            if insert_count % 20000 == 0 {
                println!("Loaded {} morphology records...", insert_count);
            }
        }

        // Commit transaction
        conn.execute("COMMIT", [])?;

        println!(
            "Successfully loaded {} morphology records",
            insert_count
        );

        Ok(())
    }
}
