// Build an MSIX for AyahLab directly from a built app folder, using the
// hand-authored manifest + crisp Visual Assets in src-tauri/msix.
//
// Why this instead of the MSIX Packaging Tool: that tool captures the files an
// installer *writes at runtime*. The app no longer copies its ~274 MB static
// DB into AppData on first run (it ATTACHes it read-only from the resource
// dir), so runtime monitoring now captures almost nothing → a ~266 KB, empty
// package. This script instead packs the real app folder (exe + resources)
// deterministically with makepri + makeappx, so the DB, dictionaries and the
// exe are all included, with the correct name/version/icons every time.
//
// Prerequisites: run on Windows with the Windows 10/11 SDK installed (provides
// makepri/makeappx/signtool), and generate the visual assets once:
//   npm run msix:assets
//
// Usage (PowerShell):
//   $env:MSIX_APP_DIR="path\to\app-folder"        # folder holding AyahLab.exe + its resources
//   $env:MSIX_PUBLISHER="CN=Your Name"            # MUST equal your signing cert Subject
//   $env:MSIX_PUBLISHER_DISPLAY_NAME="Your Name"  # optional, shown to users
//   $env:MSIX_IDENTITY_NAME="com.al-ahmadgaidasaad.ayahlab"  # optional
//   $env:MSIX_VERSION="1.4.5.0"                    # optional (defaults from tauri.conf.json)
//   $env:MSIX_CERT="path\to\cert.pfx"; $env:MSIX_CERT_PASSWORD="…"  # optional: sign
//   npm run msix
//
// Output: src-tauri/target/msix/AyahLab_<version>_x64.msix (override with MSIX_OUT).

import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";
import {
    existsSync,
    readFileSync,
    writeFileSync,
    mkdirSync,
    rmSync,
    cpSync,
    readdirSync,
} from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MSIX_DIR = join(ROOT, "src-tauri", "msix");
const ASSETS_DIR = join(MSIX_DIR, "Assets");
const MANIFEST_TEMPLATE = join(MSIX_DIR, "AppxManifest.xml");

function fail(msg) {
    console.error(`\n[msix] ERROR: ${msg}\n`);
    process.exit(1);
}

if (process.platform !== "win32") {
    fail(
        "MSIX packaging must run on Windows — it needs makepri/makeappx from the Windows SDK.",
    );
}

// ── Inputs ──────────────────────────────────────────────────────────────────

const conf = JSON.parse(
    readFileSync(join(ROOT, "src-tauri", "tauri.conf.json"), "utf8"),
);

const appDir = process.env.MSIX_APP_DIR && resolve(process.env.MSIX_APP_DIR);
if (!appDir || !existsSync(appDir)) {
    fail(
        "Set MSIX_APP_DIR to the built app folder (the one that holds AyahLab.exe and its resources).",
    );
}
const EXE = "AyahLab.exe";
if (!existsSync(join(appDir, EXE))) {
    fail(
        `${EXE} not found in MSIX_APP_DIR (${appDir}). Point it at the folder containing the built exe + its resources.`,
    );
}

// MSIX requires a four-part version (Major.Minor.Build.Revision).
function fourPart(v) {
    const parts = String(v).split(".").filter(Boolean);
    while (parts.length < 4) parts.push("0");
    return parts.slice(0, 4).join(".");
}
const version = fourPart(process.env.MSIX_VERSION || conf.version || "1.0.0");
const identityName =
    process.env.MSIX_IDENTITY_NAME || conf.identifier || "AyahLab";
const publisher = process.env.MSIX_PUBLISHER || "CN=AyahLab";
const publisherDisplay =
    process.env.MSIX_PUBLISHER_DISPLAY_NAME || conf.productName || "AyahLab";

if (!process.env.MSIX_PUBLISHER) {
    console.warn(
        '[msix] MSIX_PUBLISHER not set — defaulting to "CN=AyahLab". For a package that actually installs, this MUST exactly match the Subject of the certificate you sign with.',
    );
}

if (!existsSync(join(ASSETS_DIR, "Square150x150Logo.scale-100.png"))) {
    fail(
        "Visual assets are missing. Run `npm run msix:assets` first (it writes src-tauri/msix/Assets).",
    );
}

// ── Locate Windows SDK tools ────────────────────────────────────────────────

function onPath(name) {
    try {
        const out = execFileSync("where", [name], { encoding: "utf8" });
        return out.split(/\r?\n/).find(Boolean) || null;
    } catch {
        return null;
    }
}

function findSdkTool(name) {
    const p = onPath(name);
    if (p) return p;
    const roots = [
        "C:\\Program Files (x86)\\Windows Kits\\10\\bin",
        "C:\\Program Files\\Windows Kits\\10\\bin",
    ];
    const hits = [];
    for (const r of roots) {
        if (!existsSync(r)) continue;
        for (const ver of readdirSync(r)) {
            const exe = join(r, ver, "x64", `${name}.exe`);
            if (existsSync(exe)) hits.push({ ver, exe });
        }
    }
    // Newest SDK version wins.
    hits.sort((a, b) => (a.ver < b.ver ? 1 : -1));
    return hits[0]?.exe ?? null;
}

const makeappx = findSdkTool("makeappx");
const makepri = findSdkTool("makepri");
if (!makeappx || !makepri) {
    fail(
        "Could not find makeappx/makepri. Install the Windows 10/11 SDK, or run from a Developer Command Prompt so they're on PATH.",
    );
}

// ── Stage the package layout ────────────────────────────────────────────────

const outDir = join(ROOT, "src-tauri", "target", "msix");
const staging = join(outDir, "staging");
mkdirSync(outDir, { recursive: true });
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

// Skip Rust build artifacts so pointing MSIX_APP_DIR at target/release still
// yields a clean package (exe + DLLs + resources), not gigabytes of deps.
const JUNK_DIRS = new Set([
    "deps",
    "build",
    ".fingerprint",
    "incremental",
    "examples",
    ".cargo-lock",
]);
function keepInPackage(srcPath) {
    const rel = relative(appDir, srcPath);
    if (rel === "") return true;
    const segs = rel.split(/[\\/]/);
    if (JUNK_DIRS.has(segs[0])) return false;
    const base = segs[segs.length - 1];
    if (/\.(pdb|d|rlib|rmeta|lib|exp)$/i.test(base)) return false;
    // Drop stray top-level executables (e.g. build tools) that aren't the app.
    if (
        segs.length === 1 &&
        /\.exe$/i.test(base) &&
        base.toLowerCase() !== EXE.toLowerCase()
    ) {
        return false;
    }
    return true;
}

console.log(`[msix] staging app files from ${appDir} …`);
cpSync(appDir, staging, { recursive: true, filter: keepInPackage });
// Overwrite/insert our crisp assets and clear any stale index/manifest that a
// previous run may have left inside the app folder.
cpSync(ASSETS_DIR, join(staging, "Assets"), { recursive: true });
for (const stale of ["resources.pri", "AppxManifest.xml", "priconfig.xml"]) {
    rmSync(join(staging, stale), { force: true });
}

const manifest = readFileSync(MANIFEST_TEMPLATE, "utf8")
    .replaceAll("__MSIX_IDENTITY_NAME__", identityName)
    .replaceAll("__MSIX_PUBLISHER__", publisher)
    .replaceAll("__MSIX_VERSION__", version)
    .replaceAll("__MSIX_PUBLISHER_DISPLAY_NAME__", publisherDisplay);
writeFileSync(join(staging, "AppxManifest.xml"), manifest, "utf8");

// ── Build the resource index (makepri) so scale-qualified logos resolve ──────

const priconfig = join(outDir, "priconfig.xml");
console.log("[msix] indexing assets (makepri) …");
execFileSync(
    makepri,
    ["createconfig", "/cf", priconfig, "/dq", "en-US", "/o"],
    { stdio: "inherit" },
);
execFileSync(
    makepri,
    [
        "new",
        "/pr",
        staging,
        "/cf",
        priconfig,
        "/mn",
        join(staging, "AppxManifest.xml"),
        "/of",
        join(staging, "resources.pri"),
        "/o",
    ],
    { stdio: "inherit" },
);

// ── Pack (makeappx) ─────────────────────────────────────────────────────────

const outMsix = process.env.MSIX_OUT
    ? resolve(process.env.MSIX_OUT)
    : join(outDir, `AyahLab_${version}_x64.msix`);
console.log(`[msix] packing → ${outMsix} …`);
execFileSync(makeappx, ["pack", "/d", staging, "/p", outMsix, "/o"], {
    stdio: "inherit",
});

// ── Optional signing ────────────────────────────────────────────────────────

if (process.env.MSIX_CERT) {
    const signtool = findSdkTool("signtool");
    if (!signtool) fail("MSIX_CERT is set but signtool was not found in the SDK.");
    const args = ["sign", "/fd", "SHA256", "/f", resolve(process.env.MSIX_CERT)];
    if (process.env.MSIX_CERT_PASSWORD)
        args.push("/p", process.env.MSIX_CERT_PASSWORD);
    args.push(outMsix);
    console.log("[msix] signing …");
    execFileSync(signtool, args, { stdio: "inherit" });
} else {
    console.log(
        "[msix] package is UNSIGNED. Set MSIX_CERT=path.pfx (and MSIX_CERT_PASSWORD) to sign, or sign later — Windows won't install an MSIX without a trusted signature.",
    );
}

if (!process.env.MSIX_KEEP_STAGING) {
    rmSync(staging, { recursive: true, force: true });
}

console.log(`\n[msix] done → ${outMsix}\n`);
