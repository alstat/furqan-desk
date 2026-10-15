<!--
  The R and Python REPL.

  A transcript with the app's own prompt beneath it, the shape the Julia pane
  established — not a terminal emulator. The interpreter runs on pipes (see
  `script_repl.rs`), which is what makes that shape possible: on a PTY it would
  echo every line back and wrap its output in cursor escapes meant for a
  terminal grid, so the transcript would show each statement twice and carry
  control codes through. The cost is that the interpreter's own line editing is
  gone, so this supplies the prompt, the history and the editing instead.
-->
<script lang="ts">
    import { onDestroy, onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        replFontSize,
        replInputHeights,
        replLineSpacing,
        uiFontScale,
        REPL_INPUT_DEFAULT_LINES,
        REPL_INPUT_MAX_HEIGHT,
        REPL_INPUT_MIN_HEIGHT,
        REPL_INPUT_PADDING,
    } from "$lib/stores/editor.store";
    import SeamHighlight from "$lib/components/shared/SeamHighlight.svelte";
    import { observeHeight } from "$lib/utils/observeHeight";
    import { resizeDrag } from "$lib/utils/resizeDrag";
    import { frameTask } from "$lib/utils/frameTask";
    import { openFolderPath } from "$lib/stores/tabs.store";
    import {
        SCRIPT_LANGUAGES,
        replArgsFor,
        type ScriptLanguageId,
    } from "$lib/languages/scriptLanguages";
    import {
        detectScriptLanguage,
        openScriptInstallPrompt,
        type ScriptBinary,
    } from "$lib/stores/script-install.store";
    import {
        registerScriptRepl,
        replSessionState,
        type ReplLine,
    } from "$lib/stores/script-repl.store";
    import { stripPrompts } from "$lib/languages/scriptReplOutput";
    import {
        parsePlotMarker,
        plotFlushFor,
        plotHookFor,
    } from "$lib/languages/scriptPlotHooks";
    import { juliaPlots } from "$lib/stores/editor.store";
    import { openSettingsTo } from "$lib/stores/settings.store";
    import {
        PANE_HEADER_ROW,
        PANE_HEADER_ROW_FLAT,
        HEADER_PILL,
        HEADER_PILL_IDLE,
        HEADER_PILL_ACCENT,
    } from "$lib/styles/editorChrome";

    let {
        language,
        flat = false,
        embedded = false,
    }: {
        language: ScriptLanguageId;
        flat?: boolean;
        /** Mounted under an editor rather than filling the right-hand column. */
        embedded?: boolean;
    } = $props();

    const spec = $derived(SCRIPT_LANGUAGES[language]);

    /** Mod is Cmd on Apple platforms, Ctrl elsewhere — as CodeMirror binds it. */
    const IS_APPLE =
        typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    /** The prompt this language shows, as the interpreter itself would. */
    const prompt = $derived(language === "r" ? ">" : ">>>");

    /**
     * This language's transcript and history, which outlive the pane: the
     * right-hand column reuses one pane for whichever script file is active,
     * so a component that kept them would show R's transcript under Python's
     * prompt. The call sites key the pane on the language as well, so every
     * other piece of state here is this language's by construction.
     */
    const session = replSessionState(language);

    // `$state.raw`, not `$state`: the transcript is only ever replaced, never
    // edited in place, and a deep proxy would be re-wrapped around the stored
    // array every time the pane is remade for this language.
    let lines = $state.raw<ReplLine[]>(session.lines);
    let input = $state("");
    let history: string[] = session.history;
    let historyIndex = $state(-1);
    let savedInput = "";

    let binary = $state<ScriptBinary | null>(null);
    let missing = $state(false);
    let running = $state(false);
    let starting = $state(false);

    let outputEl = $state<HTMLDivElement | null>(null);
    let inputEl = $state<HTMLTextAreaElement | null>(null);

    // ── Input box height (drag the seam above the prompt) ────────────────────
    // The same arrangement as the Julia pane's, down to the slot names: one
    // line under an editor, seven in the right-hand column, and whatever the
    // user drags it to after that.

    /** This pane's own header row — `h-8`, which scales with the UI font. */
    const REPL_HEADER_HEIGHT = 32;

    const inputSlot = $derived(embedded ? "script-embedded" : "script-panel");
    const lineHeightPx = $derived(
        $replFontSize * $replLineSpacing * $uiFontScale,
    );
    const inputMinHeight = $derived(REPL_INPUT_MIN_HEIGHT * $uiFontScale);
    const inputPadding = $derived(REPL_INPUT_PADDING * $uiFontScale);

    // Measured rather than observed: the pane's height comes from its parent's
    // layout and does not depend on the input box, so reading it here cannot
    // feed back into itself.
    let paneHeight = $state(0);

    // What the output keeps when the prompt is at its tallest: the header plus
    // about two lines, so the last result stays visible. The rest is the
    // user's — which is what keeps the prompt reachable when a tall bottom
    // dock is covering the lower part of the window.
    const inputMaxHeight = $derived(
        paneHeight > 0
            ? Math.max(
                  inputMinHeight,
                  paneHeight -
                      REPL_HEADER_HEIGHT * $uiFontScale -
                      2 * lineHeightPx,
              )
            : REPL_INPUT_MAX_HEIGHT * $uiFontScale,
    );

    function heightForLines(lines: number): number {
        return Math.round(lines * lineHeightPx) + inputPadding;
    }

    const defaultInputHeight = $derived(
        heightForLines(REPL_INPUT_DEFAULT_LINES[inputSlot]),
    );

    // The box still opens out to fit what has been typed.
    // Keep drag frames local; saving the shared preference is release-only.
    let draggedInputHeight = $state<number | null>(null);
    const inputHeight = $derived(
        Math.min(
            inputMaxHeight,
            Math.max(
                draggedInputHeight ?? ($replInputHeights[inputSlot] == null
                    ? defaultInputHeight
                    : $replInputHeights[inputSlot]! * $uiFontScale),
                heightForLines((input.match(/\n/g) ?? []).length + 1),
                inputMinHeight,
            ),
        ),
    );

    let inputDragging = $state(false);

    // The grab strip is invisible and overlaps the prompt's top border by
    // 3.5px, putting its midline through that 1px border — where the seam's
    // highlight draws — so the line that lights up is the line that moves.
    let seamHover = $state(false);
    let seamFocused = $state(false);
    const seamActive = $derived(inputDragging || seamHover || seamFocused);
    let seamCursorX = $state(0);

    function trackSeamCursor(e: PointerEvent) {
        if (inputDragging) return;
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        seamCursorX = e.clientX - rect.left;
    }

    function startInputDrag(e: PointerEvent) {
        const startHeight = inputHeight;
        const left = (e.currentTarget as HTMLElement).getBoundingClientRect().left;
        const scale = $uiFontScale;
        const slot = inputSlot;
        const maxHeight = Math.min(inputMaxHeight, REPL_INPUT_MAX_HEIGHT * scale);
        inputDragging = true;
        return {
            move(ev: PointerEvent) {
                seamCursorX = ev.clientX - left;
                // The seam is above the prompt: dragging up makes it taller.
                draggedInputHeight = Math.max(inputMinHeight,
                    Math.min(maxHeight, startHeight + e.clientY - ev.clientY));
            },
            end() {
                if (draggedInputHeight !== null) {
                    replInputHeights.setHeight(slot, inputHeight / scale);
                }
                draggedInputHeight = null;
                inputDragging = false;
            },
        };
    }

    function nudgeInputHeight(e: KeyboardEvent) {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowUp") {
            e.preventDefault();
            replInputHeights.setHeight(
                inputSlot,
                inputHeight / $uiFontScale + step,
            );
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            replInputHeights.setHeight(
                inputSlot,
                inputHeight / $uiFontScale - step,
            );
        }
    }

    /** One session per language, shared by every file of that kind. */
    const sessionId = $derived(`script-repl:${language}`);

    let unlistenOutput: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;

    function push(kind: ReplLine["kind"], text: string) {
        lines = [...lines, { kind, text }];
        session.lines = lines;
        outputScroll.schedule();
    }

    // Coalesce streaming chunks into one layout read/scroll per painted frame.
    const outputScroll = frameTask(() => {
        if (outputEl) outputEl.scrollTop = outputEl.scrollHeight;
    });

    // ── Session ──────────────────────────────────────────────────────────────

    async function start(): Promise<void> {
        if (running || starting) return;
        starting = true;
        try {
            const found = await detectScriptLanguage(language);
            binary = found;
            missing = !found;
            if (!found) return;

            await ensureListeners();
            await invoke("start_script_repl", {
                id: sessionId,
                program: found.path,
                args: replArgsFor(language),
                cwd: $openFolderPath,
            });
            running = true;

            // Plot capture, installed before anything the user runs. Neither
            // interpreter echoes what it reads (see `replArgsFor`), so this
            // leaves no trace in the transcript. Once per session, not once
            // per pane: the pane is remade whenever the active file changes
            // language, and the interpreter it reattaches to is still the one
            // that was already set up.
            const hook = session.hooked ? null : plotHookFor(language);
            if (hook) {
                await invoke("script_repl_write", {
                    id: sessionId,
                    text: hook,
                })
                    .then(() => {
                        session.hooked = true;
                    })
                    .catch(() => {
                        /* a session without plot capture still works */
                    });
            }
        } catch (e) {
            push("err", String(e));
        } finally {
            starting = false;
        }
    }

    async function ensureListeners(): Promise<void> {
        unlistenOutput ??= await listen<{
            id: string;
            stream: string;
            text: string;
        }>("script-repl-output", (e) => {
            if (e.payload.id !== sessionId) return;

            // Reading from a pipe, both interpreters still write the prompt
            // they would show a terminal, and write it with no newline after
            // it — so it arrives stuck to the front of the next line of real
            // output. The pane draws its own prompt, so it comes off first,
            // before anything tries to read the line.
            const text = stripPrompts(e.payload.text);
            if (text === null) return;

            // A finished plot: fetch the bytes and hand them to the viewer.
            const marker = parsePlotMarker(text);
            if (marker) {
                void collectPlot(marker.format, marker.path);
                return;
            }

            // Both languages write prompts and warnings to stderr, so stderr is
            // not treated as failure — only coloured differently.
            push(e.payload.stream === "stderr" ? "err" : "out", text);
        });
        unlistenExit ??= await listen<{ id: string }>(
            "script-repl-exit",
            (e) => {
                if (e.payload.id !== sessionId) return;
                running = false;
                // The interpreter is gone, so the hook it was carrying is too.
                session.hooked = false;
                push("info", $t("script_repl.session_ended"));
            },
        );
    }

    async function collectPlot(
        format: "png" | "svg" | "plotly",
        path: string,
    ): Promise<void> {
        try {
            const data = await invoke<string>("read_plot_file", { path });
            juliaPlots.update((plots) => [
                ...plots,
                {
                    id: crypto.randomUUID(),
                    format,
                    data,
                    timestamp: Date.now(),
                },
            ]);
            // Nothing is revealed here: this app shows plots in a window of
            // their own, which the user opens from the sidebar, and its Julia
            // REPL publishes the same way — a plot arriving must not take the
            // screen away from what is being written.
        } catch (e) {
            push("info", String(e));
        }
    }

    async function stop(): Promise<void> {
        try {
            await invoke("script_repl_kill", { id: sessionId });
        } catch {
            /* already gone */
        }
        running = false;
        session.hooked = false;
    }

    async function restart(): Promise<void> {
        await stop();
        lines = [];
        session.lines = lines;
        // The exit watcher clears the session asynchronously; starting straight
        // away would be refused as "already running".
        await new Promise((r) => setTimeout(r, 300));
        await start();
    }

    async function interrupt(): Promise<void> {
        if (!running) return;
        try {
            await invoke("script_repl_interrupt", { id: sessionId });
        } catch (e) {
            push("info", String(e));
        }
    }

    /** Send code to the session — the editor's Run command arrives here. */
    export async function send(code: string): Promise<void> {
        if (!running) await start();
        if (!running) return;
        for (const line of code.replace(/\s+$/, "").split("\n")) {
            push("input", line);
        }
        // R's task callback fires on its own; Python needs the flush appended
        // (see `plotFlushFor`), after a blank line that also closes any block
        // the user just defined.
        const flush = plotFlushFor(language);
        await invoke("script_repl_write", {
            id: sessionId,
            text: flush ? `${code}\n${flush}` : code,
        }).catch((e) => push("err", String(e)));
    }

    async function submit(): Promise<void> {
        const text = input;
        if (!text.trim()) return;
        input = "";
        historyIndex = -1;
        history = [...history.filter((h) => h !== text), text];
        session.history = history;
        await send(text);
        inputEl?.focus();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
            return;
        }
        // Arrow-key history, but only from the edges of the box, so a
        // multi-line paste can still be navigated normally.
        const el = e.currentTarget as HTMLTextAreaElement;
        if (e.key === "ArrowUp" && el.selectionStart === 0) {
            if (!history.length) return;
            e.preventDefault();
            if (historyIndex === -1) savedInput = input;
            historyIndex = Math.min(historyIndex + 1, history.length - 1);
            input = history[history.length - 1 - historyIndex];
        } else if (
            e.key === "ArrowDown" &&
            el.selectionStart === el.value.length
        ) {
            if (historyIndex === -1) return;
            e.preventDefault();
            historyIndex -= 1;
            input =
                historyIndex === -1
                    ? savedInput
                    : history[history.length - 1 - historyIndex];
        }
    }

    onMount(() => {
        const unregister = registerScriptRepl(language, send);
        void start();
        return () => unregister();
    });

    onDestroy(() => {
        outputScroll.cancel();
        // The listeners go; the interpreter does not, so a tab switch or a
        // split being made and dissolved returns to the same session.
        unlistenOutput?.();
        unlistenExit?.();
        unlistenOutput = null;
        unlistenExit = null;
    });
</script>

<div
    use:observeHeight={(h) => (paneHeight = h)}
    class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    style="--repl-font-size: {$replFontSize / 16}rem; --repl-line-height: {$replLineSpacing};"
>
    <div class={flat ? PANE_HEADER_ROW_FLAT : PANE_HEADER_ROW}>
        <span class="flex min-w-0 items-center gap-1.5">
            <Icon icon={spec.icon} width="0.85rem" class="shrink-0" />
            <span
                class="text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {spec.label}
                {$t("script_repl.title")}
            </span>
            {#if binary}
                <span
                    class="truncate text-[0.625rem] text-brand-charcoal-300 dark:text-[#626880]"
                    title={binary.path}
                >
                    {binary.version}
                </span>
            {/if}
        </span>

        <span class="flex shrink-0 items-center gap-1.5">
            {#if running}
                <button
                    onclick={interrupt}
                    class="{HEADER_PILL} {HEADER_PILL_IDLE}"
                    title={$t("script_repl.interrupt")}
                >
                    <Icon icon="solar:stop-circle-bold-duotone" width="0.6875rem" />
                    {$t("script_repl.interrupt")}
                </button>
            {/if}
            <button
                onclick={restart}
                class="{HEADER_PILL} {HEADER_PILL_ACCENT}"
                title={$t("script_repl.restart")}
            >
                <Icon icon="solar:restart-bold-duotone" width="0.6875rem" />
                {$t("script_repl.restart")}
            </button>
        </span>
    </div>

    <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <!-- Transcript -->
        <div
            bind:this={outputEl}
            class="default-scroll repl-mono min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono"
            role="log"
            aria-label={$t("script_repl.output_label")}
        >
            {#if missing}
                <!-- The body says what is wrong, rather than the pane simply
                     sitting empty with a prompt that would never answer. -->
                <div class="flex flex-col items-start gap-2">
                    <p class="text-brand-charcoal-500 dark:text-[#c6d0f5]">
                        {$t("script_repl.not_installed", {
                            language: spec.label,
                        })}
                    </p>
                    <p
                        class="text-[0.6875rem] text-brand-charcoal-300 italic dark:text-[#626880]"
                    >
                        {$t("script_repl.not_installed_hint", {
                            language: spec.label,
                        })}
                    </p>
                    <div class="mt-1 flex flex-wrap items-center gap-1.5">
                        <button
                            onclick={() => openScriptInstallPrompt(language)}
                            class="{HEADER_PILL} {HEADER_PILL_ACCENT}"
                        >
                            {$t("script_repl.how_to_install")}
                        </button>
                        <button
                            onclick={() => openSettingsTo("languages")}
                            class="{HEADER_PILL} {HEADER_PILL_IDLE}"
                        >
                            <Icon icon="solar:settings-bold-duotone" width="0.6875rem" />
                            {$t("script_repl.open_settings")}
                        </button>
                        <button
                            onclick={() => {
                                void detectScriptLanguage(language, true).then(
                                    (found) => {
                                        binary = found;
                                        missing = !found;
                                        if (found) void start();
                                    },
                                );
                            }}
                            class="{HEADER_PILL} {HEADER_PILL_IDLE}"
                        >
                            {$t("script_install.recheck")}
                        </button>
                    </div>
                </div>
            {:else if lines.length === 0}
                <p class="text-brand-charcoal-300 italic select-none dark:text-[#626880]">
                    {$t("script_repl.empty_hint", {
                        language: spec.label,
                        shortcut: IS_APPLE ? "⌘Enter" : "Ctrl+Enter",
                    })}
                </p>
            {:else}
                {#each lines as line}
                    {#if line.kind === "input"}
                        <div class="mt-1 flex gap-1.5 first:mt-0">
                            <span
                                class="shrink-0 font-semibold text-brand-gold-600 select-none"
                                >{prompt}</span
                            >
                            <span
                                class="whitespace-pre-wrap text-brand-charcoal-500 dark:text-[#c6d0f5]"
                                >{line.text}</span
                            >
                        </div>
                    {:else if line.kind === "err"}
                        <div class="whitespace-pre-wrap text-red-400">
                            {line.text}
                        </div>
                    {:else if line.kind === "info"}
                        <div
                            class="whitespace-pre-wrap text-brand-charcoal-300 italic dark:text-[#838ba7]"
                        >
                            {line.text}
                        </div>
                    {:else}
                        <div
                            class="whitespace-pre-wrap text-brand-charcoal-700 dark:text-[#c6d0f5]"
                        >
                            {line.text}
                        </div>
                    {/if}
                {/each}
            {/if}
        </div>

        <!-- Resize seam: drag (or arrow-key) to set the input box height. A
             focusable separator is the ARIA window-splitter pattern, which the
             linter reads as a non-interactive element. -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        {#if !missing}
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={$t("script_repl.resize_input")}
                aria-valuenow={inputHeight}
                aria-valuemin={inputMinHeight}
                aria-valuemax={inputMaxHeight}
                tabindex="0"
                title={$t("script_repl.resize_input")}
                use:resizeDrag={{ cursor: "row-resize", start: startInputDrag }}
                onpointermove={trackSeamCursor}
                onpointerenter={() => (seamHover = true)}
                onpointerleave={() => (seamHover = false)}
                onfocus={() => (seamFocused = true)}
                onblur={() => (seamFocused = false)}
                onkeydown={nudgeInputHeight}
                ondblclick={() => replInputHeights.reset(inputSlot)}
                class="relative z-10 -mb-[3.5px] h-1.5 shrink-0 cursor-row-resize touch-none outline-none"
            >
                <SeamHighlight
                    active={seamActive}
                    dragging={inputDragging}
                    cursor={seamCursorX}
                />
            </div>

            <!-- Prompt -->
            <div
                style:height="{inputHeight}px"
                class="flex shrink-0 items-start gap-2 border-t border-brand-sand-200 px-3 py-1.5 dark:border-[#414559]"
            >
                <span
                    class="repl-mono shrink-0 font-mono font-semibold text-brand-gold-600 select-none"
                    >{prompt}</span
                >
                <textarea
                    bind:this={inputEl}
                    bind:value={input}
                    onkeydown={handleKeydown}
                    placeholder={$t("script_repl.input_placeholder", {
                        language: spec.label,
                    })}
                    rows="1"
                    spellcheck="false"
                    class="default-scroll repl-mono h-full flex-1 resize-none bg-transparent font-mono text-brand-charcoal-700 outline-none placeholder:text-brand-charcoal-300 dark:text-[#c6d0f5] dark:placeholder:text-[#626880]"
                ></textarea>
            </div>
        {/if}
    </div>
</div>
