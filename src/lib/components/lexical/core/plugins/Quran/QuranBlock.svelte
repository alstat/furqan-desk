<script lang="ts">
    import { surahLabels } from "$lib/stores/quran.svelte";

    interface Verse {
        surah: number;
        ayah: number;
        arabic: string;
    }

    interface Props {
        verses: Verse[];
    }

    let { verses }: Props = $props();

    function labelFor(n: number): string {
        return $surahLabels[n - 1]?.en ?? `Surah ${n}`;
    }

    function arabicNumerals(n: number): string {
        const digits = "٠١٢٣٤٥٦٧٨٩";
        return String(n)
            .split("")
            .map((d) => digits[+d] ?? d)
            .join("");
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

<!--
  Mushaf-style illuminated corner: palmette + leafy scrolls.
  Drawn in the top-left orientation (24×24); rotated per corner.
-->
{#snippet cornerOrnament(rot: number)}
    <svg
        class="pointer-events-none absolute h-7 w-7 text-brand-gold-500/85 dark:text-[#e5c890]/80"
        style="transform: rotate({rot}deg);"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="0.85"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <!-- L-shape inner frame accent -->
        <path d="M3 3 H11 M3 3 V11" opacity="0.7" />
        <!-- Leafy scroll spiraling out from the corner -->
        <path d="M3 3 C9 4, 12 8, 11 14 C10 11, 7 9, 3 9" fill="currentColor" opacity="0.18" />
        <path d="M3 3 C9 4, 12 8, 11 14" />
        <!-- Outer leaf -->
        <path d="M11 14 C13 11, 16 11, 17 14 C16 12, 14 12, 12 13 Z" fill="currentColor" opacity="0.55" />
        <!-- Inner leaf curl -->
        <path d="M3 9 C5 8, 7 9, 8 11 C6 10.5, 4.5 10.5, 3 11 Z" fill="currentColor" opacity="0.4" />
        <!-- Bud at scroll tip -->
        <circle cx="11" cy="14" r="0.9" fill="currentColor" />
        <!-- Tiny secondary buds -->
        <circle cx="14" cy="6" r="0.55" fill="currentColor" opacity="0.7" />
        <circle cx="6" cy="14" r="0.55" fill="currentColor" opacity="0.7" />
        <!-- Palmette fan at corner crook -->
        <path
            d="M5 5 Q6 3, 7.5 5 Q6 4, 5 5 Z M7 5 Q8 3, 9.5 5 Q8 4, 7 5 Z"
            fill="currentColor"
            opacity="0.45"
            stroke="none"
        />
    </svg>
{/snippet}

<!-- Mid-edge floral motif for the long sides (small lotus). -->
{#snippet sideFloret()}
    <svg
        class="pointer-events-none absolute h-3 w-3 text-brand-gold-500/70 dark:text-[#e5c890]/65"
        viewBox="0 0 12 12"
        fill="currentColor"
        aria-hidden="true"
    >
        <ellipse cx="6" cy="2.5" rx="1" ry="2" opacity="0.7" />
        <ellipse cx="6" cy="9.5" rx="1" ry="2" opacity="0.7" />
        <ellipse cx="2.5" cy="6" rx="2" ry="1" opacity="0.7" />
        <ellipse cx="9.5" cy="6" rx="2" ry="1" opacity="0.7" />
        <circle cx="6" cy="6" r="1.1" />
    </svg>
{/snippet}

<!-- 12-petal mushaf-style ayah rosette with double border and gold petals. -->
{#snippet ayahRosette(num: number)}
    <span class="relative mx-0.5 inline-flex h-[1.55em] w-[1.55em] items-center justify-center align-middle">
        <svg
            class="absolute inset-0 h-full w-full text-brand-gold-500/90 dark:text-[#e5c890]/90"
            viewBox="0 0 32 32"
            aria-hidden="true"
        >
            <!-- Outer petal ring -->
            <g fill="currentColor">
                {#each [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as a}
                    <ellipse cx="16" cy="4" rx="1.6" ry="3.2" transform="rotate({a} 16 16)" opacity="0.55" />
                {/each}
            </g>
            <!-- Inner light ring (double-border feel) -->
            <circle cx="16" cy="16" r="8" fill="white" class="dark:fill-[#303446]" />
            <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="0.7" />
            <circle cx="16" cy="16" r="6.4" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.55" />
            <!-- Tiny dots between petals -->
            <g fill="currentColor" opacity="0.7">
                {#each [15, 45, 75, 105, 135, 165, 195, 225, 255, 285, 315, 345] as a}
                    <circle cx="16" cy="9" r="0.45" transform="rotate({a} 16 16)" />
                {/each}
            </g>
        </svg>
        <span class="relative font-scheherazade text-[0.6em] text-brand-charcoal-900 dark:text-[#c6d0f5]">
            {arabicNumerals(num)}
        </span>
    </span>
{/snippet}

<div
    contenteditable="false"
    class="quran-block relative my-2 mx-3 inline-block w-[calc(100%-1.5rem)] rounded-lg border border-brand-gold-400/55 dark:border-[#e5c890]/35 bg-gradient-to-br from-brand-gold-50/85 via-white to-brand-gold-50/40 dark:from-[#292c3c] dark:via-[#303446] dark:to-[#292c3c] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.55),inset_0_0_0_2px_rgba(212,175,55,0.35),inset_0_0_0_3px_rgba(212,175,55,0.18)] dark:shadow-[inset_0_0_0_1px_rgba(48,52,70,0.6),inset_0_0_0_2px_rgba(229,200,144,0.32),inset_0_0_0_3px_rgba(229,200,144,0.16)]"
>
    <!-- Leafy corner illuminations (4 corners) -->
    <span class="absolute top-1 left-1">{@render cornerOrnament(0)}</span>
    <span class="absolute top-1 right-1">{@render cornerOrnament(90)}</span>
    <span class="absolute bottom-1 right-1">{@render cornerOrnament(180)}</span>
    <span class="absolute bottom-1 left-1">{@render cornerOrnament(270)}</span>

    <!-- Mid-edge florets (left & right) -->
    <span class="absolute left-[3px] top-1/2 -translate-y-1/2">{@render sideFloret()}</span>
    <span class="absolute right-[3px] top-1/2 -translate-y-1/2">{@render sideFloret()}</span>

    <div class="px-9 py-2.5">
        <!-- Cartouche-style title band -->
        <div class="mb-1.5 flex items-center justify-center gap-2">
            <svg class="h-2.5 w-8 text-brand-gold-500 dark:text-[#e5c890]" viewBox="0 0 40 8" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" aria-hidden="true">
                <path d="M0 4 H14" />
                <path d="M20 1 L23 4 L20 7 L17 4 Z" fill="currentColor" stroke="none" />
                <circle cx="14" cy="4" r="0.7" fill="currentColor" stroke="none" />
                <circle cx="26" cy="4" r="0.7" fill="currentColor" stroke="none" />
                <path d="M26 4 H40" />
            </svg>
            <span
                class="relative inline-flex items-center rounded-full border border-brand-gold-400/65 dark:border-[#e5c890]/40 bg-gradient-to-b from-brand-gold-100 to-brand-gold-50 dark:from-[#414559] dark:to-[#303446] px-3 py-[2px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] dark:shadow-[inset_0_0_0_1px_rgba(48,52,70,0.55)]"
            >
                <span class="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-brand-charcoal-700 dark:text-[#c6d0f5]">
                    {groups.map((g) => labelFor(g.surah)).join(" · ")}
                </span>
            </span>
            <svg class="h-2.5 w-8 text-brand-gold-500 dark:text-[#e5c890]" viewBox="0 0 40 8" fill="none" stroke="currentColor" stroke-width="0.85" stroke-linecap="round" aria-hidden="true">
                <path d="M0 4 H14" />
                <path d="M20 1 L23 4 L20 7 L17 4 Z" fill="currentColor" stroke="none" />
                <circle cx="14" cy="4" r="0.7" fill="currentColor" stroke="none" />
                <circle cx="26" cy="4" r="0.7" fill="currentColor" stroke="none" />
                <path d="M26 4 H40" />
            </svg>
        </div>

        <!-- Body -->
        {#each groups as group, gIdx (group.surah + ':' + gIdx)}
            {#if gIdx > 0}
                <div class="my-2 flex items-center gap-2 text-brand-gold-400/75 dark:text-[#e5c890]/60">
                    <span class="h-px flex-1 bg-gradient-to-r from-transparent via-brand-gold-300 dark:via-[#e5c890]/40 to-transparent"></span>
                    <svg class="h-2 w-2" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                        <path d="M4 0 L5 3 L8 4 L5 5 L4 8 L3 5 L0 4 L3 3 Z" />
                    </svg>
                    <span class="text-[8.5px] font-semibold uppercase tracking-[0.2em]">
                        {labelFor(group.surah)}
                    </span>
                    <svg class="h-2 w-2" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
                        <path d="M4 0 L5 3 L8 4 L5 5 L4 8 L3 5 L0 4 L3 3 Z" />
                    </svg>
                    <span class="h-px flex-1 bg-gradient-to-r from-transparent via-brand-gold-300 dark:via-[#e5c890]/40 to-transparent"></span>
                </div>
            {/if}
            <div
                dir="rtl"
                class="font-scheherazade text-[1.18rem] leading-[1.95] text-brand-charcoal-900 dark:text-[#c6d0f5] text-justify"
                style="text-align-last: center;"
            >
                {#each group.verses as v (v.surah + ':' + v.ayah)}
                    <span>{v.arabic}</span>{@render ayahRosette(v.ayah)}{' '}
                {/each}
            </div>
        {/each}
    </div>
</div>
