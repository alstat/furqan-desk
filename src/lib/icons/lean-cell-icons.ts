/**
 * Offline icon bundle for the Lean 4 code-cell UI.
 *
 * `@iconify/svelte` normally fetches icon data from the Iconify API at runtime.
 * Registering the icons here with `addCollection` embeds their SVG data into
 * the app bundle, so the Lean cell and its slash-command entry render with no
 * network request. Importing this module anywhere runs the registration once
 * (ES modules are evaluated a single time).
 *
 * Only the icons *not* already registered by `julia-cell-icons` are declared
 * here — `addCollection` merges into the same prefix, and re-declaring an icon
 * would just duplicate bytes in the bundle. That module registers the shared
 * `tabler`, `fluent`, `mdi` and `solar` entries the two cells have in common.
 *
 * When adding an icon to LeanCellComponent / the Lean slash command, add its
 * data here too — otherwise it falls back to the Iconify API.
 */
import { addCollection } from '@iconify/svelte';

// The shared chrome (wrap toggles, size steppers, run/stop buttons) comes from
// the Julia bundle; importing it keeps this file to the Lean-only additions.
import './julia-cell-icons';

addCollection({
    prefix: 'lucide',
    width: 24,
    height: 24,
    icons: {
        'x-circle': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m15 9l-6 6m0-6l6 6"/></g>',
        },
        'alert-triangle': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4"/><path d="M12 17h.01"/></g>',
        },
        info: {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></g>',
        },
        check: {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 6L9 17l-5-5"/>',
        },
        'check-circle-2': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m9 12l2 2l4-4"/></g>',
        },
        zap: {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h7l-3 8L20 10h-7l3-8z"/>',
        },
        'zap-off': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M10.513 4.856L13.12 2.17a.5.5 0 0 1 .86.46l-1.377 4.317M15.656 10H20a1 1 0 0 1 .78 1.63l-1.72 1.773M16.273 16.273L10.88 21.83a.5.5 0 0 1-.86-.46l1.92-6.02H4a1 1 0 0 1-.78-1.63l4.3-4.43"/><path d="m2 2l20 20"/></g>',
        },
        'plug-zap': {
            body: '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6l-2.3 2.3a2.4 2.4 0 0 0 0 3.4zM2 22l3-3m5-11l4-4l6 6l-4 4M15 2l-1.5 1.5M22 9l-1.5 1.5"/></g>',
        },
        x: {
            body: '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 6L6 18M6 6l12 12"/>',
        },
    },
});

addCollection({
    prefix: 'solar',
    width: 24,
    height: 24,
    icons: {
        // Lean's logo is not in the offline set, so the slash-command entry and
        // the cell header use a "verified/proved" mark — which reads correctly
        // for a proof assistant.
        'verified-check-bold-duotone': {
            body: '<path fill="currentColor" d="M10.253 2.184a2.51 2.51 0 0 1 3.494 0l.933.907a2.51 2.51 0 0 0 1.44.697l1.291.152a2.51 2.51 0 0 1 2.2 2.71l-.11 1.296c-.043.51.083 1.02.36 1.45l.702 1.092a2.51 2.51 0 0 1-.606 3.44l-1.05.76c-.414.3-.723.727-.881 1.216l-.402 1.237a2.51 2.51 0 0 1-3.164 1.6l-1.235-.406a2.51 2.51 0 0 0-1.57 0l-1.235.406a2.51 2.51 0 0 1-3.164-1.6l-.402-1.237a2.51 2.51 0 0 0-.881-1.216l-1.05-.76a2.51 2.51 0 0 1-.606-3.44l.702-1.093c.277-.43.403-.94.36-1.45l-.11-1.295a2.51 2.51 0 0 1 2.2-2.71l1.291-.152a2.51 2.51 0 0 0 1.44-.697z" opacity=".5"/><path fill="currentColor" d="M15.61 9.186a.75.75 0 0 1 .154 1.05l-3.5 4.75a.75.75 0 0 1-1.134.082l-2-2a.75.75 0 1 1 1.06-1.06l1.386 1.385l2.984-4.052a.75.75 0 0 1 1.05-.155"/>',
        },
        'documents-minimalistic-bold-duotone': {
            body: '<path fill="currentColor" d="M3 10c0-3.771 0-5.657 1.172-6.828C5.343 2 7.229 2 11 2h2c3.771 0 5.657 0 6.828 1.172C21 4.343 21 6.229 21 10v4c0 3.771 0 5.657-1.172 6.828C18.657 22 16.771 22 13 22h-2c-3.771 0-5.657 0-6.828-1.172C3 19.657 3 17.771 3 14z" opacity=".5"/><path fill="currentColor" d="M7.25 8A.75.75 0 0 1 8 7.25h8a.75.75 0 0 1 0 1.5H8A.75.75 0 0 1 7.25 8m0 4a.75.75 0 0 1 .75-.75h8a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75m0 4a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5H8a.75.75 0 0 1-.75-.75"/>',
        },
        'cpu-bolt-bold-duotone': {
            body: '<path fill="currentColor" d="M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4" opacity=".5"/><path fill="currentColor" d="M13.28 7.5a.5.5 0 0 1 .47.67l-.98 2.66h1.98a.5.5 0 0 1 .38.82l-4.13 4.9a.5.5 0 0 1-.85-.5l1.11-2.9H9.25a.5.5 0 0 1-.39-.81l3.63-4.66a.5.5 0 0 1 .4-.19zM9 2.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3A.75.75 0 0 1 9 2.25m6 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75m-6 16.5a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75m6 0a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75M2.25 9A.75.75 0 0 1 3 8.25h1.5a.75.75 0 0 1 0 1.5H3A.75.75 0 0 1 2.25 9m0 6a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5H3a.75.75 0 0 1-.75-.75m16.5-6a.75.75 0 0 1 .75-.75H21a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75m0 6a.75.75 0 0 1 .75-.75H21a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75"/>',
        },
    },
});
