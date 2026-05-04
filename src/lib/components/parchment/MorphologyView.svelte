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
    import { activeTranslatorId, surahTranslation, basmallahTranslation, transliterationEnabled, surahTransliteration, wordByWordEnabled, wordByWordLang, surahWordByWord, multiSurahTranslationMap, multiSurahTransliterationMap, multiSurahWordByWordMap, tafsirEnabled, activeTafsirId, surahTafsir, multiSurahTafsirMap, availableTafsirAuthors, tafsirDialogOpen } from '$lib/stores/translation.store';
    import type { AyahTranslation, AyahTafsir } from '$lib/stores/translation.store';
    import { manuscriptsEnabled, manuscriptAyah, manuscriptViewerOpen } from '$lib/stores/manuscripts.store';
    import { t } from '$lib/i18n';
    import { zenMode, zenPeek, lexicalEditorInstance } from "$lib/stores/editor.store";
    import { get } from 'svelte/store';
    import { $createParagraphNode as createParagraphNode, $createTextNode as createTextNode, $insertNodes as insertNodes } from 'lexical';

    $effect(() => {
        const tid = $activeTranslatorId;
        const surah = $surahMorphology?.surah;
        if (!tid || !surah) { surahTranslation.set(null); return; }
        invoke<AyahTranslation[]>('get_surah_translation', { surah, translatorId: tid })
            .then(rows => { if ($surahMorphology?.surah === surah) surahTranslation.set(rows); })
            .catch(() => surahTranslation.set(null));
    });

    $effect(() => {
        const tid = $activeTranslatorId;
        if (!tid) { basmallahTranslation.set(null); return; }
        invoke<AyahTranslation[]>('get_surah_translation', { surah: 1, translatorId: tid })
            .then(rows => basmallahTranslation.set(rows.find(r => r.ayah === 1) ?? null))
            .catch(() => basmallahTranslation.set(null));
    });

    $effect(() => {
        const enabled = $transliterationEnabled;
        const surah = $surahMorphology?.surah;
        if (!enabled || !surah) { surahTransliteration.set(null); return; }
        invoke<Array<{ayah: number; text: string}>>('get_surah_transliteration', { surah })
            .then(rows => { if ($surahMorphology?.surah === surah) surahTransliteration.set(new Map(rows.map(r => [r.ayah, r.text]))); })
            .catch(() => surahTransliteration.set(null));
    });

    $effect(() => {
        const enabled = $wordByWordEnabled;
        const surah = $surahMorphology?.surah;
        const lang = $wordByWordLang;
        if (!enabled || !surah) { surahWordByWord.set(null); return; }
        invoke<Array<{ayah: number; word: number; text: string}>>('get_surah_word_by_word', { surah, lang })
            .then(rows => {
                if ($surahMorphology?.surah !== surah) return;
                console.log(`[WBW] loaded ${rows.length} entries for surah ${surah} (${lang})`);
                surahWordByWord.set(new Map(rows.map(r => [`${r.ayah}:${r.word}`, r.text])));
            })
            .catch(err => {
                console.error('[WBW] invoke failed:', err);
                surahWordByWord.set(null);
            });
    });

    $effect(() => {
        const tid = $activeTafsirId;
        const surah = $surahMorphology?.surah;
        if (!tid || !surah || !$tafsirEnabled) { surahTafsir.set(null); return; }
        invoke<AyahTafsir[]>('get_surah_tafsir', { surah, authorId: tid })
            .then(rows => { if ($surahMorphology?.surah === surah) surahTafsir.set(rows); })
            .catch(() => surahTafsir.set(null));
    });

    // Multi-surah translation/transliteration/wbw loading
    $effect(() => {
        const list = $morphologyMultiSurahList;
        const tid = $activeTranslatorId;
        if (!list || !tid) { multiSurahTranslationMap.set(null); return; }
        Promise.all(list.map(s =>
            invoke<AyahTranslation[]>('get_surah_translation', { surah: s.surah, translatorId: tid })
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r]))] as const)
                .catch(() => [s.surah, new Map<number, AyahTranslation>()] as const)
        )).then(entries => multiSurahTranslationMap.set(new Map(entries)));
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const enabled = $transliterationEnabled;
        if (!list || !enabled) { multiSurahTransliterationMap.set(null); return; }
        Promise.all(list.map(s =>
            invoke<Array<{ayah: number; text: string}>>('get_surah_transliteration', { surah: s.surah })
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r.text]))] as const)
                .catch(() => [s.surah, new Map<number, string>()] as const)
        )).then(entries => multiSurahTransliterationMap.set(new Map(entries)));
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const enabled = $wordByWordEnabled;
        const lang = $wordByWordLang;
        if (!list || !enabled) { multiSurahWordByWordMap.set(null); return; }
        Promise.all(list.map(s =>
            invoke<Array<{ayah: number; word: number; text: string}>>('get_surah_word_by_word', { surah: s.surah, lang })
                .then(rows => [s.surah, new Map(rows.map(r => [`${r.ayah}:${r.word}`, r.text]))] as const)
                .catch(() => [s.surah, new Map<string, string>()] as const)
        )).then(entries => multiSurahWordByWordMap.set(new Map(entries)));
    });

    $effect(() => {
        const list = $morphologyMultiSurahList;
        const tid = $activeTafsirId;
        const enabled = $tafsirEnabled;
        if (!list || !tid || !enabled) { multiSurahTafsirMap.set(null); return; }
        Promise.all(list.map(s =>
            invoke<AyahTafsir[]>('get_surah_tafsir', { surah: s.surah, authorId: tid })
                .then(rows => [s.surah, new Map(rows.map(r => [r.ayah, r.text]))] as const)
                .catch(() => [s.surah, new Map<number, string>()] as const)
        )).then(entries => multiSurahTafsirMap.set(new Map(entries)));
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

    function getWordColor(word: MorphWord): string {
        const stemToken = word.tokens.find(
            (t) => !t.features.prefix_type && !t.features.suffix_type,
        );
        const tag = stemToken?.tag || word.tokens[0]?.tag || "N";

        const colors: Record<string, string> = {
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
        return colors[tag] || "hover:bg-slate-100 dark:hover:bg-slate-600/40";
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
    }

    // Full diacritics (tashkeel) for all 114 surah names, indexed by surah number (1-based)
    const SURAH_NAMES_TASHKEEL: readonly string[] = [
        '', // placeholder so index 1 = surah 1
        'الْفَاتِحَة',
        'الْبَقَرَة',
        'آلِ عِمْرَان',
        'النِّسَاء',
        'الْمَائِدَة',
        'الْأَنْعَام',
        'الْأَعْرَاف',
        'الْأَنْفَال',
        'التَّوْبَة',
        'يُونُس',
        'هُود',
        'يُوسُف',
        'الرَّعْد',
        'إِبْرَاهِيم',
        'الْحِجْر',
        'النَّحْل',
        'الْإِسْرَاء',
        'الْكَهْف',
        'مَرْيَم',
        'طه',
        'الْأَنْبِيَاء',
        'الْحَجّ',
        'الْمُؤْمِنُون',
        'النُّور',
        'الْفُرْقَان',
        'الشُّعَرَاء',
        'النَّمْل',
        'الْقَصَص',
        'الْعَنْكَبُوت',
        'الرُّوم',
        'لُقْمَان',
        'السَّجْدَة',
        'الْأَحْزَاب',
        'سَبَأ',
        'فَاطِر',
        'يس',
        'الصَّافَّات',
        'ص',
        'الزُّمَر',
        'غَافِر',
        'فُصِّلَت',
        'الشُّورَى',
        'الزُّخْرُف',
        'الدُّخَان',
        'الْجَاثِيَة',
        'الْأَحْقَاف',
        'مُحَمَّد',
        'الْفَتْح',
        'الْحُجُرَات',
        'ق',
        'الذَّارِيَات',
        'الطُّور',
        'النَّجْم',
        'الْقَمَر',
        'الرَّحْمَٰن',
        'الْوَاقِعَة',
        'الْحَدِيد',
        'الْمُجَادِلَة',
        'الْحَشْر',
        'الْمُمْتَحَنَة',
        'الصَّفّ',
        'الْجُمُعَة',
        'الْمُنَافِقُون',
        'التَّغَابُن',
        'الطَّلَاق',
        'التَّحْرِيم',
        'الْمُلْك',
        'الْقَلَم',
        'الْحَاقَّة',
        'الْمَعَارِج',
        'نُوح',
        'الْجِنّ',
        'الْمُزَّمِّل',
        'الْمُدَّثِّر',
        'الْقِيَامَة',
        'الْإِنسَان',
        'الْمُرْسَلَات',
        'النَّبَأ',
        'النَّازِعَات',
        'عَبَسَ',
        'التَّكْوِير',
        'الِانْفِطَار',
        'الْمُطَفِّفِين',
        'الِانشِقَاق',
        'الْبُرُوج',
        'الطَّارِق',
        'الْأَعْلَى',
        'الْغَاشِيَة',
        'الْفَجْر',
        'الْبَلَد',
        'الشَّمْس',
        'اللَّيْل',
        'الضُّحَى',
        'الشَّرْح',
        'التِّين',
        'الْعَلَق',
        'الْقَدْر',
        'الْبَيِّنَة',
        'الزَّلْزَلَة',
        'الْعَادِيَات',
        'الْقَارِعَة',
        'التَّكَاثُر',
        'الْعَصْر',
        'الْهُمَزَة',
        'الْفِيل',
        'قُرَيْش',
        'الْمَاعُون',
        'الْكَوْثَر',
        'الْكَافِرُون',
        'النَّصْر',
        'الْمَسَد',
        'الْإِخْلَاص',
        'الْفَلَق',
        'النَّاس',
    ];

    function getSurahNameTashkeel(surahNum: number): string {
        return SURAH_NAMES_TASHKEEL[surahNum] ?? '';
    }

    function insertAyahToLexical(
        surah: number,
        ayahNum: number,
        words: MorphWord[],
        translitMap: Map<number, string> | null | undefined,
        transMap: Map<number, AyahTranslation> | null | undefined,
        wbwMap: Map<string, string> | null | undefined,
    ) {
        const editor = get(lexicalEditorInstance);
        if (!editor) return;

        const arabicText = words.map(w => w.combined_arabic).join(' ');
        const surahNameText = getSurahNameTashkeel(surah) || ($surahLabels[surah - 1]?.en ?? `Surah ${surah}`);
        const label = `${surahNameText} · Ayah ${ayahNum}`;

        editor.update(() => {
            const paras = [];

            const arabicPara = createParagraphNode();
            arabicPara.append(createTextNode(arabicText));
            paras.push(arabicPara);

            if (translitMap?.has(ayahNum)) {
                const p = createParagraphNode();
                p.append(createTextNode(translitMap.get(ayahNum)!));
                paras.push(p);
            }

            if (transMap?.has(ayahNum)) {
                const p = createParagraphNode();
                p.append(createTextNode(transMap.get(ayahNum)!.text));
                paras.push(p);
            }

            if (wbwMap) {
                const wbwText = words
                    .map(w => {
                        const tr = wbwMap.get(`${ayahNum}:${w.word}`);
                        return tr ? `${w.combined_arabic} (${tr})` : w.combined_arabic;
                    })
                    .join(' · ');
                const p = createParagraphNode();
                p.append(createTextNode(wbwText));
                paras.push(p);
            }

            const labelPara = createParagraphNode();
            labelPara.append(createTextNode(label));
            paras.push(labelPara);

            insertNodes(paras);
        });
    }
</script>

<svelte:window on:click={handleClickOutside} />

{#snippet surahNameHeader(name: string, spacing: string)}
    <div class="{spacing}" dir="ltr">
        <div class="flex items-center">
            <!-- Left decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                </div>
            </div>
            <!-- Surah name panel -->
            <div class="relative border border-brand-gold-400/80 dark:border-brand-gold-400/70 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-brand-gold-400/10 dark:to-transparent px-10 py-4">
                <div class="pointer-events-none absolute inset-0.75 border border-brand-gold-200/40 dark:border-brand-gold-400/40"></div>
                <span class="absolute -top-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -bottom-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -left-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -right-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-1 -left-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-1 -right-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="relative font-scheherazade text-2xl leading-none text-slate-700 dark:text-[#c6d0f5]">{name}</span>
            </div>
            <!-- Right decorative arm -->
            <div class="flex flex-1 items-center">
                <div class="flex items-center gap-1 px-2">
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                    <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                    <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
                </div>
                <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
            </div>
        </div>
    </div>
{/snippet}

<div dir="rtl" class="w-full min-w-0">
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
            {@const hasExtras = multiTrans !== null || multiTranslit !== null || multiWbw !== null || (multiTafsir !== null && !$tafsirDialogOpen)}
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
                                >{word.combined_arabic}&nbsp;</span>{/each}<span class="group/ayah-num relative inline-block whitespace-nowrap"><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayBasmallah.set(surahData.surah)} title={$t('morphology.play_basmallah')} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span></span>
                        </div>
                    </div>
                    {#if $basmallahTranslation && multiTrans !== null}
                        <div dir="ltr" class="mt-1.5 px-6 text-sm leading-relaxed text-center text-brand-charcoal-500 dark:text-[#a5adce]">
                            <p dir="ltr">{$basmallahTranslation.text}</p>
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
                                >{#if multiWbw}<span>{word.combined_arabic}</span><span dir="ltr" class="text-[9px] leading-snug text-brand-charcoal-400 dark:text-[#838ba7] font-sans w-full text-center wrap-break-word whitespace-normal">{multiWbw.get(`${ayahData.ayah}:${word.word}`) ?? ''}</span>{:else}{word.combined_arabic}&nbsp;{/if}</span>{/each}<span id="ayah-{surahData.surah}-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayPosition.set({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => { manuscriptAyah.set({ surah: surahData.surah, ayah: ayahData.ayah }); manuscriptViewerOpen.set(true); }} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:document-text-bold-duotone" width="0.6rem" /></button>{/if}<button onclick={() => insertAyahToLexical(surahData.surah, ayahData.ayah, ayahData.words, multiTranslit, multiTrans, multiWbw)} title={$t('morphology.insert_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:add-square-bold-duotone" width="0.6rem" /></button></span></span></div>

                            {#if multiTranslit?.has(ayahData.ayah)}
                                <p dir="ltr" class="mt-1 text-sm leading-relaxed text-brand-charcoal-300 dark:text-[#626880] italic">
                                    {multiTranslit.get(ayahData.ayah)}
                                </p>
                            {/if}

                            {#if multiTrans?.has(ayahData.ayah)}
                                {@const entry = multiTrans.get(ayahData.ayah)!}
                                {@const fnotes = entry.footnotes ? JSON.parse(entry.footnotes) as Record<string, string> : null}
                                <div dir="auto" class="mt-1.5 text-sm leading-relaxed text-start text-brand-charcoal-500 dark:text-[#a5adce]">
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
                                    <button
                                        onclick={() => toggleMultiTafsir(surahData.surah, ayahData.ayah)}
                                        class="cursor-pointer flex items-center gap-1.5 text-[10.5px] font-semibold text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors mb-1"
                                    >
                                        <Icon icon={expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`) ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'} width="0.65rem" />
                                        {expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`) ? $t('tafsir.hide') : $t('tafsir.show')}
                                    </button>
                                    {#if expandedMultiTafsirKeys.has(`${surahData.surah}-${ayahData.ayah}`)}
                                        <div class="tafsir-content text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]" style:direction={tafsirDir} style:text-align={tafsirDir === 'ltr' ? 'left' : 'right'}>
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
                    >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{surahData.surah}-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayPosition.set({ surah: surahData.surah, ayah: ayahData.ayah })} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => { manuscriptAyah.set({ surah: surahData.surah, ayah: ayahData.ayah }); manuscriptViewerOpen.set(true); }} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:document-text-bold-duotone" width="0.6rem" /></button>{/if}<button onclick={() => insertAyahToLexical(surahData.surah, ayahData.ayah, ayahData.words, multiTranslit, multiTrans, multiWbw)} title={$t('morphology.insert_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:add-square-bold-duotone" width="0.6rem" /></button></span></span>{/each}{#if multiAyahs.length > 0 && multiAyahs[multiAyahs.length - 1].ayah < (surahData.ayahs.at(-1)?.ayah ?? 0)}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}</div>
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
                            >{word.combined_arabic}&nbsp;</span>{/each}<span class="group/ayah-num relative inline-block whitespace-nowrap"><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayBasmallah.set($surahMorphology!.surah)} title={$t('morphology.play_basmallah')} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button></span></span>
                    </div>
                </div>

                {#if $basmallahTranslation && translationMap !== null}
                    <div dir="ltr" class="mt-1.5 px-6 text-sm leading-relaxed text-center text-brand-charcoal-500 dark:text-[#a5adce]">
                        <p dir="ltr">{$basmallahTranslation.text}</p>
                    </div>
                {/if}

            </div>
        {/if}
        {#if translationMap !== null || $surahTransliteration !== null || $surahWordByWord !== null || (tafsirMap !== null && !$tafsirDialogOpen)}
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
                            >{#if $surahWordByWord}<span>{word.combined_arabic}</span><span dir="ltr" class="text-[9px] leading-snug text-brand-charcoal-400 dark:text-[#838ba7] font-sans w-full text-center wrap-break-word whitespace-normal">{$surahWordByWord.get(`${ayahData.ayah}:${word.word}`) ?? ''}</span>{:else}{word.combined_arabic}&nbsp;{/if}</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => { manuscriptAyah.set({ surah: $surahMorphology!.surah, ayah: ayahData.ayah }); manuscriptViewerOpen.set(true); }} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:document-text-bold-duotone" width="0.6rem" /></button>{/if}<button onclick={() => insertAyahToLexical($surahMorphology!.surah, ayahData.ayah, ayahData.words, $surahTransliteration, translationMap, $surahWordByWord)} title={$t('morphology.insert_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:add-square-bold-duotone" width="0.6rem" /></button></span></span></div>

                        {#if $surahTransliteration?.has(ayahData.ayah)}
                            <p dir="ltr" class="mt-1 text-sm leading-relaxed text-brand-charcoal-300 dark:text-[#626880] italic">
                                {$surahTransliteration.get(ayahData.ayah)}
                            </p>
                        {/if}

                        {#if translationMap?.has(ayahData.ayah)}
                            {@const entry = translationMap.get(ayahData.ayah)!}
                            {@const fnotes = entry.footnotes ? JSON.parse(entry.footnotes) as Record<string, string> : null}
                            <div dir="auto" class="mt-1.5 text-sm leading-relaxed text-start text-brand-charcoal-500 dark:text-[#a5adce]">
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
                                <button
                                    onclick={() => toggleTafsir(ayahData.ayah)}
                                    class="cursor-pointer flex items-center gap-1.5 text-[10.5px] font-semibold text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors mb-1"
                                >
                                    <Icon icon={expandedTafsirAyahs.has(ayahData.ayah) ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'} width="0.65rem" />
                                    {expandedTafsirAyahs.has(ayahData.ayah) ? $t('tafsir.hide') : $t('tafsir.show')}
                                </button>
                                {#if expandedTafsirAyahs.has(ayahData.ayah)}
                                    <div class="tafsir-content text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#b5bfe2]" style:direction={tafsirDir} style:text-align={tafsirDir === 'ltr' ? 'left' : 'right'}>
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
                >{word.combined_arabic}&nbsp;</span>{/each}<span id="ayah-{ayahData.ayah}" class="group/ayah-num relative inline-block whitespace-nowrap"><span class="font-scheherazade text-lime-700 dark:text-lime-600 px-1">&#x2060;﴿&#x2060;{convertToArabicNumbers(ayahData.ayah)}&#x2060;﴾&#x2060;</span><span class="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover/ayah-num:opacity-100 transition-opacity z-20 flex items-center gap-0.5"><button onclick={() => requestPlayAyah.set(ayahData.ayah)} title={$t('morphology.play_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:play-bold" width="0.6rem" /></button>{#if $manuscriptsEnabled}<button onclick={() => { manuscriptAyah.set({ surah: $surahMorphology!.surah, ayah: ayahData.ayah }); manuscriptViewerOpen.set(true); }} title={$t('morphology.view_manuscripts', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:document-text-bold-duotone" width="0.6rem" /></button>{/if}<button onclick={() => insertAyahToLexical($surahMorphology!.surah, ayahData.ayah, ayahData.words, $surahTransliteration, translationMap, $surahWordByWord)} title={$t('morphology.insert_ayah', { ayah: String(ayahData.ayah) })} class="cursor-pointer flex items-center gap-0.5 bg-white dark:bg-[#292c3c] border border-brand-gold-200/80 dark:border-[#414559] text-brand-gold-600 dark:text-[#e5c890] rounded-full p-1 shadow-md text-[10px] leading-none whitespace-nowrap"><Icon icon="solar:add-square-bold-duotone" width="0.6rem" /></button></span></span>{/each}{#if displayAyahs.length > 0 && displayAyahs[displayAyahs.length - 1].ayah < ($surahMorphology?.ayahs.at(-1)?.ayah ?? 0)}<span dir="ltr" class="inline-block px-2 select-none" aria-hidden="true"><span class="text-brand-charcoal-300/60 dark:text-[#626880]/60 pl-2"> • • • </span></span>{/if}</div>
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
