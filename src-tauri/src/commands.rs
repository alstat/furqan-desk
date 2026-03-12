use crate::db::Database;
use crate::typst_world::get_world;
use serde::Serialize;
use std::collections::BTreeMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter, Manager, State};

// ── Download state ────────────────────────────────────────────────────────────
pub struct DownloadState {
    pub cancel: Arc<AtomicBool>,
}

// ── Recitation structs ───────────────────────────────────────────────────────
#[derive(Serialize)]
pub struct RecitationAyah {
    pub audio_url: String,
    pub duration: Option<i64>,
    pub segments: Option<String>,
    pub is_local: bool,
}

#[tauri::command]
pub fn get_recitation_ayah(
    app: AppHandle,
    state: State<Database>,
    surah: i64,
    ayah: i64,
    reciter_id: i64,
) -> Result<Option<RecitationAyah>, String> {
    // Check if a locally downloaded file exists first
    let local_path = app.path().app_data_dir().ok().map(|d| {
        d.join("recitation")
            .join(reciter_id.to_string())
            .join(surah.to_string())
            .join(format!("{ayah}.mp3"))
    });
    let is_local = local_path.as_ref().map(|p| p.exists()).unwrap_or(false);

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT audio_url, duration, segments FROM recitations
             WHERE reciter_id = ?1 AND surah_number = ?2 AND ayah_number = ?3",
        )
        .map_err(|e| e.to_string())?;
    let mut rows = stmt
        .query_map(rusqlite::params![reciter_id, surah, ayah], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<i64>>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    match rows.next() {
        Some(r) => {
            let (remote_url, duration, segments) = r.map_err(|e| e.to_string())?;
            let audio_url = if is_local {
                local_path.unwrap().to_string_lossy().into_owned()
            } else {
                remote_url
            };
            Ok(Some(RecitationAyah { audio_url, duration, segments, is_local }))
        }
        None => Ok(None),
    }
}

// ── Download progress payload ─────────────────────────────────────────────────
#[derive(Serialize, Clone)]
pub struct DownloadProgressPayload {
    pub reciter_id: i64,
    pub surah: i64,
    pub ayah: i64,
    pub downloaded: usize,
    pub total: usize,
    pub done: bool,
    pub failed: bool,
}

#[tauri::command]
pub fn get_downloaded_surahs(
    app: AppHandle,
    state: State<Database>,
    reciter_id: i64,
) -> Result<Vec<i64>, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    // Get expected ayah counts per surah in one query
    let expected_counts: Vec<(i64, i64)> = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT surah_number, COUNT(*) FROM recitations
                 WHERE reciter_id = ?1 GROUP BY surah_number",
            )
            .map_err(|e| e.to_string())?;
        let result = stmt.query_map(rusqlite::params![reciter_id], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
        result
    };

    let mut downloaded = Vec::new();
    for (surah, expected) in expected_counts {
        let surah_dir = data_dir
            .join("recitation")
            .join(reciter_id.to_string())
            .join(surah.to_string());
        if surah_dir.exists() {
            let actual = std::fs::read_dir(&surah_dir)
                .map(|rd| rd.filter_map(|e| e.ok()).count() as i64)
                .unwrap_or(0);
            if actual >= expected {
                downloaded.push(surah);
            }
        }
    }

    Ok(downloaded)
}

#[tauri::command]
pub async fn download_recitation(
    app: AppHandle,
    state: State<'_, Database>,
    dl_state: State<'_, DownloadState>,
    reciter_id: i64,
    surah_filter: Option<i64>,
) -> Result<(), String> {
    dl_state.cancel.store(false, Ordering::Relaxed);

    // Collect all rows before releasing the DB lock
    let rows: Vec<(i64, i64, String)> = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(sf) = surah_filter {
            let mut stmt = conn
                .prepare(
                    "SELECT surah_number, ayah_number, audio_url FROM recitations
                     WHERE reciter_id = ?1 AND surah_number = ?2
                     ORDER BY surah_number, ayah_number",
                )
                .map_err(|e| e.to_string())?;
            let result = stmt.query_map(rusqlite::params![reciter_id, sf], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
            result
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT surah_number, ayah_number, audio_url FROM recitations
                     WHERE reciter_id = ?1
                     ORDER BY surah_number, ayah_number",
                )
                .map_err(|e| e.to_string())?;
            let result = stmt.query_map(rusqlite::params![reciter_id], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
            result
        }
    }; // DB lock released here

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let total = rows.len();
    let mut downloaded_count: usize = 0;
    let client = reqwest::Client::new();

    for (surah, ayah, url) in &rows {
        if dl_state.cancel.load(Ordering::Relaxed) {
            break;
        }

        let file_path = data_dir
            .join("recitation")
            .join(reciter_id.to_string())
            .join(surah.to_string())
            .join(format!("{ayah}.mp3"));

        if file_path.exists() {
            downloaded_count += 1;
            let _ = app.emit(
                "recitation-download-progress",
                DownloadProgressPayload {
                    reciter_id,
                    surah: *surah,
                    ayah: *ayah,
                    downloaded: downloaded_count,
                    total,
                    done: false,
                    failed: false,
                },
            );
            continue;
        }

        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let result = async {
            let resp = client.get(url.as_str()).send().await?;
            resp.bytes().await
        }
        .await;

        match result {
            Ok(bytes) => {
                if let Err(e) = std::fs::write(&file_path, &bytes) {
                    let _ = app.emit(
                        "recitation-download-progress",
                        DownloadProgressPayload {
                            reciter_id,
                            surah: *surah,
                            ayah: *ayah,
                            downloaded: downloaded_count,
                            total,
                            done: false,
                            failed: true,
                        },
                    );
                    return Err(e.to_string());
                }
                downloaded_count += 1;
                let _ = app.emit(
                    "recitation-download-progress",
                    DownloadProgressPayload {
                        reciter_id,
                        surah: *surah,
                        ayah: *ayah,
                        downloaded: downloaded_count,
                        total,
                        done: false,
                        failed: false,
                    },
                );
            }
            Err(_) => {
                let _ = app.emit(
                    "recitation-download-progress",
                    DownloadProgressPayload {
                        reciter_id,
                        surah: *surah,
                        ayah: *ayah,
                        downloaded: downloaded_count,
                        total,
                        done: false,
                        failed: true,
                    },
                );
            }
        }
    }

    let _ = app.emit(
        "recitation-download-progress",
        DownloadProgressPayload {
            reciter_id,
            surah: 0,
            ayah: 0,
            downloaded: downloaded_count,
            total,
            done: true,
            failed: false,
        },
    );

    Ok(())
}

#[tauri::command]
pub fn cancel_recitation_download(dl_state: State<'_, DownloadState>) -> Result<(), String> {
    dl_state.cancel.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn read_audio_bytes(path: String) -> Result<Vec<u8>, String> {
    tokio::fs::read(&path).await.map_err(|e| e.to_string())
}

// ── User-data structs ────────────────────────────────────────────────────────
#[derive(Serialize)]
pub struct Bookmark {
    pub id: i64,
    pub surah: i64,
    pub ayah: i64,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct LastRead {
    pub surah: i64,
    pub ayah: i64,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct Highlight {
    pub id: i64,
    pub surah: i64,
    pub ayah: i64,
    pub text: String,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct Ayah {
    pub id: i64,
    pub sura: i64,
    pub aya: i64,
    pub text: String,
}

// Morphology structs
#[derive(Serialize, Clone)]
pub struct ParsedFeatures {
    pub pos: Option<String>,
    pub lemma: Option<String>,
    pub root: Option<String>,
    pub gender: Option<String>,
    pub number: Option<String>,
    pub case_type: Option<String>,
    pub person: Option<String>,
    pub voice: Option<String>,
    pub mood: Option<String>,
    pub aspect: Option<String>,
    pub state: Option<String>,
    pub derivation: Option<String>,
    pub prefix_type: Option<String>,
    pub suffix_type: Option<String>,
    pub raw: String,
}

#[derive(Serialize, Clone)]
pub struct MorphToken {
    pub token: i64,
    pub form_buckwalter: String,
    pub form_arabic: String,
    pub tag: String,
    pub tag_name: String,
    pub features: ParsedFeatures,
}

#[derive(Serialize, Clone)]
pub struct MorphWord {
    pub word: i64,
    pub tokens: Vec<MorphToken>,
    pub combined_arabic: String,
}

#[derive(Serialize, Clone)]
pub struct AyahMorphology {
    pub ayah: i64,
    pub words: Vec<MorphWord>,
}

#[derive(Serialize)]
pub struct SurahMorphology {
    pub surah: i64,
    pub ayahs: Vec<AyahMorphology>,
}

#[derive(Serialize, Clone)]
pub struct SurahLabel {
    pub en: String,
    pub ar: String,
}

#[tauri::command]
pub fn get_surah_labels() -> Vec<SurahLabel> {
    vec![
        ("Al-Fatihah", "الفاتحة"), ("Al-Baqarah", "البقرة"), ("Ali 'Imran", "آل عمران"),
        ("An-Nisa", "النساء"), ("Al-Ma'idah", "المائدة"), ("Al-An'am", "الأنعام"),
        ("Al-A'raf", "الأعراف"), ("Al-Anfal", "الأنفال"), ("At-Tawbah", "التوبة"),
        ("Yunus", "يونس"), ("Hud", "هود"), ("Yusuf", "يوسف"),
        ("Ar-Ra'd", "الرعد"), ("Ibrahim", "إبراهيم"), ("Al-Hijr", "الحجر"),
        ("An-Nahl", "النحل"), ("Al-Isra", "الإسراء"), ("Al-Kahf", "الكهف"),
        ("Maryam", "مريم"), ("Ta-Ha", "طه"), ("Al-Anbiya", "الأنبياء"),
        ("Al-Hajj", "الحج"), ("Al-Mu'minun", "المؤمنون"), ("An-Nur", "النور"),
        ("Al-Furqan", "الفرقان"), ("Ash-Shu'ara", "الشعراء"), ("An-Naml", "النمل"),
        ("Al-Qasas", "القصص"), ("Al-'Ankabut", "العنكبوت"), ("Ar-Rum", "الروم"),
        ("Luqman", "لقمان"), ("As-Sajdah", "السجدة"), ("Al-Ahzab", "الأحزاب"),
        ("Saba", "سبأ"), ("Fatir", "فاطر"), ("Ya-Sin", "يس"),
        ("As-Saffat", "الصافات"), ("Sad", "ص"), ("Az-Zumar", "الزمر"),
        ("Ghafir", "غافر"), ("Fussilat", "فصلت"), ("Ash-Shura", "الشورى"),
        ("Az-Zukhruf", "الزخرف"), ("Ad-Dukhan", "الدخان"), ("Al-Jathiyah", "الجاثية"),
        ("Al-Ahqaf", "الأحقاف"), ("Muhammad", "محمد"), ("Al-Fath", "الفتح"),
        ("Al-Hujurat", "الحجرات"), ("Qaf", "ق"), ("Adh-Dhariyat", "الذاريات"),
        ("At-Tur", "الطور"), ("An-Najm", "النجم"), ("Al-Qamar", "القمر"),
        ("Ar-Rahman", "الرحمن"), ("Al-Waqi'ah", "الواقعة"), ("Al-Hadid", "الحديد"),
        ("Al-Mujadila", "المجادلة"), ("Al-Hashr", "الحشر"), ("Al-Mumtahanah", "الممتحنة"),
        ("As-Saf", "الصف"), ("Al-Jumu'ah", "الجمعة"), ("Al-Munafiqun", "المنافقون"),
        ("At-Taghabun", "التغابن"), ("At-Talaq", "الطلاق"), ("At-Tahrim", "التحريم"),
        ("Al-Mulk", "الملك"), ("Al-Qalam", "القلم"), ("Al-Haqqah", "الحاقة"),
        ("Al-Ma'arij", "المعارج"), ("Nuh", "نوح"), ("Al-Jinn", "الجن"),
        ("Al-Muzzammil", "المزمل"), ("Al-Muddaththir", "المدثر"), ("Al-Qiyamah", "القيامة"),
        ("Al-Insan", "الإنسان"), ("Al-Mursalat", "المرسلات"), ("An-Naba", "النبأ"),
        ("An-Nazi'at", "النازعات"), ("'Abasa", "عبس"), ("At-Takwir", "التكوير"),
        ("Al-Infitar", "الانفطار"), ("Al-Mutaffifin", "المطففين"), ("Al-Inshiqaq", "الانشقاق"),
        ("Al-Buruj", "البروج"), ("At-Tariq", "الطارق"), ("Al-A'la", "الأعلى"),
        ("Al-Ghashiyah", "الغاشية"), ("Al-Fajr", "الفجر"), ("Al-Balad", "البلد"),
        ("Ash-Shams", "الشمس"), ("Al-Layl", "الليل"), ("Ad-Duha", "الضحى"),
        ("Ash-Sharh", "الشرح"), ("At-Tin", "التين"), ("Al-'Alaq", "العلق"),
        ("Al-Qadr", "القدر"), ("Al-Bayyinah", "البينة"), ("Az-Zalzalah", "الزلزلة"),
        ("Al-'Adiyat", "العاديات"), ("Al-Qari'ah", "القارعة"), ("At-Takathur", "التكاثر"),
        ("Al-'Asr", "العصر"), ("Al-Humazah", "الهمزة"), ("Al-Fil", "الفيل"),
        ("Quraysh", "قريش"), ("Al-Ma'un", "الماعون"), ("Al-Kawthar", "الكوثر"),
        ("Al-Kafirun", "الكافرون"), ("An-Nasr", "النصر"), ("Al-Masad", "المسد"),
        ("Al-Ikhlas", "الإخلاص"), ("Al-Falaq", "الفلق"), ("An-Nas", "الناس"),
    ]
    .into_iter()
    .map(|(en, ar)| SurahLabel { en: en.to_string(), ar: ar.to_string() })
    .collect()
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
pub fn get_surah(db: State<Database>, surah_number: i64) -> Result<Vec<Ayah>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, sura, aya, text FROM quran_text WHERE sura = ? ORDER BY aya")
        .map_err(|e| e.to_string())?;

    let ayahs = stmt
        .query_map([surah_number], |row| {
            Ok(Ayah {
                id: row.get(0)?,
                sura: row.get(1)?,
                aya: row.get(2)?,
                text: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(ayahs)
}

// Helper function to parse features string
fn parse_features(features: &str) -> ParsedFeatures {
    let mut pf = ParsedFeatures {
        pos: None,
        lemma: None,
        root: None,
        gender: None,
        number: None,
        case_type: None,
        person: None,
        voice: None,
        mood: None,
        aspect: None,
        state: None,
        derivation: None,
        prefix_type: None,
        suffix_type: None,
        raw: features.to_string(),
    };

    for part in features.split('|') {
        if part.starts_with("POS:") {
            pf.pos = Some(part[4..].to_string());
        } else if part.starts_with("LEM:") {
            pf.lemma = Some(part[4..].to_string());
        } else if part.starts_with("ROOT:") {
            pf.root = Some(part[5..].to_string());
        } else if part.starts_with("PRON:") {
            pf.suffix_type = Some(part[5..].to_string());
        } else if part.starts_with("MOOD:") {
            pf.mood = Some(part[5..].to_string());
        } else if part == "M" {
            pf.gender = Some("Masculine".to_string());
        } else if part == "F" {
            pf.gender = Some("Feminine".to_string());
        } else if part == "MS" {
            pf.gender = Some("Masculine".to_string());
            pf.number = Some("Singular".to_string());
        } else if part == "FS" {
            pf.gender = Some("Feminine".to_string());
            pf.number = Some("Singular".to_string());
        } else if part == "MP" {
            pf.gender = Some("Masculine".to_string());
            pf.number = Some("Plural".to_string());
        } else if part == "FP" {
            pf.gender = Some("Feminine".to_string());
            pf.number = Some("Plural".to_string());
        } else if part == "MD" {
            pf.gender = Some("Masculine".to_string());
            pf.number = Some("Dual".to_string());
        } else if part == "FD" {
            pf.gender = Some("Feminine".to_string());
            pf.number = Some("Dual".to_string());
        } else if part == "NOM" {
            pf.case_type = Some("Nominative".to_string());
        } else if part == "ACC" {
            pf.case_type = Some("Accusative".to_string());
        } else if part == "GEN" {
            pf.case_type = Some("Genitive".to_string());
        } else if part == "PERF" {
            pf.aspect = Some("Perfect".to_string());
        } else if part == "IMPF" {
            pf.aspect = Some("Imperfect".to_string());
        } else if part == "IMPV" {
            pf.aspect = Some("Imperative".to_string());
        } else if part == "ACT" {
            pf.voice = Some("Active".to_string());
        } else if part == "PASS" {
            pf.voice = Some("Passive".to_string());
        } else if part == "INDEF" {
            pf.state = Some("Indefinite".to_string());
        } else if part == "DEF" {
            pf.state = Some("Definite".to_string());
        } else if part.starts_with("PCPL") {
            pf.aspect = Some("Participle".to_string());
        } else if part.starts_with('(') && part.ends_with(')') {
            // Verb form like (IV), (VIII), etc.
            pf.derivation = Some(part.to_string());
        } else if part.ends_with('+') {
            // Prefix like "bi+", "l:P+", "w:CONJ+", "Al+"
            pf.prefix_type = Some(part.trim_end_matches('+').to_string());
        } else if part == "1S" || part == "1P" || part == "1D" {
            pf.person = Some("1st".to_string());
            if part.ends_with('S') {
                pf.number = Some("Singular".to_string());
            } else if part.ends_with('P') {
                pf.number = Some("Plural".to_string());
            } else if part.ends_with('D') {
                pf.number = Some("Dual".to_string());
            }
        } else if part.starts_with("2") {
            pf.person = Some("2nd".to_string());
            if part.contains('M') {
                pf.gender = Some("Masculine".to_string());
            } else if part.contains('F') {
                pf.gender = Some("Feminine".to_string());
            }
            if part.ends_with('S') {
                pf.number = Some("Singular".to_string());
            } else if part.ends_with('P') {
                pf.number = Some("Plural".to_string());
            } else if part.ends_with('D') {
                pf.number = Some("Dual".to_string());
            }
        } else if part.starts_with("3") {
            pf.person = Some("3rd".to_string());
            if part.contains('M') {
                pf.gender = Some("Masculine".to_string());
            } else if part.contains('F') {
                pf.gender = Some("Feminine".to_string());
            }
            if part.ends_with('S') {
                pf.number = Some("Singular".to_string());
            } else if part.ends_with('P') {
                pf.number = Some("Plural".to_string());
            } else if part.ends_with('D') {
                pf.number = Some("Dual".to_string());
            }
        } else if part == "IND" {
            pf.mood = Some("Indicative".to_string());
        } else if part == "JUS" {
            pf.mood = Some("Jussive".to_string());
        } else if part == "SUBJ" {
            pf.mood = Some("Subjunctive".to_string());
        }
    }

    pf
}

// Helper function to convert tag to human-readable name
fn get_tag_name(tag: &str) -> String {
    match tag {
        "N" => "Noun".to_string(),
        "V" => "Verb".to_string(),
        "P" => "Preposition".to_string(),
        "PN" => "Proper Noun".to_string(),
        "ADJ" => "Adjective".to_string(),
        "DET" => "Determiner".to_string(),
        "PRON" => "Pronoun".to_string(),
        "REL" => "Relative Pronoun".to_string(),
        "DEM" => "Demonstrative".to_string(),
        "CONJ" => "Conjunction".to_string(),
        "NEG" => "Negative Particle".to_string(),
        "T" => "Time Adverb".to_string(),
        "LOC" => "Location Adverb".to_string(),
        "INL" => "Initials".to_string(),
        "REM" => "Resumption".to_string(),
        "INTG" => "Interrogative".to_string(),
        "COND" => "Conditional".to_string(),
        "SUP" => "Supplementary".to_string(),
        "EXP" => "Explanation".to_string(),
        "ANS" => "Answer".to_string(),
        "AVR" => "Aversion".to_string(),
        "CERT" => "Certainty".to_string(),
        "CIRC" => "Circumstantial".to_string(),
        "COM" => "Comitative".to_string(),
        "EXH" => "Exhortation".to_string(),
        "EXL" => "Exclamation".to_string(),
        "FUT" => "Future".to_string(),
        "INC" => "Inceptive".to_string(),
        "INT" => "Interpretation".to_string(),
        "PREV" => "Preventive".to_string(),
        "PRO" => "Prohibition".to_string(),
        "RES" => "Restriction".to_string(),
        "RET" => "Retraction".to_string(),
        "RSLT" => "Result".to_string(),
        "SUB" => "Subordinate".to_string(),
        "SUR" => "Surprise".to_string(),
        "VOC" => "Vocative".to_string(),
        "ACC" => "Accusative Particle".to_string(),
        "AMD" => "Amendment".to_string(),
        _ => tag.to_string(),
    }
}

#[tauri::command]
pub fn get_surah_morphology(
    db: State<Database>,
    surah_number: i64,
) -> Result<SurahMorphology, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT ayah, word, token, form_buckwalter, form_arabic, tag, features
             FROM morphology
             WHERE surah = ?
             ORDER BY ayah, word, token",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([surah_number], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    // Group by ayah -> word -> tokens
    let mut ayahs_map: BTreeMap<i64, BTreeMap<i64, Vec<MorphToken>>> = BTreeMap::new();

    for row_result in rows {
        let (ayah, word, token, form_bw, form_ar, tag, features) =
            row_result.map_err(|e| e.to_string())?;

        let parsed = parse_features(&features);
        let tag_name = get_tag_name(&tag);

        ayahs_map
            .entry(ayah)
            .or_default()
            .entry(word)
            .or_default()
            .push(MorphToken {
                token,
                form_buckwalter: form_bw,
                form_arabic: form_ar,
                tag,
                tag_name,
                features: parsed,
            });
    }

    // Convert to final structure
    let ayahs: Vec<AyahMorphology> = ayahs_map
        .into_iter()
        .map(|(ayah, words_map)| {
            let words: Vec<MorphWord> = words_map
                .into_iter()
                .map(|(word, tokens)| {
                    let combined_arabic: String =
                        tokens.iter().map(|t| t.form_arabic.as_str()).collect();
                    MorphWord {
                        word,
                        tokens,
                        combined_arabic,
                    }
                })
                .collect();
            AyahMorphology { ayah, words }
        })
        .collect();

    Ok(SurahMorphology {
        surah: surah_number,
        ayahs,
    })
}

#[tauri::command]
pub fn get_basmallah_morphology(db: State<Database>) -> Result<AyahMorphology, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT word, token, form_buckwalter, form_arabic, tag, features
             FROM morphology
             WHERE surah = 1 AND ayah = 1
             ORDER BY word, token",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut words_map: BTreeMap<i64, Vec<MorphToken>> = BTreeMap::new();

    for row_result in rows {
        let (word, token, form_bw, form_ar, tag, features) =
            row_result.map_err(|e| e.to_string())?;

        let parsed = parse_features(&features);
        let tag_name = get_tag_name(&tag);

        words_map
            .entry(word)
            .or_default()
            .push(MorphToken {
                token,
                form_buckwalter: form_bw,
                form_arabic: form_ar,
                tag,
                tag_name,
                features: parsed,
            });
    }

    let words: Vec<MorphWord> = words_map
        .into_iter()
        .map(|(word, tokens)| {
            let combined_arabic: String = tokens.iter().map(|t| t.form_arabic.as_str()).collect();
            MorphWord {
                word,
                tokens,
                combined_arabic,
            }
        })
        .collect();

    Ok(AyahMorphology { ayah: 1, words })
}

#[tauri::command]
pub fn get_word_morphology(
    db: State<Database>,
    surah: i64,
    ayah: i64,
    word: i64,
) -> Result<MorphWord, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT token, form_buckwalter, form_arabic, tag, features
             FROM morphology
             WHERE surah = ? AND ayah = ? AND word = ?
             ORDER BY token",
        )
        .map_err(|e| e.to_string())?;

    let tokens: Vec<MorphToken> = stmt
        .query_map([surah, ayah, word], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .map(|r| {
            r.map(|(token, form_bw, form_ar, tag, features)| {
                let parsed = parse_features(&features);
                let tag_name = get_tag_name(&tag);
                MorphToken {
                    token,
                    form_buckwalter: form_bw,
                    form_arabic: form_ar,
                    tag,
                    tag_name,
                    features: parsed,
                }
            })
        })
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let combined_arabic: String = tokens.iter().map(|t| t.form_arabic.as_str()).collect();

    Ok(MorphWord {
        word,
        tokens,
        combined_arabic,
    })
}

// ── Bookmark commands ────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_bookmark(
    db: State<Database>,
    surah: i64,
    ayah: i64,
    note: Option<String>,
) -> Result<Bookmark, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bookmarks (surah, ayah, note) VALUES (?1, ?2, ?3)",
        rusqlite::params![surah, ayah, note],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, surah, ayah, note, created_at FROM bookmarks WHERE id = ?1",
        [id],
        |r| Ok(Bookmark { id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, note: r.get(3)?, created_at: r.get(4)? }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_bookmarks(db: State<Database>) -> Result<Vec<Bookmark>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, surah, ayah, note, created_at FROM bookmarks ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Bookmark {
        id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, note: r.get(3)?, created_at: r.get(4)?,
    }))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string());
    rows
}

#[tauri::command]
pub fn delete_bookmark(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Last-read commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn set_last_read(db: State<Database>, surah: i64, ayah: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO last_read (id, surah, ayah, updated_at) VALUES (1, ?1, ?2, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET surah = ?1, ayah = ?2, updated_at = datetime('now')",
        rusqlite::params![surah, ayah],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_last_read(db: State<Database>) -> Result<Option<LastRead>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match conn.query_row(
        "SELECT surah, ayah, updated_at FROM last_read WHERE id = 1",
        [],
        |r| Ok(LastRead { surah: r.get(0)?, ayah: r.get(1)?, updated_at: r.get(2)? }),
    ) {
        Ok(lr) => Ok(Some(lr)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ── Highlight commands ───────────────────────────────────────────────────────

#[tauri::command]
pub fn add_highlight(
    db: State<Database>,
    surah: i64,
    ayah: i64,
    text: String,
) -> Result<Highlight, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO highlights (surah, ayah, text) VALUES (?1, ?2, ?3)",
        rusqlite::params![surah, ayah, text],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, surah, ayah, text, created_at FROM highlights WHERE id = ?1",
        [id],
        |r| Ok(Highlight { id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, text: r.get(3)?, created_at: r.get(4)? }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_highlights(db: State<Database>) -> Result<Vec<Highlight>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, surah, ayah, text, created_at FROM highlights ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Highlight {
        id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, text: r.get(3)?, created_at: r.get(4)?,
    }))
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string());
    rows
}

#[tauri::command]
pub fn delete_highlight(db: State<Database>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM highlights WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Translation commands ──────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TranslatorInfo {
    pub id: i64,
    pub lang: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct AyahTranslation {
    pub ayah: i64,
    pub text: String,
    pub footnotes: Option<String>,
}

#[tauri::command]
pub fn get_translators(db: State<Database>) -> Result<Vec<TranslatorInfo>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, lang, name FROM translators ORDER BY lang, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TranslatorInfo {
                id: row.get(0)?,
                lang: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_surah_translation(
    db: State<Database>,
    surah: i64,
    translator_id: i64,
) -> Result<Vec<AyahTranslation>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ayah, text, footnotes FROM translations
             WHERE translator_id = ?1 AND surah = ?2
             ORDER BY ayah",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![translator_id, surah], |row| {
            Ok(AyahTranslation {
                ayah: row.get(0)?,
                text: row.get(1)?,
                footnotes: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Transliteration commands ──────────────────────────────────────────────────

#[derive(Serialize)]
pub struct AyahTransliteration {
    pub ayah: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_surah_transliteration(
    db: State<Database>,
    surah: i64,
) -> Result<Vec<AyahTransliteration>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ayah, text FROM transliterations WHERE surah = ?1 ORDER BY ayah",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![surah], |row| {
            Ok(AyahTransliteration {
                ayah: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Word-by-word commands ─────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct WordTranslation {
    pub ayah: i64,
    pub word: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_surah_word_by_word(
    db: State<Database>,
    surah: i64,
) -> Result<Vec<WordTranslation>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ayah, word, text FROM word_by_word WHERE surah = ?1 ORDER BY ayah, word",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![surah], |row| {
            Ok(WordTranslation {
                ayah: row.get(0)?,
                word: row.get(1)?,
                text: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

// ── Typst package management commands ────────────────────────────────────────

/// Returns true if the package is already present in the local typst cache.
/// Runs on a blocking thread so the filesystem check doesn't stall the async
/// runtime on startup (particularly slow on Windows/network drives).
#[tauri::command]
pub async fn check_typst_package(namespace: String, name: String, version: String) -> bool {
    tokio::task::spawn_blocking(move || {
        dirs::data_dir()
            .map(|d| {
                d.join("typst")
                    .join("packages")
                    .join(&namespace)
                    .join(&name)
                    .join(&version)
                    .join("typst.toml")
                    .exists()
            })
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// Download a package from the typst registry and extract it into the local
/// cache at `<data_dir>/typst/packages/<namespace>/<name>/<version>/`.
///
/// The typst package registry tarballs are flat (no wrapping directory):
///   typst.toml, lib.typ, … land directly at the archive root.
/// This matches what typst-cli does: `archive.unpack(package_dir)`.
#[tauri::command]
pub async fn install_typst_package(
    namespace: String,
    name: String,
    version: String,
) -> Result<(), String> {
    use flate2::read::GzDecoder;
    use tar::Archive;

    let url = format!(
        "https://packages.typst.org/{}/{}-{}.tar.gz",
        namespace, name, version
    );

    // Download the tarball bytes.
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Network error: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Package not found on registry (HTTP {}). Check the namespace/name/version.",
            response.status()
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    // Destination: <data_dir>/typst/packages/<namespace>/<name>/<version>/
    let pkg_dir = dirs::data_dir()
        .ok_or("Cannot locate the system data directory")?
        .join("typst")
        .join("packages")
        .join(&namespace)
        .join(&name)
        .join(&version);

    // Wipe any previous (partial) install so we start clean.
    if pkg_dir.exists() {
        std::fs::remove_dir_all(&pkg_dir)
            .map_err(|e| format!("Failed to remove old install: {e}"))?;
    }
    std::fs::create_dir_all(&pkg_dir)
        .map_err(|e| format!("Failed to create package directory: {e}"))?;

    // The registry tarball is flat — files are at the archive root with no
    // wrapping directory.  Unpack them directly into pkg_dir.
    let gz = GzDecoder::new(bytes.as_ref());
    let mut archive = Archive::new(gz);
    archive
        .unpack(&pkg_dir)
        .map_err(|e| format!("Failed to extract package: {e}"))?;

    Ok(())
}

// ── Typst font installation commands ─────────────────────────────────────────

/// Platform-specific directory where user fonts can be installed.
fn typst_user_fonts_dir() -> Option<std::path::PathBuf> {
    #[cfg(target_os = "macos")]
    return dirs::home_dir().map(|h| h.join("Library").join("Fonts"));
    #[cfg(target_os = "linux")]
    return dirs::home_dir().map(|h| h.join(".local").join("share").join("fonts"));
    #[cfg(target_os = "windows")]
    return dirs::font_dir();
    #[allow(unreachable_code)]
    None
}

/// Returns true when typst's bundled fonts have been installed to the system.
#[tauri::command]
pub async fn check_typst_fonts() -> bool {
    tokio::task::spawn_blocking(|| {
        typst_user_fonts_dir()
            .map(|d| d.join(".typst-fonts-installed").exists())
            .unwrap_or(false)
    })
    .await
    .unwrap_or(false)
}

/// Install typst's bundled fonts (New Computer Modern, Linux Libertine, DejaVu, …)
/// into the user's system font directory so they are available outside the app too.
#[tauri::command]
pub fn install_typst_fonts() -> Result<(), String> {
    use typst::foundations::Bytes;
    use typst::text::{Font, FontStyle};

    let fonts_dir = typst_user_fonts_dir()
        .ok_or_else(|| "Cannot locate user fonts directory".to_string())?;
    std::fs::create_dir_all(&fonts_dir)
        .map_err(|e| format!("Cannot create fonts directory: {e}"))?;

    for (i, font_data) in typst_assets::fonts().enumerate() {
        let ext = if font_data.starts_with(b"OTTO") { "otf" } else { "ttf" };
        let stem = Font::new(Bytes::new(font_data), 0)
            .map(|f| {
                let info = f.info();
                let style = match info.variant.style {
                    FontStyle::Normal => "Regular",
                    FontStyle::Italic => "Italic",
                    FontStyle::Oblique => "Oblique",
                };
                format!("{}-{}_{i}", info.family.replace([' ', '/'], ""), style)
            })
            .unwrap_or_else(|| format!("TypstFont_{i}"));

        let path = fonts_dir.join(format!("{stem}.{ext}"));
        if !path.exists() {
            std::fs::write(&path, font_data)
                .map_err(|e| format!("Failed to write {stem}.{ext}: {e}"))?;
        }
    }

    std::fs::write(fonts_dir.join(".typst-fonts-installed"), b"")
        .map_err(|e| format!("Failed to write marker: {e}"))?;

    Ok(())
}

// ── Typst compile commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn compile_typst_svg(source: String) -> Result<Vec<String>, String> {
    let world = get_world();
    world.set_source(source);
    let doc = typst::compile::<typst::layout::PagedDocument>(world)
        .output
        .map_err(|e| format!("{e:?}"))?;
    Ok(doc.pages.iter().map(|p| typst_svg::svg(p)).collect())
}

#[tauri::command]
pub fn compile_typst_pdf(source: String) -> Result<Vec<u8>, String> {
    let world = get_world();
    world.set_source(source);
    let doc = typst::compile::<typst::layout::PagedDocument>(world)
        .output
        .map_err(|e| format!("{e:?}"))?;
    typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
        .map_err(|e| format!("{e:?}"))
}
