// Regenerate src-tauri/icons/icon.ico as a proper multi-resolution Windows icon
// (16…256 px) from the master PNG. Tauri embeds this .ico in the .exe, and the
// MSIX Packaging Tool builds its tiles by extracting + upscaling that embedded
// icon — so if the .ico tops out at 32px, every MSIX tile is a blurry upscale.
// Giving it a 256px frame is the root-cause fix for the pixelated MSIX icons.
//
// Usage:
//   node scripts/generate-ico.mjs
//   MSIX_MASTER_ICON=path/to/1024.png node scripts/generate-ico.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MASTER =
    process.env.MSIX_MASTER_ICON || join(ROOT, "src-tauri", "icons", "icon.png");
const OUT = join(ROOT, "src-tauri", "icons", "icon.ico");

// Frames Windows uses across Explorer, taskbar, Start and the MSIX tile source.
const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
    const master = await sharp(MASTER).png().toBuffer();
    const frames = await Promise.all(
        SIZES.map((s) =>
            sharp(master)
                .resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
                .png()
                .toBuffer(),
        ),
    );
    const ico = await pngToIco(frames);
    await writeFile(OUT, ico);
    console.log(`[ico] wrote ${OUT} with frames: ${SIZES.join(", ")} px`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
