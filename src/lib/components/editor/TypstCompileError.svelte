<script lang="ts">
    import { get } from "svelte/store";
    import { EditorView } from "@codemirror/view";
    import { readTextFile } from "@tauri-apps/plugin-fs";
    import {
        codeMirrorViewInstance,
        typstPreviewPath,
        pendingEditorJump,
    } from "$lib/stores/editor.store";
    import { openOrFocusTab, tabs } from "$lib/stores/tabs.store";

    let { error }: { error: string } = $props();

    // Matches a `file.typ:line:col` location emitted by the Rust diagnostic
    // formatter (see format_typst_diagnostics), so we can turn it into a link.
    const LOCATION_RE = /([\w.\-\/\\ ]+?\.typ):(\d+):(\d+)/g;

    type Segment =
        | { kind: "text"; text: string }
        | {
              kind: "link";
              text: string;
              file: string;
              line: number;
              col: number;
          };

    let segments = $derived.by<Segment[]>(() => {
        const out: Segment[] = [];
        let last = 0;
        for (const m of error.matchAll(LOCATION_RE)) {
            const raw = m[0];
            // The file character class allows spaces (filenames can contain
            // them), so a match can absorb leading whitespace after e.g. the
            // "→ " prefix. Keep that whitespace as plain text and start the
            // link at the real path.
            const lead = raw.length - raw.trimStart().length;
            const start = (m.index ?? 0) + lead;
            if (start > last) {
                out.push({ kind: "text", text: error.slice(last, start) });
            }
            out.push({
                kind: "link",
                text: raw.slice(lead),
                file: m[1].trim(),
                line: parseInt(m[2], 10),
                col: parseInt(m[3], 10),
            });
            last = (m.index ?? 0) + raw.length;
        }
        if (last < error.length) {
            out.push({ kind: "text", text: error.slice(last) });
        }
        return out;
    });

    // Split a path into its directory and the separator it uses, so we can
    // rebuild child paths in the same style (matters on Windows).
    function splitDir(p: string): { dir: string; sep: string } {
        const iSlash = p.lastIndexOf("/");
        const iBack = p.lastIndexOf("\\");
        const sep = iBack > iSlash ? "\\" : "/";
        const i = Math.max(iSlash, iBack);
        return { dir: i >= 0 ? p.slice(0, i) : "", sep };
    }

    // Resolve a Typst-reported virtual path to an on-disk path. The compiled
    // (previewed) file is the `main.typ` source; every other path is relative
    // to the project root (the main file's folder).
    //
    // We prefer an already-open tab whose path matches the reported one by
    // suffix — its stored path is exactly what an editor's `filePath` will be,
    // so the jump lands reliably even if our reconstructed absolute path would
    // differ in form (separators, symlinks, casing). Only when no tab matches
    // do we build the path from the main file's folder (for a not-yet-open
    // file that we read from disk).
    function resolveFilePath(file: string): string | null {
        const mainPath = get(typstPreviewPath);
        if (file === "main.typ" && mainPath) return mainPath;

        const relNorm = file.replace(/\\/g, "/");
        const open = get(tabs).find((t) => {
            if (!t.path) return false;
            const tp = t.path.replace(/\\/g, "/");
            return tp === relNorm || tp.endsWith("/" + relNorm);
        });
        if (open?.path) return open.path;

        if (!mainPath) return null;
        const { dir, sep } = splitDir(mainPath);
        if (!dir) return null;
        return dir + sep + file.replace(/[\\/]+/g, sep);
    }

    function jumpInView(
        view: EditorView,
        line: number,
        col: number,
    ): void {
        if (line < 1 || line > view.state.doc.lines) return;
        const docLine = view.state.doc.line(line);
        const pos = Math.min(docLine.from + Math.max(col - 1, 0), docLine.to);
        view.dispatch({
            selection: { anchor: pos },
            effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        view.focus();
    }

    // Open/focus the file the diagnostic points at (not just the active one),
    // then move the cursor to the reported line/column.
    async function jumpTo(
        file: string,
        line: number,
        col: number,
    ): Promise<void> {
        const target = resolveFilePath(file);

        // Unknown path (e.g. a package-internal file) or no preview path —
        // best effort: jump within the current editor.
        if (!target) {
            const view = get(codeMirrorViewInstance);
            if (view) jumpInView(view, line, col);
            return;
        }

        // Open/focus the target file. Read from disk only if it isn't already
        // open (openOrFocusTab ignores the content arg for existing tabs). If
        // the file can't be read, do nothing rather than jump in the wrong file.
        if (!get(tabs).some((t) => t.path === target)) {
            try {
                openOrFocusTab(target, await readTextFile(target));
            } catch {
                return;
            }
        } else {
            openOrFocusTab(target, "");
        }

        // Hand the jump to whichever editor owns this file: it performs the
        // jump once mounted and active, so we never land on the previous
        // file's line even if the tab switch/mount hasn't happened yet.
        pendingEditorJump.set({ path: target, line, col });
        // Safety: drop the request if no editor claims it (e.g. the file failed
        // to open into an editor for some reason).
        setTimeout(() => {
            const p = get(pendingEditorJump);
            if (p && p.path === target && p.line === line) {
                pendingEditorJump.set(null);
            }
        }, 5000);
    }
</script>

<pre class="text-xs text-red-500 whitespace-pre-wrap">{#each segments as seg}{#if seg.kind === "link"}<button
            type="button"
            class="underline decoration-dotted underline-offset-2 hover:text-red-600 focus:outline-none cursor-pointer"
            title="Go to {seg.file} line {seg.line}"
            onclick={() => jumpTo(seg.file, seg.line, seg.col)}>{seg.text}</button
        >{:else}{seg.text}{/if}{/each}</pre>
