/**
 * Offline icon bundle for the Julia code-cell UI.
 *
 * `@iconify/svelte` normally fetches icon data from the Iconify API at
 * runtime. Registering the icons here with `addCollection` embeds their SVG
 * data straight into the app bundle, so the Julia cell and its slash-command
 * entry render with no network request. Importing this module anywhere runs
 * the registration once (ES modules are evaluated a single time).
 *
 * When adding an icon to JuliaCellComponent / the Julia slash command, add
 * its data here too — otherwise it falls back to the Iconify API.
 */
import { addCollection } from '@iconify/svelte';

addCollection({
    prefix: 'tabler',
    width: 24,
    height: 24,
    icons: {
        'chevron-down': {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m6 9l6 6l6-6"/>',
        },
        code: {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m7 8l-4 4l4 4m10-8l4 4l-4 4M14 4l-4 16"/>',
        },
        'layout-rows': {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm0 6h16"/>',
        },
        'terminal-2': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m8 9l3 3l-3 3m5 0h3"/><path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></g>',
        },
        'text-size': {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7V5h13v2m-6-2v14m2 0H8m7-6v-1h6v1m-3-1v7m-1 0h2"/>',
        },
        'text-wrap': {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 18h5m-5-6h13a3 3 0 0 1 0 6h-4l2-2m0 4l-2-2"/>',
        },
        'text-wrap-disabled': {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h10M4 18h10M4 12h17l-3-3m0 6l3-3"/>',
        },
    },
});

addCollection({
    prefix: 'fluent',
    width: 24,
    height: 24,
    icons: {
        'arrow-autofit-height-24-filled': {
            body: '<path fill="currentColor" d="M17 14a1 1 0 0 1 1 1v2.586l.793-.793a1 1 0 1 1 1.414 1.414l-2.5 2.5a1 1 0 0 1-1.414 0l-2.5-2.5a1 1 0 0 1 1.414-1.414l.793.793V15a1 1 0 0 1 1-1M11 4a1 1 0 1 1 0 2H6.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5H11a1 1 0 1 1 0 2H6.5A2.5 2.5 0 0 1 4 17.5v-11A2.5 2.5 0 0 1 6.5 4zm5.37-.775a1 1 0 0 1 1.337.068l2.5 2.5a1 1 0 0 1-1.414 1.414L18 6.414V9a1 1 0 0 1-2 0V6.414l-.793.793a1 1 0 0 1-1.414-1.414l2.5-2.5z"/>',
        },
        'arrow-autofit-height-in-24-filled': {
            body: '<path fill="currentColor" d="m16.957 10.207l2.5-2.5a1 1 0 0 0-1.414-1.414l-.793.793V4a1 1 0 1 0-2 0v3.086l-.793-.793a1 1 0 1 0-1.414 1.414l2.5 2.5a1 1 0 0 0 1.414 0M4 6.5A2.5 2.5 0 0 1 6.5 4h4a1 1 0 1 1 0 2h-4a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h4a1 1 0 1 1 0 2h-4A2.5 2.5 0 0 1 4 17.5zm15.457 9.793l-2.5-2.5a1 1 0 0 0-1.414 0l-2.5 2.5a1 1 0 0 0 1.414 1.414l.793-.793V20a1 1 0 1 0 2 0v-3.086l.793.793a1 1 0 0 0 1.414-1.414"/>',
        },
    },
});

addCollection({
    prefix: 'mdi',
    width: 24,
    height: 24,
    icons: {
        minus: { body: '<path fill="currentColor" d="M19 13H5v-2h14z"/>' },
        plus: {
            body: '<path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>',
        },
    },
});

addCollection({
    prefix: 'solar',
    width: 24,
    height: 24,
    icons: {
        'play-bold': {
            body: '<path fill="currentColor" d="M21.409 9.353a2.998 2.998 0 0 1 0 5.294L8.597 21.614C6.534 22.737 4 21.277 4 18.968V5.033c0-2.31 2.534-3.769 4.597-2.648z"/>',
        },
        'play-stream-bold': {
            body: '<path fill="currentColor" fill-rule="evenodd" d="M5.467 4.392a.75.75 0 0 1-.001 1.06A9.22 9.22 0 0 0 2.75 12a9.22 9.22 0 0 0 2.775 6.606a.75.75 0 1 1-1.05 1.071A10.72 10.72 0 0 1 1.25 12c0-2.972 1.207-5.664 3.156-7.609a.75.75 0 0 1 1.06.001m13.15.072a.75.75 0 0 1 1.06.011A10.72 10.72 0 0 1 22.75 12c0 2.964-1.2 5.65-3.141 7.594a.75.75 0 1 1-1.062-1.06A9.22 9.22 0 0 0 21.25 12a9.22 9.22 0 0 0-2.644-6.475a.75.75 0 0 1 .01-1.06M8.308 7.488a.75.75 0 0 1-.035 1.06c-.949.888-1.524 2.102-1.524 3.434c0 1.348.589 2.575 1.558 3.466a.75.75 0 1 1-1.016 1.104c-1.252-1.151-2.042-2.77-2.042-4.57c0-1.779.771-3.38 2-4.53a.75.75 0 0 1 1.06.036m7.434.038a.75.75 0 0 1 1.06-.024c1.197 1.145 1.947 2.727 1.947 4.48c0 1.775-.767 3.373-1.99 4.521a.75.75 0 1 1-1.027-1.093c.945-.887 1.517-2.1 1.517-3.428c0-1.313-.559-2.512-1.484-3.396a.75.75 0 0 1-.023-1.06"/><path fill="currentColor" d="M13.656 10.451c.896.658 1.344.987 1.344 1.55c0 .562-.448.89-1.344 1.548a13 13 0 0 1-.718.495c-.197.125-.421.254-.653.381c-.894.49-1.34.734-1.741.463s-.437-.838-.51-1.971c-.02-.32-.034-.635-.034-.917s.013-.596.034-.917c.072-1.133.109-1.7.51-1.97c.4-.271.847-.027 1.74.462c.233.127.457.256.654.381c.226.143.471.314.718.495"/>',
        },
        'restart-bold': {
            body: '<path fill="currentColor" d="M18.258 3.508a.75.75 0 0 1 .463.693v4.243a.75.75 0 0 1-.75.75h-4.243a.75.75 0 0 1-.53-1.28L14.8 6.31a7.25 7.25 0 1 0 4.393 5.783a.75.75 0 0 1 1.488-.187A8.75 8.75 0 1 1 15.93 5.18l1.51-1.51a.75.75 0 0 1 .817-.162"/>',
        },
        'stop-bold': {
            body: '<path fill="currentColor" d="M2 12c0-4.714 0-7.071 1.464-8.536C4.93 2 7.286 2 12 2s7.071 0 8.535 1.464C22 4.93 22 7.286 22 12s0 7.071-1.465 8.535C19.072 22 16.714 22 12 22s-7.071 0-8.536-1.465C2 19.072 2 16.714 2 12"/>',
        },
    },
});

addCollection({
    prefix: 'devicon-plain',
    width: 128,
    height: 128,
    icons: {
        julia: {
            body: '<circle cx="29.1" cy="94.2" r="29.1" fill="currentColor"/><circle cx="98.9" cy="94.2" r="29.1" fill="currentColor"/><circle cx="64" cy="33.8" r="29.1" fill="currentColor"/>',
        },
    },
});
