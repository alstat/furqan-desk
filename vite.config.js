import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// Every `lexical` / `@lexical/*` module in an editor must be the SAME instance,
// otherwise `instanceof` checks across packages fail with
// "_HeadingNode (type heading) does not subclass LexicalNode". The same is true
// for `yjs` ("Yjs was already imported").
//
// Some of these are only reachable through runtime paths (e.g. ImageNode's
// `import('./ImageComponent')`), so Vite's initial dep scan misses them,
// discovers them mid-session and re-optimizes — leaving some modules on the raw
// `node_modules/lexical/*.mjs` copy and others on the pre-bundled
// `.vite/deps/lexical.js` copy. Listing them explicitly pre-bundles them all in
// one pass, so there is only ever one copy.
const lexicalDeps = [
  "lexical",
  "yjs",
  "@lexical/clipboard",
  "@lexical/code",
  "@lexical/dragon",
  "@lexical/extension",
  "@lexical/file",
  "@lexical/hashtag",
  "@lexical/history",
  "@lexical/html",
  "@lexical/link",
  "@lexical/list",
  "@lexical/mark",
  "@lexical/markdown",
  "@lexical/offset",
  "@lexical/plain-text",
  "@lexical/rich-text",
  "@lexical/selection",
  "@lexical/table",
  "@lexical/text",
  "@lexical/utils",
  "@lexical/yjs",
];

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [sveltekit(), tailwindcss()],

  resolve: {
    // Collapse any duplicate copies npm/pnpm may nest to a single resolution.
    dedupe: lexicalDeps,
  },
  optimizeDeps: {
    include: lexicalDeps,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` and Rust build output.
      //    The `target/` dir (build artifacts) holds a locked .exe while cargo
      //    runs, which makes Vite's watcher throw EBUSY.
      ignored: ["**/src-tauri/**", "**/target/**"],
    },
  },
}));
