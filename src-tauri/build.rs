fn main() {
    if let Ok(path) = dotenvy::dotenv() {
        println!("cargo:rerun-if-changed={}", path.display());
    }
    println!("cargo:rerun-if-env-changed=RESEND_API_KEY");
    if let Ok(key) = std::env::var("RESEND_API_KEY") {
        println!("cargo:rustc-env=RESEND_API_KEY={key}");
    }
    tauri_build::build()
}
