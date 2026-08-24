<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import {
        selectedSurahIdx,
        surahLabels,
        surahMorphology,
        morphologyMultiSurahList,
    } from "$lib/stores/quran.svelte";
    import {
        surahTafsir,
        multiSurahTafsirMap,
        activeTafsirId,
        availableTafsirAuthors,
    } from "$lib/stores/translation.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import WindowControls from "./WindowControls.svelte";
    import LoadingDots from "./LoadingDots.svelte";
    import type { TafsirSnapshot } from "$lib/stores/reader-windows.store";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection } from "$lib/stores/ai-chat.store";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
    import {
        customFontFamilies,
        tafsirFontSize,
        tafsirFontFamily,
        tafsirLineSpacing,
        TAFSIR_FONT_SIZE_BOUNDS,
        TAFSIR_LINE_SPACING_BOUNDS,
    } from "$lib/stores/editor.store";
    import { openCustomFontDialog } from "$lib/stores/custom-font-dialog.store";
    import { t } from "$lib/i18n";

    const BUILTIN_FONT_FAMILIES = [
        "Amiri Quran",
        "Aref Ruqaa Ink",
        "Arial",
        "Courier New",
        "EB Garamond",
        "Georgia",
        "Reem Kufi Ink",
        "Scheherazade New",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
    ];

    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]";
    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]";
    const adjustButtonClass =
        "cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#363a4f] hover:bg-brand-sand-200 dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5] font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

    const fontFamilyOptions = $derived.by(() => {
        const seen = new Set(
            BUILTIN_FONT_FAMILIES.map((f) => f.toLocaleLowerCase()),
        );
        const merged = [...BUILTIN_FONT_FAMILIES];
        for (const font of $customFontFamilies) {
            const key = font.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(font);
        }
        return merged.sort((a, b) => a.localeCompare(b));
    });

    let showOptions = $state(false);
    let optionsBtn = $state<HTMLButtonElement | null>(null);
    let optionsPanel = $state<HTMLDivElement | null>(null);

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

    $effect(() => {
        if (showOptions) {
            window.addEventListener("pointerdown", handleDocPointerDown, true);
            return () =>
                window.removeEventListener(
                    "pointerdown",
                    handleDocPointerDown,
                    true,
                );
        }
    });

    function decFontSize() {
        tafsirFontSize.set($tafsirFontSize - 1);
    }
    function incFontSize() {
        tafsirFontSize.set($tafsirFontSize + 1);
    }
    function resetFontSize() {
        tafsirFontSize.set(TAFSIR_FONT_SIZE_BOUNDS.default);
    }
    function decLineSpacing() {
        tafsirLineSpacing.set($tafsirLineSpacing - 0.1);
    }
    function incLineSpacing() {
        tafsirLineSpacing.set($tafsirLineSpacing + 0.1);
    }
    function resetLineSpacing() {
        tafsirLineSpacing.set(TAFSIR_LINE_SPACING_BOUNDS.default);
    }

    const tafsirFontStack = $derived.by(() => {
        const f = $tafsirFontFamily.trim();
        return f ? `"${f}", system-ui, sans-serif` : "";
    });

    interface Props {
        open: boolean;
        onClose: () => void;
        /**
         * The reader owns a native window of its own rather than floating
         * inside the main one: it fills the viewport, drops the drag handle,
         * resize grips and z-index juggling.
         */
        standalone?: boolean;
        /**
         * The view the main window derived. Only a reader window uses it — the
         * stores it would otherwise read are filled by MorphologyView, which
         * does not run there.
         */
        snapshot?: TafsirSnapshot | null;
    }

    const {
        open,
        onClose,
        standalone = false,
        snapshot = null,
    }: Props = $props();

    // macOS keeps native traffic lights overlaid on the header; the other
    // platforms run the window undecorated and draw their own controls.
    const isMac =
        typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

    const RTL_TAFSIR_LANGS = new Set(["AR", "UR", "PS", "FA"]);

    const tafsirDir = $derived.by((): "rtl" | "ltr" => {
        const author = $availableTafsirAuthors.find(
            (a) => a.id === $activeTafsirId,
        );
        return author && RTL_TAFSIR_LANGS.has(author.lang) ? "rtl" : "ltr";
    });

    const authorName = $derived.by((): string => {
        const author = $availableTafsirAuthors.find(
            (a) => a.id === $activeTafsirId,
        );
        return author ? author.name.replace(/ \([^)]+\)$/, "") : "";
    });

    const currentSurah = $derived(snapshot?.surah ?? $selectedSurahIdx);
    const surahName = $derived($surahLabels[currentSurah - 1]?.en ?? "");

    function labelFor(n: number): string {
        return $surahLabels[n - 1]?.en ?? $t("dialog.surah_fallback", { n });
    }

    type Section = { surah: number; entries: { ayah: number; text: string }[] };

    const sections = $derived.by((): Section[] => {
        // In a window of its own the view arrives ready-made.
        if (snapshot) return snapshot.sections;
        const list = $morphologyMultiSurahList;
        if (list && list.length > 0 && $multiSurahTafsirMap) {
            return list.map((s) => {
                const m = $multiSurahTafsirMap!.get(s.surah);
                const entries = m
                    ? [...m.entries()]
                          .sort((a, b) => a[0] - b[0])
                          .map(([ayah, text]) => ({ ayah, text }))
                    : [];
                return { surah: s.surah, entries };
            });
        }
        if ($surahTafsir && $surahTafsir.length > 0) {
            return [
                {
                    surah: $selectedSurahIdx,
                    entries: $surahTafsir.map((r) => ({
                        ayah: r.ayah,
                        text: r.text,
                    })),
                },
            ];
        }
        return [];
    });

    const isMulti = $derived(
        snapshot
            ? snapshot.isMulti
            : ($morphologyMultiSurahList?.length ?? 0) > 1,
    );

    const totalEntries = $derived(
        sections.reduce((sum, s) => sum + s.entries.length, 0),
    );

    /**
     * Nothing to show *yet*, as opposed to nothing to show at all. In a reader
     * window that means the main window's broadcast has not arrived; in the
     * panel it means an author is chosen but the tafsir is still loading. With
     * no author chosen there is nothing coming, so the empty message is the
     * honest answer.
     */
    const loading = $derived(
        totalEntries === 0 &&
            (standalone ? snapshot === null : $activeTafsirId !== null),
    );

    let panelW = $state(560);
    let panelH = $state(620);
    const MIN_W = 360;
    const MIN_H = 280;

    // ── Drag ────────────────────────────────────────────────────────────────
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    $effect(() => {
        // Floating mode has to place and size itself; a native window is
        // already exactly where the OS put it.
        if (standalone) return;
        if (open && !initialized) {
            x = Math.max(0, (window.innerWidth - panelW) / 2);
            y = Math.max(8, (window.innerHeight - panelH) * 0.2);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!open) initialized = false;
    });

    function startDrag(e: PointerEvent) {
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

    // ── Resize ──────────────────────────────────────────────────────────────
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0;
    let resizeStartW = 0,
        resizeStartH = 0;
    let resizeStartPanelX = 0,
        resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
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
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
        }
    });

    // --- AI prompt about a tafsir entry (Pro) ---
    // Size of the ask-AI prompt, used to keep it on screen when placing it.
    const AI_PROMPT_W = 320; // w-80
    const AI_PROMPT_H = 44;

    let aiPromptOpen = $state(false);
    let aiPromptX = $state(0);
    let aiPromptY = $state(0);
    let aiPromptText = $state("");
    let aiPromptInput: HTMLInputElement | null = $state(null);
    let aiPromptCtx: {
        surah: number;
        ayah: number;
        arabic: string;
        tafsir: string;
    } | null = $state(null);

    function getAyahArabic(surah: number, ayah: number): string {
        const multi = $morphologyMultiSurahList;
        if (multi) {
            const s = multi.find((m) => m.surah === surah);
            const a = s?.ayahs.find((x) => x.ayah === ayah);
            if (a) return a.words.map((w) => w.combined_arabic).join(" ");
        }
        const sm = $surahMorphology;
        if (sm && sm.surah === surah) {
            const a = sm.ayahs.find((x) => x.ayah === ayah);
            if (a) return a.words.map((w) => w.combined_arabic).join(" ");
        }
        return "";
    }

    function stripHtml(html: string): string {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return (tmp.textContent ?? tmp.innerText ?? "").trim();
    }

    function openAiPromptForTafsir(
        event: MouseEvent,
        surah: number,
        ayah: number,
        tafsirHtml: string,
    ) {
        event.stopPropagation();
        if (
            aiPromptOpen &&
            aiPromptCtx &&
            aiPromptCtx.surah === surah &&
            aiPromptCtx.ayah === ayah
        ) {
            closeAiPrompt();
            return;
        }
        const arabic = getAyahArabic(surah, ayah);
        const tafsir = stripHtml(tafsirHtml);
        aiPromptCtx = { surah, ayah, arabic, tafsir };
        const rect = (
            event.currentTarget as HTMLElement
        ).getBoundingClientRect();
        // Beside the button, not centred under it: the button sits near the
        // dialog's right edge, so a centred 320px panel ran off the side and
        // the input was clipped. Flip to the button's left when the right has
        // no room, then clamp so neither edge can leave the screen.
        const margin = 8;
        const gap = 8;
        let left = rect.right + gap;
        if (left + AI_PROMPT_W > window.innerWidth - margin) {
            left = rect.left - gap - AI_PROMPT_W;
        }
        aiPromptX = Math.max(
            margin,
            Math.min(left, window.innerWidth - AI_PROMPT_W - margin),
        );
        // Centred on the button vertically, kept clear of the window edges.
        const top = rect.top + rect.height / 2 - AI_PROMPT_H / 2;
        aiPromptY = Math.max(
            margin,
            Math.min(top, window.innerHeight - AI_PROMPT_H - margin),
        );
        aiPromptText = "";
        aiPromptOpen = true;
        queueMicrotask(() => aiPromptInput?.focus());
    }

    function closeAiPrompt() {
        aiPromptOpen = false;
        aiPromptCtx = null;
        aiPromptText = "";
    }

    function submitAiPrompt() {
        const prompt = aiPromptText.trim();
        const ctx = aiPromptCtx;
        if (!prompt || !ctx) return;
        const surahName =
            getSurahNameTashkeel(ctx.surah) ||
            ($surahLabels[ctx.surah - 1]?.en ?? `Surah ${ctx.surah}`);
        const lines: string[] = [`${surahName} · Ayah ${ctx.ayah}`];
        if (ctx.arabic) lines.push(`Arabic: ${ctx.arabic}`);
        if (ctx.tafsir) lines.push(`Tafsir:\n${ctx.tafsir}`);
        const contextPrompt = lines.join("\n");
        askAiAboutSelection({
            prompt,
            selectedText: ctx.arabic || `${surahName} ${ctx.ayah}`,
            contextPrompt,
        });
        closeAiPrompt();
    }

    function handleAiPanelKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") closeAiPrompt();
    }
</script>

{#if open}
    <div
        transition:fly={standalone
            ? { duration: 0 }
            : { y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("tafsir.dialog_title")}
        tabindex="-1"
        class="flex flex-col overflow-hidden bg-white dark:bg-[#303446] {standalone
            ? 'h-full w-full'
            : 'fixed rounded-xl border border-brand-sand-200 dark:border-[#414559] shadow-xl dark:shadow-black/40'}"
        style={standalone
            ? ""
            : `left:${x}px; top:${y}px; width:${panelW}px; height:${panelH}px; z-index:${zIndex};`}
        onpointerdown={standalone
            ? undefined
            : () => {
                  zIndex = bringToFront();
              }}
    >
        <!-- Header (drag handle) -->
        <div
            data-tauri-drag-region={standalone ? true : undefined}
            class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-4 py-1.5 select-none {standalone
                ? ''
                : isDragging
                  ? 'cursor-grabbing'
                  : 'cursor-grab'}"
            style:padding-left={standalone && isMac ? "5rem" : undefined}
            onpointerdown={standalone ? undefined : startDrag}
            role="banner"
        >
            <div
                data-tauri-drag-region={standalone ? true : undefined}
                class="flex items-center justify-between gap-2"
            >
                <div
                    data-tauri-drag-region={standalone ? true : undefined}
                    class="flex items-center gap-2 min-w-0"
                >
                    <Icon
                        icon="solar:book-2-bold-duotone"
                        width="1.1rem"
                        class="shrink-0 text-brand-gold-500"
                    />
                    <span
                        class="truncate py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
                    >
                        {$t("tafsir.dialog_title")}
                        {#if isMulti || surahName}
                            <span class="font-normal normal-case"
                                >— {isMulti
                                    ? sections
                                          .map((s) => labelFor(s.surah))
                                          .join(", ")
                                    : surahName}</span
                            >
                        {/if}
                        {#if authorName}
                            <span class="font-normal normal-case"
                                >· {authorName}</span
                            >
                        {/if}
                    </span>
                </div>
                <div class="ml-auto flex items-center gap-1 shrink-0 relative">
                    <button
                        bind:this={optionsBtn}
                        onclick={toggleOptions}
                        onpointerdown={(e) => e.stopPropagation()}
                        aria-label={$t("dialog.display_options")}
                        title={$t("dialog.display_options")}
                        class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors {showOptions
                            ? 'ring-2 ring-brand-gold-300 dark:ring-[#e5c890]/50'
                            : ''}"
                    >
                        <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
                    </button>
                    <!-- Closing is the window's job once this bar *is* the
                         title bar; the floating panel keeps its button. -->
                    {#if !standalone}
                        <button
                            onclick={onClose}
                            onpointerdown={(e) => e.stopPropagation()}
                            aria-label={$t("common.close")}
                            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                        >
                            <Icon
                                icon="solar:close-circle-bold-duotone"
                                width="0.85rem"
                            />
                        </button>
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
                                        {$t("dialog.display_options")}
                                    </p>
                                    <p
                                        class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                    >
                                        {$t("tafsir.reading_style")}
                                    </p>
                                </div>
                            </div>

                            <div>
                                <span class={labelClass}>
                                    {$t("dialog.font_size")}
                                </span>
                                <div class="flex items-center gap-2">
                                    <button
                                        onclick={decFontSize}
                                        disabled={$tafsirFontSize <=
                                            TAFSIR_FONT_SIZE_BOUNDS.min}
                                        aria-label={$t(
                                            "dialog.decrease_font_size",
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
                                        {$tafsirFontSize}px
                                    </span>
                                    <button
                                        onclick={incFontSize}
                                        disabled={$tafsirFontSize >=
                                            TAFSIR_FONT_SIZE_BOUNDS.max}
                                        aria-label={$t(
                                            "dialog.increase_font_size",
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
                                        onclick={resetFontSize}
                                        aria-label={$t(
                                            "dialog.reset_font_size",
                                        )}
                                        title={$t("dialog.reset")}
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
                                <span class={labelClass}>
                                    {$t("dialog.line_spacing")}
                                </span>
                                <div class="flex items-center gap-2">
                                    <button
                                        onclick={decLineSpacing}
                                        disabled={$tafsirLineSpacing <=
                                            TAFSIR_LINE_SPACING_BOUNDS.min}
                                        aria-label={$t(
                                            "dialog.decrease_line_spacing",
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
                                        {$tafsirLineSpacing.toFixed(1)}x
                                    </span>
                                    <button
                                        onclick={incLineSpacing}
                                        disabled={$tafsirLineSpacing >=
                                            TAFSIR_LINE_SPACING_BOUNDS.max}
                                        aria-label={$t(
                                            "dialog.increase_line_spacing",
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
                                        aria-label={$t(
                                            "dialog.reset_line_spacing",
                                        )}
                                        title={$t("dialog.reset")}
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
                                <label
                                    for="tafsir-font-family"
                                    class={labelClass}
                                >
                                    {$t("dialog.font_family")}
                                </label>
                                <div class="relative">
                                    <select
                                        id="tafsir-font-family"
                                        value={$tafsirFontFamily}
                                        onchange={(e) =>
                                            tafsirFontFamily.set(
                                                (
                                                    e.currentTarget as HTMLSelectElement
                                                ).value,
                                            )}
                                        class={selectClass}
                                    >
                                        <option value=""
                                            >{$t("dialog.default")}</option
                                        >
                                        {#each fontFamilyOptions as font}
                                            <option value={font}>{font}</option>
                                        {/each}
                                    </select>
                                    <span
                                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300 dark:text-[#838ba7]"
                                    >
                                        <Icon
                                            icon="charm:chevron-down"
                                            width="0.75rem"
                                        />
                                    </span>
                                </div>
                                <button
                                    onclick={() => {
                                        showOptions = false;
                                        openCustomFontDialog();
                                    }}
                                    class="cursor-pointer mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-brand-gold-200 dark:border-[#e5c890]/30 bg-brand-gold-100/80 dark:bg-[#414559] px-3 py-1.5 text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890] transition-all hover:bg-brand-gold-200 dark:hover:bg-[#51576d]"
                                >
                                    <Icon
                                        icon="solar:add-circle-linear"
                                        width="0.8rem"
                                    />
                                    {$t("settings.custom_fonts.add_custom")}
                                </button>
                            </div>
                        </div>
                    {/if}
                </div>

                <!-- Windows and Linux run this window undecorated, so the
                     header supplies the minimise / maximise / close buttons
                     itself. macOS overlays its own traffic lights instead
                     (see the 5rem inset). -->
                {#if standalone && !isMac}
                    <div class="-my-1.5 -mr-2 flex self-stretch">
                        <WindowControls />
                    </div>
                {/if}
            </div>
        </div>

        <!-- Body -->
        <div class="default-scroll flex-1 overflow-y-auto px-5 py-0">
            {#if totalEntries > 0}
                {#each sections as section, sIdx (section.surah)}
                    {#if isMulti}
                        <div
                            class="sticky top-0 z-[1] -mx-5 mb-1 px-5 py-2 bg-brand-gold-50 dark:bg-[#292c3c]/95 backdrop-blur border-y border-brand-gold-200 dark:border-[#414559] {sIdx >
                            0
                                ? 'mt-4'
                                : '-mt-3'}"
                        >
                            <div class="flex items-center gap-2">
                                <span
                                    class="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-brand-gold-200 dark:bg-[#414559] text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890]"
                                >
                                    {section.surah}
                                </span>
                                <span
                                    class="text-[12px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] truncate"
                                >
                                    {labelFor(section.surah)}
                                </span>
                                <span
                                    class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                >
                                    · {section.entries.length}
                                </span>
                            </div>
                        </div>
                    {/if}
                    {#if section.entries.length === 0}
                        <div
                            class="py-3 text-[12px] text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {$t("tafsir.empty")}
                        </div>
                    {:else}
                        <div class="flex flex-col">
                            {#each section.entries as entry, i (entry.ayah)}
                                <div
                                    class="py-3 {i > 0
                                        ? 'border-t border-brand-sand-100 dark:border-[#414559]'
                                        : ''}"
                                >
                                    <div class="mb-1.5 flex items-center gap-2">
                                        <span
                                            class="inline-flex items-center justify-center min-w-[1.75rem] h-7 p-2 rounded-full bg-brand-gold-100 dark:bg-[#414559] text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890]"
                                        >
                                            {entry.ayah}
                                        </span>
                                        {#if $isPro}
                                            <button
                                                onclick={(e) =>
                                                    openAiPromptForTafsir(
                                                        e,
                                                        section.surah,
                                                        entry.ayah,
                                                        entry.text,
                                                    )}
                                                title={$t(
                                                    "morphology.ai_ask_tafsir",
                                                )}
                                                aria-label={$t(
                                                    "morphology.ai_ask_tafsir",
                                                )}
                                                class="cursor-pointer flex items-center justify-center h-7 w-7 p-1 rounded-full text-slate-350 dark:text-[#838ba7] transition-all hover:bg-brand-gold-50 dark:hover:bg-[#414559] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                                            >
                                                <Icon
                                                    icon="ri:chat-smile-ai-fill"
                                                    width="0.85rem"
                                                />
                                            </button>
                                        {/if}
                                    </div>
                                    <div
                                        class="tafsir-content text-[13px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]"
                                        style:direction={tafsirDir}
                                        style:font-family={tafsirFontStack}
                                        style:font-size={`${$tafsirFontSize}px`}
                                        style:line-height={$tafsirLineSpacing}
                                        style:text-align={tafsirDir === "ltr"
                                            ? "left"
                                            : "right"}
                                    >
                                        {@html entry.text}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {/if}
                {/each}
            {:else if loading}
                <div class="flex justify-center py-10">
                    <LoadingDots />
                </div>
            {:else}
                <div
                    class="py-6 text-center text-sm text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("tafsir.empty")}
                </div>
            {/if}
        </div>

        {#if aiPromptOpen && aiPromptCtx}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                role="presentation"
                class="fixed z-[1000] flex w-80 items-center gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
                style="left:{aiPromptX}px; top:{aiPromptY}px;"
                onclick={(e) => e.stopPropagation()}
                onpointerdown={(e) => e.stopPropagation()}
                onkeydown={handleAiPanelKeydown}
            >
                <input
                    bind:this={aiPromptInput}
                    bind:value={aiPromptText}
                    placeholder={$t("morphology.ai_prompt_placeholder")}
                    class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2 py-1.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
                    onkeydown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submitAiPrompt();
                        } else if (e.key === "Escape") {
                            closeAiPrompt();
                        }
                    }}
                />
                <button
                    onclick={submitAiPrompt}
                    disabled={!aiPromptText.trim()}
                    aria-label={$t("morphology.ai_ask_tafsir")}
                    title={$t("morphology.ai_ask_tafsir")}
                    class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
                </button>
            </div>
        {/if}

        <!-- Resize handles -->
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
{/if}

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
</style>
