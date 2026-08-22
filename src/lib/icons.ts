/**
 * Offline icon bundle — registers every Iconify collection used in the app
 * so icons render without any network access.
 *
 * The full JSON for each collection is bundled (Vite cannot tree-shake icon
 * bodies based on runtime key lookups), so we just hand the whole object to
 * addCollection. This guarantees registration succeeds for every icon name
 * the app might reference, without the fragile pick() filter.
 */

import { addCollection, addIcon } from '@iconify/svelte';

import { generatedIcons } from './icons.generated';

import solarData from '@iconify-json/solar/icons.json';
import fluentData from '@iconify-json/fluent/icons.json';
import gardenData from '@iconify-json/garden/icons.json';
import iconParkData from '@iconify-json/icon-park-outline/icons.json';
import iconParkTwotoneData from '@iconify-json/icon-park-twotone/icons.json';
import charmData from '@iconify-json/charm/icons.json';
import dashiconsData from '@iconify-json/dashicons/icons.json';
import ggData from '@iconify-json/gg/icons.json';
import gridiconsData from '@iconify-json/gridicons/icons.json';
import icData from '@iconify-json/ic/icons.json';
import iconamoonData from '@iconify-json/iconamoon/icons.json';
import lucideData from '@iconify-json/lucide/icons.json';
import materialData from '@iconify-json/material-symbols/icons.json';
import mdiData from '@iconify-json/mdi/icons.json';
import phData from '@iconify-json/ph/icons.json';
import radixData from '@iconify-json/radix-icons/icons.json';
import riData from '@iconify-json/ri/icons.json';
import tablerData from '@iconify-json/tabler/icons.json';
import carbonData from '@iconify-json/carbon/icons.json';
import emojioneData from '@iconify-json/emojione/icons.json';
import svgSpinnersData from '@iconify-json/svg-spinners/icons.json';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const collections: any[] = [
    solarData,
    fluentData,
    gardenData,
    iconParkData,
    iconParkTwotoneData,
    charmData,
    dashiconsData,
    ggData,
    gridiconsData,
    icData,
    iconamoonData,
    lucideData,
    materialData,
    mdiData,
    phData,
    radixData,
    riData,
    tablerData,
    carbonData,
    emojioneData,
    svgSpinnersData,
];

for (const data of collections) {
    addCollection(data);
}

// Brand and file-type marks come from collections that run to several megabytes
// of JSON each, and the app uses one icon from each. Those are copied into
// icons.generated.ts by scripts/generate-icon-subset.mjs and registered
// individually, so the bundle carries the icons rather than the collections.
for (const [name, icon] of Object.entries(generatedIcons)) {
    addIcon(name, icon);
}
