<script module lang="ts">
    import { invoke } from '@tauri-apps/api/core';
    import type { Locale } from '$lib/i18n';

    type WordByWordRow = { ayah: number; word: number; text: string };

    const WORD_BY_WORD_LANG_BY_LOCALE: Partial<Record<Locale, string>> = {
        en: 'english',
        bn: 'bengali',
        fr: 'french',
        hi: 'hindi',
        id: 'indonesian',
        fa: 'persian',
        ta: 'tamil',
        tr: 'turkish',
        ur: 'urdu',
    };

    const wordByWordCache = new Map<string, Promise<Map<string, string>>>();

    function wordByWordLangForLocale(locale: Locale): string {
        return WORD_BY_WORD_LANG_BY_LOCALE[locale] ?? 'english';
    }

    function loadSurahWordByWord(surah: number, lang: string): Promise<Map<string, string>> {
        const cacheKey = `${surah}:${lang}`;
        const cached = wordByWordCache.get(cacheKey);
        if (cached) return cached;

        const request = invoke<WordByWordRow[]>('get_surah_word_by_word', { surah, lang })
            .then((rows) => new Map(rows.map((row) => [`${row.ayah}:${row.word}`, row.text])))
            .catch((err) => {
                wordByWordCache.delete(cacheKey);
                throw err;
            });
        wordByWordCache.set(cacheKey, request);
        return request;
    }

    async function loadWordMeaning(surah: number, ayah: number, word: number, preferredLang: string): Promise<string | null> {
        const preferredMap = await loadSurahWordByWord(surah, preferredLang);
        const preferredMeaning = preferredMap.get(`${ayah}:${word}`);
        if (preferredMeaning || preferredLang === 'english') return preferredMeaning ?? null;

        const englishMap = await loadSurahWordByWord(surah, 'english');
        return englishMap.get(`${ayah}:${word}`) ?? null;
    }
</script>

<script lang="ts">
    import type { MorphWord } from "$lib/types/morphology";
    import Icon from "@iconify/svelte";
    import { buckwalterToArabic } from "$lib/functions/utils/utils";
    import { fly } from "svelte/transition";
    import { onDestroy, tick } from "svelte";
    import { morphGlassEffect } from "$lib/stores/morphology.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { locale, t } from '$lib/i18n';
    import { get } from 'svelte/store';
    import { openUrl } from '@tauri-apps/plugin-opener';
    import { lexicalEditorInstance } from '$lib/stores/editor.store';
    import { isPro } from '$lib/stores/auth.store';
    import { askAiAboutSelection } from '$lib/stores/ai-chat.store';
    import {
        $createTableNode as createTableNode,
        $createTableRowNode as createTableRowNode,
        $createTableCellNode as createTableCellNode,
        TableCellHeaderStates,
    } from '@lexical/table';
    import {
        $createParagraphNode as createParagraphNode,
        $createTextNode as createTextNode,
    } from 'lexical';
    import { $insertNodeToNearestRoot as insertNodeToNearestRoot } from '@lexical/utils';

    interface Props {
        word: MorphWord;
        surahNum: number;
        ayahNum: number;
        position: { x: number; y: number; placement: "above" | "below" };
        onClose: () => void;
        onPin?: () => void;
        onHighlight?: () => void;
    }

    let { word, surahNum, ayahNum, position, onClose, onPin, onHighlight }: Props = $props();

    let zIndex = $state(bringToFront());
    let wordMeaning = $state<string | null>(null);
    let meaningRequestId = 0;

    $effect(() => {
        const requestId = ++meaningRequestId;
        const currentSurah = surahNum;
        const currentAyah = ayahNum;
        const currentWord = word.word;
        const preferredLang = wordByWordLangForLocale($locale);

        wordMeaning = null;
        if (currentSurah <= 0 || currentAyah <= 0) return;

        loadWordMeaning(currentSurah, currentAyah, currentWord, preferredLang)
            .catch(() => preferredLang === 'english'
                ? null
                : loadWordMeaning(currentSurah, currentAyah, currentWord, 'english').catch(() => null))
            .then((meaning) => {
                if (meaningRequestId === requestId) wordMeaning = meaning;
            });
    });

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy() { node.remove(); } };
    }

    // ── Drag ─────────────────────────────────────────────────────────────────
    let dragX = $state(0);
    let dragY = $state(0);
    let isDragging = $state(false);
    let isNearBorder = $state(false);
    let _dragStartX = 0, _dragStartY = 0, _startDragX = 0, _startDragY = 0;

    // Reset drag offset whenever the anchor position changes (new word clicked)
    $effect(() => {
        void position;
        dragX = 0;
        dragY = 0;
    });

    function startDrag(e: PointerEvent): void {
        if ((e.target as HTMLElement).closest('button')) return;
        isDragging = true;
        _dragStartX = e.clientX; _dragStartY = e.clientY;
        _startDragX = dragX;    _startDragY = dragY;
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }
    function onDragMove(e: PointerEvent): void {
        dragX = _startDragX + (e.clientX - _dragStartX);
        dragY = _startDragY + (e.clientY - _dragStartY);
    }
    function stopDrag(): void {
        isDragging = false;
        window.removeEventListener('pointermove', onDragMove);
    }

    onDestroy(() => {
        window.removeEventListener('pointermove', onDragMove);
    });

    function isInBorderZone(e: PointerEvent, el: HTMLElement): boolean {
        const rect = el.getBoundingClientRect();
        const zone = 8;
        return (
            e.clientX - rect.left < zone ||
            rect.right - e.clientX < zone ||
            e.clientY - rect.top < zone ||
            rect.bottom - e.clientY < zone
        );
    }

    function startDragFromBorder(e: PointerEvent): void {
        if (isInBorderZone(e, e.currentTarget as HTMLElement)) startDrag(e);
    }

    function updateBorderCursor(e: PointerEvent): void {
        isNearBorder = isInBorderZone(e, e.currentTarget as HTMLElement);
    }

    type TokenStyle = {
        bg: string;
        border: string;
        badge: string;
        text: string;
        dot: string;
        accent: string;
    };

    const TOKEN_STYLES: Record<string, TokenStyle> = {
        N:    { bg: "bg-sky-50/60 dark:bg-sky-900/20",     border: "border-sky-200 dark:border-sky-700/40",     badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",       text: "text-sky-700 dark:text-sky-300",     dot: "bg-sky-400 dark:bg-sky-500",     accent: "bg-sky-400 dark:bg-sky-600"    },
        V:    { bg: "bg-emerald-50/60 dark:bg-emerald-900/20", border: "border-emerald-200 dark:border-emerald-700/40", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-400 dark:bg-emerald-500", accent: "bg-emerald-400 dark:bg-emerald-600" },
        P:    { bg: "bg-violet-50/60 dark:bg-violet-900/20",  border: "border-violet-200 dark:border-violet-700/40",  badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",  text: "text-violet-700 dark:text-violet-300",  dot: "bg-violet-400 dark:bg-violet-500",  accent: "bg-violet-400 dark:bg-violet-600"  },
        PN:   { bg: "bg-indigo-50/60 dark:bg-indigo-900/20",  border: "border-indigo-200 dark:border-indigo-700/40",  badge: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",  text: "text-indigo-700 dark:text-indigo-300",  dot: "bg-indigo-400 dark:bg-indigo-500",  accent: "bg-indigo-400 dark:bg-indigo-600"  },
        ADJ:  { bg: "bg-amber-50/60 dark:bg-amber-900/20",   border: "border-amber-200 dark:border-amber-700/40",   badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",    text: "text-amber-700 dark:text-amber-300",   dot: "bg-amber-400 dark:bg-amber-500",   accent: "bg-amber-400 dark:bg-amber-600"   },
        DET:  { bg: "bg-slate-50/60 dark:bg-slate-700/20",   border: "border-slate-200 dark:border-slate-600/40",   badge: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300",    text: "text-slate-600 dark:text-slate-300",   dot: "bg-slate-400 dark:bg-slate-500",   accent: "bg-slate-300 dark:bg-slate-600"   },
        PRON: { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
        REL:  { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
        DEM:  { bg: "bg-rose-50/60 dark:bg-rose-900/20",    border: "border-rose-200 dark:border-rose-700/40",    badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",      text: "text-rose-700 dark:text-rose-300",    dot: "bg-rose-400 dark:bg-rose-500",    accent: "bg-rose-400 dark:bg-rose-600"    },
        CONJ: { bg: "bg-orange-50/60 dark:bg-orange-900/20",  border: "border-orange-200 dark:border-orange-700/40",  badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",  text: "text-orange-700 dark:text-orange-300",  dot: "bg-orange-400 dark:bg-orange-500",  accent: "bg-orange-400 dark:bg-orange-600"  },
        NEG:  { bg: "bg-red-50/60 dark:bg-red-900/20",     border: "border-red-200 dark:border-red-700/40",     badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",        text: "text-red-700 dark:text-red-300",     dot: "bg-red-400 dark:bg-red-500",     accent: "bg-red-400 dark:bg-red-600"     },
    };

    const DEFAULT_STYLE: TokenStyle = {
        bg: "bg-slate-50/60 dark:bg-slate-700/20", border: "border-slate-200 dark:border-slate-600/40",
        badge: "bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300", text: "text-slate-600 dark:text-slate-300",
        dot: "bg-slate-400 dark:bg-slate-500", accent: "bg-slate-300 dark:bg-slate-600",
    };

    function getStyle(tag: string): TokenStyle {
        return TOKEN_STYLES[tag] ?? DEFAULT_STYLE;
    }

    // Value lookup tables aligned with MorphologyDetails.md
    const POS_LABELS: Record<string, string> = {
        N:           'Noun',
        PN:          'Proper noun',
        ADJ:         'Adjective',
        IMPN:        'Imperative verbal noun',
        PRON:        'Personal pronoun',
        DEM:         'Demonstrative pronoun',
        REL:         'Relative pronoun',
        T:           'Time adverb',
        LOC:         'Location adverb',
        P:           'Preposition',
        EMPH:        'Emphatic lam prefix',
        IMPV:        'Imperative lam prefix',
        PRP:         'Purpose lam prefix',
        CONJ:        'Coordinating conjunction',
        SUB:         'Subordinating particle',
        ACC:         'Accusative particle',
        AMD:         'Amendment particle',
        ANS:         'Answer particle',
        AVR:         'Aversion particle',
        CAUS:        'Particle of cause',
        CERT:        'Particle of certainty',
        CIRC:        'Circumstantial particle',
        COM:         'Comitative particle',
        COND:        'Conditional particle',
        EQ:          'Equalization particle',
        EXH:         'Exhortation particle',
        EXL:         'Explanation particle',
        EXP:         'Exceptive particle',
        FUT:         'Future particle',
        INC:         'Inceptive particle',
        INT:         'Interpretation particle',
        INTG:        'Interrogative particle',
        NEG:         'Negative particle',
        PREV:        'Preventive particle',
        PRO:         'Prohibition particle',
        REM:         'Resumption particle',
        RES:         'Restriction particle',
        RET:         'Retraction particle',
        RSLT:        'Result particle',
        SUP:         'Supplemental particle',
        SUR:         'Surprise particle',
        VOC:         'Vocative particle',
        INL:         'Quranic initials',
        V:           'Verb',
        VN:          'Verbal noun',
        'ACT PCPL':  'Active participle',
        'PASS PCPL': 'Passive participle',
        DET:         'Determiner',
    };

    const PERSON_LABELS: Record<string, string> = {
        '1st': 'First person',
        '2nd': 'Second person',
        '3rd': 'Third person',
    };

    const DERIVATION_LABELS: Record<string, string> = {
        '(I)':    'Form I',    '(II)':   'Form II',   '(III)':  'Form III',
        '(IV)':   'Form IV',   '(V)':    'Form V',    '(VI)':   'Form VI',
        '(VII)':  'Form VII',  '(VIII)': 'Form VIII', '(IX)':   'Form IX',
        '(X)':    'Form X',    '(XI)':   'Form XI',   '(XII)':  'Form XII',
    };

    const PREFIX_LABELS: Record<string, string> = {
        Al:      'Definite article (al-)',
        bi:      'Preposition (bi-)',
        'l:P':   'Preposition (li-)',
        'l:EMPH':'Emphatic lam (la-)',
        'l:IMPV':'Imperative lam (li-)',
        'l:PRP': 'Purpose lam (li-)',
        'w:CONJ':'Conjunction (wa-)',
        'w:REM': 'Resumption particle (wa-)',
        'f:CONJ':'Conjunction (fa-)',
        'w:P':   'Preposition (wa-)',
        'k:P':   'Preposition (ka-)',
        sa:      'Future particle (sa-)',
        ta:      'Oath particle (ta-)',
    };

    const MOOD_LABELS: Record<string, string> = {
        IND:  'Indicative',
        JUS:  'Jussive',
        SUBJ: 'Subjunctive',
    };

    // PRON: in corpus stores person-gender-number codes e.g. "3MS", "2FS", "1P"
    const SUFFIX_LABELS: Record<string, string> = {
        '3MS': '3rd masc. sg.',   '3FS': '3rd fem. sg.',
        '3MD': '3rd masc. dual',  '3FD': '3rd fem. dual',
        '3MP': '3rd masc. pl.',   '3FP': '3rd fem. pl.',
        '2MS': '2nd masc. sg.',   '2FS': '2nd fem. sg.',
        '2MD': '2nd masc. dual',  '2FD': '2nd fem. dual',
        '2MP': '2nd masc. pl.',   '2FP': '2nd fem. pl.',
        '1S':  '1st sg.',
        '1D':  '1st dual',
        '1P':  '1st pl.',
    };

    const FEATURES: Array<{ key: keyof typeof word.tokens[0]['features']; labelKey: string; arabic?: boolean }> = [
        { key: 'root',        labelKey: 'morphology.feat.root',   arabic: true },
        { key: 'lemma',       labelKey: 'morphology.feat.lemma',  arabic: true },
        { key: 'pos',         labelKey: 'morphology.feat.pos'                  },
        { key: 'gender',      labelKey: 'morphology.feat.gender'               },
        { key: 'number',      labelKey: 'morphology.feat.number'               },
        { key: 'case_type',   labelKey: 'morphology.feat.case'                 },
        { key: 'person',      labelKey: 'morphology.feat.person'               },
        { key: 'aspect',      labelKey: 'morphology.feat.aspect'               },
        { key: 'voice',       labelKey: 'morphology.feat.voice'                },
        { key: 'mood',        labelKey: 'morphology.feat.mood'                 },
        { key: 'state',       labelKey: 'morphology.feat.state'                },
        { key: 'derivation',  labelKey: 'morphology.feat.form'                 },
        { key: 'prefix_type', labelKey: 'morphology.feat.prefix'               },
        { key: 'suffix_type', labelKey: 'morphology.feat.suffix'               },
    ];

    function translateFeatureValue(tFn: (k: string) => string, key: string, value: string): string {
        switch (key) {
            case 'pos':         return tFn(`morphology.pos.${value.replace(' ', '_')}`)           || POS_LABELS[value]        || value;
            case 'gender':      return tFn(`morphology.gender.${value}`)                          || value;
            case 'number':      return tFn(`morphology.number.${value}`)                          || value;
            case 'case_type':   return tFn(`morphology.case.${value}`)                            || value;
            case 'aspect':      return tFn(`morphology.aspect.${value}`)                          || value;
            case 'voice':       return tFn(`morphology.voice.${value}`)                           || value;
            case 'state':       return tFn(`morphology.state.${value}`)                           || value;
            case 'person':      return tFn(`morphology.person.${value}`)                          || PERSON_LABELS[value]     || value;
            case 'derivation':  return tFn(`morphology.form.${value.replace(/[()]/g, '')}`)       || DERIVATION_LABELS[value] || value;
            case 'prefix_type': return tFn(`morphology.prefix.${value.replace(/:/g, '_')}`)       || PREFIX_LABELS[value]     || value;
            case 'suffix_type': return tFn(`morphology.suffix.${value}`)                          || SUFFIX_LABELS[value]     || value;
            case 'mood':        return tFn(`morphology.mood.${value}`)                            || MOOD_LABELS[value]       || value;
            default:            return value;
        }
    }

    function insertToLexical(): void {
        const editor = get(lexicalEditorInstance);
        if (!editor) return;

        editor.update(() => {
            const titlePara = createParagraphNode();
            titlePara.append(createTextNode(word.combined_arabic));
            insertNodeToNearestRoot(titlePara);

            for (const token of word.tokens) {
                const table = createTableNode();

                // Header row: tag name | arabic form + buckwalter
                const headerRow = createTableRowNode();
                const hCell1 = createTableCellNode(TableCellHeaderStates.ROW);
                hCell1.append(createParagraphNode().append(createTextNode(token.tag_name)));
                const hCell2 = createTableCellNode(TableCellHeaderStates.ROW);
                hCell2.append(createParagraphNode().append(createTextNode(token.form_arabic + '  ' + token.form_buckwalter)));
                headerRow.append(hCell1, hCell2);
                table.append(headerRow);

                // Feature rows (non-null only)
                const tFn = get(t);
                for (const { key, labelKey, arabic } of FEATURES) {
                    const val = token.features[key];
                    if (!val) continue;
                    const row = createTableRowNode();

                    const labelCell = createTableCellNode(TableCellHeaderStates.NO_STATUS);
                    labelCell.append(createParagraphNode().append(createTextNode(tFn(labelKey))));

                    const rawVal = val as string;
                    const displayVal = arabic
                        ? buckwalterToArabic(rawVal)
                        : translateFeatureValue(tFn, key, rawVal);
                    const valueCell = createTableCellNode(TableCellHeaderStates.NO_STATUS);
                    valueCell.append(createParagraphNode().append(createTextNode(displayVal)));

                    row.append(labelCell, valueCell);
                    table.append(row);
                }

                insertNodeToNearestRoot(table);
            }

            // Trailing paragraph so cursor lands after inserted content
            insertNodeToNearestRoot(createParagraphNode());
        });
    }

    // --- AI prompt about this word (Pro) ---
    let aiPromptOpen = $state(false);
    let aiPromptText = $state('');
    let aiPromptInput: HTMLInputElement | null = $state(null);

    function buildWordMorphologyContext(): string {
        const tFn = get(t);
        const lines: string[] = [];
        lines.push(`Surah ${surahNum}, Ayah ${ayahNum}, Word ${word.word}`);
        lines.push(`Arabic: ${word.combined_arabic}`);
        if (wordMeaning) lines.push(`Meaning: ${wordMeaning}`);
        lines.push(`Tokens (${word.tokens.length}):`);
        for (const token of word.tokens) {
            lines.push(`- ${token.tag_name}: ${token.form_arabic} (${token.form_buckwalter})`);
            for (const { key, labelKey, arabic } of FEATURES) {
                const val = token.features[key];
                if (!val) continue;
                const rawVal = val as string;
                const displayVal = arabic
                    ? buckwalterToArabic(rawVal)
                    : translateFeatureValue(tFn, key, rawVal);
                lines.push(`    ${tFn(labelKey)}: ${displayVal}`);
            }
        }
        return lines.join('\n');
    }

    async function toggleAiPrompt() {
        aiPromptOpen = !aiPromptOpen;
        if (aiPromptOpen) {
            await tick();
            aiPromptInput?.focus();
        }
    }

    function submitAiPrompt() {
        const prompt = aiPromptText.trim();
        if (!prompt) return;
        askAiAboutSelection({
            prompt,
            selectedText: word.combined_arabic,
            contextPrompt: buildWordMorphologyContext(),
        });
        aiPromptOpen = false;
        aiPromptText = '';
        onClose();
    }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    use:portal
    class={`ayah-tooltip fixed flex w-88 max-h-[76vh] flex-col overflow-hidden rounded-xl shadow-2xl border ${$morphGlassEffect ? 'backdrop-blur-sm border-slate-200/70 dark:border-[#414559]/70 bg-white/50 dark:bg-[#292c3c]/50' : 'border-slate-200 dark:border-[#414559] bg-white dark:bg-[#292c3c]'}`}
    onpointerdown={(e) => { zIndex = bringToFront(); startDragFromBorder(e); }}
    onpointermove={updateBorderCursor}
    onpointerleave={() => { isNearBorder = false; }}
    style={`z-index:${zIndex}; ${position.placement === "below"
        ? `left: ${position.x + dragX}px; top: ${position.y + 8 + dragY}px;`
        : `left: ${position.x + dragX}px; bottom: calc(100vh - ${position.y}px + 8px - ${dragY}px);`
    }${isNearBorder || isDragging ? `; cursor: ${isDragging ? 'grabbing' : 'grab'}` : ''}`}
    transition:fly={{ y: position.placement === "below" ? 8 : -8, duration: 180, opacity: 0 }}
>
    <!-- Header -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class={`flex shrink-0 items-center justify-between bg-linear-to-b px-4 py-3.5 border-b border-slate-100 dark:border-[#414559] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${$morphGlassEffect ? 'from-slate-50/50 to-white/50 dark:from-[#232634]/50 dark:to-[#292c3c]/50' : 'from-slate-50 to-white dark:from-[#232634] dark:to-[#292c3c]'}`}
        onpointerdown={startDrag}
    >
        <div dir="rtl" class="flex flex-col gap-1">
            <span class="font-scheherazade text-2xl py-1 leading-none text-slate-800/70 dark:text-[#c6d0f5]/70">
                {word.combined_arabic}
            </span>
            <span class="text-[0.625rem] font-medium text-slate-400 dark:text-[#838ba7]">
                {word.tokens.length} {word.tokens.length !== 1 ? $t('morphology.tokens') : $t('morphology.token')}
            </span>
        </div>
        <div class="flex items-center gap-1">
            <button
                onclick={insertToLexical}
                disabled={!$lexicalEditorInstance}
                aria-label={$t('morphology.insert_to_lexical')}
                title={$t('morphology.insert_to_lexical')}
                class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-400 dark:text-[#838ba7] transition-all hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-slate-600 dark:hover:text-[#c6d0f5] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <Icon icon="solar:add-square-bold-duotone" width="15" />
            </button>
            {#if onHighlight}
                <button
                    onclick={onHighlight}
                    aria-label={$t('highlight.word_highlight')}
                    title={$t('highlight.word_highlight')}
                    class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-400 dark:text-[#838ba7] transition-all hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-brand-gold-500 dark:hover:text-[#e5c890] active:scale-95"
                >
                    <Icon icon="solar:pen-new-square-bold-duotone" width="14" />
                </button>
            {/if}
            {#if $isPro}
                <button
                    onclick={toggleAiPrompt}
                    aria-label={$t('morphology.ai_ask_word')}
                    title={$t('morphology.ai_ask_word')}
                    class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-350  dark:text-[#838ba7] transition-all hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-brand-gold-500 dark:hover:text-[#e5c890] active:scale-95 {aiPromptOpen ? 'bg-slate-100 dark:bg-[#414559] text-brand-gold-500 dark:text-[#e5c890]' : ''}"
                >
                    <Icon icon="ri:chat-smile-ai-fill" width="14" />
                </button>
            {/if}
            {#if onPin}
                <button
                    onclick={onPin}
                    aria-label="Pin"
                    class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-400 dark:text-[#838ba7] transition-all hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-slate-600 dark:hover:text-[#c6d0f5] active:scale-95"
                >
                    <Icon icon="solar:pin-bold-duotone" width="14" />
                </button>
            {/if}
            <button
                onclick={onClose}
                aria-label="Close"
                class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-400 dark:text-[#838ba7] transition-all hover:bg-slate-100 dark:hover:bg-[#414559] hover:text-slate-600 dark:hover:text-[#c6d0f5] active:scale-95"
            >
                <Icon icon="mdi:close" width="14" />
            </button>
        </div>
    </div>

    {#if aiPromptOpen}
        <div class="shrink-0 border-b border-slate-100 dark:border-[#414559] bg-brand-sand-50/60 dark:bg-[#232634]/60 px-3 py-2">
            <div class="flex items-center gap-1.5">
                <input
                    bind:this={aiPromptInput}
                    bind:value={aiPromptText}
                    placeholder={$t('morphology.ai_word_placeholder')}
                    class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#1e2030] px-2 py-1.5 text-[0.6875rem] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
                    onkeydown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitAiPrompt(); }
                        else if (e.key === 'Escape') { aiPromptOpen = false; }
                    }}
                />
                <button
                    onclick={submitAiPrompt}
                    disabled={!aiPromptText.trim()}
                    aria-label={$t('morphology.ai_ask_word')}
                    title={$t('morphology.ai_ask_word')}
                    class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
                </button>
            </div>
        </div>
    {/if}

    <!-- Token list -->
    <div class="default-scroll flex-1 space-y-2.5 overflow-y-auto p-3">
        {#if wordMeaning}
            <div class="overflow-hidden rounded-xl border border-brand-gold-200/80 bg-linear-to-br from-brand-gold-50 to-white dark:border-[#e5c890]/30 dark:from-[#e5c890]/10 dark:to-[#303446]/60">
                <div class="h-0.5 w-full bg-brand-gold-400 dark:bg-[#e5c890]"></div>
                <div class="flex items-start gap-3 px-3.5 py-3">
                    <div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-brand-gold-100 text-brand-gold-600 dark:bg-[#e5c890]/15 dark:text-[#e5c890]">
                        <Icon icon="solar:book-bookmark-bold-duotone" width="0.9rem" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="mb-1 flex items-center justify-between gap-2">
                            <span class="text-[0.625rem] font-semibold uppercase tracking-wide text-brand-gold-600/80 dark:text-[#e5c890]/80">
                                {$t('surah.word_by_word')}
                            </span>
                            <span dir="rtl" class="font-scheherazade text-lg leading-none text-brand-gold-600/80 dark:text-[#e5c890]/80">
                                {word.combined_arabic}
                            </span>
                        </div>
                        <p dir="auto" class="text-sm font-semibold leading-relaxed text-brand-charcoal-500 dark:text-[#949cbb]">
                            {wordMeaning}
                        </p>
                    </div>
                </div>
            </div>
        {/if}

        {#each word.tokens as token}
            {@const s = getStyle(token.tag)}
            <div class="overflow-hidden rounded-xl border {s.border} {s.bg}">

                <!-- Colored accent bar -->
                <div class="h-0.5 w-full {s.accent}"></div>

                <!-- Token header -->
                <div class="flex items-start justify-between px-3 pt-2.5 pb-2">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold {s.badge}">
                        <span class="h-1.5 w-1.5 rounded-full {s.dot}"></span>
                        {token.tag_name}
                    </span>
                    <div class="flex flex-col items-end gap-1" dir="rtl">
                        <span class="font-scheherazade text-right text-xl p-1 leading-none {s.text}">
                            {token.form_arabic}
                        </span>
                        <button
                            onclick={() => openUrl('https://www.ayahlab.com/docs')}
                            title={$t('morphology.buckwalter_help')}
                            aria-label={$t('morphology.buckwalter_help')}
                            class="cursor-pointer rounded-md bg-slate-100 dark:bg-[#414559] px-1.5 py-0.5 font-mono text-[0.625rem] text-slate-500 dark:text-[#949cbb] hover:underline hover:text-slate-700 dark:hover:text-[#c6d0f5] transition-colors"
                            dir="ltr"
                        >{token.form_buckwalter}</button>
                    </div>
                </div>

                <!-- Features -->
                {#if FEATURES.some(f => token.features[f.key])}
                    <div class="divide-y divide-slate-100 dark:divide-[#414559]/60 border-t {s.border} px-3 pb-0.5">
                        {#each FEATURES as { key, labelKey, arabic }}
                            {#if token.features[key]}
                                <div class="flex items-center justify-between gap-3 py-1.5">
                                    <span class="shrink-0 text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#838ba7]">
                                        {$t(labelKey)}
                                    </span>
                                    {#if arabic}
                                        <span class="font-scheherazade text-sm font-medium {s.text}" dir="rtl">
                                            {buckwalterToArabic(token.features[key] as string)}
                                        </span>
                                    {:else}
                                        <span class="text-[0.6875rem] font-medium text-slate-600 dark:text-[#a5adce]">
                                            {translateFeatureValue($t, key, token.features[key] as string)}
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</div>
