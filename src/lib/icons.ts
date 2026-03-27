/**
 * Offline icon bundle — all Iconify icons used in the app are pre-loaded here
 * so they are available without an internet connection.
 *
 * Vite tree-shakes the JSON imports: only the specific icon bodies listed in
 * each ICONS array are included in the final bundle.
 */

import { addCollection } from '@iconify/svelte';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pick(data: any, names: string[]) {
    const icons: Record<string, unknown> = {};
    for (const name of names) {
        if (data.icons[name]) icons[name] = data.icons[name];
    }
    return { ...data, icons };
}

// ── solar ──────────────────────────────────────────────────────────────────
import solarData from '@iconify-json/solar/icons.json';
addCollection(pick(solarData, [
    'add-circle-bold-duotone',
    'alt-arrow-down-bold',
    'alt-arrow-down-bold-duotone',
    'alt-arrow-left-bold-duotone',
    'alt-arrow-right-bold',
    'alt-arrow-right-bold-duotone',
    'alt-arrow-up-bold',
    'arrow-left-bold-duotone',
    'arrow-right-bold-duotone',
    'arrow-right-linear',
    'arrow-right-up-linear',
    'book-bold',
    'book-bold-duotone',
    'book-bookmark-bold-duotone',
    'bookmark-bold',
    'bookmark-bold-duotone',
    'calculator-bold',
    'calculator-bold-duotone',
    'chart-bold-duotone',
    'chat-round-dots-bold-duotone',
    'check-circle-bold',
    'check-circle-bold-duotone',
    'close-circle-bold',
    'close-circle-bold-duotone',
    'close-circle-linear',
    'code-bold-duotone',
    'code-square-bold',
    'code-square-bold-duotone',
    'copy-bold-duotone',
    'danger-circle-bold',
    'database-bold-duotone',
    'diskette-bold-duotone',
    'document-text-bold-duotone',
    'download-bold-duotone',
    'download-minimalistic-bold',
    'download-minimalistic-bold-duotone',
    'download-twice-square-bold-duotone',
    'file-bold-duotone',
    'file-text-bold-duotone',
    'folder-bold-duotone',
    'folder-open-bold',
    'folder-open-bold-duotone',
    'folder-with-files-bold-duotone',
    'full-screen-bold-duotone',
    'gallery-add-bold',
    'gallery-bold-duotone',
    'global-bold-duotone',
    'graduation-cap-bold-duotone',
    'heart-bold',
    'heart-bold-duotone',
    'letter-bold-duotone',
    'link-bold',
    'link-bold-duotone',
    'lock-bold-duotone',
    'magic-stick-3-bold-duotone',
    'magnifer-bold-duotone',
    'menu-dots-line-duotone',
    'minimize-square-bold-duotone',
    'minus-circle-bold-duotone',
    'pallete-bold-duotone',
    'pause-circle-bold-duotone',
    'plain-bold-duotone',
    'play-bold',
    'play-circle-bold-duotone',
    'question-circle-bold-duotone',
    'record-circle-bold',
    'record-circle-outline',
    'refresh-bold',
    'refresh-bold-duotone',
    'refresh-circle-bold-duotone',
    'settings-bold-duotone',
    'shield-check-bold-duotone',
    'sidebar-minimalistic-bold',
    'sidebar-minimalistic-bold-duotone',
    'skip-next-bold',
    'skip-previous-bold',
    'star-bold-duotone',
    'stop-circle-bold',
    'table-bold',
    'table-bold-duotone',
    'tag-bold-duotone',
    'terminal-bold-duotone',
    'text-bold-duotone',
    'translation-bold-duotone',
    'trash-bin-minimalistic-bold',
    'trash-bin-minimalistic-bold-duotone',
    'trash-bin-trash-bold-duotone',
    'unlink-bold',
    'upload-bold-duotone',
    'wifi-router-minimalistic-bold-duotone',
]));

// ── fluent ─────────────────────────────────────────────────────────────────
import fluentData from '@iconify-json/fluent/icons.json';
addCollection(pick(fluentData, [
    'arrow-redo-16-filled',
    'arrow-undo-16-filled',
    'code-16-filled',
    'paint-bucket-16-filled',
    'text-bold-16-filled',
    'text-bullet-list-16-filled',
    'text-italic-16-filled',
    'text-number-list-16-filled',
    'text-quote-16-filled',
    'text-strikethrough-16-filled',
    'text-underline-16-filled',
]));

// ── icon-park-outline ──────────────────────────────────────────────────────
import iconParkData from '@iconify-json/icon-park-outline/icons.json';
addCollection(pick(iconParkData, [
    'align-text-both',
    'align-text-center',
    'align-text-left',
    'align-text-right',
    'indent-left',
    'indent-right',
    'info',
]));

// ── charm ──────────────────────────────────────────────────────────────────
import charmData from '@iconify-json/charm/icons.json';
addCollection(pick(charmData, [
    'chevron-down',
]));

// ── dashicons ──────────────────────────────────────────────────────────────
import dashiconsData from '@iconify-json/dashicons/icons.json';
addCollection(pick(dashiconsData, [
    'heading',
]));

// ── gg ─────────────────────────────────────────────────────────────────────
import ggData from '@iconify-json/gg/icons.json';
addCollection(pick(ggData, [
    'insert-after-r',
]));

// ── gridicons ──────────────────────────────────────────────────────────────
import gridiconsData from '@iconify-json/gridicons/icons.json';
addCollection(pick(gridiconsData, [
    'dropdown',
]));

// ── ic ─────────────────────────────────────────────────────────────────────
import icData from '@iconify-json/ic/icons.json';
addCollection(pick(icData, [
    'round-checklist',
]));

// ── iconamoon ──────────────────────────────────────────────────────────────
import iconamoonData from '@iconify-json/iconamoon/icons.json';
addCollection(pick(iconamoonData, [
    'comment-dots',
]));

// ── material-symbols ───────────────────────────────────────────────────────
import materialData from '@iconify-json/material-symbols/icons.json';
addCollection(pick(materialData, [
    'save-as-rounded',
    'format-line-spacing',
]));

// ── mdi ────────────────────────────────────────────────────────────────────
import mdiData from '@iconify-json/mdi/icons.json';
addCollection(pick(mdiData, [
    'close',
    'format-paragraph',
    'table-merge-cells',
    'table-split-cell',
]));

// ── ph ─────────────────────────────────────────────────────────────────────
import phData from '@iconify-json/ph/icons.json';
addCollection(pick(phData, [
    'file-pdf-bold',
]));

// ── radix-icons ────────────────────────────────────────────────────────────
import radixData from '@iconify-json/radix-icons/icons.json';
addCollection(pick(radixData, [
    'font-family',
]));

// ── ri ─────────────────────────────────────────────────────────────────────
import riData from '@iconify-json/ri/icons.json';
addCollection(pick(riData, [
    'ai-generate',
]));

// ── tabler ─────────────────────────────────────────────────────────────────
import tablerData from '@iconify-json/tabler/icons.json';
addCollection(pick(tablerData, [
    'column-insert-left',
    'column-insert-right',
    'column-remove',
    'dots',
    'layout-columns',
    'layout-rows',
    'math',
    'row-insert-bottom',
    'row-insert-top',
    'row-remove',
    'trash',
]));

// ── carbon ─────────────────────────────────────────────────────────────────
import carbonData from '@iconify-json/carbon/icons.json';
addCollection(pick(carbonData, [
    'table-of-contents',
]));

// ── emojione ───────────────────────────────────────────────────────────────
import emojioneData from '@iconify-json/emojione/icons.json';
addCollection(pick(emojioneData, [
    'flag-for-philippines',
]));
