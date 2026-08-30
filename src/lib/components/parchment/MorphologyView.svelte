<script lang="ts">
    import { convertToArabicNumbers } from "$lib/functions/utils/utils";
    import {
        surahMorphology,
        basmallahMorphology,
        selectedSurahName,
        morphologyAyahFilter,
        morphologyMultiSurahList,
        surahLabels,
    } from "$lib/stores/quran.svelte";
    import { morphFontFamily } from "$lib/stores/morphology.store";
    import type { MorphWord } from "$lib/types/morphology";
    import WordMorphologyPopover from "./WordMorphologyPopover.svelte";
    import { setLastRead } from "$lib/functions/bookmarks";
    import { currentReadingAyah, pendingHighlight } from "$lib/stores/bookmarks.store";
    import Icon from "@iconify/svelte";
    import { requestPlayAyah, requestPlayPosition, requestPlayBasmallah } from "$lib/stores/recitation.store";
    import { invoke } from '@tauri-apps/api/core';
    import { activeTranslatorId, surahTranslation, basmallahTranslation, transliterationEnabled, surahTransliteration, wordByWordEnabled, wordByWordLang, surahWordByWord, multiSurahTranslationMap, multiSurahTransliterationMap, multiSurahWordByWordMap, tafsirEnabled, activeTafsirId, surahTafsir, multiSurahTafsirMap, availableTafsirAuthors, tafsirDialogOpen, translationDialogOpen, availableTranslators } from '$lib/stores/translation.store';
    import type { AyahTranslation, AyahTafsir } from '$lib/stores/translation.store';
    import { manuscriptsEnabled, openManuscriptViewer } from '$lib/stores/manuscripts.store';
    import { arabicStudyEnabled, openVerseStudy } from '$lib/stores/arabic-study.store';
    import { isPro } from '$lib/stores/auth.store';
    import { askAiAboutSelection, AI_FEATURE_TAGS } from '$lib/stores/ai-chat.store';
    import { t } from '$lib/i18n';
    import {
        zenMode,
        zenPeek,
        tafsirFontFamily,
        tafsirFontSize,
        tafsirLineSpacing,
        translationFontFamily,
        translationFontSize,
        translationLineSpacing,
    } from "$lib/stores/editor.store";
    import { getSurahNameTashkeel } from '$lib/data/surah-names-tashkeel';
    import { cachedSurahText } from '$lib/stores/surah-cache';

    // Each multi-surah loader fans out over several surahs, so a slow batch can
    // still be in flight when the displayed list changes. Without a generation
    // check the older batch resolves last and overwrites the newer one — the
    // single-surah effects below already guard this by re-checking the surah.
    let multiTranslationGen = 0;
    let multiTransliterationGen = 0;
    let multiWordByWordGen = 0;
    let multiTafsirGen = 0;

    $effect(() => {
        const tid = $activeTranslatorId;
        const surah = $surahMorphology?.surah;
        if (!tid || !surah) { surahTranslation.set(null); return; }
        cachedSurahText('translation', surah, tid, () =>
            invoke<AyahTranslation[]>('get_surah_translation', { surah, translatorId: tid }))
            .then(rows => { if ($surahMorphology?.surah === surah) surahTranslation.set(rows); })
            .catch(() => surahTranslation.set(null));
    });

    $effect(() => {
        const tid = $activeTranslatorId;
        if (!tid) { basmallahTranslation.set(null); return; }
        cachedSurahText('translation', 1, tid, () =>
            invoke<AyahTranslation[]>('get_surah_translation', { surah: 1, translatorId: tid }))
            .then(rows => basmallahTranslation.set(rows.find(r => r.ayah === 1) ?? null))
            .catch(() => basmallahTranslation.set(null));
    });

    $effect(() => {
        const enabled = $transliterationEnabled;
        const surah = $surahMorphology?.surah;
        if (!enabled || !surah) { surahTransliteration.set(null); return; }
        cachedSurahText('translit', surah, '-', () =>
            invoke<Array<{ayah: number; text: string}>>('get_surah_transliteration', { surah }))
            .then(rows => { if ($surahMorphology?.surah === surah) surahTransliteration.set(new Map(rows.map(r => [r.ayah, r.text]))); })
            .catch(() => surahTransliteration.set(null));
    });

    $effect(() => {
        const enabled = $wordByWordEnabled;
        const surah = $surahMorphology?.surah;
        const lang = $wordByWordLang;
        if (!enabled || !surah) { surahWordByWord.set(null); return; }
        cachedSurahText('wbw', surah, lang, () =>
            invoke<Array<{ayah: number; word: number; text: string}>>('get_surah_word_by_word', { surah, lang }))
            .then(rows => {
                if ($surahMorphology?.surah !== surah) return;
                surahWordByWord.set(new Map(rows.map(r => [`${r.ayah}:${r.word}`, r.text])));
            })
            .catch(() => surahWordByWord.set(null));
    });

    $effect(() => {
        const tid = $activeTafsirId;
        const surah = $surahMorphology?.surah;
        if (!tid || !surah || !$tafsirEnabled) { surahTafsir.set(null); return; }
        cachedSurahText('tafsir', surah, tid, () =>
            invoke<AyahTafsir[]>('get_surah_tafsir', { surah, authorId: tid }))
            .then(rows => { if ($surahMorphology?.surah === surah) surahTafsir.set(rows); })
            .catch(() => surahTafsir.set(null));
    });

    // Multi-surah translation/transliteration/wbw loading
    $effect(() => {
        const list = $morphologyMultiSurahList;
        const tid = $activeTranslatorId;
        if (!list || !tid) { multiSurahTranslationMap.set(null); return; }
        const gen = ++multiTranslationGen;
        Promise.all(list.map(s =>
            cachedSurahText('translation', s.surah, tid, () =>
                invoke<AyahTranslation[]>('get_surah_translation', { surah: s.surah, translatorId: tid }))
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r]))] as const)
                .catch(() => [s.surah, new Map<number, AyahTranslation>()] as const)
        )).then(entries => {
            if (gen !== multiTranslationGen) return;
            multiSurahTranslationMap.set(new Map(entries));
        });
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const enabled = $transliterationEnabled;
        if (!list || !enabled) { multiSurahTransliterationMap.set(null); return; }
        const gen = ++multiTransliterationGen;
        Promise.all(list.map(s =>
            cachedSurahText('translit', s.surah, '-', () =>
                invoke<Array<{ayah: number; text: string}>>('get_surah_transliteration', { surah: s.surah }))
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r.text]))] as const)
                .catch(() => [s.surah, new Map<number, string>()] as const)
        )).then(entries => {
            if (gen !== multiTransliterationGen) return;
            multiSurahTransliterationMap.set(new Map(entries));
        });
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const enabled = $wordByWordEnabled;
        const lang = $wordByWordLang;
        if (!list || !enabled) { multiSurahWordByWordMap.set(null); return; }
        const gen = ++multiWordByWordGen;
        Promise.all(list.map(s =>
            cachedSurahText('wbw', s.surah, lang, () =>
                invoke<Array<{ayah: number; word: number; text: string}>>('get_surah_word_by_word', { surah: s.surah, lang }))
                .then(rows => [s.surah, new Map(rows.map(r => [`${r.ayah}:${r.word}`, r.text]))] as const)
                .catch(() => [s.surah, new Map<string, string>()] as const)
        )).then(entries => {
            if (gen !== multiWordByWordGen) return;
            multiSurahWordByWordMap.set(new Map(entries));
        });
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const tid = $activeTafsirId;
        const enabled = $tafsirEnabled;
        if (!list || !tid || !enabled) { multiSurahTafsirMap.set(null); return; }
        const gen = ++multiTafsirGen;
        Promise.all(list.map(s =>
            cachedSurahText('tafsir', s.surah, tid, () =>
                invoke<AyahTafsir[]>('get_surah_tafsir', { surah: s.surah, authorId: tid }))
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r.text]))] as const)
                .catch(() => [s.surah, new Map<number, string>()] as const)
        )).then(entries => {
            if (gen !== multiTafsirGen) return;
            multiSurahTafsirMap.set(new Map(entries));
        });
    });

    const translationMap = $derived(
        $surahTranslation
            ? new Map($surahTranslation.map(r => [r.ayah, r]))
            : null
    );

    const tafsirMap = $derived(
        $surahTafsir
            ? new Map($surahTafsir.map(r => [r.ayah, r.text]))
            : null
    );

    const RTL_TAFSIR_LANGS = new Set(['AR', 'UR', 'PS', 'FA']);
    const tafsirDir = $derived.by((): 'rtl' | 'ltr' => {
        const author = $availableTafsirAuthors.find(a => a.id === $activeTafsirId);
        return author && RTL_TAFSIR_LANGS.has(author.lang) ? 'rtl' : 'ltr';
    });

    const tafsirFontStack = $derived.by(() => {
        const f = $tafsirFontFamily.trim();
        return f ? `"${f}", system-ui, sans-serif` : "";
    });

    const RTL_TRANSLATION_LANGS = new Set(['AR', 'UR', 'PS', 'FA']);
    const translationDir = $derived.by((): 'rtl' | 'ltr' => {
        const translator = $availableTranslators.find(tr => tr.id === $activeTranslatorId);
        return translator && RTL_TRANSLATION_LANGS.has(translator.lang) ? 'rtl' : 'ltr';
    });

    const translationFontStack = $derived.by(() => {
        const f = $translationFontFamily.trim();
        return f ? `"${f}", system-ui, sans-serif` : "";
    });

    let expandedTafsirAyahs = $state(new Set<number>());

    function toggleTafsir(ayah: number) {
        const next = new Set(expandedTafsirAyahs);
        if (next.has(ayah)) { next.delete(ayah); } else { next.add(ayah); }
        expandedTafsirAyahs = next;
    }

    // Compound key set for multi-surah tafsir expand/collapse (avoids collisions across surahs)
    let expandedMultiTafsirKeys = $state(new Set<string>());

    function toggleMultiTafsir(surah: number, ayah: number) {
        const key = `${surah}-${ayah}`;
        const next = new Set(expandedMultiTafsirKeys);
        if (next.has(key)) { next.delete(key); } else { next.add(key); }
        expandedMultiTafsirKeys = next;
    }

    const displayAyahs = $derived(
        $surahMorphology
            ? ($morphologyAyahFilter
                ? $surahMorphology.ayahs.filter(a => $morphologyAyahFilter!.includes(a.ayah))
                : $surahMorphology.ayahs)
            : []
    );

    // State for selected word
    let selectedWord: { word: MorphWord; ayahNum: number; surahNum: number } | null =
        $state(null);
    let popoverPosition = $state({ x: 0, y: 0, placement: 'below' as 'above' | 'below' });

    // Pinned popovers — stay open until manually closed
    let pinnedPopovers: Array<{
        id: number;
        word: MorphWord;
        ayahNum: number;
        surahNum: number;
        position: { x: number; y: number; placement: 'above' | 'below' };
    }> = $state([]);
    let pinnedCounter = 0;

    // Progressive rendering — exponential chunk growth so large surahs fill fast
    const INITIAL_CHUNK = 30;
    const MAX_CHUNK = 120;
    let renderedAyahCount = $state(INITIAL_CHUNK);
    let renderRafId: number | null = null;
    let currentChunkSize = INITIAL_CHUNK;

    $effect(() => {
        if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; }

        if ($morphologyMultiSurahList !== null) return;

        const total = displayAyahs.length;
        currentChunkSize = INITIAL_CHUNK;
        renderedAyahCount = Math.min(INITIAL_CHUNK, total);

        if (total <= INITIAL_CHUNK) return;

        function renderMore() {
            renderRafId = null;
            currentChunkSize = Math.min(currentChunkSize * 2, MAX_CHUNK);
            renderedAyahCount = Math.min(renderedAyahCount + currentChunkSize, total);
            if (renderedAyahCount < total) {
                renderRafId = requestAnimationFrame(renderMore);
            }
        }
        renderRafId = requestAnimationFrame(renderMore);

        return () => { if (renderRafId !== null) { cancelAnimationFrame(renderRafId); renderRafId = null; } };
    });

    // Every word's class attribute calls this, and each of those is its own
    // effect subscribed to `selectedWord` — so one click re-runs it for every
    // word on screen (al-Baqarah is ~6,000). The table is hoisted out of the
    // function so a render pass stops allocating one object per word, and the
    // answer is memoized per word: token lists come from the read-only cached
    // morphology and never change, so a word's colour is computed once.
    const WORD_COLORS: Record<string, string> = {
        N: "hover:bg-blue-100 dark:hover:bg-blue-800/40",
        V: "hover:bg-green-100 dark:hover:bg-green-800/40",
        P: "hover:bg-purple-100 dark:hover:bg-purple-800/40",
        PN: "hover:bg-indigo-100 dark:hover:bg-indigo-800/40",
        ADJ: "hover:bg-yellow-100 dark:hover:bg-yellow-800/40",
        DET: "hover:bg-gray-100 dark:hover:bg-gray-600/40",
        PRON: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
        REL: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
        DEM: "hover:bg-pink-100 dark:hover:bg-pink-800/40",
        CONJ: "hover:bg-orange-100 dark:hover:bg-orange-800/40",
        NEG: "hover:bg-red-100 dark:hover:bg-red-800/40",
    };
    const DEFAULT_WORD_COLOR = "hover:bg-slate-100 dark:hover:bg-slate-600/40";
    const wordColorCache = new WeakMap<MorphWord, string>();

    function getWordColor(word: MorphWord): string {
        const cached = wordColorCache.get(word);
        if (cached !== undefined) return cached;

        const stemToken = word.tokens.find(
            (t) => !t.features.prefix_type && !t.features.suffix_type,
        );
        const tag = stemToken?.tag || word.tokens[0]?.tag || "N";
        const color = WORD_COLORS[tag] || DEFAULT_WORD_COLOR;
        wordColorCache.set(word, color);
        return color;
    }

    const POPOVER_WIDTH = 352;  // w-[22rem]
    const POPOVER_MIN_HEIGHT = 320;

    function isSelectedWord(word: MorphWord, surahNum: number, ayahNum: number): boolean {
        return selectedWord?.word === word && selectedWord?.surahNum === surahNum && selectedWord?.ayahNum === ayahNum;
    }

    function handleWordClick(event: MouseEvent, word: MorphWord, ayahNum: number) {
        const surahNum = Number((event.currentTarget as HTMLElement | null)?.dataset.surah ?? $surahMorphology?.surah ?? 0);

        if (isSelectedWord(word, surahNum, ayahNum)) {
            selectedWord = null;
            return;
        }

        const rect = (event.target as HTMLElement).getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        let x = rect.left;
        if (x + POPOVER_WIDTH > viewportWidth) x = viewportWidth - POPOVER_WIDTH - 8;
        if (x < 8) x = 8;

        const spaceBelow = viewportHeight - rect.bottom;
        const placement = spaceBelow >= POPOVER_MIN_HEIGHT ? 'below' : 'above';
        const y = placement === 'below' ? rect.bottom : rect.top;

        popoverPosition = { x, y, placement };
        selectedWord = { word, ayahNum, surahNum };

        if (surahNum > 0 && ayahNum > 0) {
            currentReadingAyah.set({ surah: surahNum, ayah: ayahNum });
            setLastRead(surahNum, ayahNum);
        }
    }

    function handleClickOutside(event: MouseEvent) {
        const clickedElement = event.target as HTMLElement;
        const isPopoverClick = clickedElement.closest(".ayah-tooltip");
        const isWordClick = clickedElement.closest(".morph-word");

        if (selectedWord !== null && !isPopoverClick && !isWordClick) {
            selectedWord = null;
        }

        if (aiPromptOpen && !clickedElement.closest('[data-ai-ayah-prompt]')) {
            closeAiPrompt();
        }
    }

    // --- AI prompt for an ayah (Pro) ---
    type AiPromptContext = {
        surah: number;
        ayahNum: number;
        arabic: string;
        translit: string | null;
        translation: string | null;
        wbw: string | null;
        tafsir: string | null;
    };
    let aiPromptOpen = $state(false);
    let aiPromptX = $state(0);
    let aiPromptY = $state(0);
    let aiPromptText = $state('');
    let aiPromptContext: AiPromptContext | null = $state(null);
    let aiPromptInput: HTMLInputElement | null = $state(null);

    function openAiPromptForAyah(
        event: MouseEvent,
        surah: number,
        ayahNum: number,
        words: MorphWord[],
        translitMap: Map<number, string> | null | undefined,
        transMap: Map<number, AyahTranslation> | null | undefined,
        wbwMap: Map<string, string> | null | undefined,
    ) {
        event.stopPropagation();
        if (
            aiPromptOpen &&
            aiPromptContext &&
            aiPromptContext.surah === surah &&
            aiPromptContext.ayahNum === ayahNum &&
            aiPromptContext.tafsir === null
        ) {
            closeAiPrompt();
            return;
        }
        const arabic = words.map(w => w.combined_arabic).join(' ');
        const translit = translitMap?.get(ayahNum) ?? null;
        const translation = transMap?.get(ayahNum)?.text ?? null;
        const wbw = wbwMap
            ? words.map(w => {
                const tr = wbwMap.get(`${ayahNum}:${w.word}`);
                return tr ? `${w.combined_arabic} (${tr})` : w.combined_arabic;
            }).join(' · ')
            : null;
        aiPromptContext = { surah, ayahNum, arabic, translit, translation, wbw, tafsir: null };
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        aiPromptX = rect.left + rect.width / 2;
        aiPromptY = rect.bottom + 8;
        aiPromptText = '';
        aiPromptOpen = true;
        queueMicrotask(() => aiPromptInput?.focus());
    }

    function stripHtml(html: string): string {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        return (tmp.textContent ?? tmp.innerText ?? '').trim();
    }

    function openAiPromptForTafsir(
        event: MouseEvent,
        surah: number,
        ayahNum: number,
        words: MorphWord[],
        tafsirHtml: string,
    ) {
        event.stopPropagation();
        if (
            aiPromptOpen &&
            aiPromptContext &&
            aiPromptContext.surah === surah &&
            aiPromptContext.ayahNum === ayahNum &&
            aiPromptContext.tafsir !== null
        ) {
            closeAiPrompt();
            return;
        }
        const arabic = words.map(w => w.combined_arabic).join(' ');
        const tafsir = stripHtml(tafsirHtml);
        aiPromptContext = {
            surah,
            ayahNum,
            arabic,
            translit: null,
            translation: null,
            wbw: null,
            tafsir,
        };
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        aiPromptX = rect.left + rect.width / 2;
        aiPromptY = rect.bottom + 8;
        aiPromptText = '';
        aiPromptOpen = true;
        queueMicrotask(() => aiPromptInput?.focus());
    }

    function closeAiPrompt() {
        aiPromptOpen = false;
        aiPromptContext = null;
        aiPromptText = '';
    }

    function submitAiPrompt() {
        const prompt = aiPromptText.trim();
        const ctx = aiPromptContext;
        if (!prompt || !ctx) return;
        const surahName = getSurahNameTashkeel(ctx.surah) || ($surahLabels[ctx.surah - 1]?.en ?? `Surah ${ctx.surah}`);
        const lines: string[] = [`${surahName} · Ayah ${ctx.ayahNum}`];
        if (ctx.translit) lines.push(`Transliteration: ${ctx.translit}`);
        if (ctx.translation) lines.push(`Translation: ${ctx.translation}`);
        if (ctx.wbw) lines.push(`Word-by-word: ${ctx.wbw}`);
        if (ctx.tafsir) lines.push(`Tafsir:\n${ctx.tafsir}`);
        const contextPrompt = lines.join('\n');
        askAiAboutSelection({
            prompt,
            selectedText: ctx.arabic,
            contextPrompt,
            feature: AI_FEATURE_TAGS.morphologyViewer,
        });
        closeAiPrompt();
    }
</script>

<svelte:window on:click={handleClickOutside} />

{#if aiPromptOpen && aiPromptContext}
    <div
        data-ai-ayah-prompt
        role="presentation"
        class="fixed z-9999 flex w-80 items-center gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95 p-1 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        style="left:{aiPromptX}px; top:{aiPromptY}px; transform: translateX(-50%);"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { if (e.key === 'Escape') closeAiPrompt(); }}
    >
        <input
            bind:this={aiPromptInput}
            bind:value={aiPromptText}
            placeholder={$t('morphology.ai_prompt_placeholder')}
            class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2 py-1.5 text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
            onkeydown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); submitAiPrompt(); }
                else if (e.key === 'Escape') closeAiPrompt();
            }}
        />
        <button
            class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            disabled={!aiPromptText.trim()}
            onclick={submitAiPrompt}
            title={$t('morphology.ai_ask_ayah', { ayah: String(aiPromptContext.ayahNum) })}
        >
            <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
        </button>
    </div>
{/if}

{#snippet surahNameHeader(name: string, spacing: string)}
    <div class="{spacing}" dir="ltr">
        <div class="flex items-center">
            <!-- Left decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                </div>
            </div>
            <!-- Surah name panel -->
            <div class="relative border border-brand-gold-400/80 dark:border-[#e5c890]/70 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-[#e5c890]/10 dark:to-transparent px-10 py-4">
                <div class="pointer-events-none absolute inset-0.75 border border-brand-gold-200/40 dark:border-[#e5c890]/40"></div>
                <span class="absolute -top-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                <span class="absolute -bottom-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                <span class="absolute -left-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -right-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -bottom-1 -left-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="absolute -bottom-1 -right-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/80"></span>
                <span class="relative font-scheherazade text-2xl leading-none text-slate-700 dark:text-[#c6d0f5]">{name}</span>
            </div>
            <!-- Right decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-[#e5c890]/90"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-[#d4b57f]/65"></span>
                </div>
                <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-[#d4b57f]/70"></div>
            </div>
        </div>
    </div>
{/snippet}

<!-- pb-20 on top of the scroller's own pb-20: the recitation player floats over
     the bottom of the frame (bottom-20 plus its own height, so it starts ~116px
     up), and 80px of scroller padding alone left the closing verse sitting
     underneath it. -->
<div dir="rtl" class="w-full min-w-0 pb-20">
    {#if $morphologyMultiSurahList !== null}
        <!-- Multi-surah mode: render each surah stacked -->
        {#each $morphologyMultiSurahList as surahData}
            {@const multiName = getSurahNameTashkeel(surahData.surah) || $surahLabels[surahData.surah - 1]?.ar || ''}
            {@const multiAyahs = $morphologyAyahFilter
                ? surahData.ayahs.filter(a => $morphologyAyahFilter!.includes(a.ayah))
                : surahData.ayahs}
            {@const multiTrans = $multiSurahTranslationMap?.get(surahData.surah) ?? null}
            {@const multiTranslit = $multiSurahTransliterationMap?.get(surahData.surah) ?? null}
            {@const multiWbw = $multiSurahWordByWordMap?.get(surahData.surah) ?? null}
            {@const multiTafsir = $multiSurahTafsirMap?.get(surahData.surah) ?? null}
            {@const hasExtras = (multiTrans !== null && !$translationDialogOpen) || multiTranslit !== null || multiWbw !== null || (multiTafsir !== null && !$tafsirDialogOpen)}
            {@render surahNameHeader(multiName, 'mb-6')}
            {#if surahData.surah !== 1 && surahData.surah !== 9 && $basmallahMorphology}
                <div id="ayah-{surahData.surah}-0" class="relative mb-6">
                    <div class="relative px-6 py-1">
                        <div class="relative text-center wrap-break-word leading-loose">
                            {#each $basmallahMorphology.words as word}<span
                                    role="button"
                                    tabindex="0"
                                    data-surah={surahData.surah}
                                    data-ayah={0}
                                    class="morph-word {$morphFontFamily} cursor-pointer rounded inline-block {getWordColor(word)} {isSelectedWord(word, surahData.surah, 0) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                    onclick={(e) => handleWordClick(e, word, 0)}
                                    onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, 0)}
                                >{word.combined_arabic}&nbsp;</span>{/each}<span class="group/ayah-num relative inline-block whitespace-nowrap"><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayBasmallah.set(surahData.surah)} title={$t('morphology.play_basmallah')} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span></span>
                        </div>
                    </div>
                    {#if $basmallahTranslation && multiTrans !== null && !$translationDialogOpen}
                        <div dir={translationDir} class="mt-1.5 px-6 text-sm leading-relaxed text-center text-brand-charcoal-500 dark:text-[#a5adce]" style:font-family={translationFontStack} style:font-size={`${$translationFontSize}px`} style:line-height={$translationLineSpacing}>
                            <p>{$basmallahTranslation.text}</p>
                        </div>
                    {/if}
                </div>
            {/if}
            {#if hasExtras}
                <!-- Block mode: one ayah per row with translation/transliteration/wbw -->
                <div dir="rtl" class="w-full min-w-0 mb-10" style="contain: style;">
                    {#if multiAyahs.length > 0 && multiAyahs[0].ayah > 1}
                        <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                            <span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(multiAyahs[0].ayah - 1)}&#x2060;﴿&#x2060;</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        </div>
                    {/if}
                    {#each multiAyahs as ayahData, i}
                        {#if i > 0 && ayahData.ayah !== multiAyahs[i - 1].ayah + 1}
                            <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                                <span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(ayahData.ayah - 1)}&#x2060;﴿&#x2060;</span>
                                <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                                <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                                <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            </div>
                        {/if}
                        <div class="{i > 0 && ayahData.ayah === multiAyahs[i - 1].ayah + 1 ? 'border-t border-brand-sand-200/40 dark:border-[#414559]/40' : ''} pt-2 pb-4">
                            <div class="{multiWbw ? 'text-right' : 'leading-loose text-right'} wrap-break-word"
                                >{#each ayahData.words as word}<span
                                    dir="rtl"
                                    role="button"
                                    tabindex="0"
                                    data-surah={surahData.surah}
                                    data-ayah={ayahData.ayah}
                                    class="morph-word {$morphFontFamily} cursor-pointer rounded {multiWbw ? 'inline-flex flex-col items-center gap-1 align-top px-1.5 py-2 min-w-14' : 'inline-block'} {getWordColor(word)} {isSelectedWord(word, surahData.surah, ayahData.ayah) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                    onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                                    onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                                >{#if multiWbw}<span>{word.combined_arabic}</span><span dir="ltr" class="text-[9px] leading-snug text-brand-charcoal-400 dark:text-[#838ba7] font-sans w-full text-center wrap-break-word whitespace-normal">{multiWbw.get(`${ayahData.ayah}:${word.word}`) ?? ''}</span>{:else}{word.combined_arabic}&nbsp;{/if}</span>{/each}<span id="ayah-{surahData.surah}-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayPosition.set({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => openManuscriptViewer({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="streamline-plump:script-2-solid" width="0.6rem" /></button>{/if}{#if $isPro}<button onclick={(e) => openAiPromptForAyah(e, surahData.surah, ayahData.ayah, ayahData.words, multiTranslit, multiTrans, multiWbw)} title={$t('morphology.ai_ask_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="ri:chat-smile-ai-fill" width="0.6rem" /></button>{/if}{#if $arabicStudyEnabled}<button onclick={() => openVerseStudy({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('arabicStudy.study_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:square-academic-cap-bold-duotone" width="0.6rem" /></button>{/if}</span></span></div>

                            {#if multiTranslit?.has(ayahData.ayah)}
                                <p dir="ltr" class="mt-1 text-sm leading-relaxed text-brand-charcoal-300 dark:text-[#626880] italic">
                                    {multiTranslit.get(ayahData.ayah)}
                                </p>
                            {/if}

                            {#if multiTrans?.has(ayahData.ayah) && !$translationDialogOpen}
                                {@const entry = multiTrans.get(ayahData.ayah)!}
                                {@const fnotes = entry.footnotes ? JSON.parse(entry.footnotes) as Record<string, string> : null}
                                <div dir={translationDir} class="mt-1.5 text-sm leading-relaxed text-start text-brand-charcoal-500 dark:text-[#a5adce]" style:font-family={translationFontStack} style:font-size={`${$translationFontSize}px`} style:line-height={$translationLineSpacing}>
                                    <p>{entry.text}</p>
                                    {#if fnotes}
                                        <ol class="mt-1.5 space-y-0.5 text-xs text-brand-charcoal-300 dark:text-[#838ba7] list-decimal list-inside">
                                            {#each Object.entries(fnotes) as [num, ftxt]}
                                                <li><span class="font-medium">[{num}]</span> {ftxt}</li>
                                            {/each}
                                        </ol>
                                    {/if}
                                </div>
                            {/if}
                            {#if multiTafsir?.has(ayahData.ayah) && !$tafsirDialogOpen}
                                <div dir="ltr" class="mt-2 border-t border-brand-sand-100 dark:border-[#414559]/60 pt-2">
                                    <div class="flex items-center gap-2 mb-1">
                                        <button
                                            onclick={() => toggleMultiTafsir(surahData.surah, ayahData.ayah)}
                                            class="cursor-pointer flex items-center gap-1.5 text-[0.65625rem] font-semibold text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors"
                                        >
                                            <Icon icon={expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`) ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'} width="0.65rem" />
                                            {expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`) ? $t('tafsir.hide') : $t('tafsir.show')}
                                        </button>
                                        {#if $isPro && expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`)}
                                            <button
                                                onclick={(e) => openAiPromptForTafsir(e, surahData.surah, ayahData.ayah, ayahData.words, multiTafsir.get(ayahData.ayah)!)}
                                                title={$t('morphology.ai_ask_tafsir')}
                                                aria-label={$t('morphology.ai_ask_tafsir')}
                                                class="cursor-pointer flex items-center gap-0.5 text-slate-350 dark:text-[#838ba7] transition-all hover:bg-brand-gold-50 dark:hover:bg-[#414559] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                                            >
                                                <Icon icon="ri:chat-smile-ai-fill" width="0.75rem" />
                                            </button>
                                        {/if}
                                    </div>
                                    {#if expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`)}
                                        <div class="tafsir-content text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]" style:direction={tafsirDir} style:font-family={tafsirFontStack} style:font-size={`${$tafsirFontSize}px`} style:line-height={$tafsirLineSpacing} style:text-align={tafsirDir === 'ltr' ? 'left' : 'right'}>
                                            {@html multiTafsir.get(ayahData.ayah)}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                    {#if multiAyahs.length > 0 && multiAyahs[multiAyahs.length - 1].ayah < (surahData.ayahs.at(-1)?.ayah ?? 0)}
                        <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        </div>
                    {/if}
                </div>
            {:else}
                <!-- Inline mode: continuous flow -->
                <div dir="rtl" class="leading-loose w-full text-center wrap-break-word mb-10" style="contain: style;"
                    >{#if multiAyahs.length > 0 && multiAyahs[0].ayah > 1}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(multiAyahs[0].ayah - 1)}&#x2060;﴿&#x2060;</span><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}{#each multiAyahs as ayahData, i}{#if i > 0 && ayahData.ayah !== multiAyahs[i - 1].ayah + 1}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(ayahData.ayah - 1)}&#x2060;﴿&#x2060;</span><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}{#each ayahData.words as word}<span
                        dir="rtl"
                        role="button"
                        tabindex="0"
                        data-surah={surahData.surah}
                        data-ayah={ayahData.ayah}
                        class="morph-word {$morphFontFamily} cursor-pointer rounded inline-block {getWordColor(word)} {isSelectedWord(word, surahData.surah, ayahData.ayah) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                        onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                        onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                    >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{surahData.surah}-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayPosition.set({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => openManuscriptViewer({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="streamline-plump:script-2-solid" width="0.6rem" /></button>{/if}{#if $isPro}<button onclick={(e) => openAiPromptForAyah(e, surahData.surah, ayahData.ayah, ayahData.words, multiTranslit, multiTrans, multiWbw)} title={$t('morphology.ai_ask_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="ri:chat-smile-ai-fill" width="0.6rem" /></button>{/if}{#if $arabicStudyEnabled}<button onclick={() => openVerseStudy({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('arabicStudy.study_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:square-academic-cap-bold-duotone" width="0.6rem" /></button>{/if}</span></span>{/each}{#if multiAyahs.length > 0 && multiAyahs[multiAyahs.length - 1].ayah < (surahData.ayahs.at(-1)?.ayah ?? 0)}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}</div>
            {/if}
        {/each}
    {:else}
        <!-- Single-surah mode -->
        {@render surahNameHeader(getSurahNameTashkeel($surahMorphology?.surah ?? 0) || $selectedSurahName, 'mb-8')}

    {#if $surahMorphology}
        {#if $surahMorphology.surah !== 1 && $surahMorphology.surah !== 9 && $basmallahMorphology}
            <div id="ayah-0" class="relative mb-8">

                <!-- Basmallah text with subtle tint, no frame -->
                <div class="relative px-6 py-1">
                    <div class="relative text-center wrap-break-word leading-loose">
                        {#each $basmallahMorphology.words as word}<span
                                role="button"
                                tabindex="0"
                                data-surah={$surahMorphology.surah}
                                data-ayah={0}
                                class="morph-word {$morphFontFamily} cursor-pointer rounded inline-block {getWordColor(word)} {isSelectedWord(word, $surahMorphology.surah, 0) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                onclick={(e) => handleWordClick(e, word, 0)}
                                onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, 0)}
                            >{word.combined_arabic}&nbsp;</span>{/each}<span class="group/ayah-num relative inline-block whitespace-nowrap"><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayBasmallah.set($surahMorphology!.surah)} title={$t('morphology.play_basmallah')} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span></span>
                    </div>
                </div>

                {#if $basmallahTranslation && translationMap !== null && !$translationDialogOpen}
                    <div dir={translationDir} class="mt-1.5 px-6 text-sm leading-relaxed text-center text-brand-charcoal-500 dark:text-[#a5adce]" style:font-family={translationFontStack} style:font-size={`${$translationFontSize}px`} style:line-height={$translationLineSpacing}>
                        <p>{$basmallahTranslation.text}</p>
                    </div>
                {/if}

            </div>
        {/if}
        {#if (translationMap !== null && !$translationDialogOpen) || $surahTransliteration !== null || $surahWordByWord !== null || (tafsirMap !== null && !$tafsirDialogOpen)}
            <!-- Block mode: one ayah per row, right-justified, divider between ayahs -->
            <div dir="rtl" class="w-full min-w-0" style="contain: style;">
                {#if displayAyahs.length > 0 && displayAyahs[0].ayah > 1}
                    <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                        <span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(displayAyahs[0].ayah - 1)}&#x2060;﴿&#x2060;</span>
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                    </div>
                {/if}
                {#each displayAyahs.slice(0, renderedAyahCount) as ayahData, i}
                    {#if i > 0 && ayahData.ayah !== displayAyahs[i - 1].ayah + 1}
                        <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                            <span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴾&#x2060;{convertToArabicNumbers(ayahData.ayah - 1)}&#x2060;﴿&#x2060;</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                            <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        </div>
                    {/if}
                    <div class="{i > 0 && ayahData.ayah === displayAyahs[i - 1].ayah + 1 ? 'border-t border-brand-sand-200/40 dark:border-[#414559]/40' : ''} pt-2 pb-4">
                        <div class="{$surahWordByWord ? 'text-right' : 'leading-loose text-right'} wrap-break-word"
                            >{#each ayahData.words as word}<span
                                dir="rtl"
                                role="button"
                                tabindex="0"
                                data-surah={$surahMorphology.surah}
                                data-ayah={ayahData.ayah}
                                class="morph-word {$morphFontFamily} cursor-pointer rounded {$surahWordByWord ? 'inline-flex flex-col items-center gap-1 align-top px-1.5 py-2 min-w-14' : 'inline-block'} {getWordColor(word)} {isSelectedWord(word, $surahMorphology.surah, ayahData.ayah) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                                onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                                onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                            >{#if $surahWordByWord}<span>{word.combined_arabic}</span><span dir="ltr" class="text-[9px] leading-snug text-brand-charcoal-400 dark:text-[#838ba7] font-sans w-full text-center wrap-break-word whitespace-normal">{$surahWordByWord.get(`${ayahData.ayah}:${word.word}`) ?? ''}</span>{:else}{word.combined_arabic}&nbsp;{/if}</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => openManuscriptViewer({ surah: $surahMorphology!.surah, ayah: ayahData.ayah })} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="streamline-plump:script-2-solid" width="0.6rem" /></button>{/if}{#if $isPro}<button onclick={(e) => openAiPromptForAyah(e, $surahMorphology!.surah, ayahData.ayah, ayahData.words, $surahTransliteration, translationMap, $surahWordByWord)} title={$t('morphology.ai_ask_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="ri:chat-smile-ai-fill" width="0.6rem" /></button>{/if}{#if $arabicStudyEnabled}<button onclick={() => openVerseStudy({ surah: $surahMorphology!.surah, ayah: ayahData.ayah })} title={$t('arabicStudy.study_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:square-academic-cap-bold-duotone" width="0.6rem" /></button>{/if}</span></span></div>

                        {#if $surahTransliteration?.has(ayahData.ayah)}
                            <p dir="ltr" class="mt-1 text-sm leading-relaxed text-brand-charcoal-300 dark:text-[#626880] italic">
                                {$surahTransliteration.get(ayahData.ayah)}
                            </p>
                        {/if}

                        {#if translationMap?.has(ayahData.ayah) && !$translationDialogOpen}
                            {@const entry = translationMap.get(ayahData.ayah)!}
                            {@const fnotes = entry.footnotes ? JSON.parse(entry.footnotes) as Record<string, string> : null}
                            <div dir={translationDir} class="mt-1.5 text-sm leading-relaxed text-start text-brand-charcoal-500 dark:text-[#a5adce]" style:font-family={translationFontStack} style:font-size={`${$translationFontSize}px`} style:line-height={$translationLineSpacing}>
                                <p>{entry.text}</p>
                                {#if fnotes}
                                    <ol class="mt-1.5 space-y-0.5 text-xs text-brand-charcoal-300 dark:text-[#838ba7] list-decimal list-inside">
                                        {#each Object.entries(fnotes) as [num, ftxt]}
                                            <li><span class="font-medium">[{num}]</span> {ftxt}</li>
                                        {/each}
                                    </ol>
                                {/if}
                            </div>
                        {/if}
                        {#if tafsirMap?.has(ayahData.ayah) && !$tafsirDialogOpen}
                            <div dir="ltr" class="mt-2 border-t border-brand-sand-100 dark:border-[#414559]/60 pt-2">
                                <div class="flex items-center gap-2 mb-1">
                                    <button
                                        onclick={() => toggleTafsir(ayahData.ayah)}
                                        class="cursor-pointer flex items-center gap-1.5 text-[0.65625rem] font-semibold text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors"
                                    >
                                        <Icon icon={expandedTafsirAyahs.has(ayahData.ayah) ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'} width="0.65rem" />
                                        {expandedTafsirAyahs.has(ayahData.ayah) ? $t('tafsir.hide') : $t('tafsir.show')}
                                    </button>
                                    {#if $isPro && expandedTafsirAyahs.has(ayahData.ayah)}
                                        <button
                                            onclick={(e) => openAiPromptForTafsir(e, $surahMorphology!.surah, ayahData.ayah, ayahData.words, tafsirMap.get(ayahData.ayah)!)}
                                            title={$t('morphology.ai_ask_tafsir')}
                                            aria-label={$t('morphology.ai_ask_tafsir')}
                                            class="cursor-pointer flex items-center gap-0.5 text-slate-350 dark:text-[#838ba7] transition-all hover:bg-brand-gold-50 dark:hover:bg-[#414559] hover:text-brand-gold-500 dark:hover:text-[#e5c890]"
                                        >
                                            <Icon icon="ri:chat-smile-ai-fill" width="0.75rem" />
                                        </button>
                                    {/if}
                                </div>
                                {#if expandedTafsirAyahs.has(ayahData.ayah)}
                                    <div class="tafsir-content text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]" style:direction={tafsirDir} style:font-family={tafsirFontStack} style:font-size={`${$tafsirFontSize}px`} style:line-height={$tafsirLineSpacing} style:text-align={tafsirDir === 'ltr' ? 'left' : 'right'}>
                                        {@html tafsirMap.get(ayahData.ayah)}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                {/each}
                {#if displayAyahs.length > 0 && displayAyahs[displayAyahs.length - 1].ayah < ($surahMorphology?.ayahs.at(-1)?.ayah ?? 0)}
                    <div dir="ltr" class="flex items-center justify-center gap-2 py-3 select-none" aria-hidden="true">
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                        <span class="text-xs text-brand-charcoal-300/60 dark:text-[#626880]/60">•</span>
                    </div>
                {/if}
            </div>
        {:else}
            <!-- Inline mode: continuous flow like original -->
            <div dir="rtl" class="leading-loose w-full text-center wrap-break-word" style="contain: style;"
                >{#if displayAyahs.length > 0 && displayAyahs[0].ayah > 1}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60"> • • • </span><span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴿&#x2060;{convertToArabicNumbers(displayAyahs[0].ayah - 1)}&#x2060;﴾&#x2060;</span></span>{/if}{#each displayAyahs.slice(0, renderedAyahCount) as ayahData, i}{#if i > 0 && ayahData.ayah !== displayAyahs[i-1].ayah + 1}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60"> • • • </span><span class="font-scheherazade text-lime-700/60 dark:text-lime-600/60">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah - 1)}&#x2060;﴾&#x2060;</span></span>{/if}{#each ayahData.words as word}<span
                    dir="rtl"
                    role="button"
                    tabindex="0"
                    data-surah={$surahMorphology.surah}
                    data-ayah={ayahData.ayah}
                    class="morph-word {$morphFontFamily} cursor-pointer rounded inline-block {getWordColor(word)} {isSelectedWord(word, $surahMorphology.surah, ayahData.ayah) ? 'bg-yellow-200 dark:bg-yellow-900/40' : ''}"
                    onclick={(e) => handleWordClick(e, word, ayahData.ayah)}
                    onkeydown={(e) => e.key === 'Enter' && handleWordClick(e as unknown as MouseEvent, word, ayahData.ayah)}
                >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => openManuscriptViewer({ surah: $surahMorphology!.surah, ayah: ayahData.ayah })} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="streamline-plump:script-2-solid" width="0.6rem" /></button>{/if}{#if $isPro}<button onclick={(e) => openAiPromptForAyah(e, $surahMorphology!.surah, ayahData.ayah, ayahData.words, $surahTransliteration, translationMap, $surahWordByWord)} title={$t('morphology.ai_ask_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="ri:chat-smile-ai-fill" width="0.6rem" /></button>{/if}{#if $arabicStudyEnabled}<button onclick={() => openVerseStudy({ surah: $surahMorphology!.surah, ayah: ayahData.ayah })} title={$t('arabicStudy.study_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[0.625rem] leading-none whitespace-nowrap"><Icon icon="solar:square-academic-cap-bold-duotone" width="0.6rem" /></button>{/if}</span></span>{/each}{#if displayAyahs.length > 0 && displayAyahs[displayAyahs.length - 1].ayah < ($surahMorphology?.ayahs.at(-1)?.ayah ?? 0)}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}</div>
        {/if}
    {:else}
        <div class="py-8 text-center text-gray-500 dark:text-[#838ba7] h-full min-h-75">
            Loading morphology data...
        </div>
    {/if}
    {/if}
</div>

{#if selectedWord}
    <WordMorphologyPopover
        word={selectedWord.word}
        surahNum={selectedWord.surahNum}
        ayahNum={selectedWord.ayahNum}
        position={popoverPosition}
        onClose={() => (selectedWord = null)}
        onPin={() => {
            pinnedPopovers = [...pinnedPopovers, {
                id: pinnedCounter++,
                word: selectedWord!.word,
                ayahNum: selectedWord!.ayahNum,
                surahNum: selectedWord!.surahNum,
                position: { ...popoverPosition },
            }];
            selectedWord = null;
        }}
        onHighlight={() => {
            const surah = selectedWord!.surahNum;
            pendingHighlight.set({ surah, ayah: selectedWord!.ayahNum, text: selectedWord!.word.combined_arabic, word: selectedWord!.word });
            selectedWord = null;
        }}
    />
{/if}

{#each pinnedPopovers as pinned (pinned.id)}
    <WordMorphologyPopover
        word={pinned.word}
        surahNum={pinned.surahNum}
        ayahNum={pinned.ayahNum}
        position={pinned.position}
        onClose={() => {
            pinnedPopovers = pinnedPopovers.filter(p => p.id !== pinned.id);
        }}
        onHighlight={() => {
            const surah = pinned.surahNum;
            pendingHighlight.set({ surah, ayah: pinned.ayahNum, text: pinned.word.combined_arabic, word: pinned.word });
            pinnedPopovers = pinnedPopovers.filter(p => p.id !== pinned.id);
        }}
    />
{/each}
