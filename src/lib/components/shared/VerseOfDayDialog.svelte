<script lang="ts">
    import Icon from "@iconify/svelte";
    import { get } from "svelte/store";
    import { invoke } from "@tauri-apps/api/core";
    import Dialog from "$lib/components/shared/Dialog.svelte";
    import { t, locale } from "$lib/i18n";
    import {
        selectedSurahIdx,
        surahLabels,
    } from "$lib/stores/quran.svelte";
    import { pendingJumpAyah } from "$lib/stores/bookmarks.store";
    import {
        availableTranslators,
        type TranslatorInfo,
        type AyahTranslation,
    } from "$lib/stores/translation.store";
    import type { SurahMorphology } from "$lib/types/morphology";
    import {
        fetchVerseOfDay,
        fetchVerseOfDayHistory,
        deleteVerseOfDayEntry,
        clearVerseOfDayHistory,
        fetchVerseOfDayStorage,
        exportVerseOfDayHistory,
        fetchVerseTexts,
        formatBytes,
        localDateKey,
        type VerseRef,
        type VerseOfDayEntry,
        type VerseOfDayStorage,
        type VerseText,
    } from "$lib/data/verse-of-day";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    // Translations whose script reads right-to-left.
    const RTL_TRANSLATION_LANGS = new Set(["AR", "UR", "PS", "FA"]);

    interface VerseLine {
        ayah: number;
        arabic: string;
        translation: string;
    }

    let view = $state<"verse" | "history">("verse");
    let loading = $state(true);
    let error = $state("");
    let verse = $state<VerseRef | null>(null);
    let verseDay = $state(""); // day the shown verse belongs to (YYYY-MM-DD)
    let target = $state<VerseLine | null>(null);
    let before = $state<VerseLine[]>([]);
    let after = $state<VerseLine[]>([]);
    let translationDir = $state<"rtl" | "ltr">("ltr");

    // True while the verse view shows a past entry picked from the history
    // list (suppresses the auto-load of today's verse).
    let viewingEntry = $state(false);

    // History view state
    let history = $state<VerseOfDayEntry[]>([]);
    let historyLoading = $state(false);
    let storage = $state<VerseOfDayStorage | null>(null);
    let exportedPath = $state("");
    let confirmClear = $state(false);
    // Arabic + translation per history entry, keyed "surah:ayah".
    let historyTexts = $state<Map<string, VerseText>>(new Map());
    let historyDir = $state<"rtl" | "ltr">("ltr");

    function surahName(n: number): { en: string; ar: string } {
        const label = get(surahLabels)[n - 1];
        return { en: label?.en ?? `Surah ${n}`, ar: label?.ar ?? "" };
    }

    function dayLabel(day: string): string {
        if (day === localDateKey()) return get(t)("verse_of_day.today");
        try {
            return new Date(`${day}T00:00:00`).toLocaleDateString(get(locale), {
                year: "numeric",
                month: "short",
                day: "numeric",
            });
        } catch {
            return day;
        }
    }

    // Pick the translator that matches the app language, falling back to
    // English and finally to whatever is available.
    async function resolveTranslator(): Promise<TranslatorInfo | null> {
        let translators = get(availableTranslators);
        if (!translators.length) {
            try {
                translators = await invoke<TranslatorInfo[]>("get_translators");
                availableTranslators.set(translators);
            } catch {
                translators = [];
            }
        }
        if (!translators.length) return null;
        const want = get(locale).toUpperCase();
        return (
            translators.find((tr) => tr.lang === want) ??
            translators.find((tr) => tr.lang === "EN") ??
            translators[0]
        );
    }

    // Load the Arabic + translation window (verse ± context) for a given ref.
    async function showVerse(v: VerseRef, day: string) {
        loading = true;
        error = "";
        target = null;
        before = [];
        after = [];
        try {
            verse = v;
            verseDay = day;

            const [morph, translator] = await Promise.all([
                invoke<SurahMorphology>("get_surah_morphology", {
                    surahNumber: v.surah,
                }),
                resolveTranslator(),
            ]);

            let translations: AyahTranslation[] = [];
            if (translator) {
                try {
                    translations = await invoke<AyahTranslation[]>(
                        "get_surah_translation",
                        { surah: v.surah, translatorId: translator.id },
                    );
                } catch {
                    translations = [];
                }
                translationDir = RTL_TRANSLATION_LANGS.has(translator.lang)
                    ? "rtl"
                    : "ltr";
            } else {
                translationDir = "ltr";
            }

            const arabicMap = new Map(
                morph.ayahs.map((a) => [
                    a.ayah,
                    a.words.map((w) => w.combined_arabic).join(" "),
                ]),
            );
            const transMap = new Map(
                translations.map((r) => [r.ayah, r.text]),
            );

            const lineFor = (ayah: number): VerseLine | null =>
                arabicMap.has(ayah)
                    ? {
                          ayah,
                          arabic: arabicMap.get(ayah) ?? "",
                          translation: transMap.get(ayah) ?? "",
                      }
                    : null;

            target = lineFor(v.ayah);
            // Always show a three-verse window: when the target sits at a
            // surah boundary (no verse before ayah 1 / none after the last),
            // extend the other side so e.g. ayah 1 shows verses 1, 2 and 3.
            const beforeLine = lineFor(v.ayah - 1);
            const afterLine = lineFor(v.ayah + 1);
            before = beforeLine
                ? afterLine
                    ? [beforeLine]
                    : [lineFor(v.ayah - 2), beforeLine].filter(
                          (l): l is VerseLine => l !== null,
                      )
                : [];
            after = afterLine
                ? beforeLine
                    ? [afterLine]
                    : [afterLine, lineFor(v.ayah + 2)].filter(
                          (l): l is VerseLine => l !== null,
                      )
                : [];
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    // Fetch (or create) today's verse from the backend, then render it.
    async function loadToday() {
        loading = true;
        error = "";
        try {
            const entry = await fetchVerseOfDay();
            await showVerse({ surah: entry.surah, ayah: entry.ayah }, entry.day);
        } catch (e) {
            error = String(e);
            loading = false;
        }
    }

    $effect(() => {
        if (
            open &&
            view === "verse" &&
            !viewingEntry &&
            verseDay !== localDateKey()
        ) {
            loadToday();
        }
    });

    // Reset transient state when the dialog closes so reopening starts fresh
    // on today's verse.
    $effect(() => {
        if (!open) {
            view = "verse";
            viewingEntry = false;
            exportedPath = "";
            confirmClear = false;
        }
    });

    async function openHistory() {
        view = "history";
        exportedPath = "";
        confirmClear = false;
        historyLoading = true;
        try {
            [history, storage] = await Promise.all([
                fetchVerseOfDayHistory(),
                fetchVerseOfDayStorage(),
            ]);
            // Resolve each entry's Arabic + translation (user's language,
            // falling back to English via resolveTranslator).
            const translator = await resolveTranslator();
            historyDir =
                translator && RTL_TRANSLATION_LANGS.has(translator.lang)
                    ? "rtl"
                    : "ltr";
            const texts = await fetchVerseTexts(
                history.map((h) => ({ surah: h.surah, ayah: h.ayah })),
                translator?.id,
            );
            historyTexts = new Map(
                texts.map((t) => [`${t.surah}:${t.ayah}`, t]),
            );
        } catch (e) {
            error = String(e);
        } finally {
            historyLoading = false;
        }
    }

    function openEntry(entry: VerseOfDayEntry) {
        viewingEntry = entry.day !== localDateKey();
        view = "verse";
        showVerse({ surah: entry.surah, ayah: entry.ayah }, entry.day);
    }

    // Deleting rows is harmless for today's pick: it is seeded, so the
    // backend re-records the same verse next time it is requested.
    async function removeEntry(day: string) {
        try {
            await deleteVerseOfDayEntry(day);
            history = history.filter((h) => h.day !== day);
            storage = await fetchVerseOfDayStorage();
        } catch (e) {
            error = String(e);
        }
    }

    async function clearAll() {
        if (!confirmClear) {
            confirmClear = true;
            return;
        }
        confirmClear = false;
        try {
            await clearVerseOfDayHistory();
            history = [];
            storage = await fetchVerseOfDayStorage();
        } catch (e) {
            error = String(e);
        }
    }

    async function exportHistory() {
        try {
            exportedPath = await exportVerseOfDayHistory();
        } catch (e) {
            error = String(e);
        }
    }

    function goToVerse() {
        if (!verse) return;
        selectedSurahIdx.set(verse.surah);
        pendingJumpAyah.set(verse.ayah);
        onClose();
    }
</script>

<Dialog {open} title={$t("verse_of_day.title")} {onClose} maxWidth="max-w-lg" minHeight="min-h-[70vh]">
    {#snippet children()}
        {#if view === "history"}
            {#if historyLoading}
                <div class="flex items-center justify-center gap-2 py-12 text-brand-charcoal-300">
                    <span
                        class="h-4 w-4 rounded-full border-2 border-brand-gold-400 border-t-transparent animate-spin"
                    ></span>
                </div>
            {:else if !history.length}
                <div class="flex flex-col items-center gap-2 py-10 text-brand-charcoal-300 dark:text-[#838ba7]">
                    <Icon icon="solar:history-bold-duotone" width="1.5rem" />
                    <span class="text-xs">{$t("verse_of_day.history_empty")}</span>
                </div>
            {:else}
                <ul class="max-h-[62vh] overflow-y-auto -mx-1 px-1 flex flex-col gap-2">
                    {#each history as entry (entry.day)}
                        {@const name = surahName(entry.surah)}
                        {@const text = historyTexts.get(`${entry.surah}:${entry.ayah}`)}
                        <li
                            class="group relative rounded-2xl border border-brand-sand-200 bg-brand-sand-50/50 dark:border-[#414559] dark:bg-[#292c3c] hover:border-brand-gold-300 dark:hover:border-[#e5c890]/40 transition-colors"
                        >
                            <button
                                onclick={() => openEntry(entry)}
                                class="cursor-pointer block w-full text-left px-4 py-3"
                            >
                                <div class="mb-1.5 flex items-center gap-2 pr-6">
                                    <span class="shrink-0 text-[0.625rem] font-semibold text-brand-gold-500">
                                        {dayLabel(entry.day)}
                                    </span>
                                    <span class="truncate text-[0.6875rem] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                                        {name.en} · {$t("bookmark.ayah")} {entry.ayah}
                                    </span>
                                    {#if name.ar}
                                        <span class="shrink-0 font-scheherazade text-sm text-brand-charcoal-300 dark:text-[#838ba7]">
                                            {name.ar}
                                        </span>
                                    {/if}
                                </div>
                                {#if text}
                                    <p
                                        dir="rtl"
                                        class="font-scheherazade text-base leading-loose text-right text-brand-charcoal-900 dark:text-[#c6d0f5] line-clamp-2"
                                    >
                                        {text.arabic}
                                    </p>
                                    {#if text.translation}
                                        <p
                                            dir={historyDir}
                                            class="mt-1 text-[0.6875rem] leading-relaxed text-brand-charcoal-500 dark:text-[#a5adce] line-clamp-2"
                                        >
                                            {text.translation}
                                        </p>
                                    {/if}
                                {/if}
                            </button>
                            <button
                                onclick={() => removeEntry(entry.day)}
                                title={$t("verse_of_day.delete_entry")}
                                class="cursor-pointer absolute top-2 right-2 rounded-full p-1.5 text-brand-charcoal-300 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:text-[#838ba7] transition-all"
                            >
                                <Icon icon="solar:trash-bin-trash-linear" width="0.85rem" />
                            </button>
                        </li>
                    {/each}
                </ul>
            {/if}

            <!-- Storage footprint + export confirmation -->
            <div class="mt-3 flex flex-col items-center gap-1 text-[0.625rem] text-brand-charcoal-300 dark:text-[#838ba7]">
                {#if storage}
                    <span>
                        {$t("verse_of_day.storage", {
                            count: storage.entries,
                            size: formatBytes(storage.bytes),
                        })}
                    </span>
                {/if}
                {#if exportedPath}
                    <span class="flex items-center gap-1 text-brand-gold-500">
                        <Icon icon="solar:check-circle-bold" width="0.8rem" />
                        {$t("verse_of_day.exported_to", { path: exportedPath })}
                    </span>
                {/if}
                {#if error}
                    <span class="flex items-center gap-1 text-red-500">
                        <Icon icon="solar:danger-circle-bold" width="0.8rem" />
                        {error}
                    </span>
                {/if}
            </div>
        {:else if loading}
            <div class="flex items-center justify-center gap-2 py-12 text-brand-charcoal-300">
                <span
                    class="h-4 w-4 rounded-full border-2 border-brand-gold-400 border-t-transparent animate-spin"
                ></span>
                <span class="text-xs">{$t("verse_of_day.loading")}</span>
            </div>
        {:else if error}
            <div class="flex items-center gap-2 py-8 text-xs text-red-500">
                <Icon icon="solar:danger-circle-bold" width="0.9rem" />
                {error}
            </div>
        {:else if target && verse}
            {@const name = surahName(verse.surah)}
            <!-- Reference -->
            <div class="mb-4 flex items-center justify-center gap-2 text-center">
                <Icon
                    icon="solar:calendar-mark-bold-duotone"
                    class="text-brand-gold-500"
                    width="1rem"
                />
                {#if verseDay}
                    <span class="text-[0.6875rem] font-semibold text-brand-gold-500">
                        {dayLabel(verseDay)}
                    </span>
                {/if}
                <span class="text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">
                    {name.en} · {$t("bookmark.ayah")}
                    {verse.ayah}
                </span>
                {#if name.ar}
                    <span class="font-scheherazade text-sm text-brand-charcoal-300 dark:text-[#838ba7]">
                        {name.ar}
                    </span>
                {/if}
            </div>

            <!-- Context: preceding ayahs (hint) -->
            {#each before as line (line.ayah)}
                <div class="mb-2 opacity-75">
                    <p
                        dir="rtl"
                        class="font-scheherazade text-base leading-loose text-center text-brand-charcoal-500 dark:text-[#a5adce]"
                    >
                        {line.arabic}
                    </p>
                    {#if line.translation}
                        <p
                            dir={translationDir}
                            class="mt-0.5 text-[0.6875rem] leading-relaxed text-center text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {line.translation}
                        </p>
                    {/if}
                </div>
            {/each}

            <!-- Highlighted verse of the day -->
            <div
                class="my-2 rounded-2xl border border-brand-gold-200 dark:border-[#e5c890]/30 bg-brand-gold-50 dark:bg-[#292c3c] px-4 py-4"
            >
                <p
                    dir="rtl"
                    class="font-scheherazade text-xl leading-loose text-center text-brand-charcoal-900 dark:text-[#c6d0f5]"
                >
                    {target.arabic}
                </p>
                {#if target.translation}
                    <p
                        dir={translationDir}
                        class="mt-3 text-sm leading-relaxed text-center text-brand-charcoal-500 dark:text-[#a5adce]"
                    >
                        {target.translation}
                    </p>
                {/if}
            </div>

            <!-- Context: following ayahs (hint) -->
            {#each after as line (line.ayah)}
                <div class="mt-2 opacity-75">
                    <p
                        dir="rtl"
                        class="font-scheherazade text-base leading-loose text-center text-brand-charcoal-500 dark:text-[#a5adce]"
                    >
                        {line.arabic}
                    </p>
                    {#if line.translation}
                        <p
                            dir={translationDir}
                            class="mt-0.5 text-[0.6875rem] leading-relaxed text-center text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {line.translation}
                        </p>
                    {/if}
                </div>
            {/each}
        {/if}
    {/snippet}

    {#snippet footer()}
        {#if view === "history"}
            <div class="flex items-center justify-between gap-2">
                <button
                    onclick={() => (view = "verse")}
                    class="cursor-pointer flex items-center gap-1.5 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-4 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
                >
                    <Icon icon="solar:arrow-left-linear" width="0.7rem" />
                    {$t("verse_of_day.back")}
                </button>
                <div class="flex items-center gap-2">
                    <button
                        onclick={exportHistory}
                        disabled={!history.length}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-4 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:download-minimalistic-linear" width="0.7rem" />
                        {$t("verse_of_day.export")}
                    </button>
                    <button
                        onclick={clearAll}
                        disabled={!history.length}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[0.6875rem] font-semibold disabled:opacity-50 transition-colors {confirmClear
                            ? 'border-red-400 bg-red-500 text-white hover:bg-red-600'
                            : 'border-brand-sand-200 bg-brand-sand-100 text-red-500 dark:border-[#414559] dark:bg-[#363a4f] hover:bg-brand-sand-200 dark:hover:bg-[#414559]'}"
                    >
                        <Icon icon="solar:trash-bin-trash-linear" width="0.7rem" />
                        {confirmClear
                            ? $t("verse_of_day.confirm_clear")
                            : $t("verse_of_day.clear")}
                    </button>
                </div>
            </div>
        {:else}
            <div class="flex items-center justify-between gap-2">
                <button
                    onclick={openHistory}
                    title={$t("verse_of_day.history")}
                    class="cursor-pointer flex items-center gap-1.5 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-4 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
                >
                    <Icon icon="solar:history-bold-duotone" width="0.8rem" />
                    {$t("verse_of_day.history")}
                </button>
                <div class="flex items-center gap-2">
                    <button
                        onclick={onClose}
                        class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-4 py-1.5 text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
                    >
                        {$t("common.close")}
                    </button>
                    <button
                        onclick={goToVerse}
                        disabled={loading || !target}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-4 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                    >
                        <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                        {$t("verse_of_day.go")}
                    </button>
                </div>
            </div>
        {/if}
    {/snippet}
</Dialog>
