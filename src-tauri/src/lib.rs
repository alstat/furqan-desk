mod buckwalter;
mod commands;
mod db;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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

            let database = db::Database::new(db_path, sql_path, morph_path)
                .expect("Failed to initialize database");
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::get_surah_labels,
            commands::get_surah,
            commands::get_surah_morphology,
            commands::get_basmallah_morphology,
            commands::get_word_morphology
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
