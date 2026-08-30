mod buckwalter;
mod commands;
mod db;
#[cfg(any(unix, windows))]
mod git;
mod julia;
mod lean;
mod lean_lsp;
#[cfg(any(unix, windows))]
mod pty;
mod references;
mod spellcheck;
mod startup;
mod terminal;
mod typst_world;

use std::sync::{atomic::AtomicBool, Arc};
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

/// Whether WebKit is on its software-composited fallback, where a transparent
/// window loses its alpha.
///
/// The Linux build rounds its own corners and relies on the area outside the
/// radius being see-through. On the fallback path that area renders black
/// instead, which looks far worse than no rounding at all — so the frontend
/// asks this and squares the corners off when it is true. Only ever true when
/// someone has opted into WEBKIT_DISABLE_DMABUF_RENDERER; see the note in
/// `run()` for why that is no longer the default.
#[tauri::command]
fn software_compositing() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_some()
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Before anything that can fail: a release build has no console, so without
    // this a startup panic exits silently with no window and no message.
    startup::install_panic_hook();

    // WebKitGTK's DMA-BUF renderer fails to initialise EGL on some Linux
    // configurations (notably Fedora + Mesa ≥ 25 with AMD/Radeon GPUs), which
    // produces "Could not create default EGL display: EGL_BAD_PARAMETER.
    // Aborting…" and prevents the app from starting. Setting
    // WEBKIT_DISABLE_DMABUF_RENDERER drops WebKit onto a software-composited
    // path that starts everywhere, and this used to be forced on unconditionally.
    //
    // It is not free, though: that path composites the webview onto an *opaque*
    // surface, so the `transparent: true` window the Linux build uses to round
    // its own corners (see tauri.linux.conf.json) loses its alpha and the area
    // outside the corner radius comes out black instead of showing the desktop.
    // Forcing it therefore traded a broken window frame on every Linux machine
    // for a startup fix that only a few need, so it is now opt-in: a machine
    // that hits the EGL abort sets WEBKIT_DISABLE_DMABUF_RENDERER=1 itself.
    //
    // WebKit tests this variable by *presence*, not value, so a caller passing
    // "0" to mean "off" would still get the renderer disabled. Treat the falsey
    // spellings as opting out and remove it, so the variable behaves the way
    // someone setting it would expect.
    #[cfg(target_os = "linux")]
    {
        if matches!(
            std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").as_deref(),
            Ok("0") | Ok("false") | Ok("")
        ) {
            // SAFETY: single-threaded at this point (before Tauri spawns workers).
            unsafe { std::env::remove_var("WEBKIT_DISABLE_DMABUF_RENDERER") };
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
            // Nothing registers the ayahlab:// scheme on Windows or Linux until
            // the app is installed: the NSIS installer writes the registry key,
            // and the .desktop file covers Linux. A dev build, a portable copy,
            // or an install whose association got clobbered therefore has no
            // handler at all, so the OAuth callback dead-ends on the website's
            // "Returning you to AyahLab" page and the app sits on its spinner
            // forever. Registering at runtime (HKCU on Windows, an entry under
            // the data dir on Linux) closes that gap; it is idempotent, so it
            // costs nothing when the installer already did the job.
            //
            // macOS is absent because Info.plist carries the scheme even in a
            // dev build, and MSIX is unreachable from here either way -- a
            // packaged app's registry writes are virtualised into the package,
            // so the Store build declares the protocol in AppxManifest.xml
            // instead (see src-tauri/msix/AppxManifest.xml).
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    // Not fatal: an installed build already has the
                    // association, and everything but sign-in works without it.
                    eprintln!("deep-link scheme registration failed: {e}");
                }
            }

            let resource_dir = app.path().resource_dir()
                .expect("Failed to resolve resource directory");
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");

            std::fs::create_dir_all(&app_data_dir).unwrap_or_else(|e| {
                panic!(
                    "Failed to create app data directory {}: {e}",
                    app_data_dir.display()
                )
            });
            std::fs::create_dir_all(app_data_dir.join("manuscript-images")).unwrap_or_else(|e| {
                panic!(
                    "Failed to create manuscript-images directory under {}: {e}",
                    app_data_dir.display()
                )
            });

            let static_db = resource_dir.join("data/quran_static.db");
            // A package built without `bundle.resources` is the most common
            // cause of an installed build dying instantly, and the resulting
            // SQLite error names neither the file nor the reason. Check the
            // path first so the crash log says what is actually wrong.
            if !static_db.exists() {
                panic!(
                    "Bundled database is missing from this build: {} \
                     (resource_dir = {}). The installer or package did not \
                     include bundle.resources from tauri.conf.json.",
                    static_db.display(),
                    resource_dir.display()
                );
            }
            let database =
                db::Database::new(static_db.clone(), app_data_dir.clone()).unwrap_or_else(|e| {
                    panic!(
                        "Failed to initialize database from {}: {e}",
                        static_db.display()
                    )
                });
            app.manage(database);
            // Load any previously saved custom Julia binary path before managing state
            let julia_custom_path = julia::load_persisted_path(&app.handle());
            app.manage(julia::JuliaState::new(julia_custom_path));
            // Same pattern for Lean: the installer persists the path of the
            // launcher it produced, so restore it before managing the state.
            let lean_custom_path = lean::load_persisted_path(&app.handle());
            app.manage(lean::LeanState::new(lean_custom_path));
            app.manage(terminal::TerminalState::new());
            #[cfg(any(unix, windows))]
            app.manage(pty::PtyState::new());
            app.manage(commands::DownloadState {
                cancel: Arc::new(AtomicBool::new(false)),
            });
            app.manage(commands::HttpClient::new());

            // --- Native application menu --------------------------------
            // macOS only. There the menu lives in the global menu bar, and the
            // default File menu offers just "Close", so it is worth replacing
            // with a real one (Open File / Open Folder / Save / Save As) beside
            // the standard App and Edit menus. Each custom item emits an event
            // the frontend listens for (see src/routes/+layout.svelte).
            //
            // Windows and GTK have no global menu bar: a menu set here is drawn
            // *inside* every window as a menubar row, and `hide_menu()` only
            // reaches windows that already exist — so each dialog window opened
            // later (terminal, tafsir, drawing, …) came up with a File/Edit bar
            // above its own title bar. Those platforms therefore get no menu at
            // all; +layout.svelte already re-implements the accelerators with a
            // keydown handler, which is what actually drove the shortcuts there
            // even while the menu was merely hidden.
            #[cfg(target_os = "macos")]
            {
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

                let file_menu = SubmenuBuilder::new(&handle, "File")
                    .item(&open_file)
                    .item(&open_folder)
                    .separator()
                    .item(&save)
                    .item(&save_as)
                    .separator()
                    .close_window()
                    .build()?;

                let edit_menu = SubmenuBuilder::new(&handle, "Edit")
                    .undo()
                    .redo()
                    .separator()
                    .cut()
                    .copy()
                    .paste()
                    .select_all()
                    .build()?;

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

                let menu = MenuBuilder::new(&handle)
                    .item(&app_menu)
                    .item(&file_menu)
                    .item(&edit_menu)
                    .build()?;
                app.set_menu(menu)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            software_compositing,
            commands::greet,
            commands::get_surah_labels,
            commands::get_surah,
            commands::get_surah_morphology,
            commands::get_basmallah_morphology,
            commands::get_word_morphology,
            commands::get_ayah_morphology,
            commands::find_verses_by_root_or_lemma,
            commands::add_bookmark,
            commands::get_bookmarks,
            commands::delete_bookmark,
            commands::set_last_read,
            commands::get_last_read,
            commands::get_arabic_study_profile,
            commands::save_arabic_study_profile,
            commands::get_letter_progress,
            commands::get_random_study_words,
            commands::get_word_glosses,
            commands::mark_letter_practiced,
            commands::set_letter_mastered,
            commands::get_topic_content,
            commands::save_topic_content,
            commands::add_highlight,
            commands::get_highlights,
            commands::delete_highlight,
            commands::get_verse_of_day,
            commands::get_verse_of_day_history,
            commands::delete_verse_of_day,
            commands::clear_verse_of_day_history,
            commands::get_verse_of_day_storage,
            commands::export_verse_of_day_history,
            commands::get_verse_texts,
            commands::save_take_home_message,
            commands::get_take_home_message_history,
            commands::delete_take_home_message,
            commands::clear_take_home_message_history,
            commands::get_take_home_message_storage,
            commands::export_take_home_message_history,
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
            references::fetch_reference,
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
            lean::check_lean,
            lean::get_lean_path,
            lean::set_lean_path,
            lean::install_lean,
            lean::update_lean,
            lean::set_lean_toolchain,
            lean::get_lean_version,
            lean::get_latest_lean_version,
            lean::lean_compile,
            lean::cancel_lean_compile,
            lean::set_lean_use_server,
            lean::get_lean_use_server,
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
            spellcheck::spell_check,
            spellcheck::spell_suggest,
            spellcheck::spell_languages,
            spellcheck::spell_detect_language,
            spellcheck::install_spell_language,
            commands::get_system_font_families,
            commands::copy_path,
            #[cfg(any(unix, windows))]
            commands::move_to_trash,
            #[cfg(any(unix, windows))]
            git::git_head_content,
            #[cfg(any(unix, windows))]
            git::git_status,
            #[cfg(any(unix, windows))]
            git::git_ignored,
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
                // These runtimes belong to the app, not to any one window, and
                // this handler fires for every window. Secondary windows (the
                // postcard editor) open and close freely — tearing down the
                // user's REPLs because they closed one would be a nasty
                // surprise, so only the main window's teardown cleans up.
                if window.label() != "main" {
                    return;
                }

                // The postcard editor and the manuscript viewer are secondary
                // to this window; once it is gone there is nothing for them to
                // be secondary to, and on macOS — where closing the main window
                // does not quit the app — they would otherwise be left behind
                // with no way back to the reader. Destroy rather than close: the
                // session is already ending, so there is nothing left to prompt
                // about.
                for (label, secondary) in window.app_handle().webview_windows() {
                    if label != "main" {
                        let _ = secondary.destroy();
                    }
                }

                // Clean up Julia process to avoid zombies
                if let Some(state) = window.try_state::<julia::JuliaState>() {
                    if let Ok(mut guard) = state.processes.lock() {
                        guard.clear(); // drop stdin of every kernel → Julia exits
                    }
                }
                // A Lean compile that outlives the window would keep running
                // detached; stop whatever each runtime still has in flight.
                if let Some(state) = window.try_state::<lean::LeanState>() {
                    lean::kill_all(&state);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
