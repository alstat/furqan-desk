use crate::db::Database;
use serde::Serialize;
use std::collections::BTreeMap;
use tauri::State;

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
