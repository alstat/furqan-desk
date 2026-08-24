// Emit a real HTML entry for this route so the window can be opened at
// `/translation/` directly. Tauri serves the bundle from a custom protocol with no
// SPA rewrite, so a route that exists only as an index.html fallback would 404
// in the packaged app.
export const prerender = true;
export const trailingSlash = 'always';
