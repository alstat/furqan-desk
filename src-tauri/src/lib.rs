mod buckwalter;
mod commands;
mod db;
#[cfg(unix)]
mod git;
mod julia;
#[cfg(any(unix, windows))]
mod pty;
mod terminal;
mod typst_world;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

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
        // NOTE: We deliberately do NOT set GTK_OVERLAY_SCROLLING=0 here.
        // Forcing overlay scrolling off pushes WebKitGTK onto its legacy native
        // GTK scrollbar path, which draws a wide, always-visible trough themed by
        // the GTK system theme — light regardless of the app's dark mode, and it
        // ignores both ::-webkit-scrollbar pseudo-elements *and* the standard
        // scrollbar-width/scrollbar-color CSS. Modern WebKitGTK (≥ 2.44, e.g.
        // Debian 13 / current Fedora) supports the standard scrollbar-* CSS
        // properties on its overlay scrollbars, so leaving overlay scrolling at
        // the GNOME default lets the rules in app.css style scrollbars correctly.
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // single-instance must be the FIRST plugin registered so it can intercept a
    // second launch (e.g. the OS opening our deep link) and forward it to the
    // already-running app. Only needed/available on Linux and Windows; macOS
    // delivers deep links to the running process directly.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
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
            #[cfg(any(unix, windows))]
            app.manage(pty::PtyState::new());
            app.manage(commands::DownloadState {
                cancel: Arc::new(AtomicBool::new(false)),
            });
            app.manage(commands::HttpClient::new());

            // --- Native application menu --------------------------------
            // By default macOS shows only "Close" under the File menu. Build a
            // richer File menu (Open File / Open Folder / Save / Save As) and
            // keep the standard App/Edit menus so Quit and Copy/Paste continue
            // to work. Each custom item emits an event the frontend listens for
            // (see src/routes/+layout.svelte); the accelerators also drive the
            // same shortcuts on every platform.
            let handle = app.handle().clone();

            let open_file = MenuItemBuilder::with_id("open_file", "Open File…")
                .accelerator("CmdOrCtrl+O")
                .build(&handle)?;
            let open_folder = MenuItemBuilder::with_id("open_folder", "Open Folder…")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(&handle)?;
            let save = MenuItemBuilder::with_id("save", "Save")
                .accelerator("CmdOrCtrl+S")
                .build(&handle)?;
            let save_as = MenuItemBuilder::with_id("save_as", "Save As…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(&handle)?;

            #[allow(unused_mut)]
            let mut file_builder = SubmenuBuilder::new(&handle, "File")
                .item(&open_file)
                .item(&open_folder)
                .separator()
                .item(&save)
                .item(&save_as)
                .separator()
                .close_window();
            #[cfg(not(target_os = "macos"))]
            {
                file_builder = file_builder.separator().quit();
            }
            let file_menu = file_builder.build()?;

            let edit_menu = SubmenuBuilder::new(&handle, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            #[allow(unused_mut)]
            let mut menu_builder = MenuBuilder::new(&handle);
            #[cfg(target_os = "macos")]
            {
                let app_menu = SubmenuBuilder::new(&handle, "AyahLab")
                    .about(None)
                    .separator()
                    .services()
                    .separator()
                    .hide()
                    .hide_others()
                    .show_all()
                    .separator()
                    .quit()
                    .build()?;
                menu_builder = menu_builder.item(&app_menu);
            }
            let menu = menu_builder.item(&file_menu).item(&edit_menu).build()?;
            app.set_menu(menu)?;

            // On Windows/Linux the menu renders as a bar below the title bar,
            // wasting vertical space. Hide that bar while keeping the menu (and
            // its keyboard accelerators such as Ctrl+O / Ctrl+S) installed, so
            // shortcuts keep working. This is a no-op on macOS, where the menu
            // lives in the global system menu bar.
            app.hide_menu()?;

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
            commands::typst_format,
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
            commands::get_reciters,
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
            julia::interrupt_julia,
            julia::julia_complete,
            julia::julia_definition,
            julia::julia_format,
            julia::stop_julia_repl,
            julia::get_julia_version,
            julia::get_latest_julia_version,
            julia::update_julia,
            julia::set_julia_version,
            terminal::start_terminal,
            terminal::send_terminal_input,
            terminal::signal_terminal,
            terminal::close_terminal,
            #[cfg(any(unix, windows))]
            pty::start_pty,
            #[cfg(any(unix, windows))]
            pty::pty_write,
            #[cfg(any(unix, windows))]
            pty::pty_resize,
            #[cfg(any(unix, windows))]
            pty::pty_kill,
            commands::search_quran,
            commands::get_manuscript_detail,
            commands::save_manuscript_to_downloads,
            commands::get_manuscript_list,
            commands::get_manuscript_image,
            commands::clear_manuscript_cache,
            commands::get_manuscript_demo_image,
            commands::get_system_font_families,
            #[cfg(unix)]
            git::git_head_content,
            #[cfg(unix)]
            git::git_status,
        ])
        .on_menu_event(|app, event| {
            // Forward File-menu clicks to the frontend, which runs the same
            // actions as the action-bar buttons (see fileActions.ts).
            let event_name = match event.id().as_ref() {
                "open_file" => Some("menu-open-file"),
                "open_folder" => Some("menu-open-folder"),
                "save" => Some("menu-save"),
                "save_as" => Some("menu-save-as"),
                _ => None,
            };
            if let Some(name) = event_name {
                let _ = app.emit(name, ());
            }
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clean up Julia process to avoid zombies
                if let Some(state) = window.try_state::<julia::JuliaState>() {
                    if let Ok(mut guard) = state.processes.lock() {
                        guard.clear(); // drop stdin of every kernel → Julia exits
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
