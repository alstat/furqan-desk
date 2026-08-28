<script lang="ts">
    import Icon from "@iconify/svelte";
    import { surahLabels, selectedSurahIdx } from "$lib/stores/quran.svelte";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";
    import { pendingJumpAyah } from "$lib/stores/bookmarks.store";
    import { requestPlayBlock } from "$lib/stores/recitation.store";
    import { manuscriptsEnabled, openManuscriptViewer } from "$lib/stores/manuscripts.store";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection } from "$lib/stores/ai-chat.store";
    import { t } from "$lib/i18n";
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
        const target = e.target as (Node & HTMLElement) | null;
        if (
            aiPromptOpen &&
            target &&
            !(target as HTMLElement).closest?.("[data-quran-block-ai-prompt]")
        ) {
            closeAiPrompt();
        }
        if (!showControls) return;
        if (blockEl && target && blockEl.contains(target)) return;
        showControls = false;
    }

    function playAyah(e: MouseEvent, surah: number, ayah: number) {
        e.preventDefault();
        e.stopPropagation();
        const playlist = verses.map((v) => ({ surah: v.surah, ayah: v.ayah }));
        const startIdx = playlist.findIndex(
            (p) => p.surah === surah && p.ayah === ayah,
        );
        if (startIdx < 0) return;
        requestPlayBlock.set({ playlist, startIdx });
    }

    function viewInMorphology(e: MouseEvent, surah: number, ayah: number) {
        e.preventDefault();
        e.stopPropagation();
        selectedSurahIdx.set(surah);
        pendingJumpAyah.set(ayah);
    }

    function viewManuscripts(e: MouseEvent, surah: number, ayah: number) {
        e.preventDefault();
        e.stopPropagation();
        void openManuscriptViewer({ surah, ayah });
    }

    // --- AI prompt for an ayah (Pro) ---
    let aiPromptOpen = $state(false);
    let aiPromptX = $state(0);
    let aiPromptY = $state(0);
    let aiPromptText = $state("");
    let aiPromptInput: HTMLInputElement | null = $state(null);
    let aiPromptCtx: {
        surah: number;
        ayah: number;
        arabic: string;
    } | null = $state(null);

    function openAiPromptForAyah(
        e: MouseEvent,
        surah: number,
        ayah: number,
        arabic: string,
    ) {
        e.preventDefault();
        e.stopPropagation();
        aiPromptCtx = { surah, ayah, arabic };
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        aiPromptX = rect.left + rect.width / 2;
        aiPromptY = rect.bottom + 8;
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
        const contextPrompt = `${surahName} · Ayah ${ctx.ayah}\nArabic: ${ctx.arabic}`;
        askAiAboutSelection({
            prompt,
            selectedText: ctx.arabic,
            contextPrompt,
        });
        closeAiPrompt();
    }
</script>

<svelte:window on:click={onWindowClick} />

{#snippet surahNameHeader(name: string)}
    <div class="mb-2" dir="ltr">
        <div class="flex items-center">
            <!-- Left decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
                <div class="flex items-center gap-0.5 px-1.5">
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                </div>
            </div>
            <!-- Surah name panel -->
            <div class="relative flex items-center justify-center border border-brand-gold-400/80 dark:border-[#e5c890]/70 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-[#e5c890]/10 dark:to-transparent px-4 h-7">
                <div class="pointer-events-none absolute inset-0.5 border border-brand-gold-200/40 dark:border-[#e5c890]/40"></div>
                <span class="absolute -top-[3px] left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                <span class="absolute -bottom-[3px] left-1/2 inline-block h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                <span class="absolute -left-[3px] -top-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -right-[3px] -top-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -bottom-[3px] -left-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -bottom-[3px] -right-[3px] inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="relative block font-scheherazade text-sm leading-none text-brand-charcoal-500 dark:text-brand-charcoal-100 translate-y-[1px]">{name}</span>
            </div>
            <!-- Right decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="flex items-center gap-0.5 px-1.5">
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                    <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                </div>
                <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
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
            class="absolute -top-3 right-1 z-10 flex items-center gap-0.5 rounded-full border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-md px-1 py-0.5"
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
                class="cursor-pointer min-w-[2.25rem] px-1 text-[0.625rem] font-sans font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
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
                    <span
                        data-surah={v.surah}
                        data-ayah={v.ayah}
                        class="quran-block-ayah"
                        >{v.arabic}</span
                    ><span
                        class="group/ayah-num relative inline-block whitespace-nowrap"
                        ><span
                            class="font-scheherazade mx-1 text-[0.95em] text-brand-gold-600 dark:text-[#e5c890]"
                            >&#x2060;﴿&#x2060;{arabicNumerals(v.ayah)}&#x2060;﴾&#x2060;</span
                        ><span
                            dir="ltr"
                            class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"
                            contenteditable="false"
                            >{#if $isPro}<button
                                    type="button"
                                    onmousedown={(e) => e.preventDefault()}
                                    onclick={(e) => openAiPromptForAyah(e, v.surah, v.ayah, v.arabic)}
                                    title={$t("morphology.ai_ask_ayah", { ayah: String(v.ayah) })}
                                    aria-label={$t("morphology.ai_ask_ayah", { ayah: String(v.ayah) })}
                                    class="cursor-pointer flex items-center justify-center bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"
                                    ><Icon icon="ri:chat-smile-ai-fill" width="0.6rem" /></button
                                >{/if}{#if $manuscriptsEnabled}<button
                                    type="button"
                                    onmousedown={(e) => e.preventDefault()}
                                    onclick={(e) => viewManuscripts(e, v.surah, v.ayah)}
                                    title={$t("morphology.view_manuscripts", { ayah: String(v.ayah) })}
                                    aria-label={$t("morphology.view_manuscripts", { ayah: String(v.ayah) })}
                                    class="cursor-pointer flex items-center justify-center bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"
                                    ><Icon icon="streamline-plump:script-2-solid" width="0.6rem" /></button
                                >{/if}<button
                                type="button"
                                onmousedown={(e) => e.preventDefault()}
                                onclick={(e) => playAyah(e, v.surah, v.ayah)}
                                title={$t("morphology.play_ayah", { ayah: String(v.ayah) })}
                                aria-label={$t("morphology.play_ayah", { ayah: String(v.ayah) })}
                                class="cursor-pointer flex items-center justify-center bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"
                                ><Icon icon="solar:play-bold" width="0.6rem" /></button
                            ><button
                                type="button"
                                onmousedown={(e) => e.preventDefault()}
                                onclick={(e) => viewInMorphology(e, v.surah, v.ayah)}
                                title={$t("quran_block.view_in_quran", { ayah: String(v.ayah) })}
                                aria-label={$t("quran_block.view_in_quran", { ayah: String(v.ayah) })}
                                class="cursor-pointer flex items-center justify-center bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"
                                ><Icon icon="ph:book-open-fill" width="0.6rem" /></button
                            ></span
                        ></span
                    >{' '}
                {/each}
            </div>
        </div>
    {/each}

    <!-- Bottom decorative rule -->
    <div class="mt-2 flex items-center" dir="ltr">
        <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
        <div class="flex items-center gap-0.5 px-1.5">
            <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
            <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
            <span class="inline-block h-1 w-1 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
        </div>
        <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
    </div>
</div>

{#if aiPromptOpen && aiPromptCtx}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        data-quran-block-ai-prompt
        contenteditable="false"
        role="presentation"
        class="fixed z-[9999] flex w-80 items-center gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        style="left:{aiPromptX}px; top:{aiPromptY}px; transform: translateX(-50%);"
        onclick={(e) => e.stopPropagation()}
        onmousedown={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') closeAiPrompt(); }}
    >
        <input
            bind:this={aiPromptInput}
            bind:value={aiPromptText}
            placeholder={$t("morphology.ai_prompt_placeholder")}
            class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2 py-1.5 text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
            onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitAiPrompt(); }
                else if (e.key === 'Escape') { closeAiPrompt(); }
            }}
        />
        <button
            type="button"
            onclick={submitAiPrompt}
            disabled={!aiPromptText.trim()}
            aria-label={$t("morphology.ai_ask_ayah", { ayah: String(aiPromptCtx.ayah) })}
            title={$t("morphology.ai_ask_ayah", { ayah: String(aiPromptCtx.ayah) })}
            class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
        </button>
    </div>
{/if}
