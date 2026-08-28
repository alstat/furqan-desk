<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { get } from "svelte/store";
    import { invoke } from "@tauri-apps/api/core";
    import { openFolderPath } from "$lib/stores/tabs.store";
    import { listen, type UnlistenFn } from "@tauri-apps/api/event";
    import Icon from "@iconify/svelte";
    import { Terminal } from "@xterm/xterm";
    import { FitAddon } from "@xterm/addon-fit";
    import "@xterm/xterm/css/xterm.css";
    import { t } from "$lib/i18n";
    import { appDarkMode } from "$lib/stores/editor.store";
    import { bumpGitRefresh } from "$lib/stores/git.store";
    import { isPro } from "$lib/stores/auth.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import WindowControls from "./WindowControls.svelte";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    const askAiContextPrompt =
        "This text is part of a terminal session. Help explain commands, output, errors, or next steps.";

    // ── Font / line-spacing bounds ──────────────────────────────────────────

    const TERM_FONT_BOUNDS = { min: 10, max: 22, default: 13 };
    const TERM_LINE_BOUNDS = { min: 1.0, max: 1.8, default: 1.0 };

    interface Props {
        open: boolean;
        onClose: () => void;
        /**
         * The terminal owns a native window of its own rather than floating
         * inside the main one: it fills the viewport, drops the drag handle,
         * resize grips and z-index juggling, and lets the OS place and stack
         * it.
         */
        standalone?: boolean;
    }

    let { open, onClose, standalone = false }: Props = $props();

    // macOS keeps native traffic lights overlaid on the header; the other
    // platforms run the window undecorated and draw their own controls.
    const isMac =
        typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    type TermTab = { id: string; label: string; count?: number };

    let tabs = $state<TermTab[]>([]);
    let activeId = $state<string | null>(null);
    let exited = $state<Record<string, boolean>>({});
    let containerEls = $state<Record<string, HTMLDivElement | undefined>>({});
    let counter = $state(0);

    // Persisted across close/reopen via local state; not in a store on purpose
    // — these are terminal-only display preferences.
    let termFontSize = $state(TERM_FONT_BOUNDS.default);
    let termLineHeight = $state(TERM_LINE_BOUNDS.default);

    let showOptions = $state(false);
    let optionsBtn = $state<HTMLButtonElement | null>(null);
    let optionsPanel = $state<HTMLDivElement | null>(null);

    let terminalAiSelection = $state<{
        text: string;
        x: number;
        y: number;
    } | null>(null);

    const labelClass =
        "mb-1.5 block text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]";
    const adjustButtonClass =
        "cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#363a4f] hover:bg-brand-sand-200 dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    function toggleOptions() {
        showOptions = !showOptions;
    }
    function handleDocPointerDown(e: PointerEvent) {
        if (!showOptions) return;
        const target = e.target as Node | null;
        if (!target) return;
        if (optionsPanel?.contains(target) || optionsBtn?.contains(target))
            return;
        showOptions = false;
    }

    function decFontSize() {
        termFontSize = Math.max(TERM_FONT_BOUNDS.min, termFontSize - 1);
    }
    function incFontSize() {
        termFontSize = Math.min(TERM_FONT_BOUNDS.max, termFontSize + 1);
    }
    function resetFontSize() {
        termFontSize = TERM_FONT_BOUNDS.default;
    }
    function decLineSpacing() {
        termLineHeight = Math.max(
            TERM_LINE_BOUNDS.min,
            +(termLineHeight - 0.1).toFixed(2),
        );
    }
    function incLineSpacing() {
        termLineHeight = Math.min(
            TERM_LINE_BOUNDS.max,
            +(termLineHeight + 0.1).toFixed(2),
        );
    }
    function resetLineSpacing() {
        termLineHeight = TERM_LINE_BOUNDS.default;
    }

    // Non-reactive bundles: xterm Terminal objects have internal state that
    // shouldn't be wrapped in Svelte's reactive proxy.
    type Bundle = {
        term: Terminal;
        fit: FitAddon;
        onDataDispose: () => void;
        attached: boolean;
    };
    const bundles = new Map<string, Bundle>();

    // ── Panel position / size ────────────────────────────────────────────────
    let x = $state(0);
    let y = $state(0);
    let panelW = $state(720);
    let panelH = $state(440);
    let zIndex = $state(500);
    let initialized = false;
    const MIN_W = 360;
    const MIN_H = 220;

    // ── Drag ─────────────────────────────────────────────────────────────────
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;

    // ── Resize ───────────────────────────────────────────────────────────────
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let isResizing = $state(false);
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0;
    let resizeStartW = 0,
        resizeStartH = 0;
    let resizeStartPanelX = 0,
        resizeStartPanelY = 0;

    // ── Base64 helpers ───────────────────────────────────────────────────────

    function b64ToBytes(b64: string): Uint8Array {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function bytesToB64(bytes: Uint8Array): string {
        let bin = "";
        // chunk to avoid call-stack limits on very large arrays
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

    // ── Theme ────────────────────────────────────────────────────────────────

    function termTheme(dark: boolean) {
        if (dark) {
            return {
                background: "#232634",
                foreground: "#c6d0f5",
                cursor: "#e5c890",
                cursorAccent: "#232634",
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
            foreground: "#3c3c3c",
            cursor: "#c8a96a",
            cursorAccent: "#fafafa",
            selectionBackground: "#cfe3ff",
            black: "#3c3c3c",
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

    // ── Lifecycle: terminals ─────────────────────────────────────────────────

    async function attachTerm(id: string, container: HTMLDivElement) {
        const existing = bundles.get(id);
        if (existing?.attached) return;
        ensurePtyListeners();

        const term =
            existing?.term ??
            new Terminal({
                cursorBlink: true,
                fontFamily:
                    "Menlo, Monaco, 'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Fira Code', monospace",
                fontSize: termFontSize,
                lineHeight: termLineHeight,
                theme: termTheme($appDarkMode),
                allowProposedApi: true,
                scrollback: 5000,
            });
        const fit = existing?.fit ?? new FitAddon();
        if (!existing) term.loadAddon(fit);

        term.open(container);
        // First fit needs a measurable container; wait one frame.
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

        // Start the shell sized to the actual visible terminal.
        try {
            await invoke("start_pty", {
                id,
                cols: term.cols,
                rows: term.rows,
                cwd: get(openFolderPath),
            });
            // Resize once more in case rc files printed before our first resize.
            try {
                await invoke("pty_resize", {
                    id,
                    cols: term.cols,
                    rows: term.rows,
                });
            } catch {
                /* ignore */
            }
        } catch (e) {
            term.writeln(`\r\n\x1b[31m${String(e)}\x1b[0m`);
            exited[id] = true;
        }

        // Focus the freshly opened tab.
        requestAnimationFrame(() => term.focus());
    }

    function disposeBundle(id: string) {
        const b = bundles.get(id);
        if (!b) return;
        b.onDataDispose();
        b.term.dispose();
        bundles.delete(id);
    }

    async function addTerminal() {
        counter++;
        const id = `dialog-pty-${counter}-${Date.now()}`;
        const label = $t("terminal.tab_label", { count: counter });
        tabs = [...tabs, { id, label, count: counter }];
        exited[id] = false;
        activeId = id;
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
        tabs = tabs.filter((t) => t.id !== id);
        const { [id]: _e, ...restE } = exited;
        exited = restE;
        const { [id]: _c, ...restC } = containerEls;
        containerEls = restC;
        if (activeId === id) activeId = tabs[0]?.id ?? null;
    }

    async function killCommand(id: string) {
        if (exited[id]) return;
        // Send ^C (ETX, 0x03). With a real PTY the line discipline turns this
        // into SIGINT for the foreground process group automatically.
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

    function isFocusInsideToolbar(): boolean {
        const active = document.activeElement as HTMLElement | null;
        return !!active?.closest("[data-ai-selection-toolbar]");
    }

    function updateTerminalAiSelection(e: PointerEvent) {
        if (!$isPro || !activeId) {
            terminalAiSelection = null;
            return;
        }
        const selectedText = bundles.get(activeId)?.term.getSelection() ?? "";
        if (!selectedText.trim()) {
            if (isFocusInsideToolbar()) return;
            terminalAiSelection = null;
            return;
        }

        const viewportWidth = window.innerWidth || 0;
        terminalAiSelection = {
            text: selectedText,
            x: Math.max(180, Math.min(viewportWidth - 180, e.clientX)),
            y: Math.max(12, e.clientY - 8),
        };
    }

    // ── Active terminal search ───────────────────────────────────────────────

    type SearchMatch = {
        panel: string;
        line: number;
        col: number;
        length: number;
    };

    let showSearch = $state(false);
    let searchQuery = $state("");
    let searchInputEl: HTMLInputElement | undefined = $state(undefined);
    let searchMatches = $state<SearchMatch[]>([]);
    let searchIndex = $state(-1);
    let searchRevealed = $state(false);

    function getActiveTerminalLines(): string[] {
        if (!activeId) return [];
        const b = bundles.get(activeId);
        if (!b) return [];
        const buffer = b.term.buffer.active;
        const lines: string[] = [];
        for (let i = 0; i < buffer.length; i++) {
            lines.push(buffer.getLine(i)?.translateToString(true) ?? "");
        }
        return lines;
    }

    function refreshSearchMatches() {
        const panel = activeId;
        const query = searchQuery.trim();
        if (!panel || !query) {
            searchMatches = [];
            searchIndex = -1;
            searchRevealed = false;
            return;
        }

        const needle = query.toLocaleLowerCase();
        searchMatches = getActiveTerminalLines().flatMap((line, row) => {
            const matches: SearchMatch[] = [];
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
        searchIndex = searchMatches.length > 0 ? 0 : -1;
        searchRevealed = false;
    }

    function revealSearchMatch() {
        const match = searchMatches[searchIndex];
        if (!match) return;
        const b = bundles.get(match.panel);
        if (!b) return;
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
        if (activeId) bundles.get(activeId)?.term.clearSelection();
    }

    function handleSearchKeydown(e: KeyboardEvent) {
        e.stopPropagation();
        if (e.key === "Escape") {
            e.preventDefault();
            closeSearch();
        } else if (e.key === "Enter") {
            e.preventDefault();
            stepSearch(e.shiftKey ? -1 : 1);
        }
    }

    function handleClose() {
        onClose();
    }

    // ── Drag handlers ────────────────────────────────────────────────────────

    function startDrag(e: PointerEvent) {
        if ((e.target as HTMLElement).closest("button")) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }
    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - panelW,
                startX + (e.clientX - dragStartX),
            ),
        );
        y = Math.max(
            0,
            Math.min(
                window.innerHeight - 60,
                startY + (e.clientY - dragStartY),
            ),
        );
    }
    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    // ── Resize handlers ──────────────────────────────────────────────────────

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = panelW;
        resizeStartH = panelH;
        resizeStartPanelX = x;
        resizeStartPanelY = y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }
    function onResize(e: PointerEvent) {
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        let newW = resizeStartW,
            newH = resizeStartH;
        let newX = resizeStartPanelX,
            newY = resizeStartPanelY;
        if (resizeDir.e) newW = Math.max(MIN_W, resizeStartW + dx);
        if (resizeDir.s) newH = Math.max(MIN_H, resizeStartH + dy);
        if (resizeDir.w) {
            newW = Math.max(MIN_W, resizeStartW - dx);
            newX = resizeStartPanelX + (resizeStartW - newW);
        }
        if (resizeDir.n) {
            newH = Math.max(MIN_H, resizeStartH - dy);
            newY = resizeStartPanelY + (resizeStartH - newH);
        }
        panelW = newW;
        panelH = newH;
        x = Math.max(0, Math.min(window.innerWidth - MIN_W, newX));
        y = Math.max(0, Math.min(window.innerHeight - 60, newY));
    }
    function stopResize() {
        isResizing = false;
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    function refitActive() {
        const id = activeId;
        if (!id) return;
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

    // ── Event listeners ──────────────────────────────────────────────────────

    /**
     * PTY event plumbing, wired up only once this instance owns a terminal.
     *
     * The Rust side emits `pty-output` with `app.emit`, which broadcasts to
     * every window. A listener here would therefore decode and discard every
     * chunk a build prints — on the main window's thread, while the user is
     * typing — even when the terminal is running in its own OS window and this
     * copy of the panel is nothing but an unopened fallback. Deferring the
     * registration to `attachTerm` means the window that never opens a terminal
     * never pays for one.
     */
    let ptyListeners: Promise<UnlistenFn[]> | null = null;

    function ensurePtyListeners(): void {
        if (ptyListeners) return;
        ptyListeners = Promise.all([
            listen<{ id: string; data_b64: string }>("pty-output", (event) => {
                const { id, data_b64 } = event.payload;
                const b = bundles.get(id);
                if (!b) return;
                b.term.write(b64ToBytes(data_b64));
                // A command finished producing output — its side effects may
                // include a git commit/push/checkout, so nudge the git views to
                // re-read. Debounced: only fires once output settles.
                bumpGitRefresh();
            }),
            listen<{ id: string }>("pty-exit", (event) => {
                const { id } = event.payload;
                if (!(id in exited)) return;
                exited[id] = true;
            }),
        ]);
    }

    onMount(() => {
        const onWinResize = () => refitActive();
        window.addEventListener("resize", onWinResize);

        return () => {
            void ptyListeners?.then((fns) => fns.forEach((fn) => fn()));
            window.removeEventListener("resize", onWinResize);
        };
    });

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
        }
        for (const id of [...bundles.keys()]) {
            invoke("pty_kill", { id }).catch(() => {});
            disposeBundle(id);
        }
    });

    // Center the panel and bring it to front on first open.
    $effect(() => {
        // Floating mode has to place itself; a native window is already exactly
        // where the OS put it.
        if (standalone) return;
        if (open && !initialized && typeof window !== "undefined") {
            x = Math.max(0, (window.innerWidth - panelW) / 2);
            y = Math.max(0, (window.innerHeight - panelH) / 2);
            zIndex = bringToFront();
            initialized = true;
        }
        if (open) zIndex = bringToFront();
    });

    // Spin up a first terminal when the dialog opens with none.
    $effect(() => {
        if (open && tabs.length === 0) {
            addTerminal();
        }
    });

    // Attach xterm instances as containers become available.
    $effect(() => {
        for (const tab of tabs) {
            const container = containerEls[tab.id];
            if (container && !bundles.get(tab.id)?.attached) {
                attachTerm(tab.id, container);
            }
        }
    });

    // Refit when the panel size changes, the active tab changes, or the
    // dialog is reopened (display: none → flex restores measurable layout).
    $effect(() => {
        panelW;
        panelH;
        activeId;
        open;
        if (!open) return;
        // Defer to next frame so layout reflects new dims.
        requestAnimationFrame(() => {
            refitActive();
            bundles.get(activeId ?? "")?.term.focus();
        });
    });

    $effect(() => {
        const _activeId = activeId;
        terminalAiSelection = null;
        if (showSearch) {
            requestAnimationFrame(() => refreshSearchMatches());
        }
    });

    // Update term theme when dark mode flips.
    $effect(() => {
        const dark = $appDarkMode;
        for (const b of bundles.values()) {
            b.term.options.theme = termTheme(dark);
        }
    });

    // Apply font-size / line-spacing changes to every open terminal, then refit.
    $effect(() => {
        const size = termFontSize;
        const line = termLineHeight;
        for (const b of bundles.values()) {
            b.term.options.fontSize = size;
            b.term.options.lineHeight = line;
        }
        requestAnimationFrame(() => refitActive());
    });

    // Click-outside / Escape closes the options popover.
    $effect(() => {
        if (!showOptions) return;
        window.addEventListener("pointerdown", handleDocPointerDown, true);
        return () =>
            window.removeEventListener(
                "pointerdown",
                handleDocPointerDown,
                true,
            );
    });
</script>

<!--
    The dialog is kept mounted at all times (only its `display` toggles) so
    xterm.js terminals keep their DOM attachment and scrollback when the user
    closes and reopens the panel. The underlying PTYs also stay alive.
-->
<div
    role="dialog"
    aria-label={$t("terminal.title")}
    class="flex-col overflow-hidden bg-white dark:bg-[#292c3c] {standalone
        ? 'h-full w-full'
        : `fixed rounded-xl border border-brand-sand-200 dark:border-[#414559] shadow-xl dark:shadow-black/40 transition-opacity duration-150 ${
              open ? 'flex opacity-100' : 'opacity-0 pointer-events-none'
          }`}"
    style={standalone
        ? "display:flex;"
        : `left:${x}px; top:${y}px; width:${panelW}px; height:${panelH}px; z-index:${zIndex}; display:${
              open ? "flex" : "none"
          };`}
    onpointerdown={standalone
        ? undefined
        : () => {
              zIndex = bringToFront();
          }}
    onkeydown={(e) => {
        if (
            e.key === "Escape" &&
            (e.target as HTMLElement).tagName !== "CANVAS"
        )
            handleClose();
    }}
    tabindex="-1"
>
    <!-- Header (drag handle) -->
    <!-- Header / drag handle. In a native window the OS moves the window, so
         this becomes a plain drag region instead of a pointer-dragged panel —
         and doubles as the title bar. -->
    <div
        role="banner"
        data-tauri-drag-region={standalone ? true : undefined}
        class="flex items-center gap-2 px-4 py-1.5 shrink-0
                   bg-brand-gold-100 dark:bg-[#292c3c]
                   border-b border-brand-gold-200 dark:border-[#414559]
                   select-none {standalone
            ? ''
            : isDragging
              ? 'rounded-t-xl cursor-grabbing'
              : 'rounded-t-xl cursor-grab'}"
        style:padding-left={standalone && isMac ? "5rem" : undefined}
        onpointerdown={standalone ? undefined : startDrag}
    >
        <Icon
            icon="icon-park-twotone:terminal"
            width="1.1rem"
            class="text-brand-gold-500"
        />
        <span
            data-tauri-drag-region={standalone ? true : undefined}
            class="text-[0.6875rem] py-1 font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
        >
            {$t("terminal.title")}
        </span>
        <div class="ml-auto flex items-center gap-1.5 relative">
            {#if activeId && !exited[activeId]}
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        killCommand(activeId!);
                    }}
                    aria-label={$t("terminal.send_ctrl_c")}
                    title={$t("terminal.send_ctrl_c_title")}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                               bg-brand-gold-200 dark:bg-[#414559]
                               text-brand-gold-600 dark:text-[#c6d0f5]
                               hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                >
                    <Icon
                        icon="solar:stop-circle-bold-duotone"
                        width="0.85rem"
                    />
                </button>
            {/if}
            <div class="relative">
                <button
                    onclick={showSearch ? closeSearch : openSearch}
                    onpointerdown={(e) => e.stopPropagation()}
                    aria-label="Search active terminal"
                    title="Search active terminal"
                    aria-expanded={showSearch}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                               bg-brand-gold-200 dark:bg-[#414559]
                               text-brand-gold-600 dark:text-[#c6d0f5]
                               hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors
                               {showSearch
                        ? 'ring-2 ring-brand-gold-300 dark:ring-[#e5c890]/50'
                        : ''}"
                >
                    <Icon icon="solar:magnifer-bold-duotone" width="0.85rem" />
                </button>

                {#if showSearch}
                    <div
                        onpointerdown={(e) => e.stopPropagation()}
                        role="group"
                        aria-label="Terminal search"
                        class="absolute right-0 top-9 z-30 flex items-center gap-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white/95 dark:bg-[#303446]/95 p-1 shadow-xl shadow-brand-charcoal-900/10 dark:shadow-black/40 backdrop-blur"
                    >
                        <input
                            bind:this={searchInputEl}
                            bind:value={searchQuery}
                            oninput={refreshSearchMatches}
                            onkeydown={handleSearchKeydown}
                            class="h-7 w-44 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-2 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] outline-none placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 dark:focus:border-[#e5c890]"
                            placeholder="Search terminal"
                            aria-label="Search active terminal"
                        />
                        <span
                            class="min-w-11 text-center text-[0.625rem] tabular-nums text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {searchMatches.length > 0
                                ? `${searchIndex + 1}/${searchMatches.length}`
                                : "0/0"}
                        </span>
                        <button
                            onclick={() => stepSearch(-1)}
                            disabled={searchMatches.length === 0}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-600 dark:hover:text-[#e5c890] disabled:cursor-not-allowed disabled:opacity-40"
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
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-600 dark:hover:text-[#e5c890] disabled:cursor-not-allowed disabled:opacity-40"
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
            <button
                bind:this={optionsBtn}
                onclick={toggleOptions}
                onpointerdown={(e) => e.stopPropagation()}
                aria-label={$t("terminal.display_options")}
                title={$t("terminal.display_options")}
                class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559]
                           text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors
                           {showOptions
                    ? 'ring-2 ring-brand-gold-300 dark:ring-[#e5c890]/50'
                    : ''}"
            >
                <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
            </button>
            <!-- Closing is the window's job once this bar *is* the title bar.
                 The floating panel has no frame of its own, so it keeps its own
                 button. -->
            {#if !standalone}
                <button
                    onclick={handleClose}
                    aria-label={$t("terminal.close")}
                    title={$t("common.close")}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559]
                           text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
                </button>
            {/if}

            <!-- Windows and Linux run this window undecorated, so the header
                 supplies the minimise / maximise / close buttons itself. macOS
                 overlays its own traffic lights instead (see the 5rem inset). -->
            {#if standalone && !isMac}
                <div class="-my-1.5 -mr-2 flex self-stretch">
                    <WindowControls />
                </div>
            {/if}

            {#if showOptions}
                <div
                    bind:this={optionsPanel}
                    onpointerdown={(e) => e.stopPropagation()}
                    role="menu"
                    tabindex="-1"
                    class="absolute right-0 top-9 z-20 w-72 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white/95 dark:bg-[#303446]/95 p-3.5 shadow-xl shadow-brand-charcoal-900/10 dark:shadow-black/40 backdrop-blur space-y-3.5"
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
                                class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("terminal.text_size_spacing")}
                            </p>
                        </div>
                    </div>

                    <div>
                        <span class={labelClass}
                            >{$t("terminal.font_size")}</span
                        >
                        <div class="flex items-center gap-2">
                            <button
                                onclick={decFontSize}
                                disabled={termFontSize <= TERM_FONT_BOUNDS.min}
                                aria-label={$t("terminal.decrease_font_size")}
                                class={adjustButtonClass}
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
                                {termFontSize}px
                            </span>
                            <button
                                onclick={incFontSize}
                                disabled={termFontSize >= TERM_FONT_BOUNDS.max}
                                aria-label={$t("terminal.increase_font_size")}
                                class={adjustButtonClass}
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
                        <span class={labelClass}
                            >{$t("terminal.line_spacing")}</span
                        >
                        <div class="flex items-center gap-2">
                            <button
                                onclick={decLineSpacing}
                                disabled={termLineHeight <=
                                    TERM_LINE_BOUNDS.min}
                                aria-label={$t(
                                    "terminal.decrease_line_spacing",
                                )}
                                class={adjustButtonClass}
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
                                {termLineHeight.toFixed(1)}x
                            </span>
                            <button
                                onclick={incLineSpacing}
                                disabled={termLineHeight >=
                                    TERM_LINE_BOUNDS.max}
                                aria-label={$t(
                                    "terminal.increase_line_spacing",
                                )}
                                class={adjustButtonClass}
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
                                aria-label={$t("terminal.reset_line_spacing")}
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
    </div>

    <!-- Tab bar -->
    <div
        class="flex items-center px-2 bg-brand-sand-100 dark:bg-[#292c3c] border-b border-brand-sand-200 dark:border-[#414559] shrink-0 overflow-x-auto"
    >
        {#each tabs as tab (tab.id)}
            <div
                class="flex items-center flex-none mr-2 rounded-full border-r border-brand-sand-400 dark:border-[#414559]
                        {activeId === tab.id
                    ? 'bg-brand-sand-50 dark:bg-[#414559]'
                    : 'hover:bg-brand-sand-100 dark:hover:bg-[#303446]'}"
            >
                <button
                    onclick={() => (activeId = tab.id)}
                    class="cursor-pointer px-3 py-1 text-[0.625rem] font-semibold uppercase tracking-widest transition-colors select-none
                            {activeId === tab.id
                        ? 'text-brand-charcoal-700 dark:text-[#c6d0f5]'
                        : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                >
                    {tab.count !== undefined
                        ? $t("terminal.tab_label", { count: tab.count })
                        : tab.label}{exited[tab.id]
                        ? ` (${$t("terminal.exited")})`
                        : ""}
                </button>
                <button
                    onclick={(e) => {
                        e.stopPropagation();
                        closeTerminal(tab.id);
                    }}
                    class="cursor-pointer pr-2 py-1.5 text-[0.75rem] leading-none text-brand-charcoal-300 dark:text-[#838ba7] hover:text-red-400 transition-colors"
                    title={$t("terminal.close")}>×</button
                >
            </div>
        {/each}

        <button
            onclick={addTerminal}
            class="cursor-pointer ml-auto px-3 py-1.5 text-sm font-medium text-brand-charcoal-400 dark:text-[#838ba7] hover:text-brand-charcoal-700 dark:hover:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] shrink-0 transition-colors"
            title={$t("terminal.add")}>+</button
        >
    </div>

    {#if $isPro && terminalAiSelection}
        <AiSelectionToolbar
            selectedText={terminalAiSelection.text}
            x={terminalAiSelection.x}
            y={terminalAiSelection.y}
            {askAiContextPrompt}
            askOnly={true}
            onClose={() => (terminalAiSelection = null)}
        />
    {/if}

    <!-- Terminal stack: every container is mounted; only the active one is visible. -->
    <div
        class="relative flex-1 min-h-0 bg-brand-sand-50 dark:bg-[#232634]"
        style:--terminal-bg={$appDarkMode ? "#232634" : "#faf7f2"}
    >
        {#each tabs as tab (tab.id)}
            <div
                bind:this={containerEls[tab.id]}
                onpointerup={updateTerminalAiSelection}
                role="presentation"
                class="absolute inset-0 {activeId === tab.id
                    ? 'visible z-1'
                    : 'invisible z-0 pointer-events-none'}"
            ></div>
        {/each}
    </div>

    <!-- Resize handles. Only the floating panel resizes itself; a native
         window is resized by its own frame. -->
    {#if !standalone}
    <div
        aria-hidden="true"
        class="resize-handle resize-n"
        onpointerdown={(e) =>
            startResize(e, { n: true, s: false, e: false, w: false })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-s"
        onpointerdown={(e) =>
            startResize(e, { n: false, s: true, e: false, w: false })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-e"
        onpointerdown={(e) =>
            startResize(e, { n: false, s: false, e: true, w: false })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-w"
        onpointerdown={(e) =>
            startResize(e, { n: false, s: false, e: false, w: true })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-ne"
        onpointerdown={(e) =>
            startResize(e, { n: true, s: false, e: true, w: false })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-se"
        onpointerdown={(e) =>
            startResize(e, { n: false, s: true, e: true, w: false })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-sw"
        onpointerdown={(e) =>
            startResize(e, { n: false, s: true, e: false, w: true })}
    ></div>
    <div
        aria-hidden="true"
        class="resize-handle resize-nw"
        onpointerdown={(e) =>
            startResize(e, { n: true, s: false, e: false, w: true })}
    ></div>
    {/if}
</div>

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 6px;
        right: 0;
        bottom: 6px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 6px;
        left: 0;
        bottom: 6px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: nw-resize;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 12px;
        right: 12px;
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
        bottom: 8px;
        right: 8px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }
    :global(.xterm) {
        height: 100%;
        padding: 6px 8px;
        background-color: var(--terminal-bg, transparent);
    }
    /* Keep every xterm-owned surface on the same background color so a
       persistent scrollbar gutter blends into the terminal instead of reading as
       a pale right border when the OS keeps scrollbars visible. */
    :global(.xterm .xterm-viewport),
    :global(.xterm .xterm-screen),
    :global(.xterm .xterm-scrollable-element),
    :global(.xterm .xterm-scrollable-element > .scrollbar) {
        background-color: var(--terminal-bg, transparent) !important;
    }
</style>
