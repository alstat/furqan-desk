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
    import { verseOfDayFor, type VerseRef } from "$lib/data/verse-of-day";

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

    let loading = $state(true);
    let error = $state("");
    let verse = $state<VerseRef | null>(null);
    let target = $state<VerseLine | null>(null);
    let before = $state<VerseLine | null>(null);
    let after = $state<VerseLine | null>(null);
    let translationDir = $state<"rtl" | "ltr">("ltr");

    let loadedFor = $state(""); // guards against re-loading the same verse

    function surahName(n: number): { en: string; ar: string } {
        const label = get(surahLabels)[n - 1];
        return { en: label?.en ?? `Surah ${n}`, ar: label?.ar ?? "" };
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

    async function load() {
        loading = true;
        error = "";
        target = before = after = null;
        try {
            const v = verseOfDayFor();
            verse = v;

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
            before = lineFor(v.ayah - 1);
            after = lineFor(v.ayah + 1);
            loadedFor = `${v.surah}:${v.ayah}`;
        } catch (e) {
            error = String(e);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        const v = verseOfDayFor();
        const key = `${v.surah}:${v.ayah}`;
        if (open && loadedFor !== key) load();
    });

    function goToVerse() {
        if (!verse) return;
        selectedSurahIdx.set(verse.surah);
        pendingJumpAyah.set(verse.ayah);
        onClose();
    }
</script>

<Dialog {open} title={$t("verse_of_day.title")} {onClose} maxWidth="max-w-lg">
    {#snippet children()}
        {#if loading}
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

            <!-- Context: preceding ayah (hint) -->
            {#if before}
                <div class="mb-2 opacity-75">
                    <p
                        dir="rtl"
                        class="font-scheherazade text-base leading-loose text-center text-brand-charcoal-500 dark:text-[#a5adce]"
                    >
                        {before.arabic}
                    </p>
                    {#if before.translation}
                        <p
                            dir={translationDir}
                            class="mt-0.5 text-[11px] leading-relaxed text-center text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {before.translation}
                        </p>
                    {/if}
                </div>
            {/if}

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

            <!-- Context: following ayah (hint) -->
            {#if after}
                <div class="mt-2 opacity-75">
                    <p
                        dir="rtl"
                        class="font-scheherazade text-base leading-loose text-center text-brand-charcoal-500 dark:text-[#a5adce]"
                    >
                        {after.arabic}
                    </p>
                    {#if after.translation}
                        <p
                            dir={translationDir}
                            class="mt-0.5 text-[11px] leading-relaxed text-center text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {after.translation}
                        </p>
                    {/if}
                </div>
            {/if}
        {/if}
    {/snippet}

    {#snippet footer()}
        <div class="flex items-center justify-end gap-2">
            <button
                onclick={onClose}
                class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-4 py-1.5 text-[11px] font-semibold text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
            >
                {$t("common.close")}
            </button>
            <button
                onclick={goToVerse}
                disabled={loading || !target}
                class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-4 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
            >
                <Icon icon="solar:arrow-right-up-linear" width="0.7rem" />
                {$t("verse_of_day.go")}
            </button>
        </div>
    {/snippet}
</Dialog>
