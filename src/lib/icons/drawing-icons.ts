/**
 * Offline icon bundle for the drawing editor toolbar.
 *
 * The elbow / curved connector buttons use `teenyicons`, a collection not
 * bundled in $lib/icons.ts (these two are the only teenyicons in the app, so
 * registering just them beats shipping the whole collection). Like
 * julia-cell-icons.ts, importing this module anywhere embeds the SVG data in
 * the app bundle so the icons render without hitting the Iconify API.
 */
import { addCollection } from '@iconify/svelte';

addCollection({
    prefix: 'teenyicons',
    width: 15,
    height: 15,
    icons: {
        'elbow-connector-outline': {
            body: '<path fill="none" stroke="currentColor" d="M2.5 1.5a1 1 0 1 1-2 0a1 1 0 0 1 2 0Zm0 0h5v12h5m0 0a1 1 0 1 0 2 0a1 1 0 0 0-2 0Z"/>',
        },
        'curved-connector-outline': {
            body: '<path fill="none" stroke="currentColor" d="M2.5 1.5a1 1 0 1 1-2 0a1 1 0 0 1 2 0Zm0 0h2a3 3 0 0 1 3 3v6a3 3 0 0 0 3 3h2m0 0a1 1 0 1 0 2 0a1 1 0 0 0-2 0Z"/>',
        },
    },
});
