<!-- One card on the workbook board.
     Every kind shares the same frame — a ControlCard-style shell with a quiet
     header strip — and differs only in what it puts inside, so adding a kind
     is a case in one switch rather than another component with its own idea
     of what a card looks like. Every data kind always carries a pair of
     ports (see `hasPort`) so a wire can be started the moment it is on the
     board; the board draws the wire between two ports and resolves what
     flows through them. Only `view` renders that as verses — every other
     kind shows just its own settings, so a chain reads as source → shaping
     → the one place its result actually appears. -->
<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import VerseRefBadge from "$lib/components/arabic-study/VerseRefBadge.svelte";
    import { surahLabels, ensureSurahLabels } from "$lib/stores/quran.svelte";
    import {
        availableTranslators,
        ensureTranslators,
        availableTafsirAuthors,
        ensureTafsirAuthors,
    } from "$lib/stores/translation.store";
    import {
        nodeRefs,
        nodeTranslators,
        nodeTafsirAuthorIds,
        rowsToCsv,
        NODE_SIZE,
        SURAH_AYAH_COUNTS,
        transformNode,
        type VerseRow,
        type WorkbookNode,
    } from "$lib/stores/workbook.store";
    import { copyToClipboard } from "$lib/utils/clipboard";
    import CodeMirrorEditor from "$lib/components/editor/CodeMirrorEditor.svelte";
    import { codeMirrorViewInstance, editorIndentSize } from "$lib/stores/editor.store";
    import { formatLeanSource } from "$lib/utils/leanFormat";
    import { runWorkbookJuliaRepl, workbookJuliaPlots, workbookLeanKernel } from "$lib/stores/workbook-code-nodes";
    import { createLeanRuntime, type LeanRuntime } from "$lib/stores/lean-compiler.store";
    import LeanInfoviewPane from "$lib/components/editor/LeanInfoviewPane.svelte";
    import { isIncompleteJulia } from "$lib/stores/julia-terminal.store";
    import type { KeyBinding } from "@codemirror/view";
    import type { Text } from "@codemirror/state";

    interface Props {
        node: WorkbookNode;
        selected: boolean;
        /** True for every data kind — it always carries input/output ports. */
        hasPort: boolean;
        /** The upstream node's resolved rows, or `null` when nothing feeds this card. */
        inputRows: VerseRow[] | null;
        /** The node directly wired into this one, or `null` — `view` reads its `kind`/`sidePanelOpen` to offer hosting a Julia/Lean node's REPL, infoview, or plots. */
        upstreamNode: WorkbookNode | null;
        /** Live mode: reload on every relevant change. Manual mode: only on `runToken` bumping. */
        live: boolean;
        /** Bumped by the board's Run button — the Manual-mode trigger. */
        runToken: number;
        /** Stacking order among overlapping cards — raised on click, same convention as the app's floating panels. */
        zIndex: number;
        onChange: (patch: Partial<WorkbookNode>) => void;
        onRemove: () => void;
        onSelect: (event: PointerEvent) => void;
        onDragStart: (event: PointerEvent) => void;
        onResizeStart: (event: PointerEvent) => void;
        onPortDragStart: (event: PointerEvent, side: "in" | "out") => void;
    }
    let {
        node,
        selected,
        hasPort,
        inputRows,
        upstreamNode,
        live,
        runToken,
        zIndex,
        onChange,
        onRemove,
        onSelect,
        onDragStart,
        onResizeStart,
        onPortDragStart,
    }: Props = $props();

    let rows = $state<VerseRow[]>([]);
    let loading = $state(false);
    let error = $state("");
    let exportStatus = $state("");

    /** Export: writes this card's own resolved rows to a CSV file. */
    async function saveRowsAsCsv() {
        exportStatus = "";
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const { writeTextFile } = await import("@tauri-apps/plugin-fs");
            const path = await save({
                defaultPath: `${node.title || "export"}.csv`,
                filters: [{ name: "CSV", extensions: ["csv"] }],
            });
            if (!path) return;
            await writeTextFile(path, rowsToCsv(rows));
            exportStatus = $t("workbook.export.saved");
        } catch (e) {
            exportStatus = e instanceof Error ? e.message : String(e);
        }
    }

    /** Export: copies this card's own resolved rows for pasting into the app's other editors. */
    async function copyRowsAs(format: "csv" | "json") {
        exportStatus = "";
        const text = format === "csv" ? rowsToCsv(rows) : JSON.stringify(rows, null, 2);
        const ok = await copyToClipboard(text);
        exportStatus = ok ? $t("workbook.export.copied") : $t("workbook.export.copy_failed");
    }

    onMount(() => {
        void ensureSurahLabels();
        void ensureTranslators();
        void ensureTafsirAuthors();
    });

    // Julia/Lean: the same CodeMirrorEditor JuliaEditor.svelte/LeanEditor.svelte
    // use, buffered locally the same way `localOtherLanguage` is above — it
    // streams every keystroke into `localCode` for responsive typing, but
    // only reaches `node.code` (and so only triggers a real Julia spawn or
    // Lean compile) once the editor loses focus.
    let localCode = $state(node.code ?? "");
    let lineWrap = $state(false);

    function commitCode() {
        if (localCode !== (node.code ?? "")) onChange({ code: localCode });
    }

    function utf8ToB64(s: string): string {
        const bytes = new TextEncoder().encode(s);
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
    function b64ToUtf8(b64: string): string {
        const bin = atob(b64);
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    /** Same formatters JuliaEditor.svelte/LeanEditor.svelte use, run against whichever CodeMirror view is currently focused. */
    async function formatCode() {
        const view = get(codeMirrorViewInstance);
        if (!view) return;
        const code = view.state.doc.toString();
        if (!code.trim()) return;
        if (node.kind === "lean") {
            const formatted = formatLeanSource(code, { indentSize: get(editorIndentSize) });
            if (formatted !== code) {
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
            }
            return;
        }
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const line = await invoke<string>("julia_format", {
                codeB64: utf8ToB64(code),
                indent: get(editorIndentSize),
            });
            if (line.startsWith("OK:")) {
                const formatted = b64ToUtf8(line.slice(3));
                if (formatted !== view.state.doc.toString()) {
                    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: formatted } });
                }
            } else if (line.startsWith("ERR:")) {
                error = b64ToUtf8(line.slice(4));
            }
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        }
    }

    // A toggled-open REPL/infoview panel needs real room the card's shared
    // default footprint doesn't have — grown once, the first time either
    // opens, and never shrunk back (the reader may have since typed more
    // code; only ever making room is the safe direction).
    function ensureRoomForPanel() {
        const target = NODE_SIZE.height + 170;
        if (node.height < target) onChange({ height: target });
    }

    // ── Julia REPL toggle ──
    // A small REPL of its own, not the shared JuliaReplPane (that one is
    // hardcoded to the app's single global "repl" kernel) — this one runs on
    // the SAME per-node kernel as the pipeline itself, so toggling it open
    // lets the reader inspect `rows`/`result` interactively without ever
    // touching JuliaEditor's or JuliaCellComponent's own sessions.
    //
    // Kept on the node itself (`sidePanelOpen`), not local state — a wired
    // `view` card downstream reads it too, to know whether it may host this
    // same REPL itself (see the `view` branch below): the two are never
    // both open at once.
    let juliaReplEntries = $state<{ input: string; output: string; hasError: boolean }[]>([]);
    let juliaReplInput = $state("");
    let juliaReplBusy = $state(false);

    function toggleJuliaRepl() {
        const next = !node.sidePanelOpen;
        onChange({ sidePanelOpen: next });
        if (next) ensureRoomForPanel();
    }

    /** Shared by the REPL input and the editor's Mod-Enter — same kernel either way. */
    async function runJuliaSnippet(code: string) {
        const trimmed = code.trim();
        if (!trimmed || juliaReplBusy) return;
        juliaReplBusy = true;
        try {
            const { text, hasError } = await runWorkbookJuliaRepl(node, trimmed);
            juliaReplEntries = [...juliaReplEntries, { input: trimmed, output: text, hasError }];
        } catch (e) {
            juliaReplEntries = [
                ...juliaReplEntries,
                { input: trimmed, output: e instanceof Error ? e.message : String(e), hasError: true },
            ];
        } finally {
            juliaReplBusy = false;
        }
    }

    async function runJuliaReplLine() {
        const code = juliaReplInput.trim();
        if (!code) return;
        juliaReplInput = "";
        await runJuliaSnippet(code);
    }

    /** Mod-Enter from the editor: open (and grow for) the REPL so the result is actually visible, same as JuliaEditor.svelte surfacing into its own REPL pane. */
    function runFromEditor(snippet: string) {
        if (!node.sidePanelOpen) toggleJuliaRepl();
        void runJuliaSnippet(snippet);
    }

    // Find the top-level statement (line range) containing `cursorLine` —
    // identical approach to JuliaEditor.svelte's own Mod-Enter: grow a
    // candidate statement line by line until it parses as complete Julia, so
    // the cursor anywhere inside a function/block runs that whole construct.
    function enclosingStatementRange(doc: Text, cursorLine: number): { start: number; end: number } {
        let stmtStart = 1;
        for (let line = 1; line <= doc.lines; line++) {
            const snippet = doc.sliceString(doc.line(stmtStart).from, doc.line(line).to);
            if (!isIncompleteJulia(snippet)) {
                if (cursorLine >= stmtStart && cursorLine <= line) return { start: stmtStart, end: line };
                stmtStart = line + 1;
            }
        }
        return { start: stmtStart, end: doc.lines };
    }

    /** First line at or below `fromLine` with actual code — blank lines/comments skipped so repeated Mod-Enter lands only on runnable code. */
    function nextCodeLine(doc: Text, fromLine: number): number | null {
        for (let line = fromLine; line <= doc.lines; line++) {
            const text = doc.line(line).text.trim();
            if (text !== "" && !text.startsWith("#")) return line;
        }
        return null;
    }

    const juliaEditorKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run(view) {
                const { from, to } = view.state.selection.main;
                if (from !== to) {
                    runFromEditor(view.state.sliceDoc(from, to));
                    return true;
                }
                const doc = view.state.doc;
                const cursorLine = doc.lineAt(from).number;
                const { start, end } = enclosingStatementRange(doc, cursorLine);
                runFromEditor(doc.sliceString(doc.line(start).from, doc.line(end).to));
                const target = nextCodeLine(doc, end + 1);
                if (target !== null) {
                    view.dispatch({ selection: { anchor: doc.line(target).from }, scrollIntoView: true });
                }
                return true;
            },
        },
    ];

    // ── Lean infoview toggle ──
    // Same isolation reasoning as the Julia REPL above: a runtime of this
    // node's own, on this node's own kernel — not `leanEditorRuntime`
    // (LeanEditor.svelte's "repl") or `leanCellRuntime` (LeanCellComponent's
    // "cell"). Created lazily so a Lean node that never opens its infoview
    // never starts a kernel beyond what running the pipeline itself needs.
    // Same `sidePanelOpen` sharing as the Julia REPL above.
    let leanRuntime: LeanRuntime | null = null;
    function ensureLeanRuntime(): LeanRuntime {
        if (!leanRuntime) leanRuntime = createLeanRuntime(workbookLeanKernel(node.id));
        return leanRuntime;
    }
    function toggleLeanInfoview() {
        const next = !node.sidePanelOpen;
        onChange({ sidePanelOpen: next });
        if (next) ensureRoomForPanel();
    }

    /** Mod-Enter from the editor — same as LeanEditor.svelte: Lean elaborates whole files, not statements, so this compiles the buffer and opens (and grows for) the infoview so the result is visible. */
    function runLeanFromEditor() {
        if (!node.sidePanelOpen) toggleLeanInfoview();
        void ensureLeanRuntime().compile(localCode, true);
    }

    const leanEditorKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run() {
                runLeanFromEditor();
                return true;
            },
        },
    ];

    // ── `view` hosting a wired Julia/Lean node's REPL/infoview/plots ──
    // A view card wired directly to a Julia or Lean card can show that
    // node's own tooling in place of its resolved rows — its own REPL log
    // and Lean runtime, separate instances from the source card's (each
    // card is its own component), but bound to the exact same kernel, so
    // switching which side is showing it never loses the underlying
    // session, only which card's UI happens to be displaying it.
    let hostedJuliaReplEntries = $state<{ input: string; output: string; hasError: boolean }[]>([]);
    let hostedJuliaReplInput = $state("");
    let hostedJuliaReplBusy = $state(false);

    async function runHostedJuliaReplLine() {
        const target = upstreamNode;
        const code = hostedJuliaReplInput.trim();
        if (!code || !target || hostedJuliaReplBusy) return;
        hostedJuliaReplInput = "";
        hostedJuliaReplBusy = true;
        try {
            const { text, hasError } = await runWorkbookJuliaRepl(target, code);
            hostedJuliaReplEntries = [...hostedJuliaReplEntries, { input: code, output: text, hasError }];
        } catch (e) {
            hostedJuliaReplEntries = [
                ...hostedJuliaReplEntries,
                { input: code, output: e instanceof Error ? e.message : String(e), hasError: true },
            ];
        } finally {
            hostedJuliaReplBusy = false;
        }
    }

    let hostedLeanRuntime: LeanRuntime | null = null;
    let hostedLeanRuntimeFor: string | null = null;
    function ensureHostedLeanRuntime(targetId: string): LeanRuntime {
        if (!hostedLeanRuntime || hostedLeanRuntimeFor !== targetId) {
            hostedLeanRuntime = createLeanRuntime(workbookLeanKernel(targetId));
            hostedLeanRuntimeFor = targetId;
        }
        return hostedLeanRuntime;
    }

    /** `'repl'`/`'infoview'` only make sense while the upstream node isn't already showing that same panel itself; a mode the wiring no longer supports (upstream gone, changed kind, or its own panel opened) resets back to the plain row view. */
    $effect(() => {
        if (node.kind !== "view" || !node.viewMode || node.viewMode === "rows") return;
        const blockedByUpstream =
            (node.viewMode === "repl" && upstreamNode?.kind === "julia" && upstreamNode.sidePanelOpen) ||
            (node.viewMode === "infoview" && upstreamNode?.kind === "lean" && upstreamNode.sidePanelOpen);
        const stillValid =
            (node.viewMode === "repl" && upstreamNode?.kind === "julia") ||
            (node.viewMode === "infoview" && upstreamNode?.kind === "lean") ||
            (node.viewMode === "plots" && upstreamNode?.kind === "julia");
        if (blockedByUpstream || !stillValid) onChange({ viewMode: "rows" });
    });

    function setViewMode(mode: NonNullable<WorkbookNode["viewMode"]>) {
        const next = node.viewMode === mode ? "rows" : mode;
        onChange({ viewMode: next });
        if (next !== "rows") ensureRoomForPanel();
    }

    const juliaPlots = $derived(upstreamNode?.kind === "julia" ? workbookJuliaPlots(upstreamNode.id) : null);

    /** The verses an ayah/related card is pointed at. */
    const refs = $derived(nodeRefs(node));

    // The surah/ayah picker that adds to `refs` — its own local pick, not
    // committed until "Add" so browsing surahs doesn't touch the node.
    let pickerSurah = $state(1);
    let pickerAyah = $state(1);

    function addRef() {
        const ref = `${pickerSurah}:${pickerAyah}`;
        if (refs.includes(ref)) return;
        onChange({ refs: [...refs, ref], ref: undefined });
    }

    function removeRef(ref: string) {
        onChange({ refs: refs.filter((r) => r !== ref) });
    }

    // Translate/Tafsir: one or more picks, each its own dropdown row with a
    // + button to add another and a × to remove one — always at least one
    // row, even before the reader has touched either node (nodeTranslators/
    // nodeTafsirAuthorIds synthesise a blank "reader default" row for that).
    const translatorPicks = $derived(nodeTranslators(node));
    const tafsirAuthorPicks = $derived(nodeTafsirAuthorIds(node));

    function setTranslatorPick(i: number, patch: Partial<{ id?: number | "other"; language?: string }>) {
        onChange({ translators: translatorPicks.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
    }
    function addTranslatorPick() {
        onChange({ translators: [...translatorPicks, {}] });
    }
    function removeTranslatorPick(i: number) {
        onChange({ translators: translatorPicks.filter((_, idx) => idx !== i) });
    }

    function setTafsirAuthorPick(i: number, id: number | undefined) {
        onChange({ tafsirAuthorIds: tafsirAuthorPicks.map((v, idx) => (idx === i ? id : v)) });
    }
    function addTafsirAuthorPick() {
        onChange({ tafsirAuthorIds: [...tafsirAuthorPicks, undefined] });
    }
    function removeTafsirAuthorPick(i: number) {
        onChange({ tafsirAuthorIds: tafsirAuthorPicks.filter((_, idx) => idx !== i) });
    }

    /** Header accent per kind — a tint on the strip, a colour for the ports. */
    const ACCENT: Record<string, { strip: string; icon: string; dot: string }> = {
        ayah: {
            strip: "bg-brand-gold-50 dark:bg-[#34302a]",
            icon: "solar:book-2-bold-duotone",
            dot: "bg-brand-gold-400",
        },
        translation: {
            strip: "bg-brand-teal-50 dark:bg-[#29383e]",
            icon: "solar:translation-2-bold-duotone",
            dot: "bg-brand-teal-400",
        },
        tafsir: {
            strip: "bg-[#f5f1fb] dark:bg-[#2b2a3d]",
            icon: "solar:notebook-bold-duotone",
            dot: "bg-[#a999d6]",
        },
        related: {
            strip: "bg-brand-emerald-50 dark:bg-[#28352f]",
            icon: "solar:link-circle-bold-duotone",
            dot: "bg-brand-emerald-400",
        },
        filter: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:filter-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        limit: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:sort-vertical-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        dedupe: {
            strip: "bg-[#f4f2fa] dark:bg-[#2b2a3d]",
            icon: "solar:copy-bold-duotone",
            dot: "bg-[#c3b6ea]",
        },
        julia: {
            strip: "bg-[#f3ecfa] dark:bg-[#2f2a3d]",
            icon: "devicon-plain:julia",
            dot: "bg-[#c9a8e0]",
        },
        lean: {
            strip: "bg-[#e9f1fb] dark:bg-[#232c3d]",
            icon: "vscode-icons:file-type-light-lean",
            dot: "bg-[#a9c6e8]",
        },
        view: {
            strip: "bg-brand-emerald-50 dark:bg-[#28352f]",
            icon: "solar:eye-bold-duotone",
            dot: "bg-brand-emerald-400",
        },
        export: {
            strip: "bg-[#fdf1e6] dark:bg-[#342a1e]",
            icon: "solar:download-square-bold-duotone",
            dot: "bg-[#e0b98f]",
        },
        note: {
            strip: "bg-[#fffbe8] dark:bg-[#34302a]",
            icon: "solar:notes-bold-duotone",
            dot: "bg-[#e8dca8]",
        },
        image: {
            strip: "bg-brand-sand-50 dark:bg-[#232634]",
            icon: "solar:gallery-bold-duotone",
            dot: "bg-brand-sand-300",
        },
        title: {
            strip: "bg-transparent",
            icon: "solar:text-bold-duotone",
            dot: "bg-transparent",
        },
    };

    // Same construction as SurahWidget.svelte's `selectClass` — a bordered
    // pill with a chevron — scaled down to fit a card a few hundred px wide.
    const dropdownClass =
        "w-full appearance-none cursor-pointer rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#232634] px-2 py-1 pr-6 text-[0.625rem] text-brand-charcoal-600 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-50 dark:hover:bg-[#363a4f]";

    const NO_SETTINGS_KIND = new Set(["note", "image", "title"]);

    async function reload() {
        if (NO_SETTINGS_KIND.has(node.kind)) return;
        loading = true;
        error = "";
        try {
            rows = await transformNode(node, inputRows ?? []);
        } catch (e) {
            error = e instanceof Error ? e.message : String(e);
        } finally {
            loading = false;
        }
    }

    let lastRunToken = 0;

    // Reload whenever what this card is pointed at changes — its own refs or
    // settings, or (for a wired card) what its upstream neighbour produced —
    // but only in Live mode; in Manual mode this waits for the board's
    // `runToken` to bump (the reader pressing Run), same as the board's own
    // pipeline recompute.
    $effect(() => {
        void refs.join(",");
        void node.query;
        void node.filterField;
        void node.filterOp;
        void node.limit;
        void node.layout;
        void node.translators;
        void node.tafsirAuthorIds;
        void node.code;
        void inputRows;
        const token = runToken;
        if (!live && token === lastRunToken) return;
        lastRunToken = token;
        void reload();
    });
</script>

{#snippet dropdownChevron()}
    <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-brand-charcoal-300 dark:text-[#838ba7]">
        <Icon icon="charm:chevron-down" width="0.625rem" />
    </span>
{/snippet}

{#snippet verseCards(list: VerseRow[], layout: "list" | "columns")}
    <div class={layout === "columns" ? "grid grid-cols-2 gap-2" : "flex flex-col gap-2"}>
        {#each list as row, i (i)}
            <div class="rounded-xl border border-brand-sand-200/70 bg-white p-2 dark:border-[#414559] dark:bg-[#232634]">
                <div class="flex items-center justify-between gap-1">
                    <VerseRefBadge verseRef={`${row.surah}:${row.ayah}`} size="sm" />
                    {#if row.fromRef}
                        <span class="text-[0.5625rem] text-brand-charcoal-300 dark:text-[#626880]">
                            ← {row.fromRef}
                        </span>
                    {/if}
                </div>
                <div dir="rtl" class="pb-1 pt-1 font-scheherazade text-base leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">
                    {row.arabic}
                </div>
                {#if row.translations?.length}
                    {#each row.translations as t, ti (ti)}
                        {#if t.text}
                            <p class="text-[0.625rem] italic leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                                {#if row.translations.length > 1}<span class="font-semibold not-italic text-brand-charcoal-400 dark:text-[#838ba7]">{t.label}: </span>{/if}{t.text}
                            </p>
                        {/if}
                    {/each}
                {:else if row.translation}
                    <p class="text-[0.625rem] italic leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce]">
                        {row.translation}
                    </p>
                {/if}
                {#if row.tafsirs?.length}
                    {#each row.tafsirs as tf, tfi (tfi)}
                        {#if tf.text}
                            <p class="mt-1 line-clamp-4 text-[0.5625rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                                {#if row.tafsirs.length > 1}<span class="font-semibold">{tf.label}: </span>{/if}{tf.text}
                            </p>
                        {/if}
                    {/each}
                {:else if row.tafsir}
                    <p class="mt-1 line-clamp-4 text-[0.5625rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                        {row.tafsir}
                    </p>
                {/if}
            </div>
        {/each}
    </div>
{/snippet}

{#snippet outputHeader()}
    <div class="mb-1.5 flex items-center gap-1.5">
        <span class="text-[0.5625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("workbook.flow.output")}
        </span>
        <span class="rounded-full bg-brand-sand-100 px-1.5 text-[0.5625rem] font-semibold text-brand-charcoal-500 dark:bg-[#363a4f] dark:text-[#c6d0f5]">
            {rows.length}
        </span>
    </div>
{/snippet}

<div
    class="absolute flex flex-col overflow-hidden rounded-xl border border-brand-sand-200/80 bg-white/95 shadow-lg backdrop-blur-md transition-shadow dark:border-[#414559] dark:bg-[#292c3c]/95 dark:shadow-black/40 {selected
        ? 'ring-2 ring-brand-gold-400 dark:ring-[#e5c890]'
        : ''} {node.kind === 'title' ? 'border-transparent bg-transparent shadow-none backdrop-blur-none dark:bg-transparent' : ''}"
    class:node-running={loading}
    style:left="{node.x}px"
    style:top="{node.y}px"
    style:width="{node.width}px"
    style:height="{node.height}px"
    style:z-index={zIndex}
    data-node-id={node.id}
    data-node-kind={node.kind}
    onpointerdown={onSelect}
    onwheel={(e) => e.stopPropagation()}
>
    <!-- Header strip doubles as the drag handle -->
    <div
        class="flex shrink-0 cursor-grab items-center gap-1.5 border-b border-brand-sand-200/70 px-3 py-1.5 active:cursor-grabbing dark:border-[#414559] {ACCENT[
            node.kind
        ].strip} {node.kind === 'title' ? 'border-transparent' : ''}"
        onpointerdown={onDragStart}
    >
        {#if node.kind === "title"}
            <input
                value={node.text ?? ""}
                oninput={(e) => onChange({ text: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.node.title")}
                class="min-w-0 flex-1 bg-transparent text-lg font-bold tracking-tight text-brand-charcoal-900 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            />
        {:else}
            <Icon icon={ACCENT[node.kind].icon} width="0.8rem" class="shrink-0 text-brand-charcoal-400 dark:text-[#838ba7]" />
            <span class="flex-1 truncate text-[0.625rem] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#838ba7]">
                {$t(`workbook.node.${node.kind}`)}
            </span>
            {#if node.kind !== "note" && node.kind !== "image"}
                <button
                    onclick={reload}
                    onpointerdown={(e) => e.stopPropagation()}
                    title={$t("workbook.refresh")}
                    aria-label={$t("workbook.refresh")}
                    class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-black/5 dark:text-[#838ba7] dark:hover:bg-white/10"
                >
                    <Icon
                        icon={loading ? "svg-spinners:180-ring-with-bg" : "solar:refresh-bold-duotone"}
                        width="0.7rem"
                    />
                </button>
            {/if}
        {/if}
        <button
            onclick={onRemove}
            onpointerdown={(e) => e.stopPropagation()}
            title={$t("workbook.remove_node")}
            aria-label={$t("workbook.remove_node")}
            class="flex h-5 w-5 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-black/5 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-white/10"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.7rem" />
        </button>
    </div>

    <!-- Body -->
    <div class="default-scroll min-h-0 flex-1 overflow-auto p-3">
        {#if node.kind === "note"}
            <textarea
                value={node.text ?? ""}
                oninput={(e) => onChange({ text: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.node.note_placeholder")}
                class="h-full w-full resize-none bg-transparent text-[0.75rem] leading-relaxed text-brand-charcoal-600 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            ></textarea>
        {:else if node.kind === "image"}
            {#if node.text}
                <img src={node.text} alt="" class="h-full w-full object-contain" />
            {:else}
                <p class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("workbook.node.image_empty")}
                </p>
            {/if}
        {:else if node.kind === "filter"}
            {@const field = node.filterField ?? "text"}
            {@const op = node.filterOp ?? (field === "text" ? "contains" : "eq")}
            <div class="flex flex-col gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="flex gap-1.5">
                    <div class="relative flex-1">
                        <select
                            value={field}
                            onchange={(e) => {
                                const next = e.currentTarget.value as "text" | "surah" | "ayah";
                                onChange({
                                    filterField: next,
                                    filterOp: next === "text" ? "contains" : "eq",
                                });
                            }}
                            class={dropdownClass}
                        >
                            <option value="text">{$t("workbook.filter.field.text")}</option>
                            <option value="surah">{$t("workbook.filter.field.surah")}</option>
                            <option value="ayah">{$t("workbook.filter.field.ayah")}</option>
                        </select>
                        {@render dropdownChevron()}
                    </div>
                    <div class="relative flex-1">
                        <select
                            value={op}
                            onchange={(e) => onChange({ filterOp: e.currentTarget.value as WorkbookNode["filterOp"] })}
                            class={dropdownClass}
                        >
                            {#if field === "text"}
                                <option value="contains">{$t("workbook.filter.op.contains")}</option>
                                <option value="not_contains">{$t("workbook.filter.op.not_contains")}</option>
                            {:else}
                                <option value="eq">{$t("workbook.filter.op.eq")}</option>
                                <option value="neq">{$t("workbook.filter.op.neq")}</option>
                                <option value="gt">{$t("workbook.filter.op.gt")}</option>
                                <option value="gte">{$t("workbook.filter.op.gte")}</option>
                                <option value="lt">{$t("workbook.filter.op.lt")}</option>
                                <option value="lte">{$t("workbook.filter.op.lte")}</option>
                            {/if}
                        </select>
                        {@render dropdownChevron()}
                    </div>
                </div>
                <input
                    type={field === "text" ? "text" : "number"}
                    value={node.query ?? ""}
                    oninput={(e) => onChange({ query: e.currentTarget.value })}
                    placeholder={field === "text" ? $t("workbook.flow.contains") : "0"}
                    class="w-full rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
            </div>
        {:else if node.kind === "limit"}
            <div class="flex items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <span class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("workbook.flow.keep")}
                </span>
                <input
                    type="number"
                    min="1"
                    value={node.limit ?? 5}
                    oninput={(e) => onChange({ limit: Number(e.currentTarget.value) })}
                    class="w-16 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
            </div>
        {:else if node.kind === "dedupe"}
            <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t("workbook.node.dedupe_hint")}
            </p>
        {:else if node.kind === "julia" || node.kind === "lean"}
            {@const lang = node.kind === "julia" ? "julia" : "lean"}
            <!-- Runs against `rows` (this node's input) with the answer
                 expected in `result` — see workbook-code-nodes.ts for the
                 exact contract each language gets. Same CodeMirror editor
                 (and Format/Wrap toolbar) as JuliaEditor.svelte/LeanEditor.svelte;
                 the editor streams every keystroke into a local buffer but
                 only reaches `node.code` on blur, since a commit here means
                 a real Julia spawn or Lean compile, not a cheap comparison. -->
            <div
                class="flex h-full flex-col gap-1"
                onpointerdown={(e) => e.stopPropagation()}
                onfocusout={commitCode}
                role="presentation"
            >
                <input
                    value={node.title ?? ""}
                    oninput={(e) => onChange({ title: e.currentTarget.value })}
                    placeholder={$t(`workbook.node.${node.kind}_name_placeholder`)}
                    class="w-full shrink-0 rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-[0.6875rem] font-semibold text-brand-charcoal-700 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
                <div class="flex shrink-0 items-center gap-1">
                    <button
                        onclick={formatCode}
                        title={$t(lang === "julia" ? "julia_cell.format" : "lean_editor.format_title")}
                        class="flex cursor-pointer items-center gap-1 rounded-full bg-brand-gold-100 px-1.5 py-0.5 text-[0.5625rem] font-medium text-brand-gold-600 transition-colors hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25"
                    >
                        <Icon icon="icon-park-twotone:format-brush" width="0.625rem" />
                        {$t("julia_editor.format")}
                    </button>
                    <button
                        onclick={() => (lineWrap = !lineWrap)}
                        title={$t(lineWrap ? "julia_cell.disable_wrap" : "julia_cell.enable_wrap")}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-medium transition-colors {lineWrap
                            ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                            : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="0.625rem"
                            height="0.625rem"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <polyline points="3 6 21 6" /><path d="M3 12h15a3 3 0 0 1 0 6h-4" /><polyline
                                points="8 15 5 18 8 21"
                            />
                        </svg>
                        {$t(lineWrap ? "julia_editor.wrap" : "julia_editor.no_wrap")}
                    </button>
                    {#if lang === "julia"}
                        <button
                            onclick={toggleJuliaRepl}
                            title={$t("workbook.node.julia_repl")}
                            class="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-medium transition-colors {node.sidePanelOpen
                                ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                                : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                        >
                            <Icon icon="solar:programming-bold-duotone" width="0.625rem" />
                            {$t("workbook.node.julia_repl")}
                        </button>
                    {:else}
                        <button
                            onclick={toggleLeanInfoview}
                            title={$t("workbook.node.lean_infoview")}
                            class="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.5625rem] font-medium transition-colors {node.sidePanelOpen
                                ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                                : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                        >
                            <Icon icon="solar:document-text-bold-duotone" width="0.625rem" />
                            {$t("workbook.node.lean_infoview")}
                        </button>
                    {/if}
                </div>
                <div class="min-h-0 flex-1 overflow-hidden rounded-lg border border-brand-sand-200 dark:border-[#414559]">
                    <CodeMirrorEditor
                        value={localCode}
                        language={lang}
                        {lineWrap}
                        extraKeymap={lang === "julia" ? juliaEditorKeymap : leanEditorKeymap}
                        onchange={(v) => (localCode = v)}
                        class="h-full font-mono text-[0.625rem]"
                    />
                </div>
                {#if lang === "julia" && node.sidePanelOpen}
                    <!-- A REPL of this node's own — not JuliaReplPane, which is
                         hardcoded to the app's single shared "repl" kernel; this
                         one runs on the exact kernel the pipeline itself uses,
                         so `rows`/`result` from the last run are right there. -->
                    <div
                        class="flex h-32 shrink-0 flex-col overflow-hidden rounded-lg border border-brand-sand-200 dark:border-[#414559]"
                    >
                        <div class="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-1.5 font-mono text-[0.5625rem] leading-relaxed">
                            {#each juliaReplEntries as entry, i (i)}
                                <div class="text-[#79c0ff]">julia&gt; {entry.input}</div>
                                {#if entry.output}
                                    <div class="whitespace-pre-wrap {entry.hasError ? 'text-red-400' : 'text-[#c9d1d9]'}">
                                        {entry.output}
                                    </div>
                                {/if}
                            {/each}
                        </div>
                        <input
                            value={juliaReplInput}
                            oninput={(e) => (juliaReplInput = e.currentTarget.value)}
                            onkeydown={(e) => e.key === "Enter" && runJuliaReplLine()}
                            disabled={juliaReplBusy}
                            placeholder="julia>"
                            class="shrink-0 border-t border-brand-sand-200 bg-white px-1.5 py-1 font-mono text-[0.5625rem] text-brand-charcoal-700 outline-none dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
                        />
                    </div>
                {:else if lang === "lean" && node.sidePanelOpen}
                    <!-- Same isolation reasoning: this node's own LeanRuntime,
                         on this node's own kernel, not LeanEditor.svelte's
                         "repl" or LeanCellComponent's "cell". -->
                    <div class="h-32 shrink-0 overflow-hidden rounded-lg border border-brand-sand-200 dark:border-[#414559]">
                        <LeanInfoviewPane runtime={ensureLeanRuntime()} getCode={() => localCode} showLiveToggle={false} />
                    </div>
                {/if}
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {:else if node.kind === "view"}
            <div class="flex flex-wrap items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="relative w-28">
                    <select
                        value={node.layout ?? "list"}
                        onchange={(e) => onChange({ layout: e.currentTarget.value as "list" | "columns" })}
                        class={dropdownClass}
                    >
                        <option value="list">{$t("workbook.view.list")}</option>
                        <option value="columns">{$t("workbook.view.columns")}</option>
                    </select>
                    {@render dropdownChevron()}
                </div>
                {#if upstreamNode?.kind === "julia"}
                    <!-- Wired to a Julia card: this view can host its REPL
                         (only while that card isn't already showing it
                         itself) or its most recent plot output. -->
                    <button
                        onclick={() => setViewMode("repl")}
                        disabled={upstreamNode.sidePanelOpen}
                        title={upstreamNode.sidePanelOpen
                            ? $t("workbook.view.hosting_disabled")
                            : $t("workbook.node.julia_repl")}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[0.625rem] font-medium transition-colors disabled:cursor-default disabled:opacity-40 {node.viewMode ===
                        'repl'
                            ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                            : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                    >
                        <Icon icon="solar:programming-bold-duotone" width="0.7rem" />
                        {$t("workbook.node.julia_repl")}
                    </button>
                    <button
                        onclick={() => setViewMode("plots")}
                        title={$t("workbook.view.julia_plots")}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[0.625rem] font-medium transition-colors {node.viewMode ===
                        'plots'
                            ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                            : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                    >
                        <Icon icon="solar:chart-2-bold-duotone" width="0.7rem" />
                        {$t("workbook.view.julia_plots")}
                    </button>
                {:else if upstreamNode?.kind === "lean"}
                    <!-- Wired to a Lean card: this view can host its
                         infoview, only while that card isn't already
                         showing it itself. -->
                    <button
                        onclick={() => setViewMode("infoview")}
                        disabled={upstreamNode.sidePanelOpen}
                        title={upstreamNode.sidePanelOpen
                            ? $t("workbook.view.hosting_disabled")
                            : $t("workbook.node.lean_infoview")}
                        class="flex cursor-pointer items-center gap-1 rounded-full px-2 py-1 text-[0.625rem] font-medium transition-colors disabled:cursor-default disabled:opacity-40 {node.viewMode ===
                        'infoview'
                            ? 'bg-brand-sand-200 text-brand-charcoal-500 hover:bg-brand-sand-400 dark:bg-[#414559] dark:text-[#838ba7] dark:hover:bg-[#51566a]'
                            : 'bg-brand-gold-100 text-brand-gold-600 hover:bg-brand-gold-200 dark:bg-[#e5c890]/15 dark:text-brand-gold-400 dark:hover:bg-[#e5c890]/25'}"
                    >
                        <Icon icon="solar:document-text-bold-duotone" width="0.7rem" />
                        {$t("workbook.node.lean_infoview")}
                    </button>
                {/if}
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
            {#if node.viewMode === "repl" && upstreamNode?.kind === "julia" && !upstreamNode.sidePanelOpen}
                <div
                    class="mt-2 flex h-40 flex-col overflow-hidden rounded-lg border border-brand-sand-200 dark:border-[#414559]"
                >
                    <div class="min-h-0 flex-1 overflow-auto bg-[#0d1117] p-1.5 font-mono text-[0.5625rem] leading-relaxed">
                        {#each hostedJuliaReplEntries as entry, i (i)}
                            <div class="text-[#79c0ff]">julia&gt; {entry.input}</div>
                            {#if entry.output}
                                <div class="whitespace-pre-wrap {entry.hasError ? 'text-red-400' : 'text-[#c9d1d9]'}">
                                    {entry.output}
                                </div>
                            {/if}
                        {/each}
                    </div>
                    <input
                        value={hostedJuliaReplInput}
                        oninput={(e) => (hostedJuliaReplInput = e.currentTarget.value)}
                        onkeydown={(e) => e.key === "Enter" && runHostedJuliaReplLine()}
                        disabled={hostedJuliaReplBusy}
                        placeholder="julia>"
                        class="shrink-0 border-t border-brand-sand-200 bg-white px-1.5 py-1 font-mono text-[0.5625rem] text-brand-charcoal-700 outline-none dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]"
                    />
                </div>
            {:else if node.viewMode === "plots" && upstreamNode?.kind === "julia"}
                <div class="mt-2 flex flex-col gap-2">
                    {#if juliaPlots}
                        {@const plots = $juliaPlots ?? []}
                        {#if plots.length === 0}
                            <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                {$t("workbook.view.no_plots")}
                            </p>
                        {:else}
                            {#each plots as plot, i (i)}
                                {#if (plot.format === "png" || plot.format === "svg") && plot.data}
                                    <img
                                        src="data:image/{plot.format === 'svg' ? 'svg+xml' : 'png'};base64,{plot.data}"
                                        alt=""
                                        class="w-full rounded-lg border border-brand-sand-200 dark:border-[#414559]"
                                    />
                                {:else if plot.url}
                                    <a
                                        href={plot.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        class="text-[0.625rem] text-brand-gold-600 underline dark:text-[#e5c890]"
                                    >
                                        {plot.url}
                                    </a>
                                {/if}
                            {/each}
                        {/if}
                    {/if}
                </div>
            {:else if node.viewMode === "infoview" && upstreamNode?.kind === "lean" && !upstreamNode.sidePanelOpen}
                <div class="mt-2 h-40 overflow-hidden rounded-lg border border-brand-sand-200 dark:border-[#414559]">
                    <LeanInfoviewPane
                        runtime={ensureHostedLeanRuntime(upstreamNode.id)}
                        getCode={() => upstreamNode?.code ?? ""}
                        showLiveToggle={false}
                    />
                </div>
            {:else}
                <div class="mt-2">
                    {@render outputHeader()}
                    {@render verseCards(rows, node.layout ?? "list")}
                </div>
            {/if}
        {:else if node.kind === "export"}
            <!-- A sink: exports this card's own already-resolved input as
                 CSV (openable in Excel) or copies it for pasting into the
                 app's other editors (Lexical, Typst, Julia, Lean cells). -->
            <div class="flex flex-col gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <button
                    onclick={saveRowsAsCsv}
                    class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-sand-200 bg-white px-2 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-600 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                >
                    <Icon icon="solar:file-download-bold-duotone" width="0.8rem" />
                    {$t("workbook.export.save_csv")}
                </button>
                <button
                    onclick={() => copyRowsAs("csv")}
                    class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-sand-200 bg-white px-2 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-600 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                >
                    <Icon icon="solar:clipboard-text-bold-duotone" width="0.8rem" />
                    {$t("workbook.export.copy_csv")}
                </button>
                <button
                    onclick={() => copyRowsAs("json")}
                    class="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-brand-sand-200 bg-white px-2 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-600 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]"
                >
                    <Icon icon="solar:code-bold-duotone" width="0.8rem" />
                    {$t("workbook.export.copy_json")}
                </button>
                {#if exportStatus}
                    <p class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">{exportStatus}</p>
                {/if}
            </div>
        {:else if node.kind === "title"}
            <!-- A heading's own big text lives in the header; the body is just
                 room for an optional note about it, not another ayah picker. -->
            <textarea
                value={node.title ?? ""}
                oninput={(e) => onChange({ title: e.currentTarget.value })}
                onpointerdown={(e) => e.stopPropagation()}
                placeholder={$t("workbook.heading.description_placeholder")}
                class="h-full w-full resize-none bg-transparent text-[0.75rem] leading-relaxed text-brand-charcoal-600 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5]"
            ></textarea>
        {:else if node.kind === "translation"}
            <!-- No ayah picker: the verses come from whatever is wired into
                 the input port (an Ayah card, typically). One row per
                 translator — the + button below adds another to compare
                 side by side on the View card downstream. -->
            <div class="flex flex-col gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                {#each translatorPicks as pick, i (i)}
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center gap-1">
                            <div class="relative h-6 flex-1">
                                <select
                                    value={pick.id === undefined ? "" : String(pick.id)}
                                    onchange={(e) => {
                                        const v = e.currentTarget.value;
                                        setTranslatorPick(i, { id: v === "" ? undefined : v === "other" ? "other" : Number(v) });
                                    }}
                                    class="{dropdownClass} h-full"
                                >
                                    <option value="">{$t("workbook.translate.reader_default")}</option>
                                    {#each $availableTranslators as tr (tr.id)}
                                        <option value={String(tr.id)}>{tr.name}</option>
                                    {/each}
                                    <option value="other">{$t("workbook.translate.other")}</option>
                                </select>
                                {@render dropdownChevron()}
                            </div>
                            <button
                                onclick={() => removeTranslatorPick(i)}
                                title={$t("workbook.translate.remove")}
                                aria-label={$t("workbook.translate.remove")}
                                class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                            >
                                <Icon icon="solar:close-circle-bold-duotone" width="0.75rem" />
                            </button>
                        </div>
                        {#if pick.id === "other"}
                            <input
                                value={pick.language ?? ""}
                                onblur={(e) => setTranslatorPick(i, { language: e.currentTarget.value.trim() })}
                                onkeydown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        setTranslatorPick(i, { language: e.currentTarget.value.trim() });
                                        e.currentTarget.blur();
                                    }
                                }}
                                placeholder={$t("workbook.translate.other_placeholder")}
                                class="w-full rounded-lg border border-brand-sand-200 bg-white px-2 py-1 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                            />
                        {/if}
                    </div>
                {/each}
                <button
                    onclick={addTranslatorPick}
                    class="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-brand-sand-200 py-1 text-[0.625rem] font-semibold text-brand-charcoal-400 transition-colors hover:border-brand-gold-400 hover:text-brand-gold-600 dark:border-[#414559] dark:text-[#838ba7] dark:hover:border-[#e5c890] dark:hover:text-[#e5c890]"
                >
                    <Icon icon="solar:add-circle-bold-duotone" width="0.75rem" />
                    {$t("workbook.translate.add")}
                </button>
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {:else if node.kind === "tafsir"}
            <!-- No ayah picker here either — an Ayah card upstream (directly,
                 or through a Translate card, which passes the verses on
                 unchanged) is what this reads. One row per author — the +
                 button below adds another to compare side by side. -->
            <div class="flex flex-col gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                {#each tafsirAuthorPicks as id, i (i)}
                    <div class="flex items-center gap-1">
                        <div class="relative h-6 flex-1">
                            <select
                                value={id === undefined ? "" : String(id)}
                                onchange={(e) => {
                                    const v = e.currentTarget.value;
                                    setTafsirAuthorPick(i, v === "" ? undefined : Number(v));
                                }}
                                class="{dropdownClass} h-full"
                            >
                                <option value="">{$t("workbook.tafsir.reader_default")}</option>
                                {#each $availableTafsirAuthors as author (author.id)}
                                    <option value={String(author.id)}>{author.name}</option>
                                {/each}
                            </select>
                            {@render dropdownChevron()}
                        </div>
                        <button
                            onclick={() => removeTafsirAuthorPick(i)}
                            title={$t("workbook.tafsir.remove")}
                            aria-label={$t("workbook.tafsir.remove")}
                            class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-charcoal-300 transition-colors hover:bg-brand-sand-100 hover:text-red-500 dark:text-[#838ba7] dark:hover:bg-[#414559]"
                        >
                            <Icon icon="solar:close-circle-bold-duotone" width="0.75rem" />
                        </button>
                    </div>
                {/each}
                <button
                    onclick={addTafsirAuthorPick}
                    class="flex cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-brand-sand-200 py-1 text-[0.625rem] font-semibold text-brand-charcoal-400 transition-colors hover:border-brand-gold-400 hover:text-brand-gold-600 dark:border-[#414559] dark:text-[#838ba7] dark:hover:border-[#e5c890] dark:hover:text-[#e5c890]"
                >
                    <Icon icon="solar:add-circle-bold-duotone" width="0.75rem" />
                    {$t("workbook.tafsir.add")}
                </button>
            </div>
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {:else if node.kind === "related"}
            <!-- No picker: reads only what is wired in (an Ayah card,
                 directly or by way of a Translate card) — see the header
                 comment. All this node configures is how many related
                 verses to keep per input row. -->
            <div class="flex items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <span class="text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("workbook.flow.keep")}
                </span>
                <input
                    type="number"
                    min="1"
                    value={node.limit ?? 3}
                    oninput={(e) => onChange({ limit: Number(e.currentTarget.value) })}
                    class="w-16 rounded-lg border border-brand-sand-200 bg-white px-2 py-0.5 text-[0.6875rem] text-brand-charcoal-600 outline-none focus:border-brand-gold-400 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5] dark:focus:border-[#e5c890]"
                />
            </div>
            <p class="mt-1.5 text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                {$t("workbook.node.related_hint")}
            </p>
        {:else}
            <!-- ayah reads one or more verses, picked from dropdowns rather
                 than typed. What it resolves to is never shown here — wire a
                 View card downstream to see it. -->
            <div class="flex flex-wrap items-center gap-1.5" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                <div class="relative h-6 w-28">
                    <select
                        value={String(pickerSurah)}
                        onchange={(e) => {
                            pickerSurah = Number(e.currentTarget.value);
                            pickerAyah = 1;
                        }}
                        class="{dropdownClass} h-full"
                    >
                        {#each $surahLabels as label, i (i)}
                            <option value={String(i + 1)}>{i + 1}. {label.en}</option>
                        {/each}
                    </select>
                    {@render dropdownChevron()}
                </div>
                <div class="relative h-6 w-16">
                    <select
                        value={String(pickerAyah)}
                        onchange={(e) => (pickerAyah = Number(e.currentTarget.value))}
                        class="{dropdownClass} h-full"
                    >
                        {#each Array.from({ length: SURAH_AYAH_COUNTS[pickerSurah] ?? 1 }, (_, i) => i + 1) as ayahNum (ayahNum)}
                            <option value={String(ayahNum)}>{ayahNum}</option>
                        {/each}
                    </select>
                    {@render dropdownChevron()}
                </div>
                <button
                    onclick={addRef}
                    title={$t("workbook.verse.add")}
                    aria-label={$t("workbook.verse.add")}
                    class="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-brand-sand-200 text-brand-charcoal-400 transition-colors hover:bg-brand-sand-100 dark:border-[#414559] dark:text-[#838ba7] dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:add-circle-bold-duotone" width="0.8rem" />
                </button>
            </div>
            {#if refs.length}
                <div class="mt-1.5 flex flex-wrap items-center gap-1" onpointerdown={(e) => e.stopPropagation()} role="presentation">
                    {#each refs as ref (ref)}
                        <span class="inline-flex items-center gap-1 rounded-full border border-brand-sand-200 bg-brand-sand-100 py-0.5 pl-2 pr-1 text-[0.625rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5]">
                            {ref}
                            <button
                                onclick={() => removeRef(ref)}
                                aria-label={$t("workbook.verse.remove", { ref })}
                                class="flex h-3.5 w-3.5 cursor-pointer items-center justify-center rounded-full text-brand-charcoal-300 transition-colors hover:text-red-500 dark:text-[#838ba7]"
                            >
                                <Icon icon="solar:close-circle-bold-duotone" width="0.6rem" />
                            </button>
                        </span>
                    {/each}
                </div>
            {/if}
            {#if error}
                <p class="mt-1.5 text-[0.625rem] text-red-500 dark:text-red-400">{error}</p>
            {/if}
        {/if}
    </div>

    <!-- Ports — one input, one output, on every data card so a wire can be
         started the moment it is on the board. The board owns the wire
         itself; a port only starts the drag. -->
    {#if hasPort}
        <button
            onpointerdown={(e) => {
                e.stopPropagation();
                onPortDragStart(e, "in");
            }}
            title={$t("workbook.port.in")}
            aria-label={$t("workbook.port.in")}
            class="port-dot -left-[7px] {ACCENT[node.kind].dot}"
        ></button>
        <button
            onpointerdown={(e) => {
                e.stopPropagation();
                onPortDragStart(e, "out");
            }}
            title={$t("workbook.port.out")}
            aria-label={$t("workbook.port.out")}
            class="port-dot -right-[7px] {ACCENT[node.kind].dot}"
        ></button>
    {/if}

    <!-- Resize handle — same double-arc corner as FileExplorer's panel. -->
    <button
        onpointerdown={onResizeStart}
        aria-label={$t("workbook.resize")}
        class="resize-handle resize-se"
    ></button>
</div>

<style>
    /* Which node is actively recomputing — lit for as long as `loading` is
       true, whether that came from Live mode's own reactive reload or a
       Manual Run. A pulsing ring rather than the small header spinner alone,
       so it reads at a glance across a board full of cards. */
    .node-running {
        animation: node-pulse 1.1s ease-in-out infinite;
    }
    @keyframes node-pulse {
        0%,
        100% {
            box-shadow: 0 0 0 2px rgba(212, 165, 74, 0.55);
        }
        50% {
            box-shadow: 0 0 0 5px rgba(212, 165, 74, 0.05);
        }
    }
    :global(.dark) .node-running {
        animation-name: node-pulse-dark;
    }
    @keyframes node-pulse-dark {
        0%,
        100% {
            box-shadow: 0 0 0 2px rgba(229, 200, 144, 0.6);
        }
        50% {
            box-shadow: 0 0 0 5px rgba(229, 200, 144, 0.05);
        }
    }

    /* Matches FileExplorer.svelte's resize-handle corner exactly, so every
       resizable surface in the app reads the same. Only the SE corner is
       used here — cards resize from one corner, not four edges. */
    .resize-handle {
        position: absolute;
        z-index: 10;
        background: transparent;
        cursor: se-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 11px;
        right: 11px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 7px;
        right: 7px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }

    /* Input/output ports: a small filled dot straddling the card edge,
       ringed in the card's own background so it reads as a socket rather
       than a stray mark. */
    .port-dot {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        width: 14px;
        height: 14px;
        border-radius: 9999px;
        border: 2px solid white;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.12);
        cursor: crosshair;
        z-index: 15;
        transition: transform 0.15s ease;
    }
    :global(.dark) .port-dot {
        border-color: #292c3c;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
    }
    .port-dot:hover {
        transform: translateY(-50%) scale(1.3);
    }
</style>
