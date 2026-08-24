/**
 * Offline icon bundle — registers exactly the icons the app references, so they
 * render with no network access.
 *
 * This used to `addCollection` 21 whole Iconify collections. Vite cannot
 * tree-shake an `icons.json` looked up by runtime key, so all of it shipped:
 * ~50MB of JSON in the root layout chunk, parsed at boot by *every* window —
 * the main one and each dialog window (terminal, manuscripts, postcard,
 * drawing, plots, translation, tafsir, AI chat), each in its own webview with
 * its own heap, for the ~300 icons the app actually draws.
 *
 * scripts/generate-icon-subset.mjs now scans the source for every
 * `"prefix:name"` literal and copies just those out of the collections into
 * icons.generated.ts. `pnpm build` runs it, so an icon added to a component is
 * picked up automatically; `pnpm icons:subset` refreshes it during development.
 *
 * Collections still registered by hand elsewhere (the drawing toolbar's
 * teenyicons, the Julia and Lean cell bundles) are unaffected — they add their
 * own icons on top of these.
 */

import { addIcon } from '@iconify/svelte';

import { generatedIcons } from './icons.generated';

for (const [name, icon] of Object.entries(generatedIcons)) {
    addIcon(name, icon);
}
