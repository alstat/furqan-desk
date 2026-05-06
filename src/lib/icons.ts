/**
 * Offline icon bundle — registers every Iconify collection used in the app
 * so icons render without any network access.
 *
 * The full JSON for each collection is bundled (Vite cannot tree-shake icon
 * bodies based on runtime key lookups), so we just hand the whole object to
 * addCollection. This guarantees registration succeeds for every icon name
 * the app might reference, without the fragile pick() filter.
 */

import { addCollection } from '@iconify/svelte';

import solarData from '@iconify-json/solar/icons.json';
import fluentData from '@iconify-json/fluent/icons.json';
import iconParkData from '@iconify-json/icon-park-outline/icons.json';
import charmData from '@iconify-json/charm/icons.json';
import dashiconsData from '@iconify-json/dashicons/icons.json';
import ggData from '@iconify-json/gg/icons.json';
import gridiconsData from '@iconify-json/gridicons/icons.json';
import icData from '@iconify-json/ic/icons.json';
import iconamoonData from '@iconify-json/iconamoon/icons.json';
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
    iconParkData,
    charmData,
    dashiconsData,
    ggData,
    gridiconsData,
    icData,
    iconamoonData,
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
