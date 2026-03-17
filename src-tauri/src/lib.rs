mod buckwalter;
mod commands;
mod db;
mod julia;
mod terminal;
mod typst_world;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let resource_dir = app.path().resource_dir()
                .expect("Failed to resolve resource directory");
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");

            std::fs::create_dir_all(&app_data_dir)
                .expect("Failed to create app data directory");
            std::fs::create_dir_all(app_data_dir.join("manuscript-images"))
                .expect("Failed to create manuscript-images directory");

            let db_path   = app_data_dir.join("quran.db");
            let sql_path  = resource_dir.join("data/quran-uthmani.sql");
            let morph_path = resource_dir.join("data/quranic-corpus-morphology-0.4 2.txt");
            let recitation_paths = vec![
                (953i64, resource_dir.join("data/recitation/ayah-recitation-mishari-rashid-al-afasy-murattal-hafs-953.db")),
                (954i64, resource_dir.join("data/recitation/ayah-recitation-saad-al-ghamdi-murattal-hafs-954.db")),
            ];

            let translation_paths: Vec<(String, String, std::path::PathBuf)> = vec![
                ("BN".into(), "Dr. Abu Bakr Muhammad Zakaria".into(),
                    resource_dir.join("data/translation/bn/dr-abu-bakr-muhammad-zakaria-simple.json")),
                ("EN".into(), "Abdel Haleem".into(),
                    resource_dir.join("data/translation/en/en-haleem-with-footnote-tags.json")),
                ("EN".into(), "Sahih International".into(),
                    resource_dir.join("data/translation/en/en-sahih-international-with-footnote-tags.json")),
                ("FA".into(), "Hussein Taji".into(),
                    resource_dir.join("data/translation/fa/fr-hussein-taji-simple.json")),
                ("HA".into(), "Abubakar Mahmood Jummi".into(),
                    resource_dir.join("data/translation/ha/abubakar-mahmood-jummi-with-footnote-tags.json")),
                ("HI".into(), "Maulana Azizul Haque Al-Umari".into(),
                    resource_dir.join("data/translation/hi/maulana-azizul-haque-al-umari-with-footnote-tags.json")),
                ("ID".into(), "Quran Indonesia".into(),
                    resource_dir.join("data/translation/id/quran-id-with-footnote-tags.json")),
                ("MS".into(), "Abdullah Basamia".into(),
                    resource_dir.join("data/translation/ms/abdullah-basamia-simple.json")),
                ("PA".into(), "Bayan ul Quran".into(),
                    resource_dir.join("data/translation/pa/bayan-ul-quran-simple.json")),
                ("PS".into(), "Rowwad Translation Center".into(),
                    resource_dir.join("data/translation/ps/pashto-translation-rowwad-translation-center-simple.json")),
                ("SW".into(), "Dr. Abdullah Muhammad Abu Bakr & Sheikh Nasir Khamis".into(),
                    resource_dir.join("data/translation/sw/dr-abdullah-muhammad-abu-bakr-and-sheikh-nasir-khamis-simple.json")),
                ("TL".into(), "Dar al-Salam Center (Tagalog)".into(),
                    resource_dir.join("data/translation/tl/dar-al-salam-center-tagalog-simple.json")),
                ("TR".into(), "Dar al-Salam Center".into(),
                    resource_dir.join("data/translation/tr/dar-al-salam-center-simple.json")),
                ("UR".into(), "Bayan ul Quran".into(),
                    resource_dir.join("data/translation/ur/bayan-ul-quran-simple.json")),
                ("RU".into(), "Kuliev".into(),
                    resource_dir.join("data/translation/ru/quran-ru-kuliev-simple.json")),
            ];

            let tafsir_paths: Vec<(String, String, std::path::PathBuf)> = vec![
                ("AR".into(), "Ibn Kathir (Arabic)".into(),
                    resource_dir.join("data/tafsir/ar/ar-tafsir-ibn-kathir.json")),
                ("AR".into(), "Al-Tabari (Arabic)".into(),
                    resource_dir.join("data/tafsir/ar/ar-tafsir-al-tabari.json")),
                ("EN".into(), "Ibn Kathir (English)".into(),
                    resource_dir.join("data/tafsir/en/en-tafisr-ibn-kathir.json")),
                ("TL".into(), "Al-Mukhtasar (Tagalog)".into(),
                    resource_dir.join("data/tafsir/tl/tagalog-Al-Mukhtasar.json")),
            ];

            let transliteration_path = resource_dir.join("data/transliteration/english-transliteration-tajweed-simple.json");
            let word_by_word_path = resource_dir.join("data/word-by-word/english-wbw-translation.json");

            let database = db::Database::new(db_path, sql_path, morph_path, recitation_paths, translation_paths, tafsir_paths, transliteration_path, word_by_word_path)
                .expect("Failed to initialize database");
            app.manage(database);
            // Load any previously saved custom Julia binary path before managing state
            let julia_custom_path = julia::load_persisted_path(&app.handle());
            app.manage(julia::JuliaState::new(julia_custom_path));
            app.manage(terminal::TerminalState::new());
            app.manage(commands::DownloadState {
                cancel: Arc::new(AtomicBool::new(false)),
            });

            // Eagerly initialise the Typst world (font scanning) in the background
            // so the first compile is fast.
            std::thread::spawn(|| {
                let _ = typst_world::get_world();
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_surah_labels,
            commands::get_surah,
            commands::get_surah_morphology,
            commands::get_basmallah_morphology,
            commands::get_word_morphology,
            commands::add_bookmark,
            commands::get_bookmarks,
            commands::delete_bookmark,
            commands::set_last_read,
            commands::get_last_read,
            commands::add_highlight,
            commands::get_highlights,
            commands::delete_highlight,
            commands::compile_typst_svg,
            commands::compile_typst_pdf,
            commands::check_typst_package,
            commands::install_typst_package,
            commands::check_typst_fonts,
            commands::install_typst_fonts,
            commands::get_typst_version,
            commands::get_latest_typst_version,
            commands::get_latest_ayahlab_version,
            commands::get_manuscript_cache_size,
            commands::get_recitation_ayah,
            commands::get_downloaded_surahs,
            commands::download_recitation,
            commands::cancel_recitation_download,
            commands::read_audio_bytes,
            commands::get_translators,
            commands::get_surah_translation,
            commands::get_surah_transliteration,
            commands::get_surah_word_by_word,
            commands::get_tafsir_authors,
            commands::get_surah_tafsir,
            julia::check_julia,
            julia::get_julia_path,
            julia::set_julia_path,
            julia::install_julia,
            julia::start_julia_repl,
            julia::run_julia_code,
            julia::julia_complete,
            julia::stop_julia_repl,
            julia::get_julia_version,
            julia::get_latest_julia_version,
            julia::update_julia,
            terminal::start_terminal,
            terminal::send_terminal_input,
            terminal::close_terminal,
            commands::search_quran,
            commands::get_manuscript_detail,
            commands::save_manuscript_to_downloads,
            commands::get_manuscript_list,
            commands::get_manuscript_image,
            commands::clear_manuscript_cache,
            commands::get_manuscript_demo_image,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clean up Julia process to avoid zombies
                if let Some(state) = window.try_state::<julia::JuliaState>() {
                    if let Ok(mut guard) = state.process.lock() {
                        guard.take(); // drop stdin → Julia exits
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
