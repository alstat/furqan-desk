// Emit a real HTML entry for this route so the plot window can be opened at
// `/julia-plots/` directly. Tauri serves the bundle from a custom protocol with
// no SPA rewrite, so a route that exists only as an index.html fallback would
// 404 in the packaged app. `ssr` is already false in the root layout, so this is
// a client-booted shell rather than server-rendered markup.
export const prerender = true;

// Emit `julia-plots/index.html` rather than `julia-plots.html`: Tauri's asset
// protocol resolves a directory path to its index.html, so the window can be
// opened at the clean `/julia-plots/` URL.
export const trailingSlash = 'always';
