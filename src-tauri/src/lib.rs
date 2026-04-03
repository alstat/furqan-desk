mod buckwalter;
mod commands;
mod db;
mod feedback;
mod julia;
mod terminal;
mod typst_world;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // WebKitGTK's DMA-BUF renderer fails to initialise EGL on some Linux
    // configurations (notably Fedora + Mesa ≥ 25 with AMD/Radeon GPUs), which
    // produces "Could not create default EGL display: EGL_BAD_PARAMETER.
    // Aborting…" and prevents the app from starting.  Disabling it here makes
    // WebKit fall back to a software-composited path that works everywhere.
    // Safe to set unconditionally on Linux; no effect on other platforms.
    #[cfg(target_os = "linux")]
    {
        // Only set if the caller has not already overridden it.
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            // SAFETY: single-threaded at this point (before Tauri spawns workers).
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }
    }

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

            let static_db = resource_dir.join("data/quran_static.db");
            let database = db::Database::new(static_db, app_data_dir.clone())
                .expect("Failed to initialize database");
            app.manage(database);
            // Load any previously saved custom Julia binary path before managing state
            let julia_custom_path = julia::load_persisted_path(&app.handle());
            app.manage(julia::JuliaState::new(julia_custom_path));
            app.manage(terminal::TerminalState::new());
            app.manage(commands::DownloadState {
                cancel: Arc::new(AtomicBool::new(false)),
            });
            app.manage(commands::HttpClient::new());

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
            commands::check_new_blog_post,
            commands::mark_blog_post_seen,
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
            feedback::send_feedback,
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
