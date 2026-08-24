/**
 * Generates src/lib/icons.generated.ts — offline data for exactly the icons the
 * app uses.
 *
 * Vite cannot tree-shake an `icons.json` that is looked up by runtime key, so
 * importing a collection ships all of it: the 21 sets this app draws on come to
 * ~50MB of JSON, which every window — the main one and each of the dialog
 * windows (terminal, manuscripts, postcard, drawing, plots, …) — used to parse
 * at boot in its own webview, for the ~300 icons actually referenced.
 *
 * So the names are discovered from the source instead. Every `"prefix:name"`
 * literal is collected, resolved against the installed @iconify-json packages
 * and written out as a flat map that src/lib/icons.ts registers with `addIcon`.
 * Nothing is hand-maintained: `pnpm build` runs this, so an icon added to a
 * component is picked up on the next build.
 *
 * Run `pnpm icons:subset` to refresh it during development — until then a newly
 * added icon falls back to the Iconify API, which in the packaged (offline) app
 * means a blank space.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, extname } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Collections installed as @iconify-json packages, i.e. what can be resolved.
 * Read by name rather than by dirent type: pnpm links each package in, so the
 * entries are symlinks and `isDirectory()` is false for every one of them.
 */
const COLLECTIONS = readdirSync(resolve(root, "node_modules/@iconify-json"))
    .filter((name) => !name.startsWith("."))
    .sort();

/**
 * Icons that no source scan can find — a name assembled at runtime, or one that
 * only ever arrives as data. There are none today; the list is the escape hatch
 * for when there is.
 */
const EXTRA = [];

/** Source trees to read icon names out of. */
const SCAN_DIRS = ["src", "static"];
const SCAN_EXTENSIONS = new Set([".svelte", ".ts", ".js", ".mjs", ".json", ".html", ".css"]);

/** Files big enough that scanning them is pointless (data blobs, dictionaries). */
const MAX_SCAN_BYTES = 5_000_000;

function* walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walk(path);
        } else if (SCAN_EXTENSIONS.has(extname(entry.name))) {
            yield path;
        }
    }
}

/**
 * Every `"prefix:name"` string in the source, for prefixes we can resolve.
 *
 * Deliberately a plain string match rather than a parse: icon names show up in
 * `<Icon icon="…" />`, in ternaries, in lookup tables and in plain constants,
 * and all of those are string literals. `generate-icon-subset` fails loudly
 * below if a name it finds is not in its collection, so a typo is caught here
 * rather than shipping as a blank icon.
 */
function scanForIconNames() {
    const pattern = new RegExp(
        `["'\`](${COLLECTIONS.join("|")}):([a-z0-9][a-z0-9.-]*)["'\`]`,
        "g",
    );
    const found = new Set();
    for (const dir of SCAN_DIRS) {
        for (const file of walk(resolve(root, dir))) {
            if (statSync(file).size > MAX_SCAN_BYTES) continue;
            const text = readFileSync(file, "utf8");
            for (const match of text.matchAll(pattern)) {
                found.add(`${match[1]}:${match[2]}`);
            }
        }
    }
    for (const name of EXTRA) found.add(name);
    return [...found].sort();
}

const WANTED = scanForIconNames();

/**
 * Icons whose artwork carries a hard-coded colour, rewritten to inherit the
 * one the surrounding text uses.
 *
 * The brand marks (Julia, Typst) are drawn in `currentColor` already, so they
 * read correctly in either theme wherever they are placed. vscode-icons draws
 * its file-type marks in fixed colours instead — the Lean one is a #000 stroke,
 * which all but disappears against the dark tab strip. Recolouring keeps the
 * artwork and puts it on the same footing as its neighbours.
 */
const INHERIT_COLOR = new Set(["vscode-icons:file-type-light-lean"]);

/** Swap literal colours for `currentColor` in fill/stroke attributes. */
function inheritColor(body) {
    return body.replace(
        /(fill|stroke)="(?!none|currentColor)[^"]*"/g,
        '$1="currentColor"',
    );
}

const OUT = resolve(root, "src/lib/icons.generated.ts");

/** Read one collection's icons.json from node_modules. */
function loadCollection(prefix) {
    const path = resolve(root, "node_modules/@iconify-json", prefix, "icons.json");
    try {
        return JSON.parse(readFileSync(path, "utf8"));
    } catch {
        throw new Error(
            `Missing @iconify-json/${prefix}. Add it with: pnpm add -D @iconify-json/${prefix}`,
        );
    }
}

/**
 * Resolve one icon to a flat definition. Aliases point at a parent (possibly
 * through several hops) and may add transforms; width/height fall back to the
 * collection's defaults, then to Iconify's own 16.
 */
function resolveIcon(collection, name) {
    const seen = new Set();
    let current = name;
    let transforms = {};

    while (!collection.icons?.[current]) {
        const alias = collection.aliases?.[current];
        if (!alias) return null;
        if (seen.has(current)) throw new Error(`Alias loop at ${current}`);
        seen.add(current);
        const { parent, ...rest } = alias;
        // The alias nearest the icon name wins on conflicts.
        transforms = { ...rest, ...transforms };
        current = parent;
    }

    const icon = collection.icons[current];
    return {
        ...transforms,
        ...icon,
        width: icon.width ?? collection.width ?? 16,
        height: icon.height ?? collection.height ?? 16,
    };
}

const entries = [];
const unresolved = [];
for (const full of WANTED) {
    const [prefix, name] = full.split(":");
    if (!prefix || !name) throw new Error(`Expected "prefix:name", got "${full}"`);
    const icon = resolveIcon(loadCollection(prefix), name);
    if (!icon) {
        // A name the collection does not have. That is a typo in the source (it
        // renders blank in the packaged app either way, since there is no
        // network to fall back to), so say which one rather than failing the
        // build over it.
        unresolved.push(full);
        continue;
    }
    if (INHERIT_COLOR.has(full)) icon.body = inheritColor(icon.body);
    entries.push([full, icon]);
}

const body = entries
    .map(([full, icon]) => `    ${JSON.stringify(full)}: ${JSON.stringify(icon)},`)
    .join("\n");

writeFileSync(
    OUT,
    `// GENERATED by scripts/generate-icon-subset.mjs — do not edit by hand.
// Single icons lifted out of collections too large to bundle whole. Edit the
// WANTED list in that script and re-run \`pnpm icons:subset\`.
import type { IconifyIcon } from '@iconify/svelte';

export const generatedIcons: Record<string, IconifyIcon> = {
${body}
};
`,
);

console.log(`icons.generated.ts: ${entries.length} icons`);
if (unresolved.length) {
    console.warn(
        `  ${unresolved.length} name(s) not found in their collection, so they will render blank:\n` +
            unresolved.map((n) => `    - ${n}`).join("\n"),
    );
}
