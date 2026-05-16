<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { get } from "svelte/store";
    import { listen } from "@tauri-apps/api/event";
    import { IS_APPLE } from "@lexical/utils";
    import Icon from "@iconify/svelte";
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import "@xterm/xterm/css/xterm.css";
    import {
        sharedTermState,
        juliaIsRunning,
        executeJuliaCode,
        isIncompleteJulia,
        type TermTab,
    } from "$lib/stores/julia-terminal.store";
    import {
        juliaReplHistory,
        juliaPlots,
        cmFontSize,
        replFontSize,
        replLineSpacing,
        juliaReplStarted,
        juliaActiveEnv,
        appDarkMode,
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

    const askAiContextPrompt =
        "This text is part of a Julia programming file, help provide explanation or correction on the code";

    // ── Terminal state (shared across all Julia tabs) ─────────────────────────

    let ts = $state(get(sharedTermState));

    // Persist local state changes back to the shared store
    $effect(() => {
        const snapshot = {
            activePanel: ts.activePanel,
            termTabs: ts.termTabs,
            termExited: ts.termExited,
            termCounter: ts.termCounter,
        };
        sharedTermState.set(snapshot);
    });

    // ── xterm.js terminal bundles (one per terminal tab) ─────────────────────

    type Bundle = {
        term: Terminal;
        fit: FitAddon;
        onDataDispose: () => void;
        attached: boolean;
    };
    const bundles = new Map<string, Bundle>();
    let termContainerEls = $state<Record<string, HTMLDivElement | undefined>>(
        {},
    );

    function b64ToBytes(b64: string): Uint8Array {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function bytesToB64(bytes: Uint8Array): string {
        let bin = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(
                null,
                bytes.subarray(i, i + CHUNK) as unknown as number[],
            );
        }
        return btoa(bin);
    }
    function strToB64(s: string): string {
        return bytesToB64(new TextEncoder().encode(s));
    }

    function termTheme(dark: boolean) {
        if (dark) {
            return {
                background: "#303446",
                foreground: "#a5adce",
                cursor: "#f4b8e4",
                cursorAccent: "#303446",
                selectionBackground: "#3a3f57",
                black: "#51576d",
                red: "#e78284",
                green: "#a6d189",
                yellow: "#e5c890",
                blue: "#8caaee",
                magenta: "#f4b8e4",
                cyan: "#81c8be",
                white: "#b5bfe2",
                brightBlack: "#626880",
                brightRed: "#e78284",
                brightGreen: "#a6d189",
                brightYellow: "#e5c890",
                brightBlue: "#8caaee",
                brightMagenta: "#f4b8e4",
                brightCyan: "#81c8be",
                brightWhite: "#a5adce",
            };
        }
        return {
            background: "#faf7f2",
            foreground: "#707070",
            cursor: "#d33682",
            cursorAccent: "#faf7f2",
            selectionBackground: "#cfe3ff",
            black: "#707070",
            red: "#c44545",
            green: "#5a8a3a",
            yellow: "#b58900",
            blue: "#268bd2",
            magenta: "#d33682",
            cyan: "#2aa198",
            white: "#bdbdbd",
            brightBlack: "#586e75",
            brightRed: "#dc322f",
            brightGreen: "#859900",
            brightYellow: "#b58900",
            brightBlue: "#268bd2",
            brightMagenta: "#d33682",
            brightCyan: "#2aa198",
            brightWhite: "#fdf6e3",
        };
    }

    async function attachTerm(id: string, container: HTMLDivElement) {
        const existing = bundles.get(id);
        if (existing?.attached) return;
        const term =
            existing?.term ??
            new Terminal({
                cursorBlink: true,
                fontFamily:
                    "Menlo, Monaco, 'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Fira Code', monospace",
                fontSize: $replFontSize,
                lineHeight: $replLineSpacing,
                theme: termTheme($appDarkMode),
                allowProposedApi: true,
                scrollback: 5000,
            });
        const fit = existing?.fit ?? new FitAddon();
        if (!existing) term.loadAddon(fit);

        term.open(container);
        await tick();
        try {
            fit.fit();
        } catch {
            /* ignore */
        }

        const onData = term.onData((data) => {
            invoke("pty_write", { id, dataB64: strToB64(data) }).catch(
                () => {},
            );
        });

        bundles.set(id, {
            term,
            fit,
            onDataDispose: () => onData.dispose(),
            attached: true,
        });

        try {
            await invoke("start_pty", {
                id,
                cols: term.cols,
                rows: term.rows,
                cwd: get(openFolderPath),
            });
            await invoke("pty_resize", {
                id,
                cols: term.cols,
                rows: term.rows,
            }).catch(() => {});
        } catch (e) {
            term.writeln(`\r\n\x1b[31m${String(e)}\x1b[0m`);
            ts.termExited[id] = true;
        }

        requestAnimationFrame(() => term.focus());
    }

    function disposeBundle(id: string) {
        const b = bundles.get(id);
        if (!b) return;
        b.onDataDispose();
        b.term.dispose();
        bundles.delete(id);
    }

    function refitActiveTerm() {
        const id = ts.activePanel;
        const b = bundles.get(id);
        if (!b) return;
        try {
            b.fit.fit();
            invoke("pty_resize", {
                id,
                cols: b.term.cols,
                rows: b.term.rows,
            }).catch(() => {});
        } catch {
            /* ignore */
        }
    }

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

    const replInputRows = $derived(
        Math.max(1, (replInput.match(/\n/g) ?? []).length + 1),
    );

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

    function parsePrecompileChunk(text: string): void {
        for (const line of text.split("\n")) {
            if (/^\s*Precompiling/.test(line)) {
                precompile.active = true;
                const countMatch = line.match(/(\d+)\s+package/);
                if (countMatch && precompile.total === 0) {
                    precompile.total = parseInt(countMatch[1]);
                }
            }
            if (!precompile.active) continue;
            // In-progress package: ◒ ⌛ ●
            const inProgressMatch = line.match(/^\s*[◒⌛●]\s+(\S+)/);
            if (inProgressMatch) {
                const pkg = inProgressMatch[1];
                if (!precompile.inProgress.includes(pkg)) {
                    precompile.inProgress = [...precompile.inProgress, pkg];
                }
            }
            // Completed package: ✓ PackageName
            const doneMatch = line.match(/✓\s+(\S+)/);
            if (doneMatch) {
                precompile.done++;
                precompile.inProgress = precompile.inProgress.filter(
                    (p) => p !== doneMatch[1],
                );
            }
            // Total from "done/total" counter
            const slashMatch = line.match(/(\d+)\/(\d+)/);
            if (slashMatch && precompile.total === 0) {
                precompile.total = parseInt(slashMatch[2]);
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

    // ── Terminal helpers ──────────────────────────────────────────────────────

    async function addTerminal() {
        ts.termCounter++;
        const id = `pty-${ts.termCounter}-${Date.now()}`;
        const label = `Terminal ${ts.termCounter}`;
        ts.termTabs = [...ts.termTabs, { id, label }];
        ts.termExited[id] = false;
        ts.activePanel = id;
        // The xterm instance is attached by the $effect once the container
        // div is bound to the DOM.
    }

    async function closeTerminal(id: string) {
        try {
            await invoke("pty_kill", { id });
        } catch {
            /* ignore */
        }
        disposeBundle(id);
        ts.termTabs = ts.termTabs.filter((t) => t.id !== id);
        const { [id]: _ex, ...restEx } = ts.termExited;
        ts.termExited = restEx;
        const { [id]: _ce, ...restCe } = termContainerEls;
        termContainerEls = restCe;
        if (ts.activePanel === id) ts.activePanel = "julia";
    }

    async function killActiveTerm() {
        const id = ts.activePanel;
        if (id === "julia" || ts.termExited[id]) return;
        // 0x03 = ETX = Ctrl-C; PTY line discipline turns this into SIGINT.
        try {
            await invoke("pty_write", {
                id,
                dataB64: bytesToB64(new Uint8Array([0x03])),
            });
        } catch {
            /* ignore */
        }
        bundles.get(id)?.term.focus();
    }

    // ── Active pane search ───────────────────────────────────────────────────

    type PaneSearchMatch = {
        panel: string;
        line?: number;
        col?: number;
        index?: number;
        length: number;
    };

    let showSearch = $state(false);
    let searchQuery = $state("");
    let searchInputEl: HTMLInputElement | undefined = $state(undefined);
    let searchMatches = $state<PaneSearchMatch[]>([]);
    let searchIndex = $state(-1);
    let searchRevealed = $state(false);

    function getReplText(): string {
        return replOutputEl?.textContent ?? "";
    }

    function getActiveTerminalLines(): string[] {
        const b = bundles.get(ts.activePanel);
        if (!b) return [];
        const buffer = b.term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buffer.length; i++) {
            lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
        }
        return lines;
    }

    function collectTextMatches(
        text: string,
        query: string,
        panel: string,
    ): PaneSearchMatch[] {
        if (!query) return [];
        const matches: PaneSearchMatch[] = [];
        const haystack = text.toLocaleLowerCase();
        const needle = query.toLocaleLowerCase();
        let from = 0;
        while (from <= haystack.length) {
            const index = haystack.indexOf(needle, from);
            if (index === -1) break;
            matches.push({ panel, index, length: query.length });
            from = index + Math.max(needle.length, 1);
        }
        return matches;
    }

    function collectTerminalMatches(query: string): PaneSearchMatch[] {
        if (!query) return [];
        const panel = ts.activePanel;
        const needle = query.toLocaleLowerCase();
        return getActiveTerminalLines().flatMap((line, row) => {
            const matches: PaneSearchMatch[] = [];
            const haystack = line.toLocaleLowerCase();
            let from = 0;
            while (from <= haystack.length) {
                const col = haystack.indexOf(needle, from);
                if (col === -1) break;
                matches.push({ panel, line: row, col, length: query.length });
                from = col + Math.max(needle.length, 1);
            }
            return matches;
        });
    }

    function refreshSearchMatches() {
        const query = searchQuery.trim();
        searchMatches =
            ts.activePanel === "julia"
                ? collectTextMatches(getReplText(), query, "julia")
                : collectTerminalMatches(query);
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
        if (!match) return;
        if (match.panel === "julia") {
            if (replOutputEl && match.index !== undefined) {
                selectTextOffset(replOutputEl, match.index, match.length);
            }
            searchRevealed = true;
            return;
        }

        const b = bundles.get(match.panel);
        if (!b || match.line === undefined || match.col === undefined) return;
        b.term.scrollToLine(match.line);
        b.term.select(match.col, match.line, match.length);
        b.term.focus();
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
        if (ts.activePanel !== "julia")
            bundles.get(ts.activePanel)?.term.clearSelection();
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
        const _activePanel = ts.activePanel;
        if (showSearch) {
            requestAnimationFrame(() => refreshSearchMatches());
        }
    });

    // ── Event listeners ───────────────────────────────────────────────────────

    onMount(() => {
        const unlistenJulia = listen<{
            chunk: string;
            is_done: boolean;
            error: string | null;
        }>("julia-output", (event) => {
            const { chunk, is_done, error } = event.payload;
            if (chunk) {
                const lines = chunk.split("\n");
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
                        if (cmd.type === "plot") {
                            const { format, data } = cmd as {
                                format: "png" | "svg";
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
                                                    juliaReplHistory.update(
                                                        (h) => [
                                                            ...h,
                                                            {
                                                                text: `Surah ${surahNum} has only ${maxAyah} ayahs — requested: ${missing.join(", ")}`,
                                                                kind: "error" as const,
                                                            },
                                                        ],
                                                    );
                                                    scrollReplToBottom();
                                                }
                                            }
                                            loaded.push(data);
                                        } catch (e) {
                                            juliaReplHistory.update((h) => [
                                                ...h,
                                                {
                                                    text: `Failed to load surah ${surahNum}: ${e}`,
                                                    kind: "error" as const,
                                                },
                                            ]);
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
                    juliaReplHistory.update((h) => [
                        ...h,
                        {
                            text: displayChunk,
                            kind: classifyOutput(displayChunk, error !== null),
                        },
                    ]);
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
                precompile = {
                    active: false,
                    total: 0,
                    done: 0,
                    inProgress: [],
                };
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

        const unlistenPtyOut = listen<{ id: string; data_b64: string }>(
            "pty-output",
            (event) => {
                const { id, data_b64 } = event.payload;
                const b = bundles.get(id);
                if (!b) return;
                b.term.write(b64ToBytes(data_b64));
            },
        );

        const unlistenPtyExit = listen<{ id: string }>("pty-exit", (event) => {
            const { id } = event.payload;
            if (!(id in ts.termExited)) return;
            ts.termExited[id] = true;
        });

        const onWinResize = () => refitActiveTerm();
        window.addEventListener("resize", onWinResize);

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
            unlistenPtyOut.then((fn) => fn());
            unlistenPtyExit.then((fn) => fn());
            window.removeEventListener("resize", onWinResize);
            document.removeEventListener("selectionchange", onSelectionChange);
            replOutputEl?.removeEventListener("scroll", onScroll);
            if (streamingTimer) clearTimeout(streamingTimer);
            unsubFolder();
        };
    });

    onDestroy(() => {
        for (const id of [...bundles.keys()]) {
            invoke("pty_kill", { id }).catch(() => {});
            disposeBundle(id);
        }
    });

    // Attach xterm instances as containers become available.
    $effect(() => {
        for (const tab of ts.termTabs) {
            const container = termContainerEls[tab.id];
            if (container && !bundles.get(tab.id)?.attached) {
                attachTerm(tab.id, container);
            }
        }
    });

    // Refit when the active panel changes (e.g., switching tabs).
    $effect(() => {
        const _activePanel = ts.activePanel;
        requestAnimationFrame(() => {
            refitActiveTerm();
            const b = bundles.get(_activePanel);
            b?.term.focus();
        });
    });

    // Update theme on dark-mode flip.
    $effect(() => {
        const dark = $appDarkMode;
        for (const b of bundles.values()) {
            b.term.options.theme = termTheme(dark);
        }
    });

    // Update font size / line spacing on store changes.
    $effect(() => {
        const fs = $replFontSize;
        const lh = $replLineSpacing;
        for (const [id, b] of bundles.entries()) {
            b.term.options.fontSize = fs;
            b.term.options.lineHeight = lh;
            try {
                b.fit.fit();
                invoke("pty_resize", {
                    id,
                    cols: b.term.cols,
                    rows: b.term.rows,
                }).catch(() => {});
            } catch {
                /* ignore */
            }
        }
    });

    // ── Settings popover ──────────────────────────────────────────────────────
    const REPL_FONT_BOUNDS = { min: 9, max: 24, default: 12 };
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
</script>

<div
    class="flex-1 mt-0.5 flex flex-col rounded-md overflow-hidden border border-brand-sand-200 dark:border-[#414559] min-h-0 h-full"
    style="--repl-font-size: {$replFontSize}px; --repl-line-height: {$replLineSpacing};"
>
    <!-- Tab bar -->
    <div
        class="relative flex items-center py-1 border-b border-brand-sand-200 dark:border-[#414559] shrink-0
               {ts.activePanel === 'julia'
            ? 'bg-brand-sand-100 dark:bg-[#292c3c]'
            : 'bg-brand-sand-50 dark:bg-[#303446]'}"
    >
        <div class="flex items-center flex-1 min-w-0 overflow-x-auto">
            <!-- Julia REPL tab -->
            <div
                class="flex items-center flex-none border-r rounded-full mx-2 border-brand-sand-400 dark:border-[#414559]
                    {ts.activePanel === 'julia'
                    ? 'bg-brand-sand-50 dark:bg-[#414559]'
                    : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}"
            >
                <button
                    onclick={() => (ts.activePanel = "julia")}
                    class="px-3 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none cursor-pointer
                       {ts.activePanel === 'julia'
                        ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                        : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                    >REPL</button
                >
                {#if ts.activePanel === "julia"}
                    {#if isRunning || isStreaming}
                        <span
                            class="flex items-center gap-1 pr-2 select-none text-brand-gold-400"
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
                            <span class="text-[10px] italic">Running…</span>
                        </span>
                    {/if}
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            clearRepl();
                        }}
                        class="cursor-pointer pr-1 text-[10px] font-medium text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] transition-colors select-none"
                        title="Clear REPL output">Clear</button
                    >
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            restartRepl();
                        }}
                        class="cursor-pointer px-2 flex items-center gap-0.5 text-[10px] font-medium text-brand-charcoal-300 dark:text-[#838ba7] hover:text-red-400 dark:hover:text-red-400 transition-colors select-none"
                        title="Kill and restart Julia REPL"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path
                                d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
                            />
                            <path d="M3 3v5h5" />
                        </svg>
                        Restart
                    </button>
                {/if}
            </div>

            <!-- Terminal tabs -->
            {#each ts.termTabs as tab (tab.id)}
                <div
                    class="flex items-center flex-none mr-2 rounded-full border-r border-brand-sand-400 dark:border-[#414559]
                        {ts.activePanel === tab.id
                        ? 'bg-brand-sand-50 dark:bg-[#414559]'
                        : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}"
                >
                    <button
                        onclick={() => (ts.activePanel = tab.id)}
                        class="cursor-pointer px-3 py-1 text-[10px] font-semibold uppercase tracking-widest transition-colors select-none
                           {ts.activePanel === tab.id
                            ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                            : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                        >{tab.label}</button
                    >
                    <button
                        onclick={(e) => {
                            e.stopPropagation();
                            closeTerminal(tab.id);
                        }}
                        class="cursor-pointer pr-2 py-1 text-[10px] leading-none text-brand-charcoal-300 dark:text-[#838ba7] hover:text-red-400 transition-colors"
                        title="Close terminal">×</button
                    >
                </div>
            {/each}
        </div>

        <!-- Right-aligned tab-bar actions -->
        <div class="ml-auto flex items-center gap-0.5 pr-2 shrink-0">
            {#if ts.activePanel !== "julia" && !ts.termExited[ts.activePanel]}
                <button
                    onclick={killActiveTerm}
                    aria-label="Send Ctrl+C"
                    title="Send Ctrl+C (SIGINT) to the foreground process"
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md
                           text-brand-charcoal-300 dark:text-brand-charcoal-300
                           hover:text-red-500 dark:hover:text-red-400
                           hover:bg-brand-sand-100 dark:hover:bg-brand-sand-200 transition-colors"
                >
                    <Icon
                        icon="solar:stop-circle-bold-duotone"
                        width="0.9rem"
                    />
                </button>
            {/if}
            <!-- Settings button -->
            <div bind:this={settingsAnchorEl} class="relative">
                <button
                    onclick={() => (showSettings = !showSettings)}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-brand-charcoal-300 hover:text-brand-gold-600 dark:hover:text-brand-gold-400 hover:bg-brand-sand-100 dark:hover:bg-brand-sand-200 shrink-0 transition-colors
                           {showSettings
                        ? 'bg-brand-sand-100 dark:bg-brand-sand-200 text-brand-gold-600 dark:text-brand-gold-400'
                        : ''}"
                    title="Display settings"
                    aria-label="Display settings"
                    aria-expanded={showSettings}
                >
                    <Icon icon="solar:settings-bold-duotone" width="0.9rem" />
                </button>
                {#if showSettings}
                    <div
                        role="menu"
                        tabindex="-1"
                        onpointerdown={(e) => e.stopPropagation()}
                        class="absolute right-0 top-full mt-1 z-50 w-72 rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white/95 dark:bg-[#303446]/95 p-3.5 shadow-xl shadow-brand-charcoal-900/10 dark:shadow-black/40 backdrop-blur space-y-3.5"
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
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-brand-charcoal-300 hover:text-brand-gold-600 dark:hover:text-brand-gold-400 hover:bg-brand-sand-100 dark:hover:bg-brand-sand-200 shrink-0 transition-colors
                           {showSearch
                        ? 'bg-brand-sand-100 dark:bg-brand-sand-200 text-brand-gold-600 dark:text-brand-gold-400'
                        : ''}"
                    title="Search active pane"
                    aria-label="Search active pane"
                    aria-expanded={showSearch}
                >
                    <Icon icon="solar:magnifer-bold-duotone" width="0.9rem" />
                </button>

                {#if showSearch}
                    <div
                        class="absolute right-0 top-7 z-50 flex items-center gap-1 rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] p-1 shadow-lg"
                    >
                        <input
                            bind:this={searchInputEl}
                            bind:value={searchQuery}
                            oninput={refreshSearchMatches}
                            onkeydown={handleSearchKeydown}
                            class="h-7 w-44 rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#232634] px-2 text-xs text-brand-charcoal-700 dark:text-[#c6d0f5] outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 dark:focus:border-[#e5c890]"
                            placeholder="Search {ts.activePanel === 'julia'
                                ? 'REPL'
                                : 'terminal'}"
                            aria-label="Search active pane"
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
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-600 dark:hover:text-[#e5c890] disabled:cursor-not-allowed disabled:opacity-40"
                            title="Previous match"
                            aria-label="Previous match"
                        >
                            <Icon
                                icon="solar:alt-arrow-up-linear"
                                width="0.85rem"
                            />
                        </button>
                        <button
                            onclick={() => stepSearch(1)}
                            disabled={searchMatches.length === 0}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-600 dark:hover:text-[#e5c890] disabled:cursor-not-allowed disabled:opacity-40"
                            title="Next match"
                            aria-label="Next match"
                        >
                            <Icon
                                icon="solar:alt-arrow-down-linear"
                                width="0.85rem"
                            />
                        </button>
                    </div>
                {/if}
            </div>
            <!-- Add terminal button -->
            <button
                onclick={addTerminal}
                class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-300 dark:text-brand-charcoal-300 hover:text-brand-gold-600 dark:hover:text-brand-gold-400 hover:bg-brand-sand-100 dark:hover:bg-brand-sand-200 shrink-0 transition-colors"
                title="Add terminal"
                aria-label="Add terminal"
            >
                <Icon icon="ic:outline-plus" width="0.9rem" />
            </button>
        </div>
    </div>

    <!-- Julia REPL content -->
    {#if ts.activePanel === "julia"}
        <div class="flex-1 flex flex-col overflow-hidden min-h-0">
            <!-- Output -->
            <div
                bind:this={replOutputEl}
                class="default-scroll flex-1 overflow-y-auto min-h-0 bg-brand-sand-50 dark:bg-[#232634] px-3 py-2 font-mono repl-mono"
                role="log"
                aria-label="REPL output"
            >
                {#if replLines.length === 0}
                    <p
                        class="text-brand-charcoal-300 dark:text-[#626880] italic select-none"
                    >
                        Press {IS_APPLE ? "⌘Enter" : "Ctrl+Enter"} in the editor,
                        or type below and press Enter.
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
                            aria-label="Precompiling packages"
                            aria-live="polite"
                            class="mt-2 pl-[3.2rem] space-y-1 select-none"
                        >
                            <div class="flex items-center gap-2">
                                <span
                                    class="text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                                    >Precompiling</span
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
                                        <div
                                            class="h-full w-1/3 bg-brand-gold-400 rounded-full animate-pulse"
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
                            aria-label="Running"
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
                                >Running…</span
                            >
                        </div>
                    {/if}
                {/if}
            </div>

            <!-- Input -->
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                role="group"
                aria-label="REPL input"
                class="flex items-start gap-2 px-3 py-1.5 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] shrink-0"
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
                        ? "Pkg mode — Backspace to exit"
                        : replMode === "shell"
                          ? "Shell mode — Backspace to exit"
                          : replMode === "help"
                            ? "Help mode — Backspace to exit"
                            : "Julia — type ] for pkg, ; for shell, ? for help"}
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
                    rows={replInputRows}
                    placeholder={isRunning || isStreaming
                        ? "Running…"
                        : replMode === "pkg"
                          ? "pkg command, e.g. add DataFrames"
                          : replMode === "shell"
                            ? "shell command"
                            : replMode === "help"
                              ? "function or type, e.g. sin"
                              : "Enter code, Shift+Enter for newline"}
                    use:noAutocorrect
                    spellcheck={false}
                    class="flex-1 resize-none bg-transparent font-mono repl-mono text-brand-charcoal-700 dark:text-[#c6d0f5]
                           outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880]
                           disabled:opacity-40 disabled:cursor-not-allowed"
                ></textarea>
            </div>
        </div>
    {/if}

    <!-- Terminal panels (xterm.js). All container divs stay mounted so each
         terminal keeps its scrollback when the user switches tabs. -->
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

    {#if ts.termTabs.length > 0}
        <div
            class="relative flex-1 min-h-0 bg-brand-sand-50 dark:bg-[#303446]"
            style="display: {ts.activePanel !== 'julia' ? 'block' : 'none'};"
        >
            {#each ts.termTabs as tab (tab.id)}
                <div
                    bind:this={termContainerEls[tab.id]}
                    class="absolute inset-0 {ts.activePanel === tab.id
                        ? 'visible z-1'
                        : 'invisible z-0 pointer-events-none'}"
                ></div>
            {/each}
        </div>
    {/if}
</div>

<style>
    :global(.repl-mono) {
        font-size: var(--repl-font-size, 12px);
        line-height: var(--repl-line-height, 1.3);
    }
</style>
