<script lang="ts">
    import { onMount } from "svelte";
    import { get } from "svelte/store";
    import { listen } from "@tauri-apps/api/event";
    import { IS_APPLE } from "@lexical/utils";
    import Icon from "@iconify/svelte";
    import {
        juliaIsRunning,
        executeJuliaCode,
        isIncompleteJulia,
    } from "$lib/stores/julia-terminal.store";
    import {
        juliaReplHistory,
        pushReplLines,
        juliaPlots,
        cmFontSize,
        replFontSize,
        replLineSpacing,
        replInputHeights,
        REPL_INPUT_MIN_HEIGHT,
        REPL_INPUT_MAX_HEIGHT,
        REPL_INPUT_PADDING,
        REPL_INPUT_DEFAULT_LINES,
        juliaReplStarted,
        juliaActiveEnv,
        type ReplLine,
    } from "$lib/stores/editor.store";
    import { invoke } from "@tauri-apps/api/core";
    import {
        selectedSurahIdx,
        morphologyAyahFilter,
        morphologyMultiSurahList,
    } from "$lib/stores/quran.svelte";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { recitationPlaylist } from "$lib/stores/recitation.store";
    import {
        multiSurahTranslationMap,
        multiSurahTransliterationMap,
        multiSurahWordByWordMap,
    } from "$lib/stores/translation.store";
    import { openFolderPath, tabs } from "$lib/stores/tabs.store";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";
    import { t } from "$lib/i18n";

    /** embedded — mounted under an editor rather than filling the right column. */
    let { embedded = false }: { embedded?: boolean } = $props();

    const askAiContextPrompt =
        "This text is part of a Julia programming file, help provide explanation or correction on the code";

    // ── REPL lines (reactive from shared store) ───────────────────────────────

    let replLines = $derived<ReplLine[]>($juliaReplHistory);

    // ── REPL input state ──────────────────────────────────────────────────────

    let replInput = $state("");
    let replCmdHistory: string[] = [];
    let historyIndex = $state(-1);
    let savedInput = "";
    let focusReplOnDone = false;
    let replMode = $state<"julia" | "pkg" | "shell" | "help">("julia");

    let replOutputEl: HTMLDivElement | undefined = $state(undefined);
    let replInputEl: HTMLTextAreaElement | undefined = $state(undefined);

    // ── AI selection toolbar over REPL output ────────────────────────────────
    let replAiSelection = $state<{
        text: string;
        x: number;
        y: number;
    } | null>(null);

    function isFocusInsideToolbar(): boolean {
        const active = document.activeElement as HTMLElement | null;
        return !!active?.closest("[data-ai-selection-toolbar]");
    }

    function updateReplAiSelection() {
        if (!$isPro || !replOutputEl) {
            replAiSelection = null;
            return;
        }
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
            // Keep the toolbar open while the user is typing in its input —
            // focusing the input collapses the document selection, which
            // would otherwise dismiss the toolbar immediately.
            if (isFocusInsideToolbar()) return;
            replAiSelection = null;
            return;
        }
        const range = sel.getRangeAt(0);
        // Only show the toolbar if the selection lives inside the REPL output.
        if (
            !replOutputEl.contains(range.startContainer) ||
            !replOutputEl.contains(range.endContainer)
        ) {
            replAiSelection = null;
            return;
        }
        const text = sel.toString();
        if (!text.trim()) {
            replAiSelection = null;
            return;
        }
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            replAiSelection = null;
            return;
        }
        const viewportWidth = window.innerWidth || 0;
        replAiSelection = {
            text,
            x: Math.max(
                180,
                Math.min(viewportWidth - 180, rect.left + rect.width / 2),
            ),
            y: Math.max(12, rect.top - 8),
        };
    }

    // ── Input box height (drag the seam above the prompt) ────────────────────

    // One line under an editor, seven in the right-hand column, unless the user
    // has dragged this slot to a height of their own.
    const inputSlot = $derived(embedded ? "embedded" : "panel");
    const lineHeightPx = $derived($replFontSize * $replLineSpacing);

    function heightForLines(lines: number): number {
        return Math.round(lines * lineHeightPx) + REPL_INPUT_PADDING;
    }

    const defaultInputHeight = $derived(
        heightForLines(REPL_INPUT_DEFAULT_LINES[inputSlot]),
    );

    // The box still opens out to fit what has been typed, the way it did when
    // its height came straight from the newline count.
    const inputHeight = $derived(
        Math.min(
            REPL_INPUT_MAX_HEIGHT,
            Math.max(
                $replInputHeights[inputSlot] ?? defaultInputHeight,
                heightForLines((replInput.match(/\n/g) ?? []).length + 1),
            ),
        ),
    );

    let inputDragging = $state(false);
    let inputDragStartY = 0;
    let inputDragStartHeight = 0;

    function startInputDrag(e: PointerEvent) {
        inputDragging = true;
        inputDragStartY = e.clientY;
        inputDragStartHeight = inputHeight;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
    }

    function onInputDrag(e: PointerEvent) {
        if (!inputDragging) return;
        // The seam is above the box, so dragging up makes it taller.
        replInputHeights.setHeight(
            inputSlot,
            inputDragStartHeight + (inputDragStartY - e.clientY),
        );
    }

    function endInputDrag(e: PointerEvent) {
        if (!inputDragging) return;
        inputDragging = false;
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }

    function nudgeInputHeight(e: KeyboardEvent) {
        const step = e.shiftKey ? 32 : 8;
        if (e.key === "ArrowUp") {
            e.preventDefault();
            replInputHeights.setHeight(inputSlot, inputHeight + step);
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            replInputHeights.setHeight(inputSlot, inputHeight - step);
        }
    }

    let isRunning = $derived($juliaIsRunning);
    let isStreaming = $state(false);
    let streamingTimer: ReturnType<typeof setTimeout> | null = null;

    // ── Spinner & precompile progress ─────────────────────────────────────────
    const SPINNER_FRAMES = ["◒", "◓", "◑", "◐"];
    let spinnerFrame = $state(0);

    $effect(() => {
        if (!(isRunning || isStreaming)) return;
        const interval = setInterval(() => {
            spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
        }, 120);
        return () => clearInterval(interval);
    });

    // Clear REPL history when the last Julia tab is closed so a newly opened
    // Julia file always starts with a fresh REPL display.
    $effect(() => {
        const juliaTabCount = $tabs.filter((t) => t.type === "julia").length;
        if (juliaTabCount === 0) {
            juliaReplHistory.set([]);
        }
    });

    function noAutocorrect(node: HTMLElement) {
        node.setAttribute("autocorrect", "off");
        node.setAttribute("autocapitalize", "off");
    }

    interface PrecompileState {
        active: boolean;
        total: number; // 0 = unknown
        done: number;
        inProgress: string[];
    }

    let precompile = $state<PrecompileState>({
        active: false,
        total: 0,
        done: 0,
        inProgress: [],
    });

    // Names of packages already reported done. Dedupes Julia's fancy-mode
    // redraws (which reprint the same ✓ lines) so the count stays accurate, and
    // over a pipe — where Julia emits no live counter — it's the only signal we
    // have for how many packages have finished.
    let precompileCompleted = new Set<string>();

    function resetPrecompile(): void {
        precompile = { active: false, total: 0, done: 0, inProgress: [] };
        precompileCompleted = new Set();
    }

    // Julia's Pkg precompiler redraws its progress UI with ANSI escape codes and
    // carriage returns. Strip the escapes and collapse each line to the text
    // after its last carriage return (what a terminal would actually show) so the
    // REPL view stays clean and the progress parser sees real values.
    // eslint-disable-next-line no-control-regex
    const ANSI_RE = /\x1b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g;
    function cleanTerminalLine(line: string): string {
        // Drop a trailing CR first (CRLF line endings), then collapse any
        // in-place progress redraws by keeping the text after the last CR.
        let s = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (s.includes("\r")) s = s.slice(s.lastIndexOf("\r") + 1);
        return s.replace(ANSI_RE, "");
    }

    function parsePrecompileChunk(text: string): void {
        for (const line of text.split("\n")) {
            // Activate on "Precompiling …" anywhere (covers both
            // "Precompiling project…" and "[ Info: Precompiling Foo …]").
            if (/Precompiling\b/.test(line)) {
                precompile.active = true;
                const countMatch = line.match(/(\d+)\s+(?:package|dependenc)/i);
                if (countMatch) {
                    precompile.total = parseInt(countMatch[1]);
                }
            }
            if (!precompile.active) continue;

            // When Julia is attached to a TTY it prints an authoritative
            // "done/total" counter — prefer it for BOTH values so the bar
            // tracks real progress rather than our ✓-counting estimate.
            const frac = line.match(/\b(\d+)\s*\/\s*(\d+)\b/);
            if (frac) {
                precompile.done = parseInt(frac[1]);
                precompile.total = parseInt(frac[2]);
            }

            // In-progress package spinner: ◒ ◓ ◑ ◐ ⌛ ⏳ ● ○ (matched anywhere
            // in case a stray control char survives cleaning).
            const inProgressMatch = line.match(/[◒◓◑◐⌛⏳●○]\s+(\S+)/);
            if (inProgressMatch) {
                const pkg = inProgressMatch[1];
                if (
                    !precompileCompleted.has(pkg) &&
                    !precompile.inProgress.includes(pkg)
                ) {
                    precompile.inProgress = [...precompile.inProgress, pkg];
                }
            }
            // Completed package: ✓ / ✔ PackageName, matched anywhere in the line.
            // Dedupe by name so redraws don't over-count; over a pipe this count
            // is the only progress signal (no live "done/total" counter exists).
            const doneMatch = line.match(/[✓✔]\s+(\S+)/);
            if (doneMatch) {
                const pkg = doneMatch[1];
                precompile.inProgress = precompile.inProgress.filter(
                    (p) => p !== pkg,
                );
                if (!precompileCompleted.has(pkg)) {
                    precompileCompleted.add(pkg);
                    if (!frac) precompile.done = precompileCompleted.size;
                }
            }
            // Final summary line carries the total even in non-TTY mode.
            const summary = line.match(
                /(\d+)\s+(?:dependenc\w+|packages?)\s+successfully\s+precompiled/i,
            );
            if (summary && precompile.total === 0) {
                precompile.total = parseInt(summary[1]);
            }
        }
    }

    // ── REPL helpers ──────────────────────────────────────────────────────────

    function scrollReplToBottom() {
        if (replOutputEl) {
            setTimeout(() => {
                replOutputEl!.scrollTop = replOutputEl!.scrollHeight;
            }, 0);
        }
    }

    function classifyOutput(
        text: string,
        isStderr: boolean,
    ): "error" | "warn" | "output" {
        if (!isStderr) return "output";
        const infoPatterns = [
            /^\s*\[ (Info|Warning|Debug)/,
            /^\s*┌ (Info|Warning|Debug)/,
            /^\s*│/,
            /^\s*└/,
            /^\s*Resolving /,
            /^\s*Installed /,
            /^\s*Updating /,
            /^\s*Precompiling /,
            /^\s*Progress /,
            /^\s*\d+ dependenc/,
            /^\s*[✓⌛●○]/,
            /^\s*\[[\d=>\s]+\]/,
        ];
        if (infoPatterns.some((p) => p.test(text))) return "warn";
        return "error";
    }

    function clearRepl() {
        juliaReplHistory.set([]);
    }

    async function restartRepl() {
        juliaIsRunning.set(false);
        try {
            await invoke("stop_julia_repl");
        } catch {
            /* ignore */
        }
        juliaReplStarted.set(false);
        juliaReplHistory.set([]);
        juliaActiveEnv.set("");
        resetPrecompile();
    }

    async function runReplInput() {
        const code = replInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        if (!code.trim() || isRunning || isStreaming) return;
        const modeAtSubmit = replMode;
        replInput = "";
        historyIndex = -1;
        savedInput = "";
        replCmdHistory = [code, ...replCmdHistory];
        focusReplOnDone = true;
        // Return to default Julia mode after each submission, mirroring the
        // upstream Julia REPL where pkg/shell modes are single-command.
        replMode = "julia";
        await executeJuliaCode(code, undefined, modeAtSubmit);
    }

    function insertNewlineAtCaret() {
        const el = replInputEl!;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        replInput = replInput.slice(0, start) + "\n" + replInput.slice(end);
        requestAnimationFrame(() => {
            el.selectionStart = el.selectionEnd = start + 1;
        });
    }

    function handleReplKeydown(e: KeyboardEvent) {
        // Mode switching (Julia REPL convention): on an empty input, "]" enters
        // pkg mode, ";" enters shell mode, and "?" enters help mode.
        // The character itself is NOT added to the input.
        if (
            replMode === "julia" &&
            replInput === "" &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey
        ) {
            if (e.key === "]" && !e.shiftKey) {
                e.preventDefault();
                replMode = "pkg";
                return;
            }
            if (e.key === ";" && !e.shiftKey) {
                e.preventDefault();
                replMode = "shell";
                return;
            }
            // "?" is Shift+/ on most keyboards, so shiftKey will be true — check
            // the resulting character directly rather than gating on !shiftKey.
            if (e.key === "?") {
                e.preventDefault();
                replMode = "help";
                return;
            }
        }
        // Backspace at the very start of an empty input returns to julia mode.
        if (
            e.key === "Backspace" &&
            replMode !== "julia" &&
            replInput === "" &&
            replInputEl &&
            replInputEl.selectionStart === 0 &&
            replInputEl.selectionEnd === 0
        ) {
            e.preventDefault();
            replMode = "julia";
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const code = replInput.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
            // Multi-line buffering only applies to the default julia mode —
            // pkg / shell commands are single-line by convention.
            if (
                replMode === "julia" &&
                code.trim() &&
                isIncompleteJulia(code)
            ) {
                insertNewlineAtCaret();
                return;
            }
            runReplInput();
        } else if (e.key === "ArrowUp") {
            const before = replInput.slice(0, replInputEl!.selectionStart);
            if (before.includes("\n")) return;
            e.preventDefault();
            if (replCmdHistory.length === 0) return;
            if (historyIndex === -1) savedInput = replInput;
            historyIndex = Math.min(
                historyIndex + 1,
                replCmdHistory.length - 1,
            );
            replInput = replCmdHistory[historyIndex];
            requestAnimationFrame(() => {
                replInputEl!.selectionStart = replInputEl!.selectionEnd =
                    replInput.length;
            });
        } else if (e.key === "ArrowDown") {
            const after = replInput.slice(replInputEl!.selectionEnd);
            if (after.includes("\n")) return;
            e.preventDefault();
            if (historyIndex === -1) return;
            historyIndex--;
            replInput =
                historyIndex === -1 ? savedInput : replCmdHistory[historyIndex];
            requestAnimationFrame(() => {
                replInputEl!.selectionStart = replInputEl!.selectionEnd =
                    replInput.length;
            });
        }
    }

    // ── Active pane search ───────────────────────────────────────────────────

    type PaneSearchMatch = { index: number; length: number };

    let showSearch = $state(false);
    let searchQuery = $state("");
    let searchInputEl: HTMLInputElement | undefined = $state(undefined);
    let searchMatches = $state<PaneSearchMatch[]>([]);
    let searchIndex = $state(-1);
    let searchRevealed = $state(false);

    function getReplText(): string {
        return replOutputEl?.textContent ?? "";
    }

    function collectTextMatches(text: string, query: string): PaneSearchMatch[] {
        if (!query) return [];
        const matches: PaneSearchMatch[] = [];
        const haystack = text.toLocaleLowerCase();
        const needle = query.toLocaleLowerCase();
        let from = 0;
        while (from <= haystack.length) {
            const index = haystack.indexOf(needle, from);
            if (index === -1) break;
            matches.push({ index, length: query.length });
            from = index + Math.max(needle.length, 1);
        }
        return matches;
    }

    function refreshSearchMatches() {
        searchMatches = collectTextMatches(getReplText(), searchQuery.trim());
        searchIndex = searchMatches.length > 0 ? 0 : -1;
        searchRevealed = false;
    }

    function selectTextOffset(
        root: HTMLElement,
        start: number,
        length: number,
    ) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        let startNode: Text | null = null;
        let endNode: Text | null = null;
        let startOffset = 0;
        let endOffset = 0;
        let offset = 0;

        while (node) {
            const text = node.textContent ?? "";
            const nextOffset = offset + text.length;
            if (!startNode && start >= offset && start <= nextOffset) {
                startNode = node as Text;
                startOffset = start - offset;
            }
            if (startNode) {
                const end = start + length;
                if (end >= offset && end <= nextOffset) {
                    endNode = node as Text;
                    endOffset = end - offset;
                    break;
                }
            }
            offset = nextOffset;
            node = walker.nextNode();
        }

        if (!startNode || !endNode) return;
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        range.startContainer.parentElement?.scrollIntoView({
            block: "center",
            inline: "nearest",
        });
    }

    function revealSearchMatch() {
        const match = searchMatches[searchIndex];
        if (!match || !replOutputEl) return;
        selectTextOffset(replOutputEl, match.index, match.length);
        searchRevealed = true;
    }

    function stepSearch(delta: 1 | -1) {
        if (searchMatches.length === 0) return;
        if (!searchRevealed) {
            revealSearchMatch();
            return;
        }
        searchIndex =
            (searchIndex + delta + searchMatches.length) % searchMatches.length;
        revealSearchMatch();
    }

    function openSearch() {
        showSearch = true;
        requestAnimationFrame(() => {
            searchInputEl?.focus();
            searchInputEl?.select();
            refreshSearchMatches();
        });
    }

    function closeSearch() {
        showSearch = false;
        searchMatches = [];
        searchIndex = -1;
        searchRevealed = false;
        window.getSelection()?.removeAllRanges();
    }

    function handleSearchKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            closeSearch();
        } else if (e.key === "Enter") {
            e.preventDefault();
            stepSearch(e.shiftKey ? -1 : 1);
        }
    }

    $effect(() => {
        if (showSearch) {
            requestAnimationFrame(() => refreshSearchMatches());
        }
    });

    // ── Event listeners ───────────────────────────────────────────────────────

    onMount(() => {
        const unlistenJulia = listen<{
            kernel: string;
            chunk: string;
            is_done: boolean;
            error: string | null;
        }>("julia-output", (event) => {
            // The notebook cells run on their own "cell" kernel — ignore those.
            if (event.payload.kernel !== "repl") return;
            const { chunk, is_done, error } = event.payload;
            if (chunk) {
                const lines = chunk.split("\n").map(cleanTerminalLine);
                const alLines = lines.filter((l) =>
                    l.startsWith("__AL_CMD__:"),
                );
                const restLines = lines.filter(
                    (l) => !l.startsWith("__AL_CMD__:"),
                );

                for (const cmdLine of alLines) {
                    try {
                        const cmd = JSON.parse(
                            cmdLine.slice("__AL_CMD__:".length),
                        );
                        if (
                            cmd.type === "plot" &&
                            (cmd.format === "png" ||
                                cmd.format === "svg" ||
                                cmd.format === "plotly")
                        ) {
                            const { format, data } = cmd as {
                                format: "png" | "svg" | "plotly";
                                data: string;
                            };
                            juliaPlots.update((plots) => [
                                ...plots,
                                {
                                    id: crypto.randomUUID(),
                                    format,
                                    data,
                                    timestamp: Date.now(),
                                },
                            ]);
                        } else if (cmd.type === "env") {
                            juliaActiveEnv.set(String(cmd.name ?? ""));
                        } else if (cmd.type === "display") {
                            const surahs: number[] = cmd.surahs;
                            const ayahs: number[] | null = cmd.ayahs;

                            if (surahs.length === 1 && ayahs === null) {
                                // Simple single-surah navigation — let SurahWidget load it
                                morphologyMultiSurahList.set(null);
                                morphologyAyahFilter.set(null);
                                recitationPlaylist.set(null);
                                multiSurahTranslationMap.set(null);
                                multiSurahTransliterationMap.set(null);
                                multiSurahWordByWordMap.set(null);
                                selectedSurahIdx.set(surahs[0]);
                            } else {
                                // Load surahs, validate ayah numbers, display
                                (async () => {
                                    const ayahFilter = ayahs;
                                    const loaded: SurahMorphology[] = [];
                                    for (const surahNum of surahs) {
                                        try {
                                            const data =
                                                await invoke<SurahMorphology>(
                                                    "get_surah_morphology",
                                                    { surahNumber: surahNum },
                                                );
                                            if (ayahFilter !== null) {
                                                const maxAyah = Math.max(
                                                    ...data.ayahs.map(
                                                        (a) => a.ayah,
                                                    ),
                                                );
                                                const missing =
                                                    ayahFilter.filter(
                                                        (n) => n > maxAyah,
                                                    );
                                                if (missing.length > 0) {
                                                    pushReplLines({
                                                        text: `Surah ${surahNum} has only ${maxAyah} ayahs — requested: ${missing.join(", ")}`,
                                                        kind: "error" as const,
                                                    });
                                                    scrollReplToBottom();
                                                }
                                            }
                                            loaded.push(data);
                                        } catch (e) {
                                            pushReplLines({
                                                text: `Failed to load surah ${surahNum}: ${e}`,
                                                kind: "error" as const,
                                            });
                                            scrollReplToBottom();
                                        }
                                    }
                                    if (loaded.length === 0) return;
                                    morphologyMultiSurahList.set(loaded);
                                    morphologyAyahFilter.set(ayahFilter);
                                    if (surahs.length === 1)
                                        selectedSurahIdx.set(surahs[0]);
                                    // Build ordered playlist from displayed ayahs
                                    const playlist: {
                                        surah: number;
                                        ayah: number;
                                    }[] = [];
                                    for (const surahData of loaded) {
                                        const surahAyahs = ayahFilter
                                            ? surahData.ayahs.filter((a) =>
                                                  ayahFilter.includes(a.ayah),
                                              )
                                            : surahData.ayahs;
                                        for (const a of surahAyahs) {
                                            playlist.push({
                                                surah: surahData.surah,
                                                ayah: a.ayah,
                                            });
                                        }
                                    }
                                    recitationPlaylist.set(
                                        playlist.length > 0 ? playlist : null,
                                    );
                                })();
                            }
                        }
                    } catch {
                        /* ignore malformed */
                    }
                }

                const displayChunk = restLines.join("\n");
                if (displayChunk) {
                    pushReplLines({
                        text: displayChunk,
                        kind: classifyOutput(displayChunk, error !== null),
                    });
                    parsePrecompileChunk(displayChunk);
                    // Keep spinner alive while output is still streaming in
                    isStreaming = true;
                    if (streamingTimer) clearTimeout(streamingTimer);
                    streamingTimer = setTimeout(() => {
                        isStreaming = false;
                    }, 600);
                }
            }
            if (is_done) {
                juliaIsRunning.set(false);
                isStreaming = false;
                resetPrecompile();
                if (streamingTimer) {
                    clearTimeout(streamingTimer);
                    streamingTimer = null;
                }
                if (focusReplOnDone) {
                    focusReplOnDone = false;
                    requestAnimationFrame(() => replInputEl?.focus());
                }
            }
            scrollReplToBottom();
        });

        const onSelectionChange = () => updateReplAiSelection();
        document.addEventListener("selectionchange", onSelectionChange);
        const onScroll = () => updateReplAiSelection();
        replOutputEl?.addEventListener("scroll", onScroll);

        // CD to the new folder whenever the user opens a different folder,
        // but only if the REPL is already running and not currently busy.
        let folderSubFirst = true;
        const unsubFolder = openFolderPath.subscribe((folder) => {
            if (folderSubFirst) {
                folderSubFirst = false;
                return;
            }
            if (!folder || !get(juliaReplStarted) || get(juliaIsRunning))
                return;
            void executeJuliaCode(
                `cd(${JSON.stringify(folder)})`,
                undefined,
                "julia",
            );
        });

        return () => {
            unlistenJulia.then((fn) => fn());
            document.removeEventListener("selectionchange", onSelectionChange);
            replOutputEl?.removeEventListener("scroll", onScroll);
            if (streamingTimer) clearTimeout(streamingTimer);
            unsubFolder();
        };
    });

    // ── Settings popover ──────────────────────────────────────────────────────
    const REPL_FONT_BOUNDS = { min: 9, max: 24, default: 13 };
    const REPL_LINE_BOUNDS = { min: 1.0, max: 2.0, default: 1.3 };

    let showSettings = $state(false);
    let settingsAnchorEl: HTMLDivElement | undefined = $state();

    function handleSettingsClickOutside(e: MouseEvent) {
        if (!settingsAnchorEl) return;
        if (!settingsAnchorEl.contains(e.target as Node)) {
            showSettings = false;
        }
    }

    $effect(() => {
        if (showSettings) {
            document.addEventListener("mousedown", handleSettingsClickOutside);
            return () =>
                document.removeEventListener(
                    "mousedown",
                    handleSettingsClickOutside,
                );
        }
    });

    function decFontSize() {
        replFontSize.set(Math.max(REPL_FONT_BOUNDS.min, $replFontSize - 1));
    }
    function incFontSize() {
        replFontSize.set(Math.min(REPL_FONT_BOUNDS.max, $replFontSize + 1));
    }
    function resetFontSize() {
        replFontSize.set(REPL_FONT_BOUNDS.default);
    }
    function decLineSpacing() {
        replLineSpacing.set(
            Math.max(
                REPL_LINE_BOUNDS.min,
                +($replLineSpacing - 0.1).toFixed(2),
            ),
        );
    }
    function incLineSpacing() {
        replLineSpacing.set(
            Math.min(
                REPL_LINE_BOUNDS.max,
                +($replLineSpacing + 0.1).toFixed(2),
            ),
        );
    }
    function resetLineSpacing() {
        replLineSpacing.set(REPL_LINE_BOUNDS.default);
    }

    const settingsLabelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]";
    const settingsAdjustBtnClass =
        "cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#363a4f] hover:bg-brand-sand-200 dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    // Toolbar controls share LeanInfoviewPane's Live/Compile design and
    // palette: plain actions carry the gold accent the way Compile does, and
    // the two toggles flip between gold and sand the way Live does.
    const pillBase =
        "flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors";
    const pillIdle =
        "bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]";
    const pillAccent =
        "bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25";
</script>

<!-- Borderless like LeanInfoviewPane: the column wrapper in +page.svelte draws
     the single border-x, so the pane adds no box of its own. -->
<div
    class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
    style="--repl-font-size: {$replFontSize}px; --repl-line-height: {$replLineSpacing};"
>
    <!-- Header: status on the left, actions on the right — LeanInfoviewPane's
         layout and spacing (px-4 py-1, gap-1.5 between controls). -->
    <div
        class="flex shrink-0 items-center justify-between gap-2 border-b border-brand-sand-200 dark:border-[#414559] px-4 py-1"
    >
        <span class="flex min-w-0 items-center gap-1.5">
            {#if isRunning || isStreaming}
                <span
                    class="flex items-center gap-1 select-none text-brand-gold-400"
                >
                    <svg
                        class="animate-spin h-3 w-3 shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        ></circle>
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        ></path>
                    </svg>
                    <span class="text-[10px] italic"
                        >{$t("julia_repl.running")}</span
                    >
                </span>
            {/if}
        </span>

        <span class="flex shrink-0 items-center gap-1.5">
            <button
                onclick={clearRepl}
                class="{pillBase} {pillAccent} select-none"
                title={$t("julia_repl.clear_title")}
            >
                <Icon icon="lucide:eraser" width="11" />
                {$t("julia_repl.clear")}
            </button>
            <button
                onclick={restartRepl}
                class="{pillBase} {pillAccent} select-none"
                title={$t("julia_repl.restart_title")}
            >
                <Icon icon="lucide:rotate-ccw" width="11" />
                {$t("julia_repl.restart")}
            </button>
            <!-- Settings button -->
            <div bind:this={settingsAnchorEl} class="relative">
                <button
                    onclick={() => (showSettings = !showSettings)}
                    class="{pillBase} {showSettings ? pillAccent : pillIdle}"
                    title={$t("julia_repl.display_settings")}
                    aria-expanded={showSettings}
                >
                    <Icon icon="solar:settings-bold-duotone" width="11" />
                    {$t("julia_repl.settings")}
                </button>
                {#if showSettings}
                    <div
                        role="menu"
                        tabindex="-1"
                        onpointerdown={(e) => e.stopPropagation()}
                        class="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-stone-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] p-3.5 shadow-xl shadow-black/15 dark:shadow-black/40 space-y-3.5"
                    >
                        <div
                            class="flex items-center gap-2 border-b border-brand-sand-100 dark:border-[#414559] pb-2"
                        >
                            <div
                                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-500 dark:text-[#e5c890]"
                            >
                                <Icon
                                    icon="solar:settings-bold-duotone"
                                    width="1rem"
                                />
                            </div>
                            <div class="min-w-0">
                                <p
                                    class="text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                >
                                    {$t("terminal.display_options")}
                                </p>
                                <p
                                    class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                >
                                    {$t("terminal.text_size_spacing")}
                                </p>
                            </div>
                        </div>

                        <div>
                            <span class={settingsLabelClass}
                                >{$t("terminal.font_size")}</span
                            >
                            <div class="flex items-center gap-2">
                                <button
                                    onclick={decFontSize}
                                    disabled={$replFontSize <=
                                        REPL_FONT_BOUNDS.min}
                                    aria-label={$t(
                                        "terminal.decrease_font_size",
                                    )}
                                    class={settingsAdjustBtnClass}
                                >
                                    <svg
                                        width="10"
                                        height="2"
                                        viewBox="0 0 10 2"
                                        fill="none"
                                    >
                                        <line
                                            x1="0"
                                            y1="1"
                                            x2="10"
                                            y2="1"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </button>
                                <span
                                    class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-center text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums"
                                >
                                    {$replFontSize}px
                                </span>
                                <button
                                    onclick={incFontSize}
                                    disabled={$replFontSize >=
                                        REPL_FONT_BOUNDS.max}
                                    aria-label={$t(
                                        "terminal.increase_font_size",
                                    )}
                                    class={settingsAdjustBtnClass}
                                >
                                    <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 10 10"
                                        fill="none"
                                    >
                                        <line
                                            x1="5"
                                            y1="0"
                                            x2="5"
                                            y2="10"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                        <line
                                            x1="0"
                                            y1="5"
                                            x2="10"
                                            y2="5"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </button>
                                <button
                                    onclick={resetFontSize}
                                    aria-label={$t("terminal.reset_font_size")}
                                    title={$t("terminal.reset")}
                                    class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] transition-all hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                                >
                                    <Icon
                                        icon="solar:restart-linear"
                                        width="0.9rem"
                                    />
                                </button>
                            </div>
                        </div>

                        <div>
                            <span class={settingsLabelClass}
                                >{$t("terminal.line_spacing")}</span
                            >
                            <div class="flex items-center gap-2">
                                <button
                                    onclick={decLineSpacing}
                                    disabled={$replLineSpacing <=
                                        REPL_LINE_BOUNDS.min}
                                    aria-label={$t(
                                        "terminal.decrease_line_spacing",
                                    )}
                                    class={settingsAdjustBtnClass}
                                >
                                    <svg
                                        width="10"
                                        height="2"
                                        viewBox="0 0 10 2"
                                        fill="none"
                                    >
                                        <line
                                            x1="0"
                                            y1="1"
                                            x2="10"
                                            y2="1"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </button>
                                <span
                                    class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-center text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums"
                                >
                                    {$replLineSpacing.toFixed(1)}x
                                </span>
                                <button
                                    onclick={incLineSpacing}
                                    disabled={$replLineSpacing >=
                                        REPL_LINE_BOUNDS.max}
                                    aria-label={$t(
                                        "terminal.increase_line_spacing",
                                    )}
                                    class={settingsAdjustBtnClass}
                                >
                                    <svg
                                        width="10"
                                        height="10"
                                        viewBox="0 0 10 10"
                                        fill="none"
                                    >
                                        <line
                                            x1="5"
                                            y1="0"
                                            x2="5"
                                            y2="10"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                        <line
                                            x1="0"
                                            y1="5"
                                            x2="10"
                                            y2="5"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                        />
                                    </svg>
                                </button>
                                <button
                                    onclick={resetLineSpacing}
                                    aria-label={$t(
                                        "terminal.reset_line_spacing",
                                    )}
                                    title={$t("terminal.reset")}
                                    class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] transition-all hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                                >
                                    <Icon
                                        icon="solar:restart-linear"
                                        width="0.9rem"
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>
            <div class="relative">
                <button
                    onclick={showSearch ? closeSearch : openSearch}
                    class="{pillBase} {showSearch ? pillAccent : pillIdle}"
                    title={$t("julia_repl.search_repl")}
                    aria-expanded={showSearch}
                >
                    <Icon icon="solar:magnifer-bold-duotone" width="11" />
                    {$t("julia_repl.search")}
                </button>

                {#if showSearch}
                    <div
                        class="absolute right-0 top-7 z-50 mt-1.5 flex items-center gap-1 overflow-hidden rounded-xl border border-stone-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] p-1 shadow-xl shadow-black/15 dark:shadow-black/40"
                    >
                        <input
                            bind:this={searchInputEl}
                            bind:value={searchQuery}
                            oninput={refreshSearchMatches}
                            onkeydown={handleSearchKeydown}
                            class="h-7 w-44 rounded-full border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#1c1c1c] px-2 text-xs text-brand-charcoal-700 dark:text-[#c6d0f5] outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 dark:focus:border-[#e5c890]"
                            placeholder={$t("julia_repl.search_repl")}
                            aria-label={$t("julia_repl.search_repl")}
                        />
                        <span
                            class="min-w-11 text-center text-[10px] tabular-nums text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {searchMatches.length > 0
                                ? `${searchIndex + 1}/${searchMatches.length}`
                                : "0/0"}
                        </span>
                        <button
                            onclick={() => stepSearch(-1)}
                            disabled={searchMatches.length === 0}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-gold-600 dark:hover:text-brand-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                            title={$t("julia_repl.previous_match")}
                            aria-label={$t("julia_repl.previous_match")}
                        >
                            <Icon
                                icon="solar:alt-arrow-up-linear"
                                width="0.85rem"
                            />
                        </button>
                        <button
                            onclick={() => stepSearch(1)}
                            disabled={searchMatches.length === 0}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#414559] hover:text-brand-gold-600 dark:hover:text-brand-gold-400 disabled:cursor-not-allowed disabled:opacity-40"
                            title={$t("julia_repl.next_match")}
                            aria-label={$t("julia_repl.next_match")}
                        >
                            <Icon
                                icon="solar:alt-arrow-down-linear"
                                width="0.85rem"
                            />
                        </button>
                    </div>
                {/if}
            </div>
        </span>
    </div>

    <!-- Julia REPL content -->
    <div class="flex-1 flex flex-col overflow-hidden min-h-0">
        <!-- Output -->
            <div
                bind:this={replOutputEl}
                class="default-scroll flex-1 overflow-y-auto min-h-0 px-3 py-2 font-mono repl-mono"
                role="log"
                aria-label={$t("julia_repl.output_label")}
            >
                {#if replLines.length === 0}
                    <p
                        class="text-brand-charcoal-300 dark:text-[#626880] italic select-none"
                    >
                        {$t("julia_repl.empty_hint").replace("{shortcut}", IS_APPLE ? "⌘Enter" : "Ctrl+Enter")}
                    </p>
                {:else}
                    {#each replLines as line}
                        {#if line.kind === "input"}
                            {@const m = line.mode ?? "julia"}
                            <div class="flex gap-1.5 mt-1 first:mt-0">
                                <span
                                    class="shrink-0 select-none font-semibold {m ===
                                    'pkg'
                                        ? 'text-blue-500 dark:text-[#8caaee]'
                                        : m === 'shell'
                                          ? 'text-red-500 dark:text-[#e78284]'
                                          : 'text-brand-gold-600'}"
                                    >{m === "pkg"
                                        ? "(@v) pkg>"
                                        : m === "shell"
                                          ? "shell>"
                                          : "julia>"}</span
                                >
                                <span
                                    class="text-brand-charcoal-500 dark:text-[#c6d0f5] whitespace-pre-wrap"
                                    >{line.text}</span
                                >
                            </div>
                        {:else if line.kind === "error"}
                            <div
                                class="pl-[3.2rem] text-red-400 whitespace-pre-wrap"
                            >
                                {line.text}
                            </div>
                        {:else if line.kind === "warn"}
                            <div
                                class="pl-[3.2rem] text-amber-400 dark:text-amber-300 whitespace-pre-wrap"
                            >
                                {line.text}
                            </div>
                        {:else}
                            <div
                                class="pl-[3.2rem] text-brand-gold-600 whitespace-pre-wrap"
                            >
                                {line.text}
                            </div>
                        {/if}
                    {/each}
                    {#if precompile.active}
                        <div
                            role="status"
                            aria-label={$t("julia_repl.precompiling_packages")}
                            aria-live="polite"
                            class="mt-2 pl-[3.2rem] space-y-1 select-none"
                        >
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                                    >{$t("julia_repl.precompiling")}</span
                                >
                                <div
                                    role="progressbar"
                                    aria-valuenow={precompile.done}
                                    aria-valuemin={0}
                                    aria-valuemax={precompile.total > 0
                                        ? precompile.total
                                        : undefined}
                                    class="flex-1 h-1 rounded-full bg-brand-sand-300 dark:bg-[#414559] overflow-hidden"
                                >
                                    {#if precompile.total > 0}
                                        <div
                                            class="h-full bg-brand-gold-400 rounded-full transition-all duration-300"
                                            style="width: {Math.min(
                                                100,
                                                Math.round(
                                                    (precompile.done /
                                                        precompile.total) *
                                                        100,
                                                ),
                                            )}%"
                                        ></div>
                                    {:else}
                                        <!-- Total is unknown (Julia pipes its
                                             output, so Pkg emits no live counter);
                                             slide an indeterminate bar so it's
                                             clearly active rather than appearing
                                             stuck. -->
                                        <div
                                            class="repl-indeterminate h-full w-1/3 bg-brand-gold-400 rounded-full"
                                        ></div>
                                    {/if}
                                </div>
                                <span
                                    class="text-[10px] text-brand-charcoal-300 dark:text-[#626880] shrink-0 tabular-nums"
                                >
                                    {precompile.done}{precompile.total > 0
                                        ? `/${precompile.total}`
                                        : ""}
                                </span>
                            </div>
                            {#each precompile.inProgress as pkg}
                                <div
                                    class="flex items-center gap-1.5 text-amber-400 dark:text-amber-300"
                                >
                                    <span aria-hidden="true" class="font-mono"
                                        >{SPINNER_FRAMES[
                                            spinnerFrame % SPINNER_FRAMES.length
                                        ]}</span
                                    >
                                    <span class="text-[11px]">{pkg}</span>
                                </div>
                            {/each}
                        </div>
                    {:else if isRunning || isStreaming}
                        <div
                            role="status"
                            aria-label={$t("julia_repl.running_label")}
                            aria-live="polite"
                            class="flex items-center gap-1.5 mt-1 select-none pl-[3.2rem]"
                        >
                            <span
                                aria-hidden="true"
                                class="text-brand-gold-500 font-mono"
                                >{SPINNER_FRAMES[spinnerFrame]}</span
                            >
                            <span
                                class="text-[11px] italic text-brand-charcoal-300 dark:text-[#626880]"
                                >{$t("julia_repl.running")}</span
                            >
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- Resize seam: drag (or arrow-key) to set the input box height.
                 A focusable separator is the ARIA window-splitter pattern, which
                 the linter reads as a non-interactive element. -->
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                role="separator"
                aria-orientation="horizontal"
                aria-label={$t("julia_repl.resize_input")}
                aria-valuenow={inputHeight}
                aria-valuemin={REPL_INPUT_MIN_HEIGHT}
                aria-valuemax={REPL_INPUT_MAX_HEIGHT}
                tabindex="0"
                title={$t("julia_repl.resize_input")}
                onpointerdown={startInputDrag}
                onpointermove={onInputDrag}
                onpointerup={endInputDrag}
                onpointercancel={endInputDrag}
                onkeydown={nudgeInputHeight}
                ondblclick={() => replInputHeights.reset(inputSlot)}
                class="group/seam shrink-0 h-1.5 -mb-px cursor-row-resize outline-none"
            >
                <span
                    class="pointer-events-none block h-px w-full transition-colors
                           {inputDragging
                        ? 'bg-brand-gold-400'
                        : 'bg-transparent group-hover/seam:bg-brand-gold-400/50 group-focus/seam:bg-brand-gold-400/50'}"
                ></span>
            </div>

            <!-- Input -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                role="group"
                aria-label={$t("julia_repl.input_label")}
                style:height="{inputHeight}px"
                class="flex items-start gap-2 px-3 py-1.5 border-t border-brand-sand-200 dark:border-[#414559] shrink-0"
                onclick={() => replInputEl?.focus()}
                onkeydown={(e) => {
                    if (e.key === "Enter") replInputEl?.focus();
                }}
            >
                <span
                    class="shrink-0 select-none font-semibold font-mono repl-mono pt-px {replMode ===
                    'pkg'
                        ? 'text-blue-500 dark:text-[#8caaee]'
                        : replMode === 'shell'
                          ? 'text-red-500 dark:text-[#e78284]'
                          : replMode === 'help'
                            ? 'text-purple-500 dark:text-[#ca9ee6]'
                            : 'text-brand-gold-600'}"
                    title={replMode === "pkg"
                        ? $t("julia_repl.pkg_mode_hint")
                        : replMode === "shell"
                          ? $t("julia_repl.shell_mode_hint")
                          : replMode === "help"
                            ? $t("julia_repl.help_mode_hint")
                            : $t("julia_repl.julia_mode_hint")}
                    >{replMode === "pkg"
                        ? $juliaActiveEnv
                            ? `(${$juliaActiveEnv}) pkg>`
                            : "(@v) pkg>"
                        : replMode === "shell"
                          ? "shell>"
                          : replMode === "help"
                            ? "help?>"
                            : $juliaActiveEnv
                              ? `julia (${$juliaActiveEnv})>`
                              : "julia>"}</span
                >
                <textarea
                    bind:this={replInputEl}
                    bind:value={replInput}
                    disabled={isRunning || isStreaming}
                    onkeydown={handleReplKeydown}
                    oninput={(e) => {
                        const t = e.currentTarget;
                        const pos = t.selectionStart;
                        const fixed = t.value
                            .replace(/[\u2018\u2019]/g, "'")
                            .replace(/[\u201C\u201D]/g, '"');
                        if (fixed !== t.value) {
                            t.value = fixed;
                            t.setSelectionRange(pos, pos);
                            replInput = fixed;
                        }
                    }}
                    placeholder={isRunning || isStreaming
                        ? $t("julia_repl.running")
                        : replMode === "pkg"
                          ? $t("julia_repl.placeholder_pkg")
                          : replMode === "shell"
                            ? $t("julia_repl.placeholder_shell")
                            : replMode === "help"
                              ? $t("julia_repl.placeholder_help")
                              : $t("julia_repl.placeholder_julia")}
                    use:noAutocorrect
                    spellcheck={false}
                    class="default-scroll h-full flex-1 resize-none bg-transparent font-mono repl-mono text-brand-charcoal-700 dark:text-[#c6d0f5]
                           outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880]
                           disabled:opacity-40 disabled:cursor-not-allowed"
                ></textarea>
            </div>
    </div>

    {#if $isPro && replAiSelection}
        <AiSelectionToolbar
            selectedText={replAiSelection.text}
            x={replAiSelection.x}
            y={replAiSelection.y}
            {askAiContextPrompt}
            askOnly={true}
            onClose={() => (replAiSelection = null)}
        />
    {/if}
</div>

<style>
    :global(.repl-mono) {
        font-size: var(--repl-font-size, 13px);
        line-height: var(--repl-line-height, 1.3);
    }

    /* Indeterminate precompile bar: slide left→right so it reads as "working"
       when the total package count isn't known. */
    .repl-indeterminate {
        animation: repl-indeterminate 1.1s ease-in-out infinite;
        will-change: transform;
    }
    @keyframes repl-indeterminate {
        0% {
            transform: translateX(-110%);
        }
        100% {
            transform: translateX(320%);
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .repl-indeterminate {
            animation-duration: 2.2s;
        }
    }
</style>
