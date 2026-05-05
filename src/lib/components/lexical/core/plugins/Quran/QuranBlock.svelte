<script lang="ts">
    import { surahLabels } from "$lib/stores/quran.svelte";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";

    interface Verse {
        surah: number;
        ayah: number;
        arabic: string;
    }

    interface Props {
        verses: Verse[];
    }

    let { verses }: Props = $props();

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
</script>

{#snippet surahNameHeader(name: string)}
    <div class="mb-3" dir="ltr">
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
            <div class="relative border border-brand-gold-400/80 dark:border-brand-gold-400/70 bg-linear-to-b from-brand-gold-50/60 to-white/0 dark:from-brand-gold-400/10 dark:to-transparent px-8 py-3">
                <div class="pointer-events-none absolute inset-0.75 border border-brand-gold-200/40 dark:border-brand-gold-400/40"></div>
                <span class="absolute -top-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -bottom-1.25 left-1/2 inline-block h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
                <span class="absolute -left-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -right-1 -top-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-1 -left-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="absolute -bottom-1 -right-1 inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/80"></span>
                <span class="relative font-scheherazade text-xl leading-none text-slate-700 dark:text-[#c6d0f5]">{name}</span>
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

<div
    contenteditable="false"
    class="quran-block relative my-2 mx-3 inline-block w-[calc(100%-1.5rem)] px-4 py-3"
>
    {#each groups as group, gIdx (group.surah + ':' + gIdx)}
        <div class={gIdx > 0 ? 'mt-3' : ''}>
            {@render surahNameHeader(nameFor(group.surah))}
            <div
                dir="rtl"
                class="font-scheherazade text-[1.2rem] leading-[1.95] text-brand-charcoal-900 dark:text-[#c6d0f5] text-justify"
                style="text-align-last: center;"
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
    <div class="mt-3 flex items-center" dir="ltr">
        <div class="h-px flex-1 bg-linear-to-r from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
        <div class="flex items-center gap-1 px-2">
            <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
            <span class="inline-block h-2 w-2 rotate-45 bg-brand-gold-400 dark:bg-brand-gold-400/90"></span>
            <span class="inline-block h-1.5 w-1.5 rotate-45 bg-brand-gold-200 dark:bg-brand-gold-500/65"></span>
        </div>
        <div class="h-px flex-1 bg-linear-to-l from-transparent to-brand-gold-200 dark:to-brand-gold-500/70"></div>
    </div>
</div>
