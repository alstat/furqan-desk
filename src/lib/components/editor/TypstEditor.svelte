<script module lang="ts">
    // Epoch of the pages currently in `typstSvgPages`, or null when we hold
    // none. Paired with the store: clearing one must clear the other.
    let svgEpoch: number | null = null;

    // What the pages currently sitting in `typstSvgPages` were compiled from.
    // Switching to a non-Typst tab unmounts this editor, so without a record
    // that outlives the instance, switching back would re-run a full compile of
    // an unchanged document — seconds of work for a large file, followed by
    // re-rendering an identical preview. Module scope (not the instance) is the
    // point: the store it describes is global too.
    let lastCompiled: { src: string; path: string | null } | null = null;
</script>

<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import { save } from "@tauri-apps/plugin-dialog";
    import { writeFile, readDir } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import { onDestroy, tick } from "svelte";
    import Icon from "@iconify/svelte";
    import {
        typstSource,
        typstRecompile,
        typstSvgPages,
        typstCompileError,
        typstIsCompiling,
        typstPreviewMode,
        typstPinnedPath,
        typstPreviewPath,
        resolveTypstPreviewTab,
        zenMode,
        zenPeek,
        appDarkMode,
        typstEmbeddedPreviewZoom,
        editorIndentSize,
        codeMirrorViewInstance,
    } from "$lib/stores/editor.store";
    import { hideSurahPage } from "$lib/stores/quran.svelte";
    import { languageIdForFile } from "$lib/codemirror/languages";
    import { flashingTabId } from "$lib/stores/julia-terminal.store";
    import {
        tabs,
        activeTab,
        activeTabId,
        setActiveTabContent,
        setTabContent,
    } from "$lib/stores/tabs.store";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import TypstCompileError from "./TypstCompileError.svelte";
    import SpellLanguageSelector from "./SpellLanguageSelector.svelte";
    import TypstPreviewSourceSelector from "./TypstPreviewSourceSelector.svelte";
    import TypstPages from "./TypstPages.svelte";
    import {
        autocompletion,
        startCompletion,
        type CompletionSource,
        type Completion,
    } from "@codemirror/autocomplete";
    import { TYPST_COMPLETIONS } from "$lib/completions/typst";
    import { t } from "$lib/i18n";
    import { references } from "$lib/stores/references.store";
    import { shortAuthorLabel } from "$lib/utils/references";
    import {
        PREVIEW_ZOOM_STEP,
        attachPinchZoom,
        zoomPreviewTo,
    } from "$lib/utils/preview-zoom";

    let {
        tabId = null,
        inCrossHost = false,
    }: { tabId?: string | null; inCrossHost?: boolean } = $props();

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );
    let editorScrollKey = $derived(effectiveTab?.path ?? effectiveTab?.id ?? null);

    // `.typ` keeps the Typst grammar; every other tab this component backs is a
    // plain flat file whose grammar comes from its name, VS Code-style. An
    // unsaved or unrecognised file falls through to unstyled text.
    let editorLanguage = $derived(
        effectiveTab?.type === "typst"
            ? "typst"
            : languageIdForFile(effectiveTab?.path ?? effectiveTab?.name),
    );

    // In a Typst split, several editors are mounted at once but they share one
    // global compile pipeline + preview. Only the editor whose tab is active
    // "drives" that pipeline; the others just edit their own file. Focusing a
    // pane activates its tab (see activateThisTab), so the preview follows you.
    // The active editor is always mounted, so it also drives the preview of a
    // pinned file that is open only in a background tab.
    let isDriver = $derived(effectiveTab != null && effectiveTab.id === $activeTabId);

    // The file the preview should render: the pinned file (pinned mode, when
    // open) or otherwise the active file. The active editor compiles this, which
    // is how editing chapter1.typ can keep previewing a pinned main.typ.
    let previewTab = $derived(
        resolveTypstPreviewTab($tabs, $activeTab, $typstPreviewMode, $typstPinnedPath),
    );

    // Brief gold flash on the editor box when its tab is clicked in a split
    // group — guides the eye to the matching pane. Mirrors JuliaEditor.
    let isFlashing = $derived($flashingTabId === effectiveTab?.id);

    function activateThisTab() {
        if (effectiveTab && effectiveTab.id !== $activeTabId) {
            activeTabId.set(effectiveTab.id);
        }
    }

    // True when the preview is displayed in the Parchment area (side-by-side mode).
    // Suppressed when this editor is the host in a cross pair (shows inline preview instead).
    const sideBySide = $derived($hideSurahPage() && !inCrossHost);

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let embeddedPreviewScrollEl: HTMLDivElement | null = $state(null);
    let currentEmbeddedPreviewPage = $state(1);

    // Per-tab embedded-preview scroll memory shared across remounts of this
    // component (cross-type tab switches unmount the editor). Lives on
    // globalThis so the map survives Svelte's HMR.
    type ScrollMap = Map<string, number>;
    const EMBEDDED_PREVIEW_SCROLL_BY_KEY: ScrollMap = (() => {
        const g = globalThis as unknown as {
            __typstEmbeddedPreviewScrollByKey?: ScrollMap;
        };
        if (g.__typstEmbeddedPreviewScrollByKey instanceof Map)
            return g.__typstEmbeddedPreviewScrollByKey;
        const m: ScrollMap = new Map();
        g.__typstEmbeddedPreviewScrollByKey = m;
        return m;
    })();

    function handlePreviewScroll(): void {
        if (
            editorScrollKey &&
            embeddedPreviewScrollEl &&
            embeddedPreviewScrollEl.isConnected &&
            embeddedPreviewScrollEl.scrollHeight >
                embeddedPreviewScrollEl.clientHeight
        ) {
            EMBEDDED_PREVIEW_SCROLL_BY_KEY.set(
                editorScrollKey,
                embeddedPreviewScrollEl.scrollTop,
            );
        }
        updateCurrentEmbeddedPreviewPage();
    }

    function updateCurrentEmbeddedPreviewPage(): void {
        if (!embeddedPreviewScrollEl || $typstSvgPages.length === 0) {
            currentEmbeddedPreviewPage = 1;
            return;
        }

        const containerRect = embeddedPreviewScrollEl.getBoundingClientRect();
        const viewportCenter = containerRect.top + containerRect.height / 2;
        const pages = Array.from(
            embeddedPreviewScrollEl.querySelectorAll<HTMLElement>(
                ".typst-page",
            ),
        );
        let nearestPage = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const [i, page] of pages.entries()) {
            const rect = page.getBoundingClientRect();
            const pageCenter = rect.top + rect.height / 2;
            const distance = Math.abs(pageCenter - viewportCenter);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPage = i;
            }
        }

        currentEmbeddedPreviewPage = nearestPage + 1;
    }

    // Keep typstSource (+ its path) in sync with the previewed file's content —
    // only the active (driving) editor owns the global source/preview. In pinned
    // mode the previewed file may differ from the file in this editor.
    $effect(() => {
        if (
            isDriver &&
            (previewTab?.type === "typst" || previewTab?.type === "text")
        ) {
            typstSource.set(previewTab.content);
            typstPreviewPath.set(previewTab.path ?? null);
        }
    });

    // Only the very first compile of a freshly mounted editor may be skipped as
    // redundant (see compileToSvg). Every later run has a real trigger behind it
    // — an edit, a new preview source, an explicit recompile, or a change to a
    // file this document #includes — and must reach the compiler.
    let isFirstCompileRun = true;

    $effect(() => {
        if (!isDriver) return;
        void $typstRecompile;
        const mayReuse = isFirstCompileRun;
        isFirstCompileRun = false;
        if (previewTab?.type !== "typst") {
            typstSvgPages.set([]);
            svgEpoch = null;
            typstCompileError.set("");
            lastCompiled = null;
            return;
        }
        const src = $typstSource;
        const path = $typstPreviewPath;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => compileToSvg(src, path, mayReuse), 300);
        return () => clearTimeout(debounceTimer);
    });

    $effect(() => {
        const pageCount = $typstSvgPages.length;
        const key = editorScrollKey;
        if (pageCount === 0) {
            currentEmbeddedPreviewPage = 1;
            return;
        }

        tick().then(() => {
            if (embeddedPreviewScrollEl && key) {
                const target = EMBEDDED_PREVIEW_SCROLL_BY_KEY.get(key) ?? 0;
                const maxScroll =
                    embeddedPreviewScrollEl.scrollHeight -
                    embeddedPreviewScrollEl.clientHeight;
                if (maxScroll > 0) {
                    embeddedPreviewScrollEl.scrollTop = Math.min(
                        target,
                        maxScroll,
                    );
                }
            }
            updateCurrentEmbeddedPreviewPage();
        });
    });

    const IMPORT_RE = /#import\s+"@([\w-]+)\/([\w-]+):([\d.]+)"/g;

    // Package specs already confirmed present on disk. A document's `#import`
    // lines almost never change between compiles, so without this every debounce
    // tick paid a `check_typst_package` IPC round trip per import just to be
    // told again that nothing is missing.
    const satisfiedPackages = new Set<string>();

    async function ensurePackagesInstalled(source: string): Promise<void> {
        const imports: {
            namespace: string;
            name: string;
            version: string;
            key: string;
        }[] = [];
        const seen = new Set<string>();
        for (const m of source.matchAll(IMPORT_RE)) {
            const key = `@${m[1]}/${m[2]}:${m[3]}`;
            // Dedupe repeated imports of the same package within one document.
            if (seen.has(key) || satisfiedPackages.has(key)) continue;
            seen.add(key);
            imports.push({
                namespace: m[1],
                name: m[2],
                version: m[3],
                key,
            });
        }
        if (imports.length === 0) return;

        const installed = await Promise.all(
            imports.map(({ namespace, name, version }) =>
                invoke<boolean>("check_typst_package", {
                    namespace,
                    name,
                    version,
                }),
            ),
        );
        const missing = imports.filter((p, i) => {
            if (installed[i]) satisfiedPackages.add(p.key);
            return !installed[i];
        });
        if (missing.length === 0) return;

        await Promise.all(
            missing.map((p) =>
                invoke("install_typst_package", {
                    namespace: p.namespace,
                    name: p.name,
                    version: p.version,
                })
                    .then(() => {
                        satisfiedPackages.add(p.key);
                    })
                    .catch((e) => {
                        throw new Error(
                            `Package install failed: @${p.namespace}/${p.name}:${p.version} — ${e}`,
                        );
                    }),
            ),
        );
    }

    async function compileToSvg(
        src: string,
        path: string | null,
        mayReuse = false,
    ) {
        if (!src.trim()) {
            typstSvgPages.set([]);
            svgEpoch = null;
            typstCompileError.set("");
            lastCompiled = null;
            return;
        }
        // Mounting onto a preview that already shows exactly this document:
        // switching to a .lexical/.jl tab unmounts this editor but leaves the
        // compiled pages in the store, so switching back would otherwise pay
        // for a full recompile just to reproduce what is already on screen.
        if (
            mayReuse &&
            lastCompiled?.src === src &&
            lastCompiled.path === path &&
            get(typstSvgPages).length > 0
        ) {
            return;
        }
        typstIsCompiling.set(true);
        typstCompileError.set("");
        try {
            await ensurePackagesInstalled(src);
            // The compiler returns `null` for any page whose layout is
            // unchanged since the epoch we hand it, so a keystroke normally
            // ships one page instead of the whole document. Anything other than
            // the epoch from the immediately preceding compile makes it send
            // everything, so a stale or cleared preview can never be patched
            // against the wrong pages.
            const result = await invoke<{
                epoch: number;
                pages: (string | null)[];
            }>("compile_typst_svg", { source: src, path, epoch: svgEpoch });
            const previous = get(typstSvgPages);
            typstSvgPages.set(
                result.pages.map((page, i) => page ?? previous[i] ?? ""),
            );
            svgEpoch = result.epoch;
            lastCompiled = { src, path };
        } catch (e) {
            typstCompileError.set(String(e));
            typstSvgPages.set([]);
            svgEpoch = null;
            lastCompiled = null;
        } finally {
            typstIsCompiling.set(false);
        }
    }

    async function exportPdf() {
        typstCompileError.set("");
        try {
            const src = get(typstSource);
            await ensurePackagesInstalled(src);
            // Arrives as a raw ArrayBuffer — the command returns an IPC
            // Response rather than Vec<u8>, so the bytes are not round-tripped
            // through a JSON array of numbers.
            const bytes = await invoke<ArrayBuffer>("compile_typst_pdf", {
                source: src,
                path: get(typstPreviewPath),
            });
            const path = await save({
                filters: [{ name: "PDF", extensions: ["pdf"] }],
            });
            if (path) await writeFile(path, new Uint8Array(bytes));
        } catch (e) {
            typstCompileError.set(String(e));
        }
    }

    function handleInput(newContent: string) {
        // Always persist to this editor's own tab…
        if (tabId) setTabContent(tabId, newContent);
        else setActiveTabContent(newContent);
        // …but only the active editor feeds the shared preview pipeline, and
        // only when it is the file being previewed (active mode, or pinned-to-
        // self). When pinned to another file, edits here don't change the
        // previewed source — though they will once the imported file is saved.
        if (isDriver && previewTab?.id === effectiveTab?.id) {
            typstSource.set(newContent);
        }
    }

    // ── Completion source ─────────────────────────────────────────────────────
    // Precompute the lowercased label for each completion once, so filtering on
    // every keystroke is a plain string compare instead of 200+ toLowerCase()
    // allocations per query.
    const TYPST_COMPLETIONS_INDEXED = TYPST_COMPLETIONS.map((c) => ({
        completion: c,
        lower: c.label.toLowerCase(),
    }));

    function filterCompletions(prefix: string) {
        const out: typeof TYPST_COMPLETIONS = [];
        for (const entry of TYPST_COMPLETIONS_INDEXED) {
            if (entry.lower.startsWith(prefix)) out.push(entry.completion);
        }
        return out;
    }

    // Auto-pop only after `#` (Typst code mode, e.g. #pa → page, pad, …). A
    // Typst document body is prose, so auto-triggering on every plain word made
    // the popup recompute and reposition on each keystroke/deletion — that is
    // what caused the typing lag. Bare-word completion is still available, but
    // only when explicitly requested (Ctrl-Space).
    const typstCompletionSource: CompletionSource = (context) => {
        const hashMatch = context.matchBefore(/#[\w-]*/);
        if (hashMatch) {
            const prefix = hashMatch.text.slice(1).toLowerCase();
            const filtered = filterCompletions(prefix);
            if (filtered.length === 0 && !context.explicit) return null;
            return {
                from: hashMatch.from + 1,
                options: filtered,
                validFor: /^[\w-]*$/,
            };
        }

        if (!context.explicit) return null;

        const wordMatch = context.matchBefore(/[\w-]+/);
        const from = wordMatch ? wordMatch.from : context.pos;
        const filtered = filterCompletions(
            wordMatch ? wordMatch.text.toLowerCase() : "",
        );
        if (filtered.length === 0) return null;
        return { from, options: filtered, validFor: /^[\w-]*$/ };
    };

    // ── Citation completions (type `@` for the References list) ───────────
    // Typst cites with `@key`, so typing `@` pops the References library as a
    // code-completion. Picking one inserts `@citeKey` (Typst handles styling,
    // so no in-text style choice is needed). Auto-triggers just like `#…` does.
    const citeCompletionSource: CompletionSource = (context) => {
        const match = context.matchBefore(/@[\w:.-]*/);
        if (!match) return null;
        const refs = get(references);
        if (refs.length === 0) return null;
        const query = match.text.slice(1).toLowerCase();
        const options = refs
            .filter((r) => r.citeKey)
            .filter((r) => {
                if (!query) return true;
                const hay = [r.citeKey, r.title, r.year, r.container, ...r.authors]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(query);
            })
            .map((r) => ({
                label: `@${r.citeKey}`,
                detail: r.year || undefined,
                info: [shortAuthorLabel(r), r.title].filter(Boolean).join(" — "),
            }));
        if (options.length === 0) return null;
        // `filter: false` — our own fuzzy match above (title/author/key) is the
        // source of truth; no `validFor`, so the source re-runs as the user
        // types to keep narrowing the list.
        return { from: match.from, options, filter: false };
    };

    // ── File-path completions (inside image("…"), read(), bibliography(), …) ──
    // Typst resolves paths relative to the file being compiled, so typing a
    // path string inside a path-taking call pops the contents of that folder —
    // no need to eyeball the File Explorer and hand-type the name. Sub-folders
    // insert a trailing "/" and immediately re-query so you can drill in.
    const PATH_FUNCS = new Set([
        "image",
        "read",
        "bibliography",
        "csv",
        "json",
        "yaml",
        "xml",
        "toml",
        "cbor",
        "raw",
    ]);
    // Extensions worth surfacing first when the call is `image(...)`.
    const IMAGE_EXTS = new Set([
        "png",
        "jpg",
        "jpeg",
        "gif",
        "svg",
        "webp",
        "bmp",
        "avif",
    ]);

    // Directory portion of a "/"-normalised absolute file path.
    function parentDir(path: string): string {
        return path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    }

    // Resolve the folder to list from the base dir and the typed sub-path,
    // collapsing "." / ".." and honouring a leading "/" as an absolute path.
    function resolveDir(baseDir: string, rel: string): string {
        const parts = rel.startsWith("/") ? [""] : baseDir.split("/");
        for (const seg of rel.split("/")) {
            if (seg === "" || seg === ".") continue;
            if (seg === "..") {
                if (parts.length > 1) parts.pop();
                continue;
            }
            parts.push(seg);
        }
        return parts.join("/") || "/";
    }

    // Which call, if any, does the string under the cursor belong to?
    // Returns the function name for `image("…")`-style calls, "include" for the
    // bare `include "…"` / `import "…"` forms, or null when not a path context.
    function pathCallName(beforeQuote: string): string | null {
        // Bare `include "…"` / `import "…"` take a string without parentheses.
        if (/(?:^|[^\w.-])(?:include|import)\s+$/.test(beforeQuote)) {
            return "include";
        }
        // Walk back to the "(" that opens the call the string sits in, skipping
        // any balanced parens in earlier arguments, then read the callee name.
        let depth = 0;
        let i = beforeQuote.length - 1;
        for (; i >= 0; i--) {
            const ch = beforeQuote[i];
            if (ch === ")") depth++;
            else if (ch === "(") {
                if (depth === 0) break;
                depth--;
            }
        }
        if (i < 0) return null;
        const name = /([a-zA-Z_][\w.-]*)\s*$/.exec(beforeQuote.slice(0, i));
        return name ? name[1] : null;
    }

    const pathCompletionSource: CompletionSource = async (context) => {
        const filePath = effectiveTab?.path;
        if (!filePath) return null;

        // Only fire inside an unterminated double-quoted string on this line.
        const line = context.state.doc.lineAt(context.pos);
        const textBefore = context.state.sliceDoc(line.from, context.pos);
        const strMatch = /"([^"\n]*)$/.exec(textBefore);
        if (!strMatch) return null;

        const beforeQuote = textBefore.slice(0, strMatch.index);
        const callName = pathCallName(beforeQuote);
        if (!callName || (callName !== "include" && !PATH_FUNCS.has(callName))) {
            return null;
        }

        const typed = strMatch[1];
        const slash = typed.lastIndexOf("/");
        const subDir = slash >= 0 ? typed.slice(0, slash + 1) : "";
        const partial = slash >= 0 ? typed.slice(slash + 1) : typed;

        const targetDir = resolveDir(parentDir(filePath), subDir);
        let entries: Awaited<ReturnType<typeof readDir>>;
        try {
            entries = await readDir(targetDir);
        } catch {
            return null;
        }

        const preferImages = callName === "image";
        const options: Completion[] = [];
        for (const entry of entries) {
            if (entry.name.startsWith(".")) continue; // skip dotfiles
            if (entry.isDirectory) {
                const name = entry.name;
                options.push({
                    label: name + "/",
                    type: "folder",
                    // Insert the folder + "/" then re-open the popup so the next
                    // level lists immediately (the "/" invalidates validFor).
                    apply: (view, _c, from, to) => {
                        view.dispatch({
                            changes: { from, to, insert: name + "/" },
                            selection: { anchor: from + name.length + 1 },
                        });
                        startCompletion(view);
                    },
                    boost: 1,
                });
            } else {
                const ext = entry.name.includes(".")
                    ? entry.name.slice(entry.name.lastIndexOf(".") + 1).toLowerCase()
                    : "";
                options.push({
                    label: entry.name,
                    type: "file",
                    detail: ext || undefined,
                    boost: preferImages && IMAGE_EXTS.has(ext) ? 2 : 0,
                });
            }
        }

        if (options.length === 0) return null;
        return {
            from: context.pos - partial.length,
            options,
            // Keep filtering as the user types; re-run only when a "/" is typed
            // (drilling into a folder) or the string is closed.
            validFor: /^[^"/]*$/,
        };
    };

    const typstCompletionExtension = autocompletion({
        override: [
            typstCompletionSource,
            citeCompletionSource,
            pathCompletionSource,
        ],
        // Wait a touch longer after typing before querying, and cap how many
        // options hit the DOM, so a fast typist never blocks on the popup.
        activateOnTypingDelay: 150,
        maxRenderedOptions: 50,
    });

    let lineWrap = $state(true);

    // ── Typst formatter ───────────────────────────────────────────────────────
    let formatting = $state(false);
    let formatError = $state("");
    let formatErrorTimer: ReturnType<typeof setTimeout> | null = null;

    function showFormatError(msg: string) {
        formatError = msg;
        if (formatErrorTimer) clearTimeout(formatErrorTimer);
        formatErrorTimer = setTimeout(() => (formatError = ""), 8000);
    }

    async function formatTypst() {
        const view = get(codeMirrorViewInstance);
        if (!view || formatting) return;
        const code = view.state.doc.toString();
        if (!code.trim()) return;
        formatting = true;
        formatError = "";
        try {
            const formatted = await invoke<string>("typst_format", {
                source: code,
                indent: get(editorIndentSize),
            });
            // Full-document replace, kept in the editor's undo history.
            if (formatted !== view.state.doc.toString()) {
                view.dispatch({
                    changes: {
                        from: 0,
                        to: view.state.doc.length,
                        insert: formatted,
                    },
                });
            }
        } catch (e) {
            showFormatError(typeof e === "string" ? e : String(e));
        } finally {
            formatting = false;
        }
    }

    const aiContextPrompt =
        "This text is part of a typst file, so your output should be formatted as part of a typst file";

    // ── Zoom (embedded preview) ───────────────────────────────────────────────
    function zoomEmbeddedBy(factor: number) {
        zoomPreviewTo(
            typstEmbeddedPreviewZoom,
            embeddedPreviewScrollEl,
            get(typstEmbeddedPreviewZoom) * factor,
        );
    }

    $effect(() => {
        if (!embeddedPreviewScrollEl) return;
        return attachPinchZoom(
            embeddedPreviewScrollEl,
            typstEmbeddedPreviewZoom,
        );
    });

    // ── Resize (preview pane) ─────────────────────────────────────────────────
    const PREVIEW_DEFAULT_HEIGHT = 200;
    let containerEl: HTMLDivElement;
    let previewHeight = $state(PREVIEW_DEFAULT_HEIGHT); // 54 × 4px = 216px (replaces fixed h-54)
    let dragStartY = 0;
    let dragStartHeight = 0;

    // Cursor-following gradient highlight on the divider, matching StackSplitDivider.
    let dividerHovering = $state(false);
    let dividerDragging = $state(false);
    let dividerCursorX = $state(0);
    let dividerHandleEl: HTMLElement | null = null;
    let dividerActive = $derived(dividerHovering || dividerDragging);
    let highlightColor = $derived($appDarkMode ? "229, 200, 144" : "212, 161, 64");
    let highlightStrength = $derived(dividerDragging ? 0.85 : 0.55);

    function updateDividerCursorX(e: PointerEvent, el: HTMLElement) {
        const rect = el.getBoundingClientRect();
        dividerCursorX = e.clientX - rect.left;
    }
    function onDividerMove(e: PointerEvent) {
        updateDividerCursorX(e, e.currentTarget as HTMLElement);
    }

    function startDrag(e: PointerEvent) {
        dividerHandleEl = e.currentTarget as HTMLElement;
        dividerDragging = true;
        try { dividerHandleEl.setPointerCapture(e.pointerId); } catch {}
        dragStartY = e.clientY;
        dragStartHeight = previewHeight;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        if (dividerHandleEl) updateDividerCursorX(e, dividerHandleEl);
        const delta = dragStartY - e.clientY;
        const maxH = containerEl
            ? Math.max(120, containerEl.offsetHeight - 120 - 6)
            : dragStartHeight * 2;
        previewHeight = Math.max(120, Math.min(maxH, dragStartHeight + delta));
    }
    function stopDrag(e: PointerEvent) {
        dividerDragging = false;
        if (dividerHandleEl) {
            try { dividerHandleEl.releasePointerCapture(e.pointerId); } catch {}
        }
        window.removeEventListener("pointermove", onDrag);
    }
    onDestroy(() => {
        window.removeEventListener("pointermove", onDrag);
        if (formatErrorTimer) clearTimeout(formatErrorTimer);
    });
</script>

<div
    bind:this={containerEl}
    onfocusin={activateThisTab}
    class="relative overflow-visible flex flex-col h-full"
>
    <!-- Editor — always visible -->
    <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center justify-between px-2 pt-1 mb-1">
            <span
                class="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >{effectiveTab?.name ??
                    $t("typst.fallback_name")}{#if effectiveTab?.isDirty}<span
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                    >
                        *</span
                    >{/if}</span
            >
            <div
                class="flex items-center gap-1.5 {$zenMode
                    ? $zenPeek
                        ? 'opacity-50 transition-opacity duration-200'
                        : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
                    : ''}"
            >
                <!-- Spelling language -->
                <SpellLanguageSelector />
                <!-- Typst Formatter -->
                <button
                    onclick={formatTypst}
                    disabled={formatting}
                    title={$t("typst.format_title")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium transition-colors
                           bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400
                           hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25
                           disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Icon icon="icon-park-twotone:format-brush" width="0.6875rem" />
                    {formatting ? $t("typst.formatting") : $t("typst.format")}
                </button>
                <!-- Line wrap toggle -->
                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap ? $t("julia_cell.disable_wrap") : $t("julia_cell.enable_wrap")}
                    class="flex cursor-pointer items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-medium transition-colors
                           {lineWrap
                        ? 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'
                        : 'bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25'}"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="0.6875rem"
                        height="0.6875rem"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <polyline points="3 6 21 6" /><path
                            d="M3 12h15a3 3 0 0 1 0 6h-4"
                        /><polyline points="8 15 5 18 8 21" />
                    </svg>
                    {lineWrap ? $t("julia_editor.wrap") : $t("julia_editor.no_wrap")}
                </button>
            </div>
        </div>
        {#if formatError}
            <div
                class="mx-2 mb-1 px-2 py-1 rounded-md text-[0.625rem] text-red-500 dark:text-red-400
                       bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40"
            >
                {formatError}
            </div>
        {/if}
        <CodeMirrorEditor
            value={effectiveTab?.content ?? ""}
            language={editorLanguage}
            extensions={[typstCompletionExtension]}
            {lineWrap}
            aiSelectionTools={true}
            {aiContextPrompt}
            filePath={effectiveTab?.path ?? null}
            scrollKey={editorScrollKey}
            ownerTabId={effectiveTab?.id ?? null}
            onchange={handleInput}
            class={`${effectiveTab?.type !== "typst" ? "mb-4" : ""} ${sideBySide ? "mb-3" : ""} ${isFlashing ? "flash-border-anim" : ""} flex-1 min-h-0 overflow-hidden border border-brand-sand-200 rounded-md mx-2 font-mono`}
        />
    </div>

    <!-- Splitter + resizable preview pane — hidden when preview is in Parchment area -->
    {#if effectiveTab?.type === "typst" && !sideBySide}
        <!-- Draggable splitter — cursor-following gradient highlight (matches
             the split-mode StackSplitDivider for visual consistency). The -mx-1
             extends the tail flush against the vertical column divider. -->
        <div class="relative z-1 flex-none h-1.5 -mx-1 select-none">
            <!-- Hit area: taller than visible, centered on the seam. -->
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize the preview pane"
                onpointerdown={startDrag}
                onpointermove={onDividerMove}
                onpointerenter={() => (dividerHovering = true)}
                onpointerleave={() => (dividerHovering = false)}
                ondblclick={() => (previewHeight = PREVIEW_DEFAULT_HEIGHT)}
                title="Drag to resize · Double-click to reset"
                class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-3 cursor-row-resize"
            ></div>
            <!-- Cursor-following highlight, only visible while hovering / dragging. -->
            <span
                class="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px
                       transition-opacity duration-150"
                style="opacity: {dividerActive ? 1 : 0};
                       background: radial-gradient(
                           circle at {dividerCursorX}px 50%,
                           rgba({highlightColor}, {highlightStrength}) 0px,
                           rgba({highlightColor}, {highlightStrength * 0.5}) 40px,
                           rgba({highlightColor}, 0) 140px
                       );"
            ></span>
        </div>
        <div
            class="flex-none flex flex-col p-2"
            style:height="{previewHeight}px"
        >
            <div class="mb-1.5 flex items-center justify-between gap-2">
                <span
                    class="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                    >{$t("typst.preview")}</span
                >
                <div class="flex items-center gap-1.5">
                    <button
                        onclick={exportPdf}
                        title={$t("typst.export_pdf")}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium transition-colors
                               bg-brand-gold-100 dark:bg-[#e5c890]/15 text-brand-gold-600 dark:text-brand-gold-400
                               hover:bg-brand-gold-200 dark:hover:bg-[#e5c890]/25
                               {$zenMode
                            ? $zenPeek
                                ? 'opacity-50 transition-opacity duration-200'
                                : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
                            : ''}"
                    >
                        <Icon icon="ph:file-pdf-bold" width="0.6875rem" />
                        {$t("typst.export_pdf")}
                    </button>
                    <TypstPreviewSourceSelector />
                </div>
            </div>
            <div class="group relative flex-1 min-h-0">
                {#if $typstSvgPages.length > 0}
                    <div
                        class="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5"
                    >
                        <!-- Zoom controls — revealed while hovering the preview body -->
                        <div
                            class="pointer-events-auto flex items-center gap-0.5 overflow-hidden rounded-full border border-stone-200/60 dark:border-[#414559]/60 bg-white/70 dark:bg-[#303446]/70 px-1 py-0.5 shadow-sm backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        >
                            <button
                                onclick={() => zoomEmbeddedBy(1 / PREVIEW_ZOOM_STEP)}
                                title={$t("typst.zoom_out")}
                                class="cursor-pointer rounded-full p-1 text-brand-charcoal-300 hover:bg-brand-sand-100 dark:hover:bg-[#414559] transition-colors"
                            >
                                <Icon icon="solar:magnifer-zoom-out-linear" width="0.75rem" />
                            </button>
                            <span
                                class="min-w-8 text-center text-[0.625rem] font-medium tabular-nums text-brand-charcoal-300"
                            >
                                {Math.round($typstEmbeddedPreviewZoom * 100)}%
                            </span>
                            <button
                                onclick={() => zoomEmbeddedBy(PREVIEW_ZOOM_STEP)}
                                title={$t("typst.zoom_in")}
                                class="cursor-pointer rounded-full p-1 text-brand-charcoal-300 hover:bg-brand-sand-100 dark:hover:bg-[#414559] transition-colors"
                            >
                                <Icon icon="solar:magnifer-zoom-in-linear" width="0.75rem" />
                            </button>
                            <button
                                onclick={() =>
                                    zoomPreviewTo(
                                        typstEmbeddedPreviewZoom,
                                        embeddedPreviewScrollEl,
                                        1,
                                    )}
                                title={$t("typst.full_width")}
                                class="cursor-pointer rounded-full p-1 text-brand-charcoal-300 hover:bg-brand-sand-100 dark:hover:bg-[#414559] transition-colors"
                            >
                                <Icon icon="material-symbols:fit-width" width="0.8125rem" />
                            </button>
                        </div>
                        <div
                            class="rounded-full px-2.5 py-1 text-[0.625rem] font-semibold leading-none text-brand-charcoal-300 backdrop-blur-md"
                            aria-label={$t("typst.page_of").replace("{current}", String(currentEmbeddedPreviewPage)).replace("{total}", String($typstSvgPages.length))}
                        >
                            {currentEmbeddedPreviewPage} / {$typstSvgPages.length}
                        </div>
                    </div>
                {/if}
                <div
                    bind:this={embeddedPreviewScrollEl}
                    onscroll={handlePreviewScroll}
                    class="default-scroll h-full overflow-auto"
                >
                    {#if $typstIsCompiling}
                        <p class="text-xs text-brand-charcoal-300 italic">
                            {$t("typst.compiling")}
                        </p>
                    {:else if $typstCompileError}
                        <TypstCompileError error={$typstCompileError} />
                    {:else if $typstSvgPages.length > 0}
                        <TypstPages
                            pages={$typstSvgPages}
                            zoom={$typstEmbeddedPreviewZoom}
                            scroller={embeddedPreviewScrollEl}
                            gapClass="gap-3"
                            listClass="pb-2"
                        />
                    {:else}
                        <p class="text-xs text-brand-charcoal-300 italic">
                            {$t("typst.preview_placeholder")}
                        </p>
                    {/if}
                </div>
            </div>
        </div>
    {/if}

</div>
