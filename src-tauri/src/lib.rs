mod buckwalter;
mod commands;
mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let database = db::Database::new().expect("Failed to initialize database");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(database)
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
