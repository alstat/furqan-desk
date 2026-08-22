fn main() {
    if let Ok(path) = dotenvy::dotenv() {
        println!("cargo:rerun-if-changed={}", path.display());
    }

    // tauri_build::build() bakes the config into the binary but emits no
    // rerun-if-changed for the files it read, so cargo has no reason to rerun
    // this script when one of them changes. `tauri dev`'s watcher hides that
    // while it is already running; edit a config with it stopped -- or add a
    // platform file that did not exist at the last build -- and the next
    // `tauri dev` silently launches the previous binary, config change and all.
    // Listing them here is what makes cargo notice. Naming files that do not
    // exist is fine: cargo then reruns if one appears.
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=tauri.linux.conf.json");
    println!("cargo:rerun-if-changed=tauri.macos.conf.json");
    println!("cargo:rerun-if-changed=tauri.windows.conf.json");
    println!("cargo:rerun-if-changed=tauri.microsoftstore.conf.json");

    tauri_build::build()
}
