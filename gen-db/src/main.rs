/// Build-time database generator.
///
/// Run from the workspace root or from `src-tauri/`:
///   cargo run --bin gen-db
///
/// Reads all JSON/SQL/txt source files under `data/` and produces
/// `data/quran_static.db` — a pre-built SQLite database that is
/// shipped in the app bundle instead of the raw source files.

use rusqlite::{Connection, Result};
use serde_json;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Increment this whenever the schema or data changes.
/// Must match DB_VERSION in db.rs.
const DB_VERSION: i64 = 10;

fn main() {
    // Support running from the workspace root (furqan-desk/) or from src-tauri/
    let tauri_root = if PathBuf::from("src-tauri").is_dir() {
        PathBuf::from("src-tauri")
    } else {
        PathBuf::from(".")
    };

    let data_dir = tauri_root.join("data");
    let output = data_dir.join("quran_static.db");

    if output.exists() {
        fs::remove_file(&output).expect("Failed to remove existing quran_static.db");
    }

    println!("Building quran_static.db …");
    build_static_db(&data_dir, &output).expect("Failed to build static database");

    let size = fs::metadata(&output).map(|m| m.len()).unwrap_or(0);
    println!(
        "Done! quran_static.db created at {:?} ({:.1} MB)",
        output,
        size as f64 / 1_048_576.0
    );

    // Sync the new DB to Tauri's target resource directories so that the dev
    // server picks up the updated file without requiring a full `cargo tauri dev`
    // restart.  These paths mirror where `tauri_build` stages resources during
    // compilation.
    let target_candidates = [
        tauri_root.join("target/debug/data/quran_static.db"),
        tauri_root.join("target/release/data/quran_static.db"),
        tauri_root.join("target/x86_64-apple-darwin/release/data/quran_static.db"),
        tauri_root.join("target/aarch64-apple-darwin/release/data/quran_static.db"),
    ];
    let mut synced = 0usize;
    for dest in &target_candidates {
        if dest.exists() {
            match fs::copy(&output, dest) {
                Ok(_) => {
                    println!("Synced → {:?}", dest);
                    synced += 1;
                }
                Err(e) => eprintln!("Warning: could not sync to {:?}: {}", dest, e),
            }
        }
    }
    if synced == 0 {
        println!("No target data directories found to sync (normal on first build).");
    }
}

fn build_static_db(data_dir: &Path, output: &Path) -> Result<()> {
    let conn = Connection::open(output)?;

    // Performance pragmas for bulk inserts
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA temp_store = MEMORY;
         PRAGMA cache_size = -65536;",
    )?;

    init_quran_db(&conn, &data_dir.join("quran-uthmani.sql"))?;
    init_morphology_db(&conn, &data_dir.join("quranic-corpus-morphology-0.4 2.txt"))?;

    init_reciters_table(&conn)?;

    let recitation_paths = vec![
        (
            950i64,
            data_dir.join(
                "recitation/ayah-recitation-abdul-basit-abdul-samad-murattal-hafs-950.db",
            ),
        ),
        (
            953i64,
            data_dir.join(
                "recitation/ayah-recitation-mishari-rashid-al-afasy-murattal-hafs-953.db",
            ),
        ),
        (
            954i64,
            data_dir.join("recitation/ayah-recitation-saad-al-ghamdi-murattal-hafs-954.db"),
        ),
        (
            961i64,
            data_dir.join(
                "recitation/ayah-recitation-yasser-al-dosari-murattal-hafs-961.db",
            ),
        ),
    ];
    init_recitation_tables(&conn, &recitation_paths)?;
    init_maher_recitation(
        &conn,
        &data_dir.join("recitation/surah-recitation-maher-al-muaiqly.db"),
    )?;

    let translation_paths: Vec<(String, String, PathBuf)> = vec![
        (
            "BN".into(),
            "Dr. Abu Bakr Muhammad Zakaria".into(),
            data_dir.join("translation/bn/dr-abu-bakr-muhammad-zakaria-simple.json"),
        ),
        (
            "EN".into(),
            "Abdel Haleem".into(),
            data_dir.join("translation/en/en-haleem-with-footnote-tags.json"),
        ),
        (
            "EN".into(),
            "Sahih International".into(),
            data_dir.join("translation/en/en-sahih-international-with-footnote-tags.json"),
        ),
        (
            "FA".into(),
            "Hussein Taji".into(),
            data_dir.join("translation/fa/fr-hussein-taji-simple.json"),
        ),
        (
            "HA".into(),
            "Abubakar Mahmood Jummi".into(),
            data_dir.join("translation/ha/abubakar-mahmood-jummi-with-footnote-tags.json"),
        ),
        (
            "HI".into(),
            "Maulana Azizul Haque Al-Umari".into(),
            data_dir.join(
                "translation/hi/maulana-azizul-haque-al-umari-with-footnote-tags.json",
            ),
        ),
        (
            "ID".into(),
            "Quran Indonesia".into(),
            data_dir.join("translation/id/quran-id-with-footnote-tags.json"),
        ),
        (
            "MS".into(),
            "Abdullah Basamia".into(),
            data_dir.join("translation/ms/abdullah-basamia-simple.json"),
        ),
        (
            "PA".into(),
            "Bayan ul Quran".into(),
            data_dir.join("translation/pa/bayan-ul-quran-simple.json"),
        ),
        (
            "PS".into(),
            "Rowwad Translation Center".into(),
            data_dir.join(
                "translation/ps/pashto-translation-rowwad-translation-center-simple.json",
            ),
        ),
        (
            "SW".into(),
            "Dr. Abdullah Muhammad Abu Bakr & Sheikh Nasir Khamis".into(),
            data_dir.join(
                "translation/sw/dr-abdullah-muhammad-abu-bakr-and-sheikh-nasir-khamis-simple.json",
            ),
        ),
        (
            "TL".into(),
            "Dar al-Salam Center (Tagalog)".into(),
            data_dir.join("translation/tl/dar-al-salam-center-tagalog-simple.json"),
        ),
        (
            "TR".into(),
            "Dar al-Salam Center".into(),
            data_dir.join("translation/tr/dar-al-salam-center-simple.json"),
        ),
        (
            "UR".into(),
            "Bayan ul Quran".into(),
            data_dir.join("translation/ur/bayan-ul-quran-simple.json"),
        ),
        (
            "RU".into(),
            "Kuliev".into(),
            data_dir.join("translation/ru/quran-ru-kuliev-simple.json"),
        ),
        (
            "DE".into(),
            "Frank Bubenheim & Nadeem".into(),
            data_dir.join("translation/de/de-Frank Bubenheim and Nadeem-simple.json"),
        ),
        (
            "FR".into(),
            "Montada Islamic Foundation".into(),
            data_dir.join("translation/fr/montada-islamic-foundation-simple.json"),
        ),
        (
            "PT".into(),
            "Samir".into(),
            data_dir.join("translation/pt/quran-pt-samir-simple.json"),
        ),
        (
            "ZH".into(),
            "Muhammad Makin".into(),
            data_dir.join("translation/zh/muhammad-makin-simple.json"),
        ),
        (
            "ES".into(),
            "Noor International Center".into(),
            data_dir.join("translation/es/noor-international-center-simple.json"),
        ),
        (
            "JA".into(),
            "Saeed Sato".into(),
            data_dir.join("translation/ja/saeed-sato-simple.json"),
        ),
        (
            "KO".into(),
            "Hamed Choi".into(),
            data_dir.join("translation/ko/hamed-choi-simple.json"),
        ),
        (
            "VI".into(),
            "Hasan Abdul Karim".into(),
            data_dir.join("translation/vi/hasan-abdul-karim-simple.json"),
        ),
        (
            "TH".into(),
            "Quran Complex".into(),
            data_dir.join("translation/th/quran-th-quran-complex-simple.json"),
        ),
        (
            "CEB".into(),
            "Rowwad Center (Bisaya)".into(),
            data_dir.join("translation/ceb/bisayan-translation-rowwad-center-simple.json"),
        ),
        (
            "KK".into(),
            "Khalifa Altay".into(),
            data_dir.join("translation/kk/khalifa-altay-simple.json"),
        ),
        (
            "UZ".into(),
            "Muhammad Sodik Muhammad Yusuf".into(),
            data_dir.join("translation/uz/muhammad-sodik-muhammad-yusuf-simple.json"),
        ),
        (
            "KY".into(),
            "Hakimov".into(),
            data_dir.join("translation/ky/kyrgyz-hakimov-simple.json"),
        ),
        (
            "TG".into(),
            "Khawaja Mirof".into(),
            data_dir.join("translation/tg/khawaja-mirof-khawaja-mir-simple.json"),
        ),
        (
            "SQ".into(),
            "Al-Hasan Efendi".into(),
            data_dir.join("translation/sq/al-hasan-efendi-simple.json"),
        ),
        (
            "BS".into(),
            "Dar al-Salam Center".into(),
            data_dir.join("translation/bs/dar-al-salam-center-simple 3.json"),
        ),
        (
            "KU".into(),
            "Muhammad Saleh Bamoki".into(),
            data_dir.join("translation/ku/muhammad-saleh-bamoki-simple.json"),
        ),
        (
            "SR".into(),
            "Dar al-Salam Center".into(),
            data_dir.join("translation/sr/dar-al-salam-center-simple 4.json"),
        ),
        (
            "TA".into(),
            "Abdul Hameed Baqavi".into(),
            data_dir.join("translation/ta/abdul-hameed-baqavi-simple.json"),
        ),
    ];
    init_translation_tables(&conn, &translation_paths)?;

    let tafsir_paths: Vec<(String, String, PathBuf)> = vec![
        (
            "AR".into(),
            "Ibn Kathir (Arabic)".into(),
            data_dir.join("tafsir/ar/ar-tafsir-ibn-kathir.json"),
        ),
        (
            "AR".into(),
            "Al-Tabari (Arabic)".into(),
            data_dir.join("tafsir/ar/ar-tafsir-al-tabari.json"),
        ),
        (
            "EN".into(),
            "Ibn Kathir (English)".into(),
            data_dir.join("tafsir/en/en-tafisr-ibn-kathir.json"),
        ),
        (
            "TL".into(),
            "Al-Mukhtasar (Tagalog)".into(),
            data_dir.join("tafsir/tl/tagalog-Al-Mukhtasar.json"),
        ),
        (
            "ID".into(),
            "As-Sa'di (Indonesian)".into(),
            data_dir.join("tafsir/id/id-tafsir-as-saadi.json"),
        ),
        (
            "BN".into(),
            "Ibn Kathir (Bengali)".into(),
            data_dir.join("tafsir/bn/bn-tafseer-ibn-e-kaseer.json"),
        ),
        (
            "HI".into(),
            "Al-Mukhtasar (Hindi)".into(),
            data_dir.join("tafsir/hi/hindi-mokhtasar.json"),
        ),
        (
            "PS".into(),
            "Al-Mukhtasar (Pashto)".into(),
            data_dir.join("tafsir/ps/pashto-mokhtasar.json"),
        ),
        (
            "RU".into(),
            "Ibn Kathir (Russian)".into(),
            data_dir.join("tafsir/ru/ru-tafsir-ibne-kahtir.json"),
        ),
        (
            "TR".into(),
            "Ibn Kathir (Turkish)".into(),
            data_dir.join("tafsir/tr/tr-tafsir-ibne-kathir.json"),
        ),
        (
            "UR".into(),
            "Ibn Kathir (Urdu)".into(),
            data_dir.join("tafsir/ur/tafseer-ibn-e-kaseer-urdu.json"),
        ),
        (
            "AR".into(),
            "Al-Mukhtasar (Arabic)".into(),
            data_dir.join("tafsir/ar/arabic-al-mukhtasar-in-interpreting-the-noble-quran.json"),
        ),
        (
            "BN".into(),
            "Al-Mukhtasar (Bengali)".into(),
            data_dir.join("tafsir/bn/bengali-mokhtasar.json"),
        ),
        (
            "ES".into(),
            "Al-Mukhtasar (Spanish)".into(),
            data_dir.join("tafsir/es/spanish-mokhtasar.json"),
        ),
        (
            "FA".into(),
            "As-Sa'di (Persian)".into(),
            data_dir.join("tafsir/fa/fr-tafsir-as-saadi.json"),
        ),
        (
            "FA".into(),
            "Al-Mukhtasar (Persian)".into(),
            data_dir.join("tafsir/fa/persian-mokhtasar.json"),
        ),
        (
            "FR".into(),
            "Al-Mukhtasar (French)".into(),
            data_dir.join("tafsir/fr/french-mokhtasar.json"),
        ),
        (
            "ID".into(),
            "Al-Mukhtasar (Indonesian)".into(),
            data_dir.join("tafsir/id/indonesian-mokhtasar.json"),
        ),
        (
            "KY".into(),
            "Al-Mukhtasar (Kyrgyz)".into(),
            data_dir.join("tafsir/ky/kyrgyz-mokhtasar.json"),
        ),
        (
            "RU".into(),
            "Al-Mukhtasar (Russian)".into(),
            data_dir.join("tafsir/ru/russian-mokhtasar.json"),
        ),
        (
            "RU".into(),
            "As-Sa'di (Russian)".into(),
            data_dir.join("tafsir/ru/tafsir-as-saadi-russian.json"),
        ),
        (
            "TH".into(),
            "Al-Mukhtasar (Thai)".into(),
            data_dir.join("tafsir/th/thai-mokhtasar.json"),
        ),
        (
            "TR".into(),
            "Al-Mukhtasar (Turkish)".into(),
            data_dir.join("tafsir/tr/turkish-mokhtasar.json"),
        ),
        (
            "UZ".into(),
            "Al-Mukhtasar (Uzbek)".into(),
            data_dir.join("tafsir/uz/uzbek-mokhtasar.json"),
        ),
        (
            "VI".into(),
            "Al-Mukhtasar (Vietnamese)".into(),
            data_dir.join("tafsir/vi/vietnamese-mokhtasar.json"),
        ),
        (
            "ZH".into(),
            "Al-Mukhtasar (Chinese)".into(),
            data_dir.join("tafsir/zh/chinese-mokhtasar.json"),
        ),
        (
            "JA".into(),
            "Al-Mukhtasar (Japanese)".into(),
            data_dir.join("tafsir/ja/japanese-mokhtasar.json"),
        ),
        (
            "SQ".into(),
            "As-Sa'di (Albanian)".into(),
            data_dir.join("tafsir/sq/sq-saadi.json"),
        ),
        (
            "BS".into(),
            "Al-Mukhtasar (Bosnian)".into(),
            data_dir.join("tafsir/bs/bosnian-mokhtasar.json"),
        ),
        (
            "SR".into(),
            "Al-Mukhtasar (Serbian)".into(),
            data_dir.join("tafsir/sr/serbian-mokhtasar.json"),
        ),
        (
            "KU".into(),
            "Al-Mukhtasar (Kurdish)".into(),
            data_dir.join("tafsir/ku/kurdish-mokhtasar.json"),
        ),
        (
            "TA".into(),
            "Al-Mukhtasar (Tamil)".into(),
            data_dir.join("tafsir/ta/tamil-mokhtasar.json"),
        ),
    ];
    init_tafsir_tables(&conn, &tafsir_paths)?;

    init_transliteration_table(
        &conn,
        &data_dir.join("transliteration/english-transliteration-tajweed-simple.json"),
    )?;
    init_word_by_word_table(
        &conn,
        &data_dir.join("word-by-word/english-wbw-translation.json"),
    )?;

    // Stamp the version
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS db_version (version INTEGER PRIMARY KEY);
         INSERT OR REPLACE INTO db_version VALUES ({DB_VERSION});"
    ))?;

    // Switch back to DELETE journal mode before the final VACUUM so the output
    // file is NOT in WAL mode.  A WAL-mode file is safe to copy only if no
    // companion -wal/-shm files exist; switching to DELETE mode first guarantees
    // the result is a single self-contained file that can always be safely
    // copied with std::fs::copy.
    println!("Running VACUUM …");
    conn.execute_batch(
        "PRAGMA journal_mode = DELETE;
         PRAGMA wal_checkpoint(TRUNCATE);
         VACUUM;",
    )?;

    Ok(())
}

// ─── Quran text ───────────────────────────────────────────────────────────────

fn init_quran_db(conn: &Connection, sql_path: &Path) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS quran_text (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            sura INTEGER NOT NULL,
            aya  INTEGER NOT NULL,
            text TEXT    NOT NULL
        )",
        [],
    )?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM quran_text", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    println!("Loading Quran text from SQL file …");
    let sql_content = fs::read_to_string(sql_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    conn.execute_batch("BEGIN TRANSACTION")?;

    let mut current_statement = String::new();
    let mut in_create_table = false;
    let mut insert_count = 0;

    for line in sql_content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty()
            || trimmed.starts_with("--")
            || trimmed.starts_with('#')
            || trimmed.starts_with("CREATE DATABASE")
            || trimmed.starts_with("USE ")
            || trimmed.starts_with("DROP TABLE")
            || trimmed.starts_with("SET ")
        {
            continue;
        }
        if trimmed.starts_with("CREATE TABLE") {
            in_create_table = true;
            continue;
        }
        if in_create_table {
            if trimmed.contains(';') {
                in_create_table = false;
            }
            continue;
        }
        if trimmed.starts_with("INSERT INTO") || !current_statement.is_empty() {
            current_statement.push_str(line);
            current_statement.push('\n');
            if trimmed.ends_with(';') {
                let stmt = current_statement
                    .replace("`quran_text`", "quran_text")
                    .replace("`index`", "id")
                    .replace("`sura`", "sura")
                    .replace("`aya`", "aya")
                    .replace("`text`", "text");
                conn.execute(&stmt, [])?;
                insert_count += 1;
                current_statement.clear();
            }
        }
    }

    conn.execute_batch("COMMIT")?;
    println!("Inserted {} Quran text statements", insert_count);
    Ok(())
}

// ─── Morphology ───────────────────────────────────────────────────────────────

fn init_morphology_db(conn: &Connection, morph_path: &Path) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS morphology (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            surah           INTEGER NOT NULL,
            ayah            INTEGER NOT NULL,
            word            INTEGER NOT NULL,
            token           INTEGER NOT NULL,
            form_buckwalter TEXT    NOT NULL,
            form_arabic     TEXT    NOT NULL,
            tag             TEXT    NOT NULL,
            features        TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_morph_surah ON morphology(surah);
        CREATE INDEX IF NOT EXISTS idx_morph_location ON morphology(surah, ayah, word);",
    )?;

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM morphology", [], |row| row.get(0))?;
    if count > 0 {
        return Ok(());
    }

    println!("Loading morphology corpus …");
    let content = fs::read_to_string(morph_path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;

    conn.execute_batch("BEGIN TRANSACTION")?;
    let mut stmt = conn.prepare(
        "INSERT INTO morphology
             (surah, ayah, word, token, form_buckwalter, form_arabic, tag, features)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
    )?;

    let mut count = 0usize;
    for line in content.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') || t.starts_with("LOCATION") {
            continue;
        }
        let parts: Vec<&str> = t.split('\t').collect();
        if parts.len() < 4 {
            continue;
        }
        let loc = parts[0].trim_matches(|c| c == '(' || c == ')');
        let lp: Vec<&str> = loc.split(':').collect();
        if lp.len() < 4 {
            continue;
        }
        let surah: i64 = lp[0].parse().unwrap_or(0);
        let ayah: i64 = lp[1].parse().unwrap_or(0);
        let word: i64 = lp[2].parse().unwrap_or(0);
        let token: i64 = lp[3].parse().unwrap_or(0);
        if surah == 0 || ayah == 0 || word == 0 || token == 0 {
            continue;
        }
        let form_bw = parts[1];
        let form_arabic = buckwalter_to_arabic(form_bw);
        stmt.execute(rusqlite::params![
            surah, ayah, word, token, form_bw, form_arabic, parts[2], parts[3]
        ])?;
        count += 1;
        if count % 20_000 == 0 {
            println!("  {} morphology records …", count);
        }
    }
    conn.execute_batch("COMMIT")?;
    println!("Inserted {} morphology records", count);
    Ok(())
}

// ─── Reciters metadata ───────────────────────────────────────────────────────

fn init_reciters_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS reciters (
            id         INTEGER PRIMARY KEY,
            name       TEXT NOT NULL,
            short_name TEXT NOT NULL,
            style      TEXT NOT NULL DEFAULT 'ayah'
        );",
    )?;

    let reciters: &[(i64, &str, &str, &str)] = &[
        (950, "Abdul-Basit Abdul-Samad", "Abdul-Basit", "ayah"),
        (952, "Maher Al-Muaiqly", "Maher", "seek"),
        (953, "Mishari Rashid Al-Afasy", "Mishary", "ayah"),
        (954, "Saad Al-Ghamdi", "Saad", "ayah"),
        (961, "Yasser Al-Dosari", "Yasser", "ayah"),
    ];

    for (id, name, short_name, style) in reciters {
        conn.execute(
            "INSERT OR REPLACE INTO reciters (id, name, short_name, style) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![id, name, short_name, style],
        )?;
    }
    println!("Inserted {} reciter metadata rows", reciters.len());
    Ok(())
}

// ─── Recitations ─────────────────────────────────────────────────────────────

fn init_recitation_tables(conn: &Connection, paths: &[(i64, PathBuf)]) -> Result<()> {
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

    for (reciter_id, path) in paths {
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
                "INSERT OR IGNORE INTO recitations
                     (reciter_id, surah_number, ayah_number, audio_url, duration, segments)
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
                ins.execute(rusqlite::params![
                    reciter_id, surah, ayah, url, duration, segments
                ])?;
            }
        }
        tx.commit()?;
        println!("Imported recitation for reciter {}", reciter_id);
    }
    Ok(())
}

fn init_maher_recitation(conn: &Connection, path: &Path) -> Result<()> {
    if !path.exists() {
        eprintln!("Maher recitation DB not found: {:?}", path);
        return Ok(());
    }
    let src = Connection::open(path)?;
    let mut src_stmt = src.prepare(
        "SELECT sl.surah_number, seg.ayah_number, sl.audio_url,
                (seg.timestamp_to - seg.timestamp_from) AS duration,
                seg.timestamp_from, seg.timestamp_to
         FROM surah_list sl
         JOIN segments seg ON sl.surah_number = seg.surah_number
         ORDER BY sl.surah_number, seg.ayah_number",
    )?;

    let tx = conn.unchecked_transaction()?;
    {
        let mut ins = conn.prepare(
            "INSERT OR IGNORE INTO recitations
                 (reciter_id, surah_number, ayah_number, audio_url, duration, segments)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        let rows = src_stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })?;
        for row in rows {
            let (surah, ayah, url, duration, seek_from, seek_to) = row?;
            let segments = format!(r#"{{"seek_from":{seek_from},"seek_to":{seek_to}}}"#);
            ins.execute(rusqlite::params![952i64, surah, ayah, url, duration, segments])?;
        }
    }
    tx.commit()?;
    println!("Imported recitation for reciter 952 (Maher Al-Muaiqly, seek-style)");
    Ok(())
}

// ─── Translations ─────────────────────────────────────────────────────────────

fn init_translation_tables(conn: &Connection, paths: &[(String, String, PathBuf)]) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS translators (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            lang TEXT NOT NULL,
            name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS translations (
            translator_id INTEGER NOT NULL,
            surah         INTEGER NOT NULL,
            ayah          INTEGER NOT NULL,
            text          TEXT    NOT NULL,
            footnotes     TEXT,
            PRIMARY KEY (translator_id, surah, ayah)
        );
        CREATE INDEX IF NOT EXISTS idx_trans_surah ON translations(translator_id, surah);",
    )?;

    for (lang, name, path) in paths {
        if !path.exists() {
            eprintln!("Translation file not found: {:?}", path);
            continue;
        }
        conn.execute(
            "INSERT INTO translators (lang, name) VALUES (?1, ?2)",
            rusqlite::params![lang, name],
        )?;
        let translator_id = conn.last_insert_rowid();

        println!("Importing translation: {} - {}", lang, name);
        let content = fs::read_to_string(path)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let obj = match json.as_object() {
            Some(o) => o,
            None => continue,
        };

        let tx = conn.unchecked_transaction()?;
        {
            let mut stmt = conn.prepare(
                "INSERT INTO translations (translator_id, surah, ayah, text, footnotes)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;
            for (key, val) in obj {
                let parts: Vec<&str> = key.split(':').collect();
                if parts.len() != 2 {
                    continue;
                }
                let surah: i64 = parts[0].parse().unwrap_or(0);
                let ayah: i64 = parts[1].parse().unwrap_or(0);
                if surah == 0 || ayah == 0 {
                    continue;
                }
                let t = val.get("t").and_then(|v| v.as_str()).unwrap_or("");
                let empty_map = serde_json::Map::new();
                let f_map = val
                    .get("f")
                    .and_then(|v| v.as_object())
                    .unwrap_or(&empty_map);
                let (text, footnotes) = process_translation(t, f_map);
                stmt.execute(rusqlite::params![translator_id, surah, ayah, text, footnotes])?;
            }
        }
        tx.commit()?;
    }
    Ok(())
}

// ─── Tafsir ───────────────────────────────────────────────────────────────────
//
// Text deduplication: tafsir blocks (one per unique text) are stored in
// `tafsir_blocks`; `tafsir_ayah_map` maps each (author, surah, ayah) to a
// block.  A VIEW named `tafsirs` presents the same columns as the old table
// so `commands.rs` queries require no changes.

fn init_tafsir_tables(conn: &Connection, paths: &[(String, String, PathBuf)]) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS tafsir_authors (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            lang TEXT NOT NULL,
            name TEXT NOT NULL
        );
        -- Stores each unique tafsir block once
        CREATE TABLE IF NOT EXISTS tafsir_blocks (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            text      TEXT    NOT NULL
        );
        -- Maps each (author, surah, ayah) to a block; no text duplication
        CREATE TABLE IF NOT EXISTS tafsir_ayah_map (
            author_id INTEGER NOT NULL,
            surah     INTEGER NOT NULL,
            ayah      INTEGER NOT NULL,
            block_id  INTEGER NOT NULL,
            PRIMARY KEY (author_id, surah, ayah)
        );
        CREATE INDEX IF NOT EXISTS idx_tafsir_surah ON tafsir_ayah_map(author_id, surah);
        -- Transparent VIEW keeps commands.rs queries working unchanged
        CREATE VIEW IF NOT EXISTS tafsirs AS
            SELECT m.author_id, m.surah, m.ayah, b.text
            FROM tafsir_ayah_map m JOIN tafsir_blocks b ON m.block_id = b.id;",
    )?;

    for (lang, name, path) in paths {
        if !path.exists() {
            eprintln!("Tafsir file not found: {:?}", path);
            continue;
        }
        conn.execute(
            "INSERT INTO tafsir_authors (lang, name) VALUES (?1, ?2)",
            rusqlite::params![lang, name],
        )?;
        let author_id = conn.last_insert_rowid();

        println!("Importing tafsir: {} - {}", lang, name);
        let content = fs::read_to_string(path)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
        let obj = match json.as_object() {
            Some(o) => o,
            None => continue,
        };

        let tx = conn.unchecked_transaction()?;
        {
            let mut map_stmt = conn.prepare(
                "INSERT OR IGNORE INTO tafsir_ayah_map (author_id, surah, ayah, block_id)
                 VALUES (?1, ?2, ?3, ?4)",
            )?;

            for (key, val) in obj {
                let text = val.get("text").and_then(|v| v.as_str()).unwrap_or("");
                if text.is_empty() {
                    continue;
                }

                // Store the text block once
                conn.execute(
                    "INSERT INTO tafsir_blocks (author_id, text) VALUES (?1, ?2)",
                    rusqlite::params![author_id, text],
                )?;
                let block_id = conn.last_insert_rowid();

                // Map each covered ayah to this block
                let inserted =
                    if let Some(ayah_keys) = val.get("ayah_keys").and_then(|v| v.as_array()) {
                        let mut any = false;
                        for ak in ayah_keys {
                            let ak_str = ak.as_str().unwrap_or("");
                            let parts: Vec<&str> = ak_str.split(':').collect();
                            if parts.len() != 2 {
                                continue;
                            }
                            let s: i64 = parts[0].parse().unwrap_or(0);
                            let a: i64 = parts[1].parse().unwrap_or(0);
                            if s == 0 || a == 0 {
                                continue;
                            }
                            map_stmt.execute(rusqlite::params![author_id, s, a, block_id])?;
                            any = true;
                        }
                        any
                    } else {
                        false
                    };

                if !inserted {
                    let parts: Vec<&str> = key.split(':').collect();
                    if parts.len() != 2 {
                        continue;
                    }
                    let s: i64 = parts[0].parse().unwrap_or(0);
                    let a: i64 = parts[1].parse().unwrap_or(0);
                    if s == 0 || a == 0 {
                        continue;
                    }
                    map_stmt.execute(rusqlite::params![author_id, s, a, block_id])?;
                }
            }
        }
        tx.commit()?;
    }
    Ok(())
}

// ─── Transliteration ─────────────────────────────────────────────────────────

fn init_transliteration_table(conn: &Connection, path: &Path) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS transliterations (
            surah INTEGER NOT NULL,
            ayah  INTEGER NOT NULL,
            text  TEXT    NOT NULL,
            PRIMARY KEY (surah, ayah)
        );
        CREATE INDEX IF NOT EXISTS idx_translit_surah ON transliterations(surah);",
    )?;

    if !path.exists() {
        eprintln!("Transliteration file not found: {:?}", path);
        return Ok(());
    }

    println!("Importing transliteration …");
    let content = fs::read_to_string(path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let obj = match json.as_object() {
        Some(o) => o,
        None => return Ok(()),
    };

    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt =
            conn.prepare("INSERT INTO transliterations (surah, ayah, text) VALUES (?1, ?2, ?3)")?;
        for (key, val) in obj {
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() != 2 {
                continue;
            }
            let surah: i64 = parts[0].parse().unwrap_or(0);
            let ayah: i64 = parts[1].parse().unwrap_or(0);
            if surah == 0 || ayah == 0 {
                continue;
            }
            let text = val.get("t").and_then(|v| v.as_str()).unwrap_or("");
            stmt.execute(rusqlite::params![surah, ayah, text])?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ─── Word-by-word ─────────────────────────────────────────────────────────────

fn init_word_by_word_table(conn: &Connection, path: &Path) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS word_by_word (
            surah INTEGER NOT NULL,
            ayah  INTEGER NOT NULL,
            word  INTEGER NOT NULL,
            text  TEXT    NOT NULL,
            PRIMARY KEY (surah, ayah, word)
        );",
    )?;

    if !path.exists() {
        eprintln!("Word-by-word file not found: {:?}", path);
        return Ok(());
    }

    println!("Importing word-by-word …");
    let content = fs::read_to_string(path)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
    let obj = match json.as_object() {
        Some(o) => o,
        None => return Ok(()),
    };

    let tx = conn.unchecked_transaction()?;
    {
        let mut stmt = conn.prepare(
            "INSERT OR IGNORE INTO word_by_word (surah, ayah, word, text) VALUES (?1, ?2, ?3, ?4)",
        )?;
        for (key, val) in obj {
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() != 3 {
                continue;
            }
            let surah: i64 = parts[0].parse().unwrap_or(0);
            let ayah: i64 = parts[1].parse().unwrap_or(0);
            let word: i64 = parts[2].parse().unwrap_or(0);
            if surah == 0 || ayah == 0 || word == 0 {
                continue;
            }
            let text = val.as_str().unwrap_or("");
            stmt.execute(rusqlite::params![surah, ayah, word, text])?;
        }
    }
    tx.commit()?;
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn strip_html_simple(s: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(c),
            _ => {}
        }
    }
    result
}

fn process_translation(
    text: &str,
    f_map: &serde_json::Map<String, serde_json::Value>,
) -> (String, Option<String>) {
    let mut result = String::new();
    let mut footnotes: BTreeMap<String, String> = BTreeMap::new();
    let chars: Vec<char> = text.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '<' {
            i += 1;
            let mut tag_content = String::new();
            while i < chars.len() && chars[i] != '>' {
                tag_content.push(chars[i]);
                i += 1;
            }
            i += 1; // skip '>'

            if tag_content.starts_with("sup foot_note=\"") {
                let after = &tag_content["sup foot_note=\"".len()..];
                if let Some(end) = after.find('"') {
                    let id = &after[..end];
                    let mut display_num = String::new();
                    while i < chars.len() {
                        if chars[i] == '<' {
                            i += 1;
                            while i < chars.len() && chars[i] != '>' {
                                i += 1;
                            }
                            i += 1;
                            break;
                        } else {
                            display_num.push(chars[i]);
                            i += 1;
                        }
                    }
                    result.push('[');
                    result.push_str(&display_num);
                    result.push(']');
                    if let Some(ft) = f_map.get(id) {
                        let ft_str = ft.as_str().unwrap_or("");
                        footnotes.insert(display_num, strip_html_simple(ft_str));
                    }
                }
            }
            // else: skip other HTML tags
        } else {
            result.push(chars[i]);
            i += 1;
        }
    }

    let footnotes_json = if footnotes.is_empty() {
        None
    } else {
        serde_json::to_string(&footnotes).ok()
    };
    (result, footnotes_json)
}

fn buckwalter_to_arabic(buckwalter: &str) -> String {
    let mut result = String::with_capacity(buckwalter.len() * 2);
    for ch in buckwalter.chars() {
        let arabic = match ch {
            '\'' => '\u{0621}',
            '(' => '\u{0622}',
            '>' => '\u{0623}',
            '&' => '\u{0624}',
            '<' => '\u{0625}',
            '}' => '\u{0626}',
            'A' => '\u{0627}',
            'b' => '\u{0628}',
            'p' => '\u{0629}',
            't' => '\u{062A}',
            'v' => '\u{062B}',
            'j' => '\u{062C}',
            'H' => '\u{062D}',
            'x' => '\u{062E}',
            'd' => '\u{062F}',
            '*' => '\u{0630}',
            'r' => '\u{0631}',
            'z' => '\u{0632}',
            's' => '\u{0633}',
            '$' => '\u{0634}',
            'S' => '\u{0635}',
            'D' => '\u{0636}',
            'T' => '\u{0637}',
            'Z' => '\u{0638}',
            'E' => '\u{0639}',
            'g' => '\u{063A}',
            '_' => '\u{0640}',
            'f' => '\u{0641}',
            'q' => '\u{0642}',
            'k' => '\u{0643}',
            'l' => '\u{0644}',
            'm' => '\u{0645}',
            'n' => '\u{0646}',
            'h' => '\u{0647}',
            'w' => '\u{0648}',
            'Y' => '\u{0649}',
            'y' => '\u{064A}',
            'F' => '\u{064B}',
            'N' => '\u{064C}',
            'K' => '\u{064D}',
            'a' => '\u{064E}',
            'u' => '\u{064F}',
            'i' => '\u{0650}',
            '~' => '\u{0651}',
            'o' => '\u{0652}',
            '^' => '\u{0653}',
            '#' => '\u{0654}',
            '`' => '\u{0670}',
            '{' => '\u{0671}',
            ':' => '\u{06DC}',
            '@' => '\u{06DF}',
            '"' => '\u{06E0}',
            '[' => '\u{06E2}',
            ';' => '\u{06E3}',
            ',' => '\u{06E5}',
            '.' => '\u{06E6}',
            '!' => '\u{06E8}',
            '-' => '\u{06EA}',
            '+' => '\u{06EB}',
            '%' => '\u{06EC}',
            ']' => '\u{06ED}',
            '=' => '\u{060C}',
            '/' => '\u{061F}',
            'B' => '\u{061B}',
            'c' => '\u{060D}',
            'L' => '\u{FEFB}',
            'G' => '\u{FDF2}',
            '0' => '\u{0660}',
            '1' => '\u{0661}',
            '2' => '\u{0662}',
            '3' => '\u{0663}',
            '4' => '\u{0664}',
            '5' => '\u{0665}',
            '6' => '\u{0666}',
            '7' => '\u{0667}',
            '8' => '\u{0668}',
            '9' => '\u{0669}',
            _ => ch,
        };
        result.push(arabic);
    }
    result
}
