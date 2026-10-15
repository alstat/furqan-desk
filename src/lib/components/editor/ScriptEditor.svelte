<!--
  The editor for a runnable script file — R or Python.

  It is the shape JuliaEditor established: the file's name and controls in a
  header, the code below it, and the language's REPL docked under that (or
  hidden, when the split layout has moved the REPL into the right-hand column).
  What it does *not* copy is Julia's machinery for cells, go-to-definition and
  source formatting, none of which exists for these two yet; the parts that are
  purely layout come from the shared chrome so all four editors line up.
-->
<script lang="ts">
    import { get } from "svelte/store";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
    import ScriptReplPane from "./ScriptReplPane.svelte";
    import SpellLanguageSelector from "./SpellLanguageSelector.svelte";
    import { activeTab, activeTabId, tabs, setTabContent } from "$lib/stores/tabs.store";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { crossGroups } from "$lib/stores/julia-terminal.store";
    import {
        SCRIPT_LANGUAGES,
        type ScriptLanguageId,
    } from "$lib/languages/scriptLanguages";
    import { requireScriptLanguage } from "$lib/stores/script-install.store";
    import { runInScriptRepl } from "$lib/stores/script-repl.store";
    import {
        enclosingStatementRange,
        nextCodeLine,
    } from "$lib/languages/scriptStatements";
    import type { KeyBinding } from "@codemirror/view";
    import {
        EDITOR_HEADER_ROW,
        EDITOR_BOTTOM_GUTTER,
        PANE_DEFAULT_HEIGHT,
        HEADER_PILL,
        HEADER_PILL_IDLE,
        HEADER_PILL_ACCENT,
    } from "$lib/styles/editorChrome";

    let {
        tabId = null,
        hideRepl = false,
    }: { tabId?: string | null; hideRepl?: boolean } = $props();

    let effectiveTab = $derived(
        tabId ? ($tabs.find((t) => t.id === tabId) ?? null) : $activeTab,
    );

    /** The language is the tab's own type — `r` or `python`. */
    const language = $derived(
        (effectiveTab?.type ?? "python") as ScriptLanguageId,
    );
    const spec = $derived(SCRIPT_LANGUAGES[language]);

    let editorScrollKey = $derived(effectiveTab?.path ?? effectiveTab?.id ?? null);
    let lineWrap = $state(true);

    /** Same rule as the other editors: half of a split is a flush panel. */
    let inSplit = $derived(
        !!effectiveTab &&
            $crossGroups.some(
                (g) =>
                    g.hostTabId === effectiveTab!.id ||
                    g.partnerTabId === effectiveTab!.id,
            ),
    );

    function handleInput(newContent: string) {
        if (tabId) setTabContent(tabId, newContent);
        else {
            const id = get(activeTabId);
            if (id) setTabContent(id, newContent);
        }
    }

    /**
     * Ctrl+Enter (Cmd+Enter on macOS): run where the cursor is, then move on.
     *
     * The same contract the Julia editor offers. With a selection, that text
     * runs. Without one, the whole top-level statement the cursor sits in runs
     * — so pressing it anywhere inside a function re-runs that entire function
     * rather than one line of its body — and the cursor then lands on the next
     * line that actually holds code, so repeated presses walk the file
     * statement by statement instead of stopping on every blank and comment.
     */
    const scriptKeymap: KeyBinding[] = [
        {
            key: "Mod-Enter",
            run(view) {
                const { from, to } = view.state.selection.main;
                if (from !== to) {
                    void runSnippet(view.state.sliceDoc(from, to));
                    return true;
                }

                const doc = view.state.doc;
                const lines = doc.toString().split("\n");
                const cursorLine = doc.lineAt(from).number;
                const { start, end } = enclosingStatementRange(
                    language,
                    lines,
                    cursorLine,
                );
                void runSnippet(
                    doc.sliceString(doc.line(start).from, doc.line(end).to),
                );

                const target = nextCodeLine(lines, end + 1);
                if (target !== null) {
                    view.dispatch({
                        selection: { anchor: doc.line(target).from },
                        scrollIntoView: true,
                    });
                }
                return true;
            },
        },
    ];

    /** Focusing a pane makes its tab the active one, as the other editors do. */
    function activateThisTab() {
        if (tabId && get(activeTabId) !== tabId) activeTabId.set(tabId);
    }

    /**
     * Run the file in the REPL beside it.
     *
     * The whole buffer goes to the live session rather than to a fresh
     * interpreter, so anything the user has already defined at the prompt is
     * still there — and anything the file defines is available afterwards,
     * which is the point of having the REPL next to the editor.
     */
    /** Send one piece of code to this language's session. */
    async function runSnippet(code: string) {
        if (!code.trim()) return;
        if (!(await requireScriptLanguage(language))) return;
        await runInScriptRepl(language, code);
    }

    async function runFile() {
        await runSnippet(effectiveTab?.content ?? "");
    }

    // ── Docked REPL height ───────────────────────────────────────────────────

    let replHeight = $state(PANE_DEFAULT_HEIGHT);
    let dragging = $state(false);
    let dragStartY = 0;
    let dragStartHeight = 0;

    function startDrag(e: PointerEvent) {
        dragging = true;
        dragStartY = e.clientY;
        dragStartHeight = replHeight;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }
    function onDrag(e: PointerEvent) {
        if (!dragging) return;
        // The seam is above the pane, so dragging up makes it taller.
        replHeight = Math.max(120, dragStartHeight + (dragStartY - e.clientY));
    }
    function endDrag(e: PointerEvent) {
        if (!dragging) return;
        dragging = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
</script>

<div
    onfocusin={activateThisTab}
    class="relative flex h-full flex-col overflow-visible"
>
    <div class="flex min-h-0 flex-1 flex-col" style="min-height: 120px">
        <div class={EDITOR_HEADER_ROW}>
            <span
                class="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-300"
                >{effectiveTab?.name ?? `Untitled.${spec.defaultExtension}`}{#if effectiveTab?.isDirty}<span
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                    >
                        *</span
                    >{/if}</span
            >
            <div
                class="flex items-center gap-1.5 {$zenMode
                    ? $zenPeek
                        ? 'opacity-50 transition-opacity duration-200'
                        : 'opacity-0 transition-opacity duration-200 hover:opacity-100'
                    : ''}"
            >
                <SpellLanguageSelector />

                <button
                    onclick={runFile}
                    title={$t("script_editor.run_title")}
                    class="{HEADER_PILL} {HEADER_PILL_ACCENT}"
                >
                    <Icon icon="solar:play-bold-duotone" width="0.6875rem" />
                    {$t("script_editor.run")}
                </button>

                <button
                    onclick={() => (lineWrap = !lineWrap)}
                    title={lineWrap
                        ? $t("julia_cell.disable_wrap")
                        : $t("julia_cell.enable_wrap")}
                    class="{HEADER_PILL} {lineWrap
                        ? HEADER_PILL_IDLE
                        : HEADER_PILL_ACCENT}"
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
                    {lineWrap
                        ? $t("julia_editor.wrap")
                        : $t("julia_editor.no_wrap")}
                </button>
            </div>
        </div>
        {#if effectiveTab}
            <div
                class="mx-2 min-h-0 flex-1 overflow-hidden border border-brand-sand-200 {hideRepl
                    ? EDITOR_BOTTOM_GUTTER
                    : ''}"
            >
                <CodeMirrorEditor
                    value={effectiveTab?.content ?? ""}
                    language={spec.grammar}
                    extraKeymap={scriptKeymap}
                    {lineWrap}
                    filePath={effectiveTab?.path ?? null}
                    scrollKey={editorScrollKey}
                    ownerTabId={effectiveTab?.id ?? null}
                    onchange={handleInput}
                    class="h-full font-mono"
                />
            </div>
        {/if}
    </div>

    {#if !hideRepl}
        <!-- Resize seam, matching the one the Julia and Typst editors use. -->
        <div class="relative z-1 -mx-1 h-px flex-none select-none">
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={$t("script_repl.resize")}
                tabindex="0"
                onpointerdown={startDrag}
                onpointermove={onDrag}
                onpointerup={endDrag}
                onpointercancel={endDrag}
                ondblclick={() => (replHeight = PANE_DEFAULT_HEIGHT)}
                class="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 cursor-row-resize"
            ></div>
        </div>
        <div
            class="flex flex-none flex-col overflow-hidden {inSplit
                ? '-mx-1'
                : 'mx-2 mb-2 border border-brand-sand-200 dark:border-[#414559]'}"
            style:height="{replHeight}px"
        >
            <!-- Keyed as in `+page.svelte`: the editor follows the active
                 tab, so its language changes under the same component. -->
            {#key language}
                <ScriptReplPane {language} flat={inSplit} embedded={true} />
            {/key}
        </div>
    {/if}
</div>
