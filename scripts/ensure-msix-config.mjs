// Reconcile the Windows bundler config with tauri.conf.json before packaging.
//
// Why this exists: the MSIX that goes to the Microsoft Store is produced by
// tauri-windows-bundle, which GENERATES its AppxManifest from
// src-tauri/gen/windows/bundle.config.json. That file lives under gen/ and is
// gitignored, so it is machine-local and invisible in diffs. It defaults to
// `extensions.protocolHandlers: []`, which means the Store build shipped with
// no ayahlab:// registration at all -- Google sign-in then hung forever,
// because the OAuth callback had nowhere to land. (v2.0.16 shipped this way.)
//
// src-tauri/msix/AppxManifest.xml is a DIFFERENT, hand-authored manifest used
// only by `pnpm msix` (scripts/build-msix.mjs). Fixing that one does not touch
// the Store artifact -- hence this script, which patches the config the Store
// build actually reads, every time, on any machine.
//
// The scheme list is read from tauri.conf.json (plugins.deep-link.desktop
// .schemes) rather than hardcoded, so the packaged manifest cannot silently
// drift from what the app itself registers at runtime.
//
// Idempotent: rewrites the file only when something actually changed.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TAURI_CONF = join(ROOT, "src-tauri", "tauri.conf.json");
const WINDOWS_CONF = join(ROOT, "src-tauri", "tauri.windows.conf.json");
const BUNDLE_CONF = join(ROOT, "src-tauri", "gen", "windows", "bundle.config.json");

function fail(msg) {
    console.error(`\n[msix-config] ERROR: ${msg}\n`);
    process.exit(1);
}

function readJson(path, label) {
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
        fail(`could not read ${label} (${path}): ${e.message}`);
    }
}

const conf = readJson(TAURI_CONF, "tauri.conf.json");

if (!existsSync(BUNDLE_CONF)) {
    fail(
        `bundle.config.json not found at ${BUNDLE_CONF}.\n` +
            "  This is a fresh clone: run `pnpm exec tauri-windows-bundle init` first,\n" +
            "  then set `publisher` to the Partner Center publisher ID (CN=<GUID>)\n" +
            "  and re-run this script.",
    );
}

const bundle = readJson(BUNDLE_CONF, "bundle.config.json");

// ── Protocol handlers ───────────────────────────────────────────────────────

const schemes = conf.plugins?.["deep-link"]?.desktop?.schemes ?? [];
if (schemes.length === 0) {
    fail(
        "tauri.conf.json declares no deep-link schemes " +
            "(plugins.deep-link.desktop.schemes), so there is nothing to register.",
    );
}

bundle.extensions ??= {};
const handlers = (bundle.extensions.protocolHandlers ??= []);

const added = [];
for (const scheme of schemes) {
    if (!handlers.some((h) => h?.name === scheme)) {
        handlers.push({ name: scheme, displayName: conf.productName ?? scheme });
        added.push(scheme);
    }
}

// ── Warnings that do not block the build ────────────────────────────────────

const warnings = [];

if (!bundle.publisher || /Your Company Name/i.test(bundle.publisher)) {
    warnings.push(
        `publisher is "${bundle.publisher ?? "unset"}" -- the Store requires the ` +
            "Partner Center publisher ID (CN=<GUID>). The upload will be rejected as-is.",
    );
}

// The window title carries the version literally, in two config files. They
// desync easily on a release bump, and the wrong one ships in the title bar.
const version = conf.version;
for (const [path, label] of [
    [TAURI_CONF, "tauri.conf.json"],
    [WINDOWS_CONF, "tauri.windows.conf.json"],
]) {
    if (!existsSync(path)) continue;
    for (const w of readJson(path, label).app?.windows ?? []) {
        const m = /v(\d+\.\d+\.\d+)/.exec(w.title ?? "");
        if (m && m[1] !== version) {
            warnings.push(
                `${label} window title says v${m[1]} but tauri.conf.json version is ${version}.`,
            );
        }
    }
}

// ── Write ───────────────────────────────────────────────────────────────────

if (added.length > 0) {
    writeFileSync(BUNDLE_CONF, `${JSON.stringify(bundle, null, 2)}\n`);
    console.log(`[msix-config] added protocol handler(s): ${added.join(", ")}`);
} else {
    console.log(
        `[msix-config] protocol handler(s) already present: ${schemes.join(", ")}`,
    );
}

for (const w of warnings) console.warn(`[msix-config] WARNING: ${w}`);
