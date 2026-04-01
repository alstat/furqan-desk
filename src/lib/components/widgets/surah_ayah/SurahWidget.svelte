<script lang="ts">
    import Icon from "@iconify/svelte";
    import ControlCard from "../cards/ControlCard.svelte";
    import GroupCards from "../cards/GroupCards.svelte";
    import {
        selectedSurahIdx,
        selectedSurahName,
        surahLabels,
        hideSurahPage,
        isSidebar,
        morphologyAyahFilter,
        morphologyMultiSurahList,
    } from "$lib/stores/quran.svelte";
    import { recitationPlaylist } from "$lib/stores/recitation.store";
    import {
        multiSurahTranslationMap,
        multiSurahTransliterationMap,
        multiSurahWordByWordMap,
    } from "$lib/stores/translation.store";
    import {
        morphFontFamily,
        morphFontSize,
    } from "$lib/stores/morphology.store";
    import {
        loadMorphologySurah,
        loadBasmallahMorphology,
    } from "$lib/functions/widgets/surahWidget";
    import {
        availableTranslators,
        activeTranslatorId,
        transliterationEnabled,
        wordByWordEnabled,
        tafsirEnabled,
        activeTafsirId,
        availableTafsirAuthors,
    } from "$lib/stores/translation.store";
    import { invoke } from "@tauri-apps/api/core";
    import type {
        TranslatorInfo,
        TafsirAuthorInfo,
    } from "$lib/stores/translation.store";
    import { onMount } from "svelte";

    const LANG_NAMES: Record<string, string> = {
        AR: "Arabic",
        BN: "Bengali",
        DE: "German",
        EN: "English",
        FA: "Persian",
        FR: "French",
        HA: "Hausa",
        HI: "Hindi",
        ID: "Indonesian",
        MS: "Malay",
        PA: "Punjabi",
        PS: "Pashto",
        RU: "Russian",
        SW: "Swahili",
        TL: "Tagalog",
        TR: "Turkish",
        UR: "Urdu",
    };

    let font: string = $state("font-scheherazade");
    let textSize: string = $state("text-xl");
    let hideSurah: boolean = $state(false);
    let fontOptionsOn: boolean = $state(false);
    let selectedTranslatorId: string = $state("");
    let translitEnabled: boolean = $state(false);
    let wbwEnabled: boolean = $state(false);
    let tafsirOn: boolean = $state(false);
    let selectedTafsirId: string = $state("");

    onMount(async () => {
        loadBasmallahMorphology();
        try {
            const translators =
                await invoke<TranslatorInfo[]>("get_translators");
            availableTranslators.set(translators);
        } catch (e) {
            console.error("Failed to load translators", e);
        }
        const saved = $activeTranslatorId;
        if (saved !== null) selectedTranslatorId = String(saved);
        translitEnabled = $transliterationEnabled;
        wbwEnabled = $wordByWordEnabled;
        try {
            const tafsirAuthors =
                await invoke<TafsirAuthorInfo[]>("get_tafsir_authors");
            availableTafsirAuthors.set(tafsirAuthors);
        } catch (e) {
            console.error("Failed to load tafsir authors", e);
        }
        const savedTafsir = $activeTafsirId;
        if (savedTafsir !== null) selectedTafsirId = String(savedTafsir);
        tafsirOn = $tafsirEnabled;
    });

    $effect(() => {
        morphFontFamily.set(font);
    });
    $effect(() => {
        morphFontSize.set(textSize);
    });
    $effect(() => {
        hideSurahPage.set(() => hideSurah);
    });

    $effect(() => {
        const idx = $selectedSurahIdx;
        selectedSurahName.set($surahLabels[idx - 1]?.ar ?? "");
        loadMorphologySurah(idx);
    });

    $effect(() => {
        activeTranslatorId.set(
            selectedTranslatorId ? parseInt(selectedTranslatorId) : null,
        );
    });

    $effect(() => {
        transliterationEnabled.set(translitEnabled);
    });
    $effect(() => {
        wordByWordEnabled.set(wbwEnabled);
    });
    $effect(() => {
        tafsirEnabled.set(tafsirOn);
    });
    $effect(() => {
        activeTafsirId.set(
            selectedTafsirId ? parseInt(selectedTafsirId) : null,
        );
    });

    function onSurahChange(event: Event) {
        const idx = parseInt((event.target as HTMLSelectElement).value);
        selectedSurahIdx.set(idx);
        morphologyAyahFilter.set(null);
        morphologyMultiSurahList.set(null);
        recitationPlaylist.set(null);
        multiSurahTranslationMap.set(null);
        multiSurahTransliterationMap.set(null);
        multiSurahWordByWordMap.set(null);
    }

    const SURAH_EN = [
        "The Opening",
        "The Cow",
        "The Family of 'Imran",
        "Women",
        "The Feast",
        "Livestock",
        "The Heights",
        "Battle Gains",
        "Repentance",
        "Jonah",
        "Hud",
        "Joseph",
        "Thunder",
        "Abraham",
        "Al-Hijr",
        "The Bee",
        "The Night Journey",
        "The Cave",
        "Mary",
        "Ta Ha",
        "The Prophets",
        "The Pilgrimage",
        "The Believers",
        "The Light",
        "The Differentiator",
        "The Poets",
        "The Ants",
        "The Story",
        "The Spider",
        "The Byzantines",
        "Luqman",
        "Bowing Down In Worship",
        "The Joint Forces",
        "Sheba",
        "The Creator",
        "Ya Sin",
        "Ranged In Rows",
        "Saad",
        "The Throngs",
        "The Foregiver",
        "[Verses] Made Clear",
        "Consultation",
        "Ornaments Of Gold",
        "Smoke",
        "Kneeling",
        "The Sand Dunes",
        "Muhammad",
        "Triumph",
        "The Private Rooms",
        "Qaaf",
        "Scattering [Winds]",
        "The Mountain",
        "The Star",
        "The Moon",
        "The Lord Of Mercy",
        "That Which Is Coming",
        "Iron",
        "The Dispute",
        "The Gathering [Of Forces]",
        "The Women Tested",
        "Solid Lines",
        "The Day of Congregation",
        "The Hypocrites",
        "Mutual Neglect",
        "Divorce",
        "Prohibition",
        "Control",
        "The Pen",
        "The Inevitable Hour",
        "The Ways Of Ascent",
        "Noah",
        "The Jinn",
        "Enfolded",
        "Wrapped In His Cloak",
        "The Resurrection",
        "Man",
        "[Winds] Sent Forth",
        "The Announcement",
        "The Forceful Chargers",
        "He Frowned",
        "The Rolling Up",
        "The Breaking",
        "Those Who Give Short Measure",
        "The Cracking",
        "The Towering Constellations",
        "The Night-Comer",
        "The Most High",
        "The Overwhelming Event",
        "Daybreak",
        "The City",
        "The Sun",
        "The Night",
        "The Morning Brightness",
        "Relief",
        "The Fig",
        "The Clinging Form",
        "The Night Of Glory",
        "Clear Evidence",
        "The Earthquake",
        "The Charging Steeds",
        "The Crashing Blow",
        "Competing For More",
        "The Fading Day",
        "The Backbiter",
        "The Elephant",
        "Quraysh",
        "Common Kindness",
        "Abundance",
        "The Disbelievers",
        "Help",
        "Palm Fibre",
        "Purity of Faith",
        "Daybreak",
        "People",
    ];

    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 transition-all focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100";
    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";
</script>

{#snippet surahCardBody()}
    <div class="px-4 py-3">
        <div class="relative">
            <select
                id="surah-idx"
                onchange={onSurahChange}
                class="{selectClass} pl-8"
            >
                {#each $surahLabels as label, i}
                    <option
                        value={`${i + 1}`}
                        selected={$selectedSurahIdx - 1 === i}
                    >
                        {label.ar} — {SURAH_EN[i]}
                    </option>
                {/each}
            </select>
            <span
                class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
            >
                <Icon icon="charm:chevron-down" width="0.75rem" />
            </span>
        </div>
    </div>
{/snippet}

{#snippet fontBody()}
    <div class="flex flex-col px-4 py-3">
        <!-- Font Options collapsible -->
        <button
            onclick={() => { fontOptionsOn = !fontOptionsOn; }}
            class="cursor-pointer flex items-center justify-between w-full mb-1.5"
            aria-expanded={fontOptionsOn}
        >
            <span class={labelClass + " mb-0"}>Font Options</span>
            <Icon
                icon="charm:chevron-down"
                width="0.75rem"
                class="text-brand-charcoal-300 mb-1.5 transition-transform duration-200 {fontOptionsOn ? 'rotate-180' : ''}"
            />
        </button>
        {#if fontOptionsOn}
            <div class="flex flex-col gap-3.5 mb-3.5">
                <div>
                    <label for="surah-font-family" class={labelClass}>Font Family</label>
                    <div class="relative">
                        <select
                            id="surah-font-family"
                            bind:value={font}
                            class={selectClass}
                        >
                            <option value="font-scheherazade">Scheherazade New</option>
                            <option value="font-amiri">Amiri Qur'an</option>
                            <option value="font-garamond">EB Garamond</option>
                        </select>
                        <span
                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                        >
                            <Icon icon="charm:chevron-down" width="0.75rem" />
                        </span>
                    </div>
                </div>
                <div>
                    <label for="surah-font-size" class={labelClass}>Font Size</label>
                    <div class="relative">
                        <select
                            id="surah-font-size"
                            bind:value={textSize}
                            class={selectClass}
                        >
                            <option value="text-base">Small</option>
                            <option value="text-xl">Medium</option>
                            <option value="text-2xl">Large</option>
                            <option value="text-3xl">Extra Large</option>
                        </select>
                        <span
                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                        >
                            <Icon icon="charm:chevron-down" width="0.75rem" />
                        </span>
                    </div>
                </div>
            </div>
        {/if}
        <!-- Hide Surah Page -->
        <div class="flex items-center justify-between border-t border-brand-sand-100 dark:border-[#414559] pt-3">
            <span class={labelClass + " mb-0"}>Hide Surah Page</span>
            <button
                role="switch"
                aria-checked={hideSurah}
                aria-label="Hide Surah Page"
                onclick={() => {
                    hideSurah = !hideSurah;
                    if (hideSurah && !$isSidebar) $isSidebar = true;
                }}
                class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {hideSurah
                    ? 'bg-brand-gold-400'
                    : 'bg-brand-charcoal-100'}"
            >
                <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {hideSurah
                        ? 'translate-x-4'
                        : 'translate-x-1'}"
                ></span>
            </button>
        </div>
    </div>
{/snippet}

{#snippet translationBody()}
    <div class="flex flex-col gap-3.5 px-4 pt-3 pb-1.5">
        <div>
            <label for="translator-select" class={labelClass}>Translator</label>
            <div class="relative">
                <select
                    id="translator-select"
                    bind:value={selectedTranslatorId}
                    class={selectClass}
                >
                    <option value="">None</option>
                    {#each [...new Set($availableTranslators.map((t) => t.lang))] as lang}
                        <optgroup label={LANG_NAMES[lang] ?? lang}>
                            {#each $availableTranslators.filter((t) => t.lang === lang) as t}
                                <option value={String(t.id)}>{t.name}</option>
                            {/each}
                        </optgroup>
                    {/each}
                </select>
                <span
                    class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                >
                    <Icon icon="charm:chevron-down" width="0.75rem" />
                </span>
            </div>
        </div>
        <div class="flex items-center justify-between">
            <span class={labelClass}>Transliteration</span>
            <button
                role="switch"
                aria-checked={translitEnabled}
                aria-label="Transliteration"
                onclick={() => {
                    translitEnabled = !translitEnabled;
                }}
                class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {translitEnabled
                    ? 'bg-brand-gold-400'
                    : 'bg-brand-charcoal-100'}"
            >
                <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {translitEnabled
                        ? 'translate-x-4'
                        : 'translate-x-1'}"
                ></span>
            </button>
        </div>
        <div class="flex items-center justify-between">
            <span class={labelClass}>Word by Word</span>
            <button
                role="switch"
                aria-checked={wbwEnabled}
                aria-label="Word by Word"
                onclick={() => {
                    wbwEnabled = !wbwEnabled;
                }}
                class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {wbwEnabled
                    ? 'bg-brand-gold-400'
                    : 'bg-brand-charcoal-100'}"
            >
                <span
                    class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {wbwEnabled
                        ? 'translate-x-4'
                        : 'translate-x-1'}"
                ></span>
            </button>
        </div>
        <div class="border-t border-brand-sand-100 dark:border-[#414559] pt-3">
            <div class="flex items-center justify-between mb-2">
                <span class={labelClass}>Tafsir</span>
                <button
                    role="switch"
                    aria-checked={tafsirOn}
                    aria-label="Tafsir"
                    onclick={() => {
                        tafsirOn = !tafsirOn;
                    }}
                    class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {tafsirOn
                        ? 'bg-brand-gold-400'
                        : 'bg-brand-charcoal-100'}"
                >
                    <span
                        class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {tafsirOn
                            ? 'translate-x-4'
                            : 'translate-x-1'}"
                    ></span>
                </button>
            </div>
            {#if tafsirOn}
                <div class="relative">
                    <select
                        id="tafsir-select"
                        bind:value={selectedTafsirId}
                        class={selectClass}
                    >
                        <option value="">None</option>
                        {#each [...new Set($availableTafsirAuthors.map((a) => a.lang))] as lang}
                            <optgroup label={LANG_NAMES[lang] ?? lang}>
                                {#each $availableTafsirAuthors.filter((a) => a.lang === lang) as a}
                                    <option value={String(a.id)}
                                        >{a.name.replace(/ \([^)]+\)$/, '')}</option
                                    >
                                {/each}
                            </optgroup>
                        {/each}
                    </select>
                    <span
                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                    >
                        <Icon icon="charm:chevron-down" width="0.75rem" />
                    </span>
                </div>
            {/if}
        </div>
    </div>
{/snippet}

{#snippet collapsedIcon()}
    <Icon icon="solar:book-bookmark-bold-duotone" width="1.5em" />
{/snippet}

{#snippet controlCard()}
    <div class="space-y-2">
        <ControlCard cardTitle={"Display"} cardBody={fontBody} />
        <ControlCard cardTitle={"Translation"} cardBody={translationBody} />
        <ControlCard cardTitle={"Surah"} cardBody={surahCardBody} />
    </div>
{/snippet}

<GroupCards
    {controlCard}
    {collapsedIcon}
    xPosition={"right"}
    id="tour-surah-widget"
/>
