// Generate the complete MSIX / AppX "Visual Assets" set from a single master
// icon, so the packaged app has crisp tile/logo images at every size and DPI
// scale instead of the pixelated result you get when the MSIX Packaging Tool
// upscales the small icon embedded in the .exe.
//
// Output: src-tauri/msix/Assets/*.png  (referenced by src-tauri/msix/AppxManifest.xml)
//
// Usage:
//   node scripts/generate-msix-assets.mjs
//   MSIX_MASTER_ICON=path/to/1024.png node scripts/generate-msix-assets.mjs
//
// Tip: the master should be square and as large as possible. The biggest asset
// is Square310x310Logo.scale-400 = 1240px, so a >=1240px (or vector-exported)
// master gives the sharpest tiles; a smaller master is upscaled with Lanczos.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MASTER =
    process.env.MSIX_MASTER_ICON || join(ROOT, "src-tauri", "icons", "icon.png");
const OUT = join(ROOT, "src-tauri", "msix", "Assets");

// DPI scale factors MSIX supports. Every logo is emitted at each scale so
// Windows can pick the exact match for the display instead of resampling.
const SCALES = [100, 125, 150, 200, 400];

// Square logos: base = the nominal (scale-100) edge length in px.
const SQUARE_LOGOS = [
    // The app-list icon also needs unplated "target size" variants used by the
    // taskbar / Start / Alt-Tab, at true pixel sizes.
    { name: "Square44x44Logo", base: 44, targetSizes: [16, 24, 32, 48, 256] },
    { name: "Square71x71Logo", base: 71 },
    { name: "Square150x150Logo", base: 150 },
    { name: "Square310x310Logo", base: 310 },
    { name: "StoreLogo", base: 50 },
];

// Wide tile: non-square, logo centred on a transparent canvas.
const WIDE_LOGO = { name: "Wide310x150Logo", baseW: 310, baseH: 150 };

const scaled = (px, scale) => Math.round((px * scale) / 100);
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** Resize the master into a w×h canvas, contained + centred, transparent pad. */
async function emit(master, w, h, file) {
    await sharp(master)
        .resize(w, h, {
            fit: "contain",
            background: TRANSPARENT,
            kernel: "lanczos3",
        })
        .png()
        .toFile(join(OUT, file));
    return file;
}

async function main() {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });

    // Load the master once into a buffer so every variant resamples from the
    // original (never from an already-downscaled intermediate).
    const master = await sharp(MASTER).png().toBuffer();
    const meta = await sharp(master).metadata();
    if (meta.width !== meta.height) {
        console.warn(
            `[msix] warning: master ${MASTER} is ${meta.width}x${meta.height}, not square.`,
        );
    }
    const biggest = scaled(310, 400); // 1240
    if ((meta.width ?? 0) < biggest) {
        console.warn(
            `[msix] note: master is ${meta.width}px; largest tile is ${biggest}px, so big tiles are upscaled. Provide a >=${biggest}px master for maximum sharpness.`,
        );
    }

    const written = [];

    for (const logo of SQUARE_LOGOS) {
        for (const scale of SCALES) {
            const s = scaled(logo.base, scale);
            written.push(await emit(master, s, s, `${logo.name}.scale-${scale}.png`));
        }
        // Target-size + unplated variants (Square44x44Logo only, per spec).
        for (const ts of logo.targetSizes ?? []) {
            written.push(await emit(master, ts, ts, `${logo.name}.targetsize-${ts}.png`));
            written.push(
                await emit(
                    master,
                    ts,
                    ts,
                    `${logo.name}.targetsize-${ts}_altform-unplated.png`,
                ),
            );
        }
    }

    for (const scale of SCALES) {
        const w = scaled(WIDE_LOGO.baseW, scale);
        const h = scaled(WIDE_LOGO.baseH, scale);
        written.push(await emit(master, w, h, `${WIDE_LOGO.name}.scale-${scale}.png`));
    }

    console.log(`[msix] wrote ${written.length} assets to ${OUT}`);
    console.log(`[msix] master: ${MASTER} (${meta.width}x${meta.height})`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
