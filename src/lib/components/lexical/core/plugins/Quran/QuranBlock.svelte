<script lang="ts">
    import Icon from "@iconify/svelte";
    import { surahLabels } from "$lib/stores/quran.svelte";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import {
        $isQuranBlockNode as isQuranBlockNode,
        QURAN_FONT_SCALE_DEFAULT,
        QURAN_FONT_SCALE_MIN,
        QURAN_FONT_SCALE_MAX,
        QURAN_FONT_SCALE_STEP,
    } from "./QuranBlockNode";

    interface Verse {
        surah: number;
        ayah: number;
        arabic: string;
    }

    interface Props {
        verses: Verse[];
        nodeKey: string;
        fontScale?: number;
    }

    let { verses, nodeKey, fontScale = QURAN_FONT_SCALE_DEFAULT }: Props = $props();

    const editor = getEditor();

    function arabicNumerals(n: number): string {
        const digits = "٠١٢٣٤٥٦٧٨٩";
        return String(n)
            .split("")
            .map((d) => digits[+d] ?? d)
            .join("");
    }

    function nameFor(surah: number): string {
        return (
            getSurahNameTashkeel(surah) ||
            $surahLabels[surah - 1]?.ar ||
            $surahLabels[surah - 1]?.en ||
            `Surah ${surah}`
        );
    }

    type Group = { surah: number; verses: Verse[] };
    const groups = $derived.by((): Group[] => {
        const out: Group[] = [];
        for (const v of verses) {
            const last = out[out.length - 1];
            if (last && last.surah === v.surah) last.verses.push(v);
            else out.push({ surah: v.surah, verses: [v] });
        }
        return out;
    });

    const verseFontSize = $derived(`${1.2 * fontScale}rem`);

    let showControls = $state(false);
    let blockEl = $state<HTMLDivElement | null>(null);

    function setScale(next: number) {
        const clamped = Math.min(
            QURAN_FONT_SCALE_MAX,
            Math.max(QURAN_FONT_SCALE_MIN, next),
        );
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (isQuranBlockNode(node)) node.setFontScale(clamped);
        });
    }

    function increase(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(+(fontScale + QURAN_FONT_SCALE_STEP).toFixed(2));
    }
    function decrease(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(+(fontScale - QURAN_FONT_SCALE_STEP).toFixed(2));
    }
    function reset(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        setScale(QURAN_FONT_SCALE_DEFAULT);
    }

    function onBlockClick(e: MouseEvent) {
        e.stopPropagation();
        showControls = true;
    }

    function onWindowClick(e: MouseEvent) {
        if (!showControls) return;
        const target = e.target as Node | null;
        if (blockEl && target && blockEl.contains(target)) return;
        showControls = false;
    }
</script>

<svelte:window on:click={onWindowClick} />

{#snippet surahNameHeader(name: string)}
    <div class="mb-2" dir="ltr">
        <div class="flex items-center">
            <!-- Left decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
                <div class="flex items-center gap-0.5 px-1.5">
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                </div>
            </div>
            <!-- Surah name panel -->
            <div class="relative flex items-center justify-center border border-brand-gold-400/80 dark:border-brand-gold-400/70 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-brand-gold-400/10 dark:to-transparent px-4 h-7">
                <div class="pointer-events-none absolute inset-0.5 border border-brand-gold-200/40 dark:border-brand-gold-400/40"></div>
                <span class="absolute -top-[3px] left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -bottom-[3px] left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -left-[3px] -top-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -right-[3px] -top-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-[3px] -left-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-[3px] -right-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="relative block font-scheherazade text-sm leading-none text-brand-charcoal-500 dark:text-brand-charcoal-100 translate-y-[1px]">{name}</span>
            </div>
            <!-- Right decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="flex items-center gap-0.5 px-1.5">
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                </div>
                <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
            </div>
        </div>
    </div>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    bind:this={blockEl}
    contenteditable="false"
    onclick={onBlockClick}
    class="quran-block relative my-2 mx-3 inline-block w-[calc(100%-1.5rem)] px-4 py-3 cursor-pointer"
>
    {#if showControls}
        <div
            class="absolute -top-3 right-1 z-10 flex items-center gap-0.5 rounded-full border border-brand-gold-300 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-md px-1 py-0.5"
            onclick={(e) => e.stopPropagation()}
            role="toolbar"
            aria-label="Quran block font size"
        >
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={decrease}
                disabled={fontScale <= QURAN_FONT_SCALE_MIN + 1e-6}
                title="Decrease font size"
                aria-label="Decrease font size"
                class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-full text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-100 dark:hover:bg-[#414559] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                <Icon icon="solar:minus-circle-linear" width="0.9rem" />
            </button>
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={reset}
                title="Reset font size"
                aria-label="Reset font size"
                class="cursor-pointer min-w-[2.25rem] px-1 text-[10px] font-sans font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            >
                {Math.round(fontScale * 100)}%
            </button>
            <button
                type="button"
                onmousedown={(e) => e.preventDefault()}
                onclick={increase}
                disabled={fontScale >= QURAN_FONT_SCALE_MAX - 1e-6}
                title="Increase font size"
                aria-label="Increase font size"
                class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-full text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-100 dark:hover:bg-[#414559] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                <Icon icon="solar:add-circle-linear" width="0.9rem" />
            </button>
        </div>
    {/if}

    {#each groups as group, gIdx (group.surah + ':' + gIdx)}
        <div class={gIdx > 0 ? 'mt-3' : ''}>
            {@render surahNameHeader(nameFor(group.surah))}
            <div
                dir="rtl"
                class="font-scheherazade leading-[1.95] -my-4 text-brand-charcoal-500 dark:text-brand-charcoal-100 text-justify"
                style="text-align-last: center; font-size: {verseFontSize};"
            >
                {#each group.verses as v (v.surah + ':' + v.ayah)}
                    <span>{v.arabic}</span><span
                        class="font-scheherazade mx-1 text-[0.95em] text-brand-gold-600 dark:text-[#e5c890]"
                        >&#x2060;﴿&#x2060;{arabicNumerals(v.ayah)}&#x2060;﴾&#x2060;</span
                    >{' '}
                {/each}
            </div>
        </div>
    {/each}

    <!-- Bottom decorative rule -->
    <div class="mt-2 flex items-center" dir="ltr">
        <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
        <div class="flex items-center gap-0.5 px-1.5">
            <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
            <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
            <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
        </div>
        <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
    </div>
</div>
