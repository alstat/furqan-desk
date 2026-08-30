<!-- The beginner alphabet lesson: letter picker, positional forms, one
     Qur'anic + one everyday example word. Renders as
     the BODY of ArabicStudyHome's window (which already supplies the window
     chrome) — no header of its own. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        glossOverrides,
        glossText,
        registerGlosses,
    } from "$lib/stores/arabic-study-gloss.store";
    import {
        ARABIC_ALPHABET,
        letterForms,
        getArabicLetter,
        type ArabicLetter,
    } from "$lib/data/arabic-alphabet";
    import { getLetterExamples, type WordExample } from "$lib/data/letter-examples";
    import { LETTER_POSITION_EXAMPLES } from "$lib/data/letter-position-examples";
    import { highlightLetter } from "$lib/utils/arabic-highlight";
    import VerseRefBadge from "./VerseRefBadge.svelte";
    import {
        fetchLetterProgress,
        markLetterPracticed,
        setLetterMastered,
        type LetterProgress,
    } from "$lib/stores/arabic-study.store";

    interface Props {
        onBack: () => void;
        onContinue: () => void;
    }
    let { onBack, onContinue }: Props = $props();

    let selectedId = $state<string>("alif");
    let progress = $state<LetterProgress[]>([]);
    let marking = $state(false);

    $effect(() => {
        void fetchLetterProgress()
            .then((p) => (progress = p))
            .catch((e) => console.error("Failed to load letter progress", e));
    });

    const selected = $derived<ArabicLetter>(getArabicLetter(selectedId) ?? ARABIC_ALPHABET[0]);
    const forms = $derived(letterForms(selected));
    const examples = $derived(getLetterExamples(selected.id));
    const quranExamples = $derived(examples.quran);
    const everydayExamples = $derived(examples.everyday);
    const positionExamples = $derived(LETTER_POSITION_EXAMPLES[selected.id]);
    interface PositionEntry {
        key: "initial" | "medial" | "final";
        labelKey: string;
        example?: WordExample;
    }
    const positionEntries = $derived<PositionEntry[]>(
        positionExamples === undefined
            ? []
            : [
                  { key: "initial", labelKey: "arabicStudy.alphabet.form_initial", example: positionExamples.initial },
                  { key: "medial", labelKey: "arabicStudy.alphabet.form_medial", example: positionExamples.medial },
                  { key: "final", labelKey: "arabicStudy.alphabet.form_final", example: positionExamples.final },
              ],
    );
    // Hand the words on screen to the gloss store, so the header's language
    // choice reaches this lesson's meanings too.
    $effect(() => {
        registerGlosses([
            ...quranExamples,
            ...everydayExamples,
            ...positionEntries.flatMap((entry) => (entry.example ? [entry.example] : [])),
        ]);
    });

    const practicedCount = $derived(progress.filter((p) => p.practiced_at).length);
    const isMastered = $derived(
        progress.find((p) => p.letter === selected.id)?.mastered ?? false,
    );

    function selectLetter(id: string) {
        selectedId = id;
    }

    async function gotIt() {
        marking = true;
        try {
            await markLetterPracticed(selected.id);
            const updated = await setLetterMastered(selected.id, true);
            progress = [...progress.filter((p) => p.letter !== updated.letter), updated];
        } catch (e) {
            console.error("Failed to save letter progress", e);
        } finally {
            marking = false;
        }
    }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-[#303446]">
    <!-- Progress sub-bar -->
    <div
        class="flex shrink-0 items-center gap-3 border-b border-brand-sand-200 bg-brand-sand-50 px-5 py-2 dark:border-[#414559] dark:bg-[#232634]"
    >
        <div class="flex items-center gap-2">
            <span class="text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                {$t("arabicStudy.alphabet.progress", {
                    count: String(practicedCount),
                    total: String(ARABIC_ALPHABET.length),
                })}
            </span>
            <div class="h-1.5 w-32 overflow-hidden rounded-full bg-brand-sand-200 dark:bg-[#414559]">
                <div
                    class="h-full bg-brand-gold-400 dark:bg-brand-gold-500"
                    style:width="{(practicedCount / ARABIC_ALPHABET.length) * 100}%"
                ></div>
            </div>
        </div>
    </div>

    <div class="default-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <!-- Reading-direction intro -->
        <div
            class="shrink-0 rounded-2xl border border-brand-gold-200 bg-brand-gold-50 p-4 dark:border-[#5a5030] dark:bg-[#34302a]"
        >
            <div class="flex items-center gap-1.5">
                <Icon
                    icon="solar:round-arrow-left-bold-duotone"
                    width="1rem"
                    class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                />
                <h4 class="text-[0.75rem] font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                    {$t("arabicStudy.alphabet.direction_title")}
                </h4>
            </div>
            <p class="mt-1 text-[0.6875rem] leading-relaxed text-brand-gold-700 dark:text-[#e5c890]">
                {$t("arabicStudy.alphabet.direction_desc")}
            </p>
        </div>

        <div class="flex shrink-0 gap-5">
            <!-- Letter grid -->
            <div class="w-52 shrink-0">
                <h4
                    class="mb-2 text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("arabicStudy.alphabet.letters")}
                </h4>
                <div class="grid grid-cols-5 gap-1.5">
                    {#each ARABIC_ALPHABET as l (l.id)}
                        {@const done = progress.find((p) => p.letter === l.id)?.mastered}
                        <button
                            onclick={() => selectLetter(l.id)}
                            class="relative flex h-10 items-center justify-center rounded-lg font-scheherazade text-xl transition-colors {selectedId ===
                            l.id
                                ? 'bg-brand-gold-100 text-brand-charcoal-900 ring-2 ring-brand-gold-400 dark:bg-[#414559] dark:text-[#c6d0f5] dark:ring-[#e5c890]'
                                : 'bg-brand-sand-100 text-brand-charcoal-500 hover:bg-brand-sand-200 dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:bg-[#363a4f]'}"
                        >
                            {l.glyph}
                            {#if done}
                                <span
                                    class="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-white bg-brand-emerald-400 text-white dark:border-[#303446]"
                                >
                                    <Icon icon="solar:check-bold" width="0.5rem" />
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Main panel -->
            <div class="flex min-w-0 flex-1 flex-col gap-4">
                <div
                    class="flex items-center gap-5 rounded-2xl border border-brand-sand-200 bg-brand-sand-50 p-4 dark:border-[#414559] dark:bg-[#232634]"
                >
                    <div
                        class="flex h-20 w-20 shrink-0 items-center justify-center font-scheherazade text-6xl text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {selected.glyph}
                    </div>
                    <div>
                        <div class="text-base font-bold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                            {selected.name}
                        </div>
                        <div class="text-[0.75rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                            {selected.sound}
                        </div>
                    </div>
                </div>

                <!-- Forms -->
                <div class="flex items-center gap-1.5">
                    <h4
                        class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("arabicStudy.alphabet.forms_title")}
                    </h4>
                    <span
                        title={$t("arabicStudy.alphabet.forms_explainer")}
                        class="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        <Icon icon="solar:info-circle-linear" width="0.75rem" />
                    </span>
                </div>
                <p class="-mt-1.5 text-[0.6875rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("arabicStudy.alphabet.forms_explainer")}
                </p>
                <div class="flex gap-2">
                    <div
                        class="flex flex-1 flex-col items-center rounded-xl border border-brand-sand-200 bg-white py-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span class="pb-2 font-scheherazade text-2xl text-brand-charcoal-700 dark:text-[#c6d0f5]">{forms.iso}</span>
                        <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_isolated")}</span>
                    </div>
                    {#if selected.connects}
                        <div
                            class="flex flex-1 flex-col items-center rounded-xl border border-brand-sand-200 bg-white py-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                        >
                            <span class="pb-2 font-scheherazade text-2xl text-brand-charcoal-700 dark:text-[#c6d0f5]">{forms.ini}</span>
                            <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_initial")}</span>
                        </div>
                        <div
                            class="flex flex-1 flex-col items-center rounded-xl border border-brand-sand-200 bg-white py-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                        >
                            <span class="pb-2 font-scheherazade text-2xl text-brand-charcoal-700 dark:text-[#c6d0f5]">{forms.med}</span>
                            <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_medial")}</span>
                        </div>
                    {:else}
                        <div
                            class="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-brand-sand-200 bg-brand-sand-50 py-2.5 dark:border-[#414559] dark:bg-[#232634]"
                        >
                            <span class="text-lg text-brand-charcoal-200 dark:text-[#5b6078]">—</span>
                            <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_none_initial")}</span>
                        </div>
                        <div
                            class="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-brand-sand-200 bg-brand-sand-50 py-2.5 dark:border-[#414559] dark:bg-[#232634]"
                        >
                            <span class="text-lg text-brand-charcoal-200 dark:text-[#5b6078]">—</span>
                            <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_none_medial")}</span>
                        </div>
                    {/if}
                    <div
                        class="flex flex-1 flex-col items-center rounded-xl border border-brand-sand-200 bg-white py-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span class="pb-2 font-scheherazade text-2xl text-brand-charcoal-700 dark:text-[#c6d0f5]">{forms.fin}</span>
                        <span class="mt-1 text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t("arabicStudy.alphabet.form_final")}</span>
                    </div>
                </div>

                {#if selected.tip}
                    <p
                        class="rounded-xl border border-brand-gold-200 bg-brand-gold-50 px-3 py-2 text-[0.6875rem] leading-relaxed text-brand-gold-600 dark:border-[#5a5030] dark:bg-[#34302a] dark:text-[#e5c890]"
                    >
                        {selected.tip}
                    </p>
                {/if}

                <!-- Forms, spotted in real words -->
                {#if positionExamples}
                    <div>
                        <h4
                            class="text-[0.625rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {$t("arabicStudy.alphabet.positions_title")}
                        </h4>
                        <div class="mt-1.5 grid grid-cols-3 gap-2">
                            {#each positionEntries as entry (entry.key)}
                                {#if entry.example}
                                    {@const ex = entry.example}
                                    <div
                                        class="rounded-xl border border-brand-sand-200 bg-white p-2.5 dark:border-[#414559] dark:bg-[#292c3c]"
                                    >
                                        <span class="text-[0.59375rem] font-bold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]">{$t(entry.labelKey)}</span>
                                        <div dir="rtl" class="mt-1 pb-2 font-scheherazade text-xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(ex.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                        <div dir="ltr" class="mt-0.5 text-left text-[0.625rem]">
                                            <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{ex.translit}</span>
                                            <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                            <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(ex.word, ex.meaning, $glossOverrides)}</span>{#if ex.ref}<span class="ml-1.5 align-middle"><VerseRefBadge verseRef={ex.ref} size="sm" /></span>{/if}
                                        </div>
                                    </div>
                                {/if}
                            {/each}
                        </div>
                    </div>
                {:else}
                    <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("arabicStudy.alphabet.positions_none", { letter: selected.name })}
                    </p>
                {/if}

                <!-- Examples -->
                <div class="flex gap-3">
                    <div
                        class="flex-1 rounded-2xl border border-brand-emerald-200 bg-brand-emerald-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span
                            class="rounded-full bg-brand-emerald-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-emerald-600 dark:bg-[#414559] dark:text-[#9dd4c8]"
                        >
                            {$t("arabicStudy.alphabet.from_quran")}
                        </span>
                        <div class="mt-2 flex flex-col gap-3">
                            {#each quranExamples as q, i (q.word)}
                                <div class="{i > 0 ? 'border-t border-brand-emerald-200/60 pt-3 dark:border-[#414559]' : ''}">
                                    <div dir="rtl" class="pb-2 font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(q.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                    <div dir="ltr" class="mt-0.5 text-left text-[0.6875rem]">
                                        <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{q.translit}</span>
                                        <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                        <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(q.word, q.meaning, $glossOverrides)}</span>{#if q.ref}<span class="ml-1.5 align-middle"><VerseRefBadge verseRef={q.ref} /></span>{/if}
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                    <div
                        class="flex-1 rounded-2xl border border-brand-teal-200 bg-brand-teal-50 p-3 dark:border-[#414559] dark:bg-[#292c3c]"
                    >
                        <span
                            class="rounded-full bg-brand-teal-100 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-brand-teal-600 dark:bg-[#414559] dark:text-[#92cccc]"
                        >
                            {$t("arabicStudy.alphabet.everyday")}
                        </span>
                        <div class="mt-2 flex flex-col gap-3">
                            {#each everydayExamples as w, i (w.word)}
                                <div class="{i > 0 ? 'border-t border-brand-teal-200/60 pt-3 dark:border-[#414559]' : ''}">
                                    <div dir="rtl" class="pb-2 font-scheherazade text-2xl leading-loose text-brand-charcoal-900 dark:text-[#c6d0f5]">{#each highlightLetter(w.word, selected.glyph) as seg, si (si)}{#if seg.hi}<span class="text-brand-gold-500 dark:text-[#e5c890]">{seg.text}</span>{:else}{seg.text}{/if}{/each}</div>
                                    <div dir="ltr" class="mt-0.5 text-left text-[0.6875rem]">
                                        <span class="italic text-brand-charcoal-400 dark:text-[#a5adce]">{w.translit}</span>
                                        <span class="text-brand-charcoal-300 dark:text-[#5b6078]"> — </span>
                                        <span class="font-semibold text-brand-charcoal-600 dark:text-[#c6d0f5]">{glossText(w.word, w.meaning, $glossOverrides)}</span>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>

                <div class="flex items-center justify-end gap-3">
                    <button
                        onclick={gotIt}
                        disabled={marking || isMastered}
                        class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-[0.75rem] font-semibold transition-colors disabled:cursor-default {isMastered
                            ? 'border-brand-emerald-200 bg-brand-emerald-50 text-brand-emerald-600 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#9dd4c8]'
                            : 'border-brand-sand-200 bg-white text-brand-charcoal-500 hover:border-brand-gold-300 hover:bg-brand-gold-50 dark:border-[#414559] dark:bg-[#292c3c] dark:text-[#c6d0f5] dark:hover:border-[#e5c890]/40'}"
                    >
                        <Icon
                            icon={isMastered ? "solar:check-circle-bold" : "solar:check-circle-linear"}
                            width="0.9rem"
                        />
                        {isMastered
                            ? $t("arabicStudy.alphabet.mastered")
                            : $t("arabicStudy.alphabet.got_it")}
                    </button>
                </div>
            </div>
        </div>
        <!-- Spacer — padding-bottom on a scrolling flex container isn't
             reliably honored by every WebView engine, so a real element
             guarantees breathing room above the footer once scrolled. -->
        <div class="h-2 shrink-0" aria-hidden="true"></div>
    </div>

    <!-- Footer nav -->
    <div
        class="flex shrink-0 items-center justify-between border-t border-brand-sand-200 px-5 py-3 dark:border-[#414559]"
    >
        <button
            onclick={onBack}
            class="flex cursor-pointer items-center gap-1.5 text-[0.75rem] font-semibold text-brand-charcoal-400 hover:text-brand-charcoal-600 dark:text-[#838ba7] dark:hover:text-[#c6d0f5]"
        >
            <Icon icon="solar:arrow-left-linear" width="0.8rem" />
            {$t("arabicStudy.alphabet.back")}
        </button>
        <button
            onclick={onContinue}
            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-4 py-1.5 text-[0.75rem] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400"
        >
            {$t("arabicStudy.alphabet.continue_pairing")}
            <Icon icon="solar:arrow-right-linear" width="0.8rem" />
        </button>
    </div>
</div>
