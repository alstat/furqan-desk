<script lang="ts">
    import type { MorphWord } from "$lib/types/morphology";
    import Icon from "@iconify/svelte";
    import { buckwalterToArabic } from "$lib/functions/utils/utils";
    import { fly } from "svelte/transition";
    import { onDestroy } from "svelte";
    import { morphGlassEffect } from "$lib/stores/morphology.store";
    import { bringToFront } from "$lib/stores/window-manager.store";

    interface Props {
        word: MorphWord;
        position: { x: number; y: number; placement: "above" | "below" };
        onClose: () => void;
        onPin?: () => void;
    }

    let { word, position, onClose, onPin }: Props = $props();

    let zIndex = $state(bringToFront());

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

    const FEATURES: Array<{ key: keyof typeof word.tokens[0]['features']; label: string; arabic?: boolean; transform?: (v: string) => string }> = [
        { key: 'root',        label: 'Root',    arabic: true },
        { key: 'lemma',       label: 'Lemma',   arabic: true },
        { key: 'pos',         label: 'POS',         transform: v => POS_LABELS[v]        ?? v },
        { key: 'gender',      label: 'Gender'                                                 },
        { key: 'number',      label: 'Number'                                                 },
        { key: 'case_type',   label: 'Case'                                                   },
        { key: 'person',      label: 'Person',      transform: v => PERSON_LABELS[v]     ?? v },
        { key: 'aspect',      label: 'Aspect'                                                 },
        { key: 'voice',       label: 'Voice'                                                  },
        { key: 'mood',        label: 'Mood',        transform: v => MOOD_LABELS[v]        ?? v },
        { key: 'state',       label: 'State'                                                  },
        { key: 'derivation',  label: 'Form',        transform: v => DERIVATION_LABELS[v] ?? v },
        { key: 'prefix_type', label: 'Prefix',      transform: v => PREFIX_LABELS[v]     ?? v },
        { key: 'suffix_type', label: 'Suffix',      transform: v => SUFFIX_LABELS[v]     ?? v },
    ];
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
    use:portal
    class={`ayah-tooltip fixed flex w-88 max-h-[76vh] flex-col overflow-hidden rounded-3xl shadow-2xl border ${$morphGlassEffect ? 'backdrop-blur-sm border-slate-200/70 dark:border-[#414559]/70 bg-white/50 dark:bg-[#292c3c]/50' : 'border-slate-200 dark:border-[#414559] bg-white dark:bg-[#292c3c]'}`}
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
            <span class="text-[10px] font-medium text-slate-400 dark:text-[#838ba7]">
                {word.tokens.length} token{word.tokens.length !== 1 ? 's' : ''}
            </span>
        </div>
        <div class="flex items-center gap-1">
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

    <!-- Token list -->
    <div class="default-scroll flex-1 space-y-2.5 overflow-y-auto p-3">
        {#each word.tokens as token}
            {@const s = getStyle(token.tag)}
            <div class="overflow-hidden rounded-xl border {s.border} {s.bg}">

                <!-- Colored accent bar -->
                <div class="h-0.5 w-full {s.accent}"></div>

                <!-- Token header -->
                <div class="flex items-start justify-between px-3 pt-2.5 pb-2">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold {s.badge}">
                        <span class="h-1.5 w-1.5 rounded-full {s.dot}"></span>
                        {token.tag_name}
                    </span>
                    <div class="flex flex-col items-end gap-1" dir="rtl">
                        <span class="font-scheherazade text-right text-xl p-1 leading-none {s.text}">
                            {token.form_arabic}
                        </span>
                        <code class="rounded-md bg-slate-100 dark:bg-[#414559] px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:text-[#949cbb]" dir="ltr">
                            {token.form_buckwalter}
                        </code>
                    </div>
                </div>

                <!-- Features -->
                {#if FEATURES.some(f => token.features[f.key])}
                    <div class="divide-y divide-slate-100 dark:divide-[#414559]/60 border-t {s.border} px-3 pb-0.5">
                        {#each FEATURES as { key, label, arabic, transform }}
                            {#if token.features[key]}
                                <div class="flex items-center justify-between gap-3 py-1.5">
                                    <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-[#838ba7]">
                                        {label}
                                    </span>
                                    {#if arabic}
                                        <span class="font-scheherazade text-sm font-medium {s.text}" dir="rtl">
                                            {buckwalterToArabic(token.features[key] as string)}
                                        </span>
                                    {:else}
                                        <span class="text-[11px] font-medium text-slate-600 dark:text-[#a5adce]">
                                            {transform ? transform(token.features[key] as string) : token.features[key]}
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
