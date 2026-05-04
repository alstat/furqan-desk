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
        surahTafsir,
        multiSurahTafsirMap,
        activeTafsirId,
        availableTafsirAuthors,
    } from "$lib/stores/translation.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { t } from "$lib/i18n";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    const { open, onClose }: Props = $props();

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

    const surahName = $derived($surahLabels[$selectedSurahIdx - 1]?.en ?? "");

    function labelFor(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    type Section = { surah: number; entries: { ayah: number; text: string }[] };

    const sections = $derived.by((): Section[] => {
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

    const isMulti = $derived(($morphologyMultiSurahList?.length ?? 0) > 1);
    const totalEntries = $derived(
        sections.reduce((sum, s) => sum + s.entries.length, 0),
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
</script>

{#if open}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("tafsir.dialog_title")}
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
    >
        <!-- Header (drag handle) -->
        <div
            class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4 select-none {isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                    >
                        <Icon
                            icon="solar:book-2-bold-duotone"
                            class="text-brand-gold-500"
                            width="1rem"
                        />
                    </div>
                    <div class="min-w-0">
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] truncate"
                        >
                            {#if isMulti}
                                {$t("tafsir.dialog_title")} — {sections
                                    .map((s) => labelFor(s.surah))
                                    .join(", ")}
                            {:else}
                                {$t("tafsir.dialog_title")}{surahName
                                    ? ` — ${surahName}`
                                    : ""}
                            {/if}
                        </h2>
                        {#if authorName}
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7] truncate"
                            >
                                {authorName}
                            </p>
                        {/if}
                    </div>
                </div>
                <button
                    onclick={onClose}
                    aria-label="Close"
                    class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
                </button>
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
                                            class="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-2 rounded-full bg-brand-gold-100 dark:bg-[#414559] text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890]"
                                        >
                                            {entry.ayah}
                                        </span>
                                    </div>
                                    <div
                                        class="tafsir-content text-[13px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]"
                                        style:direction={tafsirDir}
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
            {:else}
                <div
                    class="py-6 text-center text-sm text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("tafsir.empty")}
                </div>
            {/if}
        </div>

        <!-- Resize handles -->
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
