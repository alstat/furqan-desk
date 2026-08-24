<script lang="ts">
    import Icon from "@iconify/svelte";
    import { onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import {
        selectedSurahIdx,
        surahLabels,
        morphologyMultiSurahList,
    } from "$lib/stores/quran.svelte";
    import {
        activeTranslatorId,
        availableTranslators,
        multiSurahTranslationMap,
        surahTranslation,
        type AyahTranslation,
    } from "$lib/stores/translation.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import WindowControls from "./WindowControls.svelte";
    import LoadingDots from "./LoadingDots.svelte";
    import type { TranslationSnapshot } from "$lib/stores/reader-windows.store";
    import {
        customFontFamilies,
        translationFontFamily,
        translationFontSize,
        translationLineSpacing,
        TRANSLATION_FONT_SIZE_BOUNDS,
        TRANSLATION_LINE_SPACING_BOUNDS,
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
        snapshot?: TranslationSnapshot | null;
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

    type Section = { surah: number; entries: AyahTranslation[] };

    const RTL_TRANSLATION_LANGS = new Set(["AR", "UR", "PS", "FA"]);

    const translationDir = $derived.by((): "rtl" | "ltr" => {
        const translator = $availableTranslators.find(
            (tr) => tr.id === $activeTranslatorId,
        );
        return translator && RTL_TRANSLATION_LANGS.has(translator.lang)
            ? "rtl"
            : "ltr";
    });

    const translatorName = $derived.by(() => {
        const translator = $availableTranslators.find(
            (tr) => tr.id === $activeTranslatorId,
        );
        return translator?.name ?? "";
    });

    const currentSurah = $derived(snapshot?.surah ?? $selectedSurahIdx);
    const surahName = $derived($surahLabels[currentSurah - 1]?.en ?? "");

    const sections = $derived.by((): Section[] => {
        // In a window of its own the view arrives ready-made.
        if (snapshot) return snapshot.sections;
        const list = $morphologyMultiSurahList;
        if (list && list.length > 0 && $multiSurahTranslationMap) {
            return list.map((s) => {
                const m = $multiSurahTranslationMap!.get(s.surah);
                const entries = m
                    ? [...m.values()].sort((a, b) => a.ayah - b.ayah)
                    : [];
                return { surah: s.surah, entries };
            });
        }
        if ($surahTranslation && $surahTranslation.length > 0) {
            return [{ surah: $selectedSurahIdx, entries: $surahTranslation }];
        }
        return [];
    });

    const isMulti = $derived(
        snapshot
            ? snapshot.isMulti
            : ($morphologyMultiSurahList?.length ?? 0) > 1,
    );

    const totalEntries = $derived(
        sections.reduce((sum, section) => sum + section.entries.length, 0),
    );

    /**
     * Nothing to show *yet*, as opposed to nothing to show at all. In a reader
     * window that means the main window's broadcast has not arrived; in the
     * panel it means a translator is chosen but its text is still loading.
     * With no translator chosen there is nothing coming, so the empty message
     * is the honest answer.
     */
    const loading = $derived(
        totalEntries === 0 &&
            (standalone ? snapshot === null : $activeTranslatorId !== null),
    );

    const fontFamilyOptions = $derived.by(() => {
        const seen = new Set(
            BUILTIN_FONT_FAMILIES.map((font) => font.toLocaleLowerCase()),
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

    const translationFontStack = $derived.by(() => {
        const font = $translationFontFamily.trim();
        return font ? `"${font}", system-ui, sans-serif` : "";
    });

    let showOptions = $state(false);
    let optionsBtn = $state<HTMLButtonElement | null>(null);
    let optionsPanel = $state<HTMLDivElement | null>(null);

    function labelFor(n: number): string {
        return $surahLabels[n - 1]?.en ?? $t("dialog.surah_fallback", { n });
    }

    function parseFootnotes(entry: AyahTranslation): Record<string, string> | null {
        if (!entry.footnotes) return null;
        try {
            return JSON.parse(entry.footnotes) as Record<string, string>;
        } catch {
            return null;
        }
    }

    function handleDocPointerDown(e: PointerEvent) {
        if (!showOptions) return;
        const target = e.target as Node | null;
        if (!target) return;
        if (optionsPanel?.contains(target) || optionsBtn?.contains(target)) return;
        showOptions = false;
    }

    $effect(() => {
        if (showOptions) {
            window.addEventListener("pointerdown", handleDocPointerDown, true);
            return () =>
                window.removeEventListener("pointerdown", handleDocPointerDown, true);
        }
    });

    function decFontSize() {
        translationFontSize.set($translationFontSize - 1);
    }
    function incFontSize() {
        translationFontSize.set($translationFontSize + 1);
    }
    function resetFontSize() {
        translationFontSize.set(TRANSLATION_FONT_SIZE_BOUNDS.default);
    }
    function decLineSpacing() {
        translationLineSpacing.set($translationLineSpacing - 0.1);
    }
    function incLineSpacing() {
        translationLineSpacing.set($translationLineSpacing + 0.1);
    }
    function resetLineSpacing() {
        translationLineSpacing.set(TRANSLATION_LINE_SPACING_BOUNDS.default);
    }

    let panelW = $state(560);
    let panelH = $state(620);
    const MIN_W = 360;
    const MIN_H = 280;
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let initialized = false;
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;

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
        x = Math.max(0, Math.min(window.innerWidth - panelW, startX + e.clientX - dragStartX));
        y = Math.max(0, Math.min(window.innerHeight - 60, startY + e.clientY - dragStartY));
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
        { cls: "resize-n", dir: { n: true, s: false, e: false, w: false } },
        { cls: "resize-s", dir: { n: false, s: true, e: false, w: false } },
        { cls: "resize-e", dir: { n: false, s: false, e: true, w: false } },
        { cls: "resize-w", dir: { n: false, s: false, e: false, w: true } },
        { cls: "resize-ne", dir: { n: true, s: false, e: true, w: false } },
        { cls: "resize-se", dir: { n: false, s: true, e: true, w: false } },
        { cls: "resize-sw", dir: { n: false, s: true, e: false, w: true } },
        { cls: "resize-nw", dir: { n: true, s: false, e: false, w: true } },
    ];
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0,
        resizeStartW = 0,
        resizeStartH = 0,
        resizeStartPanelX = 0,
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
            newH = resizeStartH,
            newX = resizeStartPanelX,
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
</script>

{#if open}
    <div
        transition:fly={standalone
            ? { duration: 0 }
            : { y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("translation.dialog_title")}
        tabindex="-1"
        class="flex flex-col overflow-hidden bg-white dark:bg-[#303446] {standalone
            ? 'h-screen w-screen'
            : 'fixed rounded-xl border border-brand-sand-200 dark:border-[#414559] shadow-xl dark:shadow-black/40'}"
        style={standalone
            ? ""
            : `left:${x}px; top:${y}px; width:${panelW}px; height:${panelH}px; z-index:${zIndex};`}
        onpointerdown={standalone ? undefined : () => (zIndex = bringToFront())}
    >
        <!-- Header / drag handle. In a native window the OS moves the window,
             so this becomes a plain drag region and doubles as the title bar. -->
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
                        icon="garden:translation-exists-stroke-12"
                        width="1.1rem"
                        class="shrink-0 text-brand-gold-500"
                    />
                    <span
                        class="truncate py-2 text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-500 dark:text-[#838ba7]"
                    >
                        {$t("translation.dialog_title")}
                        {#if isMulti || surahName}
                            <span class="font-normal normal-case"
                                >— {isMulti
                                    ? sections
                                          .map((s) => labelFor(s.surah))
                                          .join(", ")
                                    : surahName}</span
                            >
                        {/if}
                        {#if translatorName}
                            <span class="font-normal normal-case"
                                >· {translatorName}</span
                            >
                        {/if}
                    </span>
                </div>
                <div class="ml-auto flex items-center gap-1 shrink-0 relative">
                    <button
                        bind:this={optionsBtn}
                        onclick={() => (showOptions = !showOptions)}
                        onpointerdown={(e) => e.stopPropagation()}
                        aria-label={$t("dialog.display_options")}
                        title={$t("dialog.display_options")}
                        class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors {showOptions ? 'ring-2 ring-brand-gold-300 dark:ring-[#e5c890]/50' : ''}"
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
                            <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
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
                            <div class="flex items-center gap-2 border-b border-brand-sand-100 dark:border-[#414559] pb-2">
                                <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-500 dark:text-[#e5c890]">
                                    <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
                                </div>
                                <div class="min-w-0">
                                    <p class="text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">{$t("dialog.display_options")}</p>
                                    <p class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">{$t("translation.reading_style")}</p>
                                </div>
                            </div>

                            <div>
                                <span class={labelClass}>{$t("dialog.font_size")}</span>
                                <div class="flex items-center gap-2">
                                    <button onclick={decFontSize} disabled={$translationFontSize <= TRANSLATION_FONT_SIZE_BOUNDS.min} aria-label={$t("dialog.decrease_font_size")} class={adjustButtonClass}><svg width="10" height="2" viewBox="0 0 10 2" fill="none"><line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                                    <span class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-center text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums">{$translationFontSize}px</span>
                                    <button onclick={incFontSize} disabled={$translationFontSize >= TRANSLATION_FONT_SIZE_BOUNDS.max} aria-label={$t("dialog.increase_font_size")} class={adjustButtonClass}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                                    <button onclick={resetFontSize} aria-label={$t("dialog.reset_font_size")} title={$t("dialog.reset")} class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] transition-all hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"><Icon icon="solar:restart-linear" width="0.9rem" /></button>
                                </div>
                            </div>

                            <div>
                                <span class={labelClass}>{$t("dialog.line_spacing")}</span>
                                <div class="flex items-center gap-2">
                                    <button onclick={decLineSpacing} disabled={$translationLineSpacing <= TRANSLATION_LINE_SPACING_BOUNDS.min} aria-label={$t("dialog.decrease_line_spacing")} class={adjustButtonClass}><svg width="10" height="2" viewBox="0 0 10 2" fill="none"><line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                                    <span class="flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 text-center text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] tabular-nums">{$translationLineSpacing.toFixed(1)}x</span>
                                    <button onclick={incLineSpacing} disabled={$translationLineSpacing >= TRANSLATION_LINE_SPACING_BOUNDS.max} aria-label={$t("dialog.increase_line_spacing")} class={adjustButtonClass}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
                                    <button onclick={resetLineSpacing} aria-label={$t("dialog.reset_line_spacing")} title={$t("dialog.reset")} class="cursor-pointer flex h-8 w-8 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] transition-all hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"><Icon icon="solar:restart-linear" width="0.9rem" /></button>
                                </div>
                            </div>

                            <div>
                                <label for="translation-font-family" class={labelClass}>{$t("dialog.font_family")}</label>
                                <div class="relative">
                                    <select id="translation-font-family" value={$translationFontFamily} onchange={(e) => translationFontFamily.set((e.currentTarget as HTMLSelectElement).value)} class={selectClass}>
                                        <option value="">{$t("dialog.default")}</option>
                                        {#each fontFamilyOptions as font}
                                            <option value={font}>{font}</option>
                                        {/each}
                                    </select>
                                    <span class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300 dark:text-[#838ba7]"><Icon icon="charm:chevron-down" width="0.75rem" /></span>
                                </div>
                                <button onclick={() => { showOptions = false; openCustomFontDialog(); }} class="cursor-pointer mt-2 flex w-full items-center justify-center gap-1.5 rounded-full border border-brand-gold-200 dark:border-[#e5c890]/30 bg-brand-gold-100/80 dark:bg-[#414559] px-3 py-1.5 text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890] transition-all hover:bg-brand-gold-200 dark:hover:bg-[#51576d]">
                                    <Icon icon="solar:add-circle-linear" width="0.8rem" />
                                    {$t('settings.custom_fonts.add_custom')}
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

        <div class="default-scroll flex-1 overflow-y-auto px-5 py-0">
            {#if totalEntries > 0}
                {#each sections as section, sIdx (section.surah)}
                    {#if isMulti}
                        <div class="sticky top-0 z-[1] -mx-5 mb-1 px-5 py-2 bg-brand-gold-50 dark:bg-[#292c3c]/95 backdrop-blur border-y border-brand-gold-200 dark:border-[#414559] {sIdx > 0 ? 'mt-4' : '-mt-3'}">
                            <div class="flex items-center gap-2">
                                <span class="inline-flex items-center justify-center h-6 px-2.5 rounded-full bg-brand-gold-200 dark:bg-[#414559] text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890]">{section.surah}</span>
                                <span class="text-[12px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] truncate">{labelFor(section.surah)}</span>
                                <span class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">· {section.entries.length}</span>
                            </div>
                        </div>
                    {/if}
                    {#if section.entries.length === 0}
                        <div class="py-3 text-[12px] text-brand-charcoal-300 dark:text-[#838ba7]">{$t("translation.empty")}</div>
                    {:else}
                        <div class="flex flex-col">
                            {#each section.entries as entry, i (entry.ayah)}
                                {@const fnotes = parseFootnotes(entry)}
                                <div class="py-3 {i > 0 ? 'border-t border-brand-sand-100 dark:border-[#414559]' : ''}">
                                    <div class="mb-1.5 flex items-center gap-2">
                                        <span class="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full bg-brand-gold-100 dark:bg-[#414559] text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890]">{entry.ayah}</span>
                                    </div>
                                    <div class="text-brand-charcoal-500 dark:text-[#b5bfe2]" dir={translationDir} style:font-family={translationFontStack} style:font-size={`${$translationFontSize}px`} style:line-height={$translationLineSpacing} style:text-align={translationDir === "ltr" ? "left" : "right"}>
                                        <p>{entry.text}</p>
                                        {#if fnotes}
                                            <ol class="mt-2 space-y-1 text-[0.88em] text-brand-charcoal-300 dark:text-[#838ba7] list-decimal list-inside">
                                                {#each Object.entries(fnotes) as [num, text]}
                                                    <li><span class="font-medium">[{num}]</span> {text}</li>
                                                {/each}
                                            </ol>
                                        {/if}
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
                <div class="py-6 text-center text-sm text-brand-charcoal-300 dark:text-[#838ba7]">{$t("translation.empty")}</div>
            {/if}
        </div>

        <!-- Only the floating panel resizes itself; a native window is resized
             by its own frame. -->
        {#each standalone ? [] : resizeHandles as { cls, dir }}
            <div aria-hidden="true" class="resize-handle {cls}" onpointerdown={(e) => startResize(e, dir)}></div>
        {/each}
    </div>
{/if}

<style>
    .resize-handle { position: absolute; z-index: 10; }
    .resize-n { top: 0; left: 6px; right: 6px; height: 6px; cursor: n-resize; }
    .resize-s { bottom: 0; left: 6px; right: 6px; height: 6px; cursor: s-resize; }
    .resize-e { top: 6px; right: 0; bottom: 6px; width: 6px; cursor: e-resize; }
    .resize-w { top: 6px; left: 0; bottom: 6px; width: 6px; cursor: w-resize; }
    .resize-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
    .resize-se { bottom: 0; right: 0; width: 20px; height: 20px; cursor: se-resize; }
    .resize-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
    .resize-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
    .resize-se::before { content: ""; position: absolute; bottom: 12px; right: 12px; width: 5px; height: 5px; border-bottom: 1.5px solid rgba(130, 130, 130, 0.4); border-right: 1.5px solid rgba(130, 130, 130, 0.4); border-bottom-right-radius: 5px; pointer-events: none; }
    .resize-se::after { content: ""; position: absolute; bottom: 8px; right: 8px; width: 9px; height: 9px; border-bottom: 1.5px solid rgba(130, 130, 130, 0.55); border-right: 1.5px solid rgba(130, 130, 130, 0.55); border-bottom-right-radius: 9px; pointer-events: none; }
</style>
