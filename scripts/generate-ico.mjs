// Regenerate src-tauri/icons/icon.ico as a proper multi-resolution Windows icon
// from the master PNG. Tauri embeds this .ico in the .exe, and the MSIX
// Packaging Tool builds its tiles by extracting + upscaling that embedded icon —
// so the bigger the largest frame in the .ico, the sharper every MSIX tile.
//
// Format notes (why this doesn't just use png-to-ico):
//   - An ICO directory entry stores width/height in a single byte, where 0 means
//     "256 or larger". So 256, 512 and 1024 frames ALL declare 0/0, and readers
//     must fall back to each frame's own header for the true size.
//   - That fallback only works when the frame is PNG-compressed (the real size
//     lives in the PNG IHDR). png-to-ico embeds *uncompressed BMP* frames, which
//     both bloat the file and leave two "256" entries indistinguishable to naive
//     readers — so a >256 frame added that way is unreliable. We therefore build
//     the ICO by hand with PNG frames, which is exactly how real large .ico files
//     (IcoFX, ImageMagick, …) carry 512/1024 sizes.
//
// We emit frames up to the master's native size (never upscaling past it, since
// that only inflates the file without adding detail). Drop in a 1024px master
// via MSIX_MASTER_ICON to push the largest frame higher still. For the sharpest
// MSIX tiles overall, prefer the dedicated Visual Assets pipeline
// (scripts/generate-msix-assets.mjs), which goes up to 1240px.
//
// Usage:
//   node scripts/generate-ico.mjs
//   MSIX_MASTER_ICON=path/to/1024.png node scripts/generate-ico.mjs

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MASTER =
    process.env.MSIX_MASTER_ICON || join(ROOT, "src-tauri", "icons", "icon.png");
const OUT = join(ROOT, "src-tauri", "icons", "icon.ico");

// Candidate frames Windows uses across Explorer, taskbar, Start and the MSIX
// tile source. The list is capped at the master's native size at runtime.
const CANDIDATE_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

/** Assemble a Windows .ico from PNG frame buffers. */
function buildIco(frames) {
    const HEADER = 6;
    const ENTRY = 16;
    const header = Buffer.alloc(HEADER);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type: 1 = icon
    header.writeUInt16LE(frames.length, 4); // frame count

    const dir = Buffer.alloc(ENTRY * frames.length);
    let offset = HEADER + ENTRY * frames.length;
    for (let i = 0; i < frames.length; i++) {
        const { size, data } = frames[i];
        const o = i * ENTRY;
        // 256 and larger are declared as 0; readers use the PNG header for the
        // real dimensions.
        dir[o] = size >= 256 ? 0 : size; // width
        dir[o + 1] = size >= 256 ? 0 : size; // height
        dir[o + 2] = 0; // color count (0 = truecolor)
        dir[o + 3] = 0; // reserved
        dir.writeUInt16LE(1, o + 4); // color planes
        dir.writeUInt16LE(32, o + 6); // bits per pixel
        dir.writeUInt32LE(data.length, o + 8); // bytes in resource
        dir.writeUInt32LE(offset, o + 12); // offset to data
        offset += data.length;
    }

    return Buffer.concat([header, dir, ...frames.map((f) => f.data)]);
}

async function main() {
    const image = sharp(MASTER);
    const meta = await image.metadata();
    const masterSize = Math.min(meta.width ?? 0, meta.height ?? 0);
    const master = await image.png().toBuffer();

    // Keep every candidate that fits within the master, plus the master's own
    // size, so the largest frame matches the master exactly rather than stopping
    // short. Never exceed the master (upscaling adds bytes, not detail).
    let sizes = CANDIDATE_SIZES.filter((s) => s <= masterSize);
    if (masterSize > 0 && !sizes.includes(masterSize)) sizes.push(masterSize);
    if (sizes.length === 0) sizes = [256];

    if (masterSize < 512) {
        console.warn(
            `[ico] master ${MASTER} is only ${masterSize}px — the largest frame can't exceed it. Provide a 512px+ master (MSIX_MASTER_ICON) for a bigger icon.`,
        );
    }

    const frames = await Promise.all(
        sizes.map(async (size) => ({
            size,
            data: await sharp(master)
                .resize(size, size, {
                    fit: "contain",
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                    kernel: "lanczos3",
                })
                .png({ compressionLevel: 9 })
                .toBuffer(),
        })),
    );

    const ico = buildIco(frames);
    await writeFile(OUT, ico);
    console.log(
        `[ico] wrote ${OUT} from ${masterSize}px master with PNG frames: ${sizes.join(", ")} px (${ico.length} bytes)`,
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
