use crate::db::Database;
use crate::typst_world::get_world;
use serde::Serialize;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Semaphore;

// ── Download state ────────────────────────────────────────────────────────────
pub struct DownloadState {
    pub cancel: Arc<AtomicBool>,
}

// ── Shared HTTP client ────────────────────────────────────────────────────────
/// Application-wide HTTP client shared across all commands.
///
/// Two independent semaphores prevent starvation:
/// - `detail_sem` throttles the burst of metadata fetches (60–90 per ayah).
/// - `image_sem` is reserved exclusively for image loads so that clicking any
///   manuscript always acquires a slot immediately, regardless of how many
///   detail fetches are still queued.
pub struct HttpClient {
    pub client: reqwest::Client,
    detail_sem: Arc<Semaphore>,
    image_sem: Arc<Semaphore>,
}

impl HttpClient {
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .expect("Failed to build shared HTTP client");
        Self {
            client,
            detail_sem: Arc::new(Semaphore::new(6)),
            image_sem: Arc::new(Semaphore::new(2)),
        }
    }
}

// ── Blog post struct ──────────────────────────────────────────────────────────
#[derive(Serialize, Clone)]
pub struct BlogPost {
    pub title: String,
    pub date: String,
    pub author: String,
    pub post_url: String,
}

// ── Recitation structs ───────────────────────────────────────────────────────
#[derive(Serialize)]
pub struct ReciterInfo {
    pub id: i64,
    pub name: String,
    pub short_name: String,
    pub style: String,
}

#[tauri::command]
pub fn get_reciters(state: State<Database>) -> Result<Vec<ReciterInfo>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, short_name, style FROM reciters ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ReciterInfo {
                id: row.get(0)?,
                name: row.get(1)?,
                short_name: row.get(2)?,
                style: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[derive(Serialize)]
pub struct RecitationAyah {
    pub audio_url: String,
    pub duration: Option<i64>,
    pub segments: Option<String>,
    pub is_local: bool,
    pub seek_start: Option<i64>,
    pub seek_end: Option<i64>,
}

#[tauri::command]
pub fn get_recitation_ayah(
    app: AppHandle,
    state: State<Database>,
    surah: i64,
    ayah: i64,
    reciter_id: i64,
) -> Result<Option<RecitationAyah>, String> {
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

            // Detect seek-style entries: segments JSON contains "seek_from"/"seek_to"
            let (seek_start, seek_end) = if let Some(ref seg) = segments {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(seg) {
                    let from = v.get("seek_from").and_then(|x| x.as_i64());
                    let to = v.get("seek_to").and_then(|x| x.as_i64());
                    (from, to)
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            };

            // Determine local file path based on reciter style
            let is_seek = seek_start.is_some();
            let local_path = if is_seek {
                // Seek-style: one MP3 per surah stored flat as {reciter_id}/{surah}.mp3
                app.path().app_data_dir().ok().map(|d| {
                    d.join("recitation")
                        .join(reciter_id.to_string())
                        .join(format!("{surah}.mp3"))
                })
            } else {
                // Ayah-style: one MP3 per ayah at {reciter_id}/{surah}/{ayah}.mp3
                app.path().app_data_dir().ok().map(|d| {
                    d.join("recitation")
                        .join(reciter_id.to_string())
                        .join(surah.to_string())
                        .join(format!("{ayah}.mp3"))
                })
            };
            let is_local = local_path.as_ref().map(|p| p.exists()).unwrap_or(false);
            let audio_url = if is_local {
                local_path.unwrap().to_string_lossy().into_owned()
            } else {
                remote_url
            };

            Ok(Some(RecitationAyah {
                audio_url,
                duration,
                segments,
                is_local,
                seek_start,
                seek_end,
            }))
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

    // Determine reciter style and get per-surah info
    let (is_seek, surah_rows): (bool, Vec<(i64, i64)>) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let style: String = conn
            .query_row(
                "SELECT style FROM reciters WHERE id = ?1",
                rusqlite::params![reciter_id],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "ayah".to_string());
        let is_seek = style == "seek";

        let mut stmt = conn
            .prepare(
                "SELECT surah_number, COUNT(*) FROM recitations
                 WHERE reciter_id = ?1 GROUP BY surah_number",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![reciter_id], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        (is_seek, rows)
    };

    let mut downloaded = Vec::new();
    let reciter_dir = data_dir.join("recitation").join(reciter_id.to_string());

    for (surah, expected) in surah_rows {
        if is_seek {
            // Seek-style: check for flat {reciter_id}/{surah}.mp3 file
            let file_path = reciter_dir.join(format!("{surah}.mp3"));
            if file_path.exists() {
                downloaded.push(surah);
            }
        } else {
            // Ayah-style: check surah directory has all expected ayah files
            let surah_dir = reciter_dir.join(surah.to_string());
            if surah_dir.exists() {
                let actual = std::fs::read_dir(&surah_dir)
                    .map(|rd| rd.filter_map(|e| e.ok()).count() as i64)
                    .unwrap_or(0);
                if actual >= expected {
                    downloaded.push(surah);
                }
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
    http: State<'_, HttpClient>,
    reciter_id: i64,
    surah_filter: Option<i64>,
    ayah_filter: Option<i64>,
) -> Result<(), String> {
    dl_state.cancel.store(false, Ordering::Relaxed);

    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let reciter_dir = data_dir.join("recitation").join(reciter_id.to_string());

    // Determine reciter style before building the download list
    let is_seek: bool = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT style FROM reciters WHERE id = ?1",
            rusqlite::params![reciter_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "ayah".to_string())
            == "seek"
    };

    if is_seek {
        // ── Seek-style: download one MP3 per surah ───────────────────────────
        // Each ayah row in recitations has the same audio_url per surah;
        // use DISTINCT to get one URL per surah.
        let surah_urls: Vec<(i64, String)> = {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            if let Some(sf) = surah_filter {
                let mut stmt = conn
                    .prepare(
                        "SELECT DISTINCT surah_number, audio_url FROM recitations
                         WHERE reciter_id = ?1 AND surah_number = ?2
                         ORDER BY surah_number",
                    )
                    .map_err(|e| e.to_string())?;
                let result = stmt
                    .query_map(rusqlite::params![reciter_id, sf], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                result
            } else {
                let mut stmt = conn
                    .prepare(
                        "SELECT DISTINCT surah_number, audio_url FROM recitations
                         WHERE reciter_id = ?1
                         ORDER BY surah_number",
                    )
                    .map_err(|e| e.to_string())?;
                let result = stmt
                    .query_map(rusqlite::params![reciter_id], |row| {
                        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                    })
                    .map_err(|e| e.to_string())?
                    .collect::<Result<Vec<_>, _>>()
                    .map_err(|e| e.to_string())?;
                result
            }
        };

        std::fs::create_dir_all(&reciter_dir).map_err(|e| e.to_string())?;

        let total = surah_urls.len();
        let mut downloaded_count: usize = 0;

        for (surah, url) in &surah_urls {
            if dl_state.cancel.load(Ordering::Relaxed) {
                break;
            }

            let file_path = reciter_dir.join(format!("{surah}.mp3"));

            if file_path.exists() {
                downloaded_count += 1;
                let _ = app.emit(
                    "recitation-download-progress",
                    DownloadProgressPayload {
                        reciter_id,
                        surah: *surah,
                        ayah: 1,
                        downloaded: downloaded_count,
                        total,
                        done: false,
                        failed: false,
                    },
                );
                continue;
            }

            let result = async {
                let resp = http.client.get(url.as_str()).send().await?;
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
                                ayah: 1,
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
                            ayah: 1,
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
                            ayah: 1,
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

        return Ok(());
    }

    // ── Ayah-style: download per-ayah MP3s ───────────────────────────────────
    // silent_rows are downloaded without emitting progress events (e.g. basmallah).
    let (rows, silent_rows): (Vec<(i64, i64, String)>, Vec<(i64, i64, String)>) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(af) = ayah_filter {
            // Single-ayah download
            let sf = surah_filter.unwrap_or(1);
            let mut stmt = conn
                .prepare(
                    "SELECT surah_number, ayah_number, audio_url FROM recitations
                     WHERE reciter_id = ?1 AND surah_number = ?2 AND ayah_number = ?3",
                )
                .map_err(|e| e.to_string())?;
            let result = stmt
                .query_map(rusqlite::params![reciter_id, sf, af], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            (result, vec![])
        } else if let Some(sf) = surah_filter {
            let mut stmt = conn
                .prepare(
                    "SELECT surah_number, ayah_number, audio_url FROM recitations
                     WHERE reciter_id = ?1 AND surah_number = ?2
                     ORDER BY surah_number, ayah_number",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(rusqlite::params![reciter_id, sf], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            // Fetch basmallah (surah 1, ayah 1) silently so offline playback works,
            // but exclude it from the progress count so users see only the surah's own ayahs.
            let basmallah = if sf != 1 && sf != 9 {
                let mut stmt1 = conn
                    .prepare(
                        "SELECT surah_number, ayah_number, audio_url FROM recitations
                         WHERE reciter_id = ?1 AND surah_number = 1 AND ayah_number = 1",
                    )
                    .map_err(|e| e.to_string())?;
                let result = stmt1
                    .query_map(rusqlite::params![reciter_id], |row| {
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
                vec![]
            };
            (rows, basmallah)
        } else {
            let mut stmt = conn
                .prepare(
                    "SELECT surah_number, ayah_number, audio_url FROM recitations
                     WHERE reciter_id = ?1
                     ORDER BY surah_number, ayah_number",
                )
                .map_err(|e| e.to_string())?;
            let result = stmt
                .query_map(rusqlite::params![reciter_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            (result, vec![])
        }
    }; // DB lock released here

    // Download basmallah silently (no progress events, not counted in total).
    for (_, _, url) in &silent_rows {
        if dl_state.cancel.load(Ordering::Relaxed) {
            break;
        }
        let file_path = reciter_dir.join("1").join("1.mp3");
        if file_path.exists() {
            continue;
        }
        if let Some(parent) = file_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let result = async {
            let resp = http.client.get(url.as_str()).send().await?;
            resp.bytes().await
        }
        .await;
        if let Ok(bytes) = result {
            let _ = std::fs::write(&file_path, &bytes);
        }
    }

    let total = rows.len();
    let mut downloaded_count: usize = 0;

    for (surah, ayah, url) in &rows {
        if dl_state.cancel.load(Ordering::Relaxed) {
            break;
        }

        let file_path = reciter_dir
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
            let resp = http.client.get(url.as_str()).send().await?;
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
    pub note: Option<String>,
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
    note: Option<String>,
) -> Result<Highlight, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO highlights (surah, ayah, text, note) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![surah, ayah, text, note],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, surah, ayah, text, note, created_at FROM highlights WHERE id = ?1",
        [id],
        |r| Ok(Highlight { id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, text: r.get(3)?, note: r.get(4)?, created_at: r.get(5)? }),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_highlights(db: State<Database>) -> Result<Vec<Highlight>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, surah, ayah, text, note, created_at FROM highlights ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| Ok(Highlight {
        id: r.get(0)?, surah: r.get(1)?, ayah: r.get(2)?, text: r.get(3)?, note: r.get(4)?, created_at: r.get(5)?,
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
    lang: String,
) -> Result<Vec<WordTranslation>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ayah, word, text FROM word_by_word WHERE surah = ?1 AND lang = ?2 ORDER BY ayah, word",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![surah, lang], |row| {
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

fn project_root_from_path(path: Option<String>) -> Option<std::path::PathBuf> {
    let p = std::path::PathBuf::from(path?);
    p.parent().map(|d| d.to_path_buf())
}

#[tauri::command]
pub fn compile_typst_svg(
    source: String,
    path: Option<String>,
) -> Result<Vec<String>, String> {
    let world = get_world();
    world.set_project_root(project_root_from_path(path));
    world.set_source(source);
    let doc = typst::compile::<typst::layout::PagedDocument>(world)
        .output
        .map_err(|e| format!("{e:?}"))?;
    Ok(doc.pages.iter().map(|p| typst_svg::svg(p)).collect())
}

#[tauri::command]
pub fn compile_typst_pdf(
    source: String,
    path: Option<String>,
) -> Result<Vec<u8>, String> {
    let world = get_world();
    world.set_project_root(project_root_from_path(path));
    world.set_source(source);
    let doc = typst::compile::<typst::layout::PagedDocument>(world)
        .output
        .map_err(|e| format!("{e:?}"))?;
    typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
        .map_err(|e| format!("{e:?}"))
}

/// Format Typst source with the `typstyle` pretty printer.
/// `indent` is the spaces per indentation level. Returns the formatted
/// document, or an error message if the source has syntax errors.
#[tauri::command]
pub fn typst_format(source: String, indent: u32) -> Result<String, String> {
    use typstyle_core::{Config, Typstyle};
    let config = Config::default().with_tab_spaces(indent as usize);
    Typstyle::new(config)
        .format_text(source)
        .render()
        .map_err(|e| e.to_string())
}

// ── Manuscript commands ───────────────────────────────────────────────────────

/// Fetch full metadata for a single manuscript (date, material, script, etc.)
#[tauri::command]
pub async fn get_manuscript_detail(
    http: State<'_, HttpClient>,
    manuscript_id: u32,
) -> Result<String, String> {
    let _permit = http.detail_sem.acquire().await.map_err(|e| e.to_string())?;
    let url = format!(
        "https://api.corpuscoranicum.de/api/data/manuscripts/{}",
        manuscript_id
    );
    let response = http.client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    response.text().await.map_err(|e| e.to_string())
}

/// Download full-resolution manuscript image and save it to the user's Downloads folder.
/// Returns the absolute path of the saved file.
#[tauri::command]
pub async fn save_manuscript_to_downloads(
    http: State<'_, HttpClient>,
    image_url: String,
    filename: String,
) -> Result<String, String> {
    // Build a high-res URL by keeping only the fn= param and adding dw=1200
    let fn_param: Option<String> = image_url
        .split(|c| c == '?' || c == '&')
        .find_map(|seg| {
            let s = seg.trim_start_matches('?');
            if s.starts_with("fn=") { Some(s.to_string()) } else { None }
        });

    let fetch_url = match fn_param {
        Some(ref fp) => format!(
            "https://corpuscoranicum.de/digitallibrary/servlet/Scaler?{}&dw=1200",
            fp
        ),
        None => image_url.clone(),
    };

    let bytes = http.client
        .get(&fetch_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let downloads_dir = dirs::download_dir()
        .ok_or_else(|| "Cannot locate Downloads folder".to_string())?;

    // Sanitise filename
    let safe: String = filename
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_' | '.') { c } else { '_' })
        .collect();
    let save_path = downloads_dir.join(if safe.is_empty() { "manuscript.jpg".into() } else { safe });

    tokio::fs::write(&save_path, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(save_path.to_string_lossy().into_owned())
}

/// Fetch manuscript list for a given surah/ayah from the Corpus Coranicum API.
/// Returns the raw JSON string for the frontend to parse.
#[tauri::command]
pub async fn get_manuscript_list(
    http: State<'_, HttpClient>,
    surah: u32,
    ayah: u32,
) -> Result<String, String> {
    let _permit = http.detail_sem.acquire().await.map_err(|e| e.to_string())?;
    let url = format!(
        "https://api.corpuscoranicum.de/api/data/manuscripts/sura/{}/verse/{}",
        surah, ayah
    );
    let response = http.client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    response.text().await.map_err(|e| e.to_string())
}

/// Extract a safe relative cache path from the `fn=` parameter embedded in a
/// Corpus Coranicum Scaler URL.  Returns e.g.
///   "manuscript/1247/<uuid>/manuscript-1247-page-41341-image-26904_t.jpg"
fn manuscript_cache_rel(image_url: &str, thumbnail: bool) -> std::path::PathBuf {
    // Pull out fn=... value (ends at next '&' or end-of-string)
    let fn_value = image_url
        .split(|c| c == '?' || c == '&')
        .find_map(|seg| seg.strip_prefix("fn="))
        .unwrap_or(image_url);

    // Strip the static prefix that every CC image shares
    let rel = fn_value
        .trim_start_matches('/')
        .trim_start_matches("projects/corpus-coranicum/")
        .trim_start_matches('/');

    // Build a safe PathBuf component-by-component
    let mut path = std::path::PathBuf::new();
    for component in rel.split('/') {
        if !component.is_empty() && component != ".." && component != "." {
            path.push(component);
        }
    }

    // Normalise extension to .jpg (Scaler always returns JPEG)
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("img")
        .to_string();
    let parent = path.parent().map(|p| p.to_path_buf()).unwrap_or_default();
    let filename = if thumbnail {
        format!("{}_t.jpg", stem)
    } else {
        format!("{}.jpg", stem)
    };
    parent.join(filename)
}

/// Download (and locally cache) a manuscript page image.
///
/// `image_url` is the complete Scaler thumbnail URL returned by the API
/// (e.g. `…Scaler?fn=…&dw=800&dh=800&mo=q1,jpg`).
/// When `thumbnail=false` the size params are swapped for a higher-res version.
#[tauri::command]
pub async fn get_manuscript_image(
    app: AppHandle,
    http: State<'_, HttpClient>,
    image_url: String,
    thumbnail: bool,
) -> Result<Vec<u8>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let cache_rel = manuscript_cache_rel(&image_url, thumbnail);
    let cache_path = app_data_dir.join("manuscript-images").join(&cache_rel);

    // Serve from cache — no network, no semaphore needed
    if cache_path.exists() {
        return tokio::fs::read(&cache_path).await.map_err(|e| e.to_string());
    }

    // Acquire permit before opening a network connection.
    // Uses the dedicated image semaphore so this is never blocked by detail fetches.
    let _permit = http.image_sem.acquire().await.map_err(|e| e.to_string())?;

    // Build the fetch URL: thumbnail uses the API URL as-is; full-res strips
    // the size constraints so Scaler returns the original resolution.
    let fetch_url = if thumbnail {
        image_url.clone()
    } else {
        // Replace the thumbnail size params with a larger width only
        let base = image_url
            .split('&')
            .next()
            .unwrap_or(&image_url);
        let fn_param = base
            .split('?')
            .nth(1)
            .map(|q| q.to_string())
            .unwrap_or_default();
        format!(
            "https://corpuscoranicum.de/digitallibrary/servlet/Scaler?{}&dw=1200",
            fn_param
        )
    };

    let bytes = http.client
        .get(&fetch_url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(parent) = cache_path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    tokio::fs::write(&cache_path, &bytes).await.map_err(|e| e.to_string())?;

    Ok(bytes.to_vec())
}

#[tauri::command]
pub async fn clear_manuscript_cache(app: AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("manuscript-images");
    if cache_dir.exists() {
        tokio::fs::remove_dir_all(&cache_dir).await.map_err(|e| e.to_string())?;
        tokio::fs::create_dir_all(&cache_dir).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Version queries ───────────────────────────────────────────────────────────

const TYPST_BUNDLED_VERSION: &str = "0.14"; // update when bumping Cargo.toml

/// Return the bundled Typst version (sync, no I/O).
#[tauri::command]
pub fn get_typst_version() -> String {
    TYPST_BUNDLED_VERSION.to_string()
}

/// Fetch the latest stable Typst release tag from GitHub.
#[tauri::command]
pub async fn get_latest_typst_version(http: State<'_, HttpClient>) -> Result<String, String> {
    let resp = http.client
        .get("https://api.github.com/repos/typst/typst/releases/latest")
        .header("User-Agent", "AyahLab/1.0")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;

    // Safety net: fall back to listing releases if latest is a pre-release
    if json.get("prerelease").and_then(|v| v.as_bool()).unwrap_or(false) {
        return get_latest_stable_typst_release(&http.client).await;
    }

    let tag = json
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing tag_name in response".to_string())?;
    Ok(tag.trim_start_matches('v').to_string())
}

/// Fetch the latest AyahLab version from the public versions.txt file.
#[tauri::command]
pub async fn get_latest_ayahlab_version(http: State<'_, HttpClient>) -> Result<String, String> {
    let resp = http.client
        .get("https://raw.githubusercontent.com/alstat/ayahlab-versions/refs/heads/main/versions.txt")
        .header("User-Agent", "AyahLab/1.0")
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error ({})", resp.status()));
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let version = text
        .lines()
        .next()
        .map(|l| l.trim().trim_start_matches('v').to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "versions.txt is empty".to_string())?;
    Ok(version)
}

/// Fetch the latest AyahLab blog post and compare it against the local DB.
/// Returns the new post if it hasn't been seen yet, or None if up to date.
#[tauri::command]
pub async fn check_new_blog_post(
    http: State<'_, HttpClient>,
    db: State<'_, Database>,
) -> Result<Option<BlogPost>, String> {
    let resp = http.client
        .get("https://raw.githubusercontent.com/alstat/ayahlab-blog-posts/refs/heads/main/posts-0.json")
        .header("User-Agent", "AyahLab/1.0")
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP error ({})", resp.status()));
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let posts: Vec<serde_json::Value> =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;

    let latest = posts.first().ok_or_else(|| "Empty posts list".to_string())?;
    let title = latest["title"].as_str().unwrap_or("").to_string();
    let date = latest["date"].as_str().unwrap_or("").to_string();
    let author = latest["author"].as_str().unwrap_or("").to_string();
    let post_url = latest["postUrl"].as_str().unwrap_or("").to_string();

    if title.is_empty() || date.is_empty() {
        return Ok(None);
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let stored: Option<(String, String, String)> = conn.query_row(
        "SELECT title, date, author FROM blog_posts ORDER BY id DESC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).ok();

    let is_new = match stored {
        None => true,
        Some((s_title, s_date, s_author)) => {
            date > s_date || title != s_title || author != s_author
        }
    };

    if is_new {
        Ok(Some(BlogPost { title, date, author, post_url }))
    } else {
        Ok(None)
    }
}

/// Record that the user has seen a blog post. Inserts it into the local DB
/// and trims the table to the 2 most recent entries.
#[tauri::command]
pub fn mark_blog_post_seen(
    title: String,
    date: String,
    author: String,
    post_url: String,
    db: State<'_, Database>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO blog_posts (title, date, author, post_url) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![title, date, author, post_url],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM blog_posts WHERE id NOT IN (SELECT id FROM blog_posts ORDER BY id DESC LIMIT 2)",
        [],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

async fn get_latest_stable_typst_release(client: &reqwest::Client) -> Result<String, String> {
    let resp = client
        .get("https://api.github.com/repos/typst/typst/releases")
        .header("User-Agent", "AyahLab/1.0")
        .send()
        .await
        .map_err(|e| format!("Network error: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub API error (HTTP {})", resp.status()));
    }
    let text = resp.text().await.map_err(|e| format!("Failed to read response: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON parse error: {e}"))?;
    let releases = json.as_array().ok_or("Expected array of releases")?;
    for release in releases {
        if !release
            .get("prerelease")
            .and_then(|v| v.as_bool())
            .unwrap_or(true)
        {
            if let Some(tag) = release.get("tag_name").and_then(|v| v.as_str()) {
                return Ok(tag.trim_start_matches('v').to_string());
            }
        }
    }
    Err("No stable Typst release found".to_string())
}

fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

async fn walk_dir_size(dir: std::path::PathBuf) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![dir];
    while let Some(current) = stack.pop() {
        let mut rd = match tokio::fs::read_dir(&current).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if let Ok(meta) = tokio::fs::metadata(&path).await {
                total += meta.len();
            }
        }
    }
    total
}

/// Return the total size of the manuscript image cache as a human-readable string.
#[tauri::command]
pub async fn get_manuscript_cache_size(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let cache_dir = app_data_dir.join("manuscript-images");
    if !cache_dir.exists() {
        return Ok("0 B".to_string());
    }
    Ok(format_bytes(walk_dir_size(cache_dir).await))
}

/// Serve a bundled demo manuscript image (index 0-2) from resources — used by
/// the first-run tour so images display offline without network calls.
#[tauri::command]
pub async fn get_manuscript_demo_image(app: AppHandle, index: usize) -> Result<Vec<u8>, String> {
    if index > 2 {
        return Err("index out of range".into());
    }
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let filename = format!("demo-{}.jpg", index);
    let path = resource_dir.join("data/manuscripts/demo").join(&filename);
    tokio::fs::read(&path).await.map_err(|e| format!("Failed to read demo image {}: {}", filename, e))
}

// ── Quranic search ────────────────────────────────────────────────────────────
#[derive(Serialize)]
pub struct AyahMatch {
    pub surah: i64,
    pub ayah: i64,
}

/// Strip Arabic diacritics (harakat + Quranic annotation marks) so consonant-only
/// queries match fully-vowelised stored text.
fn strip_arabic_diacritics(s: &str) -> String {
    s.chars()
        .filter(|&c| {
            !matches!(c,
                '\u{064B}'..='\u{065F}' // fathatan … wavy hamza below
                | '\u{0610}'..='\u{061A}' // extended Arabic marks
                | '\u{0670}'              // superscript alef
                | '\u{06D6}'..='\u{06DC}' // Quranic annotation signs
                | '\u{06DF}'..='\u{06E4}'
                | '\u{06E7}'..='\u{06E8}'
                | '\u{06EA}'..='\u{06ED}'
            )
        })
        .collect()
}

/// Languages (ISO codes stored in `translators.lang`) whose translation text is
/// written in Arabic script and therefore benefits from consonantal search.
const ARABIC_SCRIPT_LANGS: &[&str] = &["FA", "HA", "MS", "PA", "PS", "UR"];

/// Return true if `word` appears in `text` as a whole token (split on whitespace).
fn is_whole_word(text: &str, word: &str) -> bool {
    text.split_whitespace().any(|t| t == word)
}

/// Check all `words` against `text`. The last word uses whole-word matching when
/// `last_whole_word` is true; all other words use substring matching.
fn words_match(text: &str, words: &[String], last_whole_word: bool) -> bool {
    let last = words.len().saturating_sub(1);
    words.iter().enumerate().all(|(i, w)| {
        if i == last && last_whole_word {
            is_whole_word(text, w.as_str())
        } else {
            text.contains(w.as_str())
        }
    })
}

/// Fetch all (surah, ayah, text) rows from `translations` for a given translator,
/// then filter in Rust using consonantal, multi-word AND matching.
fn consonantal_translation_search(
    conn: &rusqlite::Connection,
    tid: i64,
    words: &[String],
    last_whole_word: bool,
) -> Result<Vec<AyahMatch>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT surah, ayah, text FROM translations
             WHERE translator_id = ?1 ORDER BY surah, ayah",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![tid], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    let results = rows
        .into_iter()
        .filter_map(|(surah, ayah, text)| {
            let stripped = strip_arabic_diacritics(&text);
            if words_match(&stripped, words, last_whole_word) {
                Some(AyahMatch { surah, ayah })
            } else {
                None
            }
        })
        .collect();
    Ok(results)
}

#[tauri::command]
pub fn search_quran(
    db: State<Database>,
    query: String,
    translator_id: Option<i64>,
) -> Result<Vec<AyahMatch>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Detect Arabic script in the query
    let is_arabic = query.chars().any(|c| ('\u{0600}'..='\u{06FF}').contains(&c));

    // Trailing whitespace in the query means the user wants the last word matched
    // as a standalone token (whole-word boundary), not as a prefix of another word.
    let last_whole_word = query.ends_with(|c: char| c.is_whitespace());

    if is_arabic {
        // Strip diacritics from the query and split into words for AND matching
        let stripped_query = strip_arabic_diacritics(query.trim());
        let words: Vec<String> = stripped_query
            .split_whitespace()
            .map(|w| w.to_string())
            .collect();

        // If an Arabic-script translator is active, search that translation table.
        // Otherwise search the Quran text directly.
        if let Some(tid) = translator_id {
            let lang: Option<String> = conn
                .query_row(
                    "SELECT lang FROM translators WHERE id = ?1",
                    rusqlite::params![tid],
                    |row| row.get(0),
                )
                .ok();
            if lang.as_deref().map(|l| ARABIC_SCRIPT_LANGS.contains(&l)).unwrap_or(false) {
                return consonantal_translation_search(&conn, tid, &words, last_whole_word);
            }
        }

        // Default: search quran_text consonantally
        let mut stmt = conn
            .prepare("SELECT sura, aya, text FROM quran_text ORDER BY sura, aya")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let results = rows
            .into_iter()
            .filter_map(|(sura, aya, text)| {
                let stripped = strip_arabic_diacritics(&text);
                if words_match(&stripped, &words, last_whole_word) {
                    Some(AyahMatch { surah: sura, ayah: aya })
                } else {
                    None
                }
            })
            .collect();
        Ok(results)
    } else {
        // Latin/Roman query — multi-word AND search against the active translation.
        // Diacritics are stripped from the stored text too, covering Arabic-script
        // translations that the user might query via romanised input.
        let tid = translator_id.unwrap_or(1);
        let words: Vec<String> = query
            .trim()
            .split_whitespace()
            .map(|w| w.to_lowercase())
            .collect();
        if words.is_empty() {
            return Ok(vec![]);
        }

        // Pre-filter in SQL on the first word to reduce in-memory work, then
        // apply the remaining words and diacritic stripping in Rust.
        let first_pattern = format!("%{}%", words[0]);
        let mut stmt = conn
            .prepare(
                "SELECT surah, ayah, text FROM translations
                 WHERE translator_id = ?1 AND text LIKE ?2
                 ORDER BY surah, ayah",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![tid, first_pattern], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        let results = rows
            .into_iter()
            .filter_map(|(surah, ayah, text)| {
                let normalised = strip_arabic_diacritics(&text).to_lowercase();
                if words_match(&normalised, &words, last_whole_word) {
                    Some(AyahMatch { surah, ayah })
                } else {
                    None
                }
            })
            .collect();
        Ok(results)
    }
}

// ── Tafsir commands ───────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TafsirAuthorInfo {
    pub id: i64,
    pub lang: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct AyahTafsir {
    pub ayah: i64,
    pub text: String,
}

#[tauri::command]
pub fn get_tafsir_authors(db: State<Database>) -> Result<Vec<TafsirAuthorInfo>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, lang, name FROM tafsir_authors ORDER BY lang, name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TafsirAuthorInfo {
                id: row.get(0)?,
                lang: row.get(1)?,
                name: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_surah_tafsir(
    db: State<Database>,
    surah: i64,
    author_id: i64,
) -> Result<Vec<AyahTafsir>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT ayah, text FROM tafsirs
             WHERE author_id = ?1 AND surah = ?2
             ORDER BY ayah",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![author_id, surah], |row| {
            Ok(AyahTafsir {
                ayah: row.get(0)?,
                text: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn get_system_font_families() -> Result<Vec<String>, String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();

    let mut families = BTreeSet::new();
    for face in db.faces() {
        for (family, _) in &face.families {
            families.insert(family.clone());
        }
    }

    Ok(families.into_iter().collect())
}
