mod buckwalter;
mod commands;
mod db;
mod julia;
mod terminal;
mod typst_world;

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

            let db_path   = app_data_dir.join("quran.db");
            let sql_path  = resource_dir.join("data/quran-uthmani.sql");
            let morph_path = resource_dir.join("data/quranic-corpus-morphology-0.4 2.txt");
            let recitation_paths = vec![
                (953i64, resource_dir.join("data/recitation/ayah-recitation-mishari-rashid-al-afasy-murattal-hafs-953.db")),
                (954i64, resource_dir.join("data/recitation/ayah-recitation-saad-al-ghamdi-murattal-hafs-954.db")),
            ];

            let database = db::Database::new(db_path, sql_path, morph_path, recitation_paths)
                .expect("Failed to initialize database");
            app.manage(database);
            // Load any previously saved custom Julia binary path before managing state
            let julia_custom_path = julia::load_persisted_path(&app.handle());
            app.manage(julia::JuliaState::new(julia_custom_path));
            app.manage(terminal::TerminalState::new());

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
            commands::get_recitation_ayah,
            julia::check_julia,
            julia::get_julia_path,
            julia::set_julia_path,
            julia::install_julia,
            julia::start_julia_repl,
            julia::run_julia_code,
            julia::julia_complete,
            julia::stop_julia_repl,
            terminal::start_terminal,
            terminal::send_terminal_input,
            terminal::close_terminal,
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
