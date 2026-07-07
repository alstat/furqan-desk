<!-- Take-home message dialog (Pro/Pro+).

     Generates a personal-growth reflection from the ayah(s) currently shown in
     the Morphology view — key lessons, practical steps, reflection prompts,
     daily-life applications and a concise take-home message. Generation runs
     only when the dialog is opened.

     Anchored beside its trigger button (right edge of the parchment): opens to
     the LEFT of the button when the editor sidebar is open, and to the RIGHT
     when it is closed. The message follows the app's display language. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { untrack } from "svelte";
    import { fly } from "svelte/transition";
    import { get } from "svelte/store";
    import { isPro, isProPlus } from "$lib/stores/auth.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { renderMarkdown } from "$lib/utils/markdown";
    import {
        fetchTakeHomeMessage,
        takeHomeModel,
    } from "$lib/stores/ai-takehome.store";
    import { t, locale } from "$lib/i18n";
    import {
        surahMorphology,
        morphologyMultiSurahList,
        morphologyAyahFilter,
        surahLabels,
        selectedSurahIdx,
        isSidebar,
    } from "$lib/stores/quran.svelte";
    import { pendingJumpAyah } from "$lib/stores/bookmarks.store";
    import { getSurahNameTashkeel } from "$lib/data/surah-names-tashkeel";

    interface Props {
        open: boolean;
        onClose: () => void;
        /** Trigger button — the panel is anchored beside it. */
        anchorEl?: HTMLElement | null;
    }
    let { open, onClose, anchorEl = null }: Props = $props();

    let result = $state("");
    let loading = $state(false);
    let error = $state("");
    let quotaExceeded = $state(false);
    let sourceLabel = $state("");
    // Signature of the ayahs the cached `result` was generated for, so we can
    // tell when the displayed ayahs have since changed.
    let savedSig = $state("");
    let controller: AbortController | null = null;
    let zIndex = $state(500);
    let panelEl = $state<HTMLElement | null>(null);

    const RTL_LOCALES = new Set(["ar", "fa", "ur", "ku"]);
    const contentDir = $derived(RTL_LOCALES.has($locale) ? "rtl" : "ltr");

    // Reactive signature of the ayahs currently shown in the Morphology view.
    const currentSig = $derived.by(() => {
        const filter = $morphologyAyahFilter;
        const multi = $morphologyMultiSurahList;
        const single = $surahMorphology;
        const list = (ayahs: { ayah: number }[]) =>
            (filter ? ayahs.filter((a) => filter.includes(a.ayah)) : ayahs)
                .map((a) => a.ayah)
                .join(",");
        if (multi && multi.length)
            return multi.map((s) => `${s.surah}:${list(s.ayahs)}`).join("|");
        if (single) return `${single.surah}:${list(single.ayahs)}`;
        return "";
    });

    // True when there is a cached message but the displayed ayahs have changed.
    const isStale = $derived(
        !!result && !!savedSig && !!currentSig && currentSig !== savedSig,
    );

    // ── Structured sections + clickable ayah references ──────────────────────
    // The model returns five sections marked by `@@id@@ Title` lines; we render
    // each as its own card with a fixed icon (the id is stable, the title is
    // localised by the model). Inline `{{surah:ayah}}` tokens become chips that
    // jump to the verse in the Morphology view.
    const SECTION_ORDER = [
        "key_lessons",
        "practical_steps",
        "reflection_prompts",
        "daily_applications",
        "take_home",
    ];
    const SECTION_META: Record<string, { icon: string; fallback: string }> = {
        key_lessons: {
            icon: "solar:notebook-bookmark-bold-duotone",
            fallback: "Key lessons",
        },
        practical_steps: {
            icon: "solar:checklist-minimalistic-bold-duotone",
            fallback: "Practical steps",
        },
        reflection_prompts: {
            icon: "solar:chat-round-line-bold-duotone",
            fallback: "Reflection prompts",
        },
        daily_applications: {
            icon: "solar:sun-2-bold-duotone",
            fallback: "Daily-life applications",
        },
        take_home: {
            icon: "solar:star-shine-bold-duotone",
            fallback: "Take-home message",
        },
    };

    type Section = { id: string; title: string; body: string };

    function parseSections(raw: string): Section[] {
        if (!raw) return [];
        const out: Section[] = [];
        let cur: Section | null = null;
        for (const line of raw.split("\n")) {
            const m = line.match(/^\s*@@\s*([a-z_]+)\s*@@\s*(.*)$/i);
            if (m && SECTION_ORDER.includes(m[1].toLowerCase())) {
                cur = { id: m[1].toLowerCase(), title: m[2].trim(), body: "" };
                out.push(cur);
            } else if (cur) {
                cur.body += (cur.body ? "\n" : "") + line;
            }
        }
        return out;
    }

    const sections = $derived(parseSections(result));

    // Replace {{surah:ayah}} or a range {{surah:start-end}} (optionally
    // {{surah:start-surah:end}}) with a clickable chip; drop any trailing
    // partial token still being streamed (e.g. "{{2:2").
    function convertRefs(md: string): string {
        return md
            .replace(/\{\{[^}]*$/g, "")
            .replace(
                /\{\{\s*(\d{1,3})\s*:\s*(\d{1,3})(?:\s*-\s*(?:\d{1,3}\s*:\s*)?(\d{1,3}))?\s*\}\}/g,
                (_m, s: string, a1: string, a2: string | undefined) => {
                    const label = a2 ? `${s}:${a1}-${a2}` : `${s}:${a1}`;
                    const endAttr = a2 ? ` data-ayah-end="${a2}"` : "";
                    return ` <a class="ayah-ref" role="button" tabindex="0" data-surah="${s}" data-ayah="${a1}"${endAttr}>${label}</a>`;
                },
            );
    }

    const renderSection = (body: string) => renderMarkdown(convertRefs(body));

    // Highlight every ayah in [start, end] (end defaults to start).
    function pulseAyah(surah: number, start: number, end = start) {
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        const selectors: string[] = [];
        for (let a = lo; a <= hi; a++) {
            selectors.push(`[data-surah="${surah}"][data-ayah="${a}"]`);
            selectors.push(`#ayah-${surah}-${a}`);
        }
        const els = document.querySelectorAll<HTMLElement>(selectors.join(", "));
        els.forEach((el) => {
            el.classList.remove("ayah-highlight");
            void el.offsetWidth; // reflow so the animation can retrigger
            el.classList.add("ayah-highlight");
        });
        setTimeout(
            () => els.forEach((el) => el.classList.remove("ayah-highlight")),
            2500,
        );
    }

    function jumpToAyah(surah: number, ayah: number, end = ayah) {
        // Multi-surah view uses `#ayah-{surah}-{ayah}` ids — scroll directly.
        const multiEl = document.getElementById(`ayah-${surah}-${ayah}`);
        if (multiEl) {
            multiEl.scrollIntoView({ behavior: "smooth", block: "center" });
            pulseAyah(surah, ayah, end);
            return;
        }
        // Single-surah view: switch surah if needed, then let Parchment's
        // pendingJumpAyah effect scroll to `#ayah-{ayah}` and pulse it. Also
        // pulse the whole range for multi-ayah references.
        const single = get(surahMorphology);
        if (single && single.surah !== surah) selectedSurahIdx.set(surah);
        pendingJumpAyah.set(ayah);
        if (end > ayah) setTimeout(() => pulseAyah(surah, ayah, end), 900);
    }

    function refTarget(el: HTMLElement): { s: number; a: number; e: number } | null {
        const s = parseInt(el.dataset.surah ?? "0", 10);
        const a = parseInt(el.dataset.ayah ?? "0", 10);
        const e = parseInt(el.dataset.ayahEnd ?? String(a), 10);
        return s > 0 && a > 0 ? { s, a, e } : null;
    }

    function onRefClick(ev: MouseEvent) {
        const el = (ev.target as HTMLElement | null)?.closest?.(
            ".ayah-ref",
        ) as HTMLElement | null;
        if (!el) return;
        ev.preventDefault();
        const t = refTarget(el);
        if (t) jumpToAyah(t.s, t.a, t.e);
    }

    function onRefKeydown(ev: KeyboardEvent) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        const el = (ev.target as HTMLElement | null)?.closest?.(
            ".ayah-ref",
        ) as HTMLElement | null;
        if (!el) return;
        ev.preventDefault();
        const t = refTarget(el);
        if (t) jumpToAyah(t.s, t.a, t.e);
    }

    // Full-surah context could be very large; cap it so we stay within the
    function surahName(n: number): string {
        return (
            get(surahLabels)[n - 1]?.en ||
            getSurahNameTashkeel(n) ||
            `Surah ${n}`
        );
    }

    // Collapse a sorted ayah list into compact ranges, e.g. [1,2,3,5,6] → "1-3, 5-6".
    function compressAyahs(nums: number[]): string {
        const sorted = [...new Set(nums)].sort((a, b) => a - b);
        const parts: string[] = [];
        let start = sorted[0];
        let prev = sorted[0];
        for (let i = 1; i <= sorted.length; i++) {
            const n = sorted[i];
            if (n === prev + 1) {
                prev = n;
                continue;
            }
            parts.push(start === prev ? `${start}` : `${start}-${prev}`);
            start = n;
            prev = n;
        }
        return parts.join(", ");
    }

    // Build the AI context from whatever the Morphology view is displaying.
    // The model already knows the Qur'an, so we send ONLY the ayah references
    // (surah:ayah numbers) — no Arabic text or translation — which keeps the
    // prompt tiny and well within token limits.
    function buildContext(): { label: string; body: string } | null {
        const filter = get(morphologyAyahFilter);
        const multi = get(morphologyMultiSurahList);
        const single = get(surahMorphology);

        const groups: { surah: number; name: string; ayahs: number[] }[] = [];
        if (multi && multi.length) {
            for (const s of multi) {
                const ayahs = (
                    filter
                        ? s.ayahs.filter((a) => filter.includes(a.ayah))
                        : s.ayahs
                ).map((a) => a.ayah);
                if (ayahs.length)
                    groups.push({ surah: s.surah, name: surahName(s.surah), ayahs });
            }
        } else if (single) {
            const ayahs = (
                filter
                    ? single.ayahs.filter((a) => filter.includes(a.ayah))
                    : single.ayahs
            ).map((a) => a.ayah);
            if (ayahs.length)
                groups.push({
                    surah: single.surah,
                    name: surahName(single.surah),
                    ayahs,
                });
        } else {
            return null;
        }

        if (!groups.length) return null;

        const label = groups
            .map((g) => {
                const first = g.ayahs[0];
                const last = g.ayahs[g.ayahs.length - 1];
                return g.ayahs.length === 1
                    ? `${g.name} · ${first}`
                    : `${g.name} · ${first}–${last}`;
            })
            .join(", ");

        const body = groups
            .map(
                (g) =>
                    `Surah ${g.surah} (${g.name}) — ayah(s): ${compressAyahs(g.ayahs)}`,
            )
            .join("\n");

        return { label, body };
    }

    async function generate() {
        controller?.abort();
        // Preserve the previous cached message so a failed regeneration doesn't
        // wipe out what the user already had.
        const prevResult = result;
        const prevSig = savedSig;
        const prevLabel = sourceLabel;
        error = "";
        quotaExceeded = false;
        const ctx = buildContext();
        if (!ctx) {
            error = get(t)("takehome.no_ayahs");
            return;
        }
        const sig = currentSig;
        result = "";
        sourceLabel = ctx.label;
        loading = true;
        const ac = new AbortController();
        controller = ac;
        try {
            const text = await fetchTakeHomeMessage({
                context: ctx.body,
                locale: get(locale),
                // Advanced model is Pro+ only; Pro accounts always use Standard.
                advanced: get(takeHomeModel) === "advanced" && get(isProPlus),
                signal: ac.signal,
                onPartial: (partial) => {
                    if (!ac.signal.aborted) result = partial;
                },
            });
            if (!ac.signal.aborted) {
                result = text;
                savedSig = sig; // this message now matches the current ayahs
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                error = e instanceof Error ? e.message : String(e);
                quotaExceeded =
                    (e as { status?: number } | null)?.status === 429;
                // Restore the prior cached message (shown once the error clears).
                result = prevResult;
                savedSig = prevSig;
                sourceLabel = prevLabel;
            }
        } finally {
            if (controller === ac) {
                loading = false;
                controller = null;
            }
        }
    }

    // Switch the model and regenerate immediately with the new choice (aborts
    // any in-flight request). Lets the user fall back to the standard model
    // when their advanced-model quota is exhausted.
    function toggleModel() {
        takeHomeModel.set($takeHomeModel === "advanced" ? "standard" : "advanced");
        if (get(isPro)) generate();
    }

    // Error-state shortcut: drop to the standard model and try again.
    function useStandardAndRetry() {
        takeHomeModel.set("standard");
        if (get(isPro)) generate();
    }

    // Opening the dialog no longer auto-generates — it shows the last cached
    // message (kept in component state for the session) so re-opening is instant.
    // The user generates a fresh message for the current ayahs from the button.
    $effect(() => {
        if (open) {
            zIndex = bringToFront();
        } else {
            controller?.abort();
            controller = null;
            loading = false;
            // Clear transient error so re-opening shows the cached result/idle,
            // not a stale error. Reset any manual drag position.
            error = "";
            quotaExceeded = false;
            dragPos = null;
        }
    });

    // ── Anchored positioning ─────────────────────────────────────────────────
    let winW = $state(0);
    let winH = $state(0);
    let reflowTick = $state(0);

    const PANEL_W = 440;
    const GAP = 12;

    // Bump `reflowTick` after a sidebar toggle so the panel re-anchors once the
    // button has slid to its new spot (the sidebar animates ~300ms). The bump
    // is wrapped in untrack() so this effect doesn't depend on `reflowTick`
    // itself (reading + writing the same state would loop endlessly).
    const bumpReflow = () => untrack(() => reflowTick++);
    $effect(() => {
        $isSidebar; // track sidebar toggles
        if (!open) return;
        bumpReflow();
        const id = setTimeout(bumpReflow, 340);
        return () => clearTimeout(id);
    });

    const pos = $derived.by(() => {
        // Dependencies that should retrigger a re-measure.
        void reflowTick;
        void winW;
        void winH;
        const sidebarOpen = $isSidebar;
        // Only null while closed. While open we ALWAYS return a valid position
        // (falling back to screen-centre if the anchor isn't measurable yet),
        // so the {#if} never flips mid-open and the outro transition can't read
        // a null `pos`.
        if (!open) return null;
        const vw = winW || (typeof window !== "undefined" ? window.innerWidth : 1024);
        const vh = winH || (typeof window !== "undefined" ? window.innerHeight : 768);
        const w = Math.min(Math.max(vw - 16, 200), PANEL_W);

        const r = anchorEl?.getBoundingClientRect();
        // No anchor yet (button not mounted / measured) → centre on screen.
        if (!r || (r.width === 0 && r.height === 0)) {
            const maxH = Math.min(vh * 0.85, 640);
            return {
                x: Math.max(8, (vw - w) / 2),
                y: vh / 2,
                w,
                maxH,
                side: "right" as const,
            };
        }

        // Sidebar OPEN → open to the LEFT of the button; CLOSED → to the RIGHT.
        const side: "left" | "right" = sidebarOpen ? "left" : "right";
        let x = side === "left" ? r.left - GAP - w : r.right + GAP;
        // If the preferred side has no room, flip to the other side.
        if (side === "left" && x < 8) x = r.right + GAP;
        if (side === "right" && x + w > vw - 8) x = r.left - GAP - w;
        x = Math.max(8, Math.min(x, vw - 8 - w));

        // Vertically centre on the button, capping the height to twice the
        // smaller gap so a centred panel always stays on screen.
        const cy = r.top + r.height / 2;
        const gap = Math.min(cy - 8, vh - 8 - cy);
        const maxH = Math.max(240, Math.min(Math.min(vh * 0.85, 640), gap * 2));
        return { x, y: cy, w, maxH, side };
    });

    // ── Dragging by the header ───────────────────────────────────────────────
    // Once dragged, `dragPos` (viewport-fixed top-left) overrides the anchored
    // position until the dialog is closed.
    let dragPos = $state<{ x: number; y: number } | null>(null);
    let dragging = $state(false);
    let dragDX = 0;
    let dragDY = 0;

    function startDrag(e: PointerEvent) {
        if (!panelEl) return;
        // Let header buttons (close) handle their own clicks.
        if ((e.target as HTMLElement).closest("button")) return;
        const rect = panelEl.getBoundingClientRect();
        dragPos = { x: rect.left, y: rect.top };
        dragDX = e.clientX - rect.left;
        dragDY = e.clientY - rect.top;
        dragging = true;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", endDrag, { once: true });
        e.preventDefault();
    }

    function onDrag(e: PointerEvent) {
        if (!dragging || !panelEl) return;
        const w = panelEl.offsetWidth;
        const h = panelEl.offsetHeight;
        dragPos = {
            x: Math.max(0, Math.min(e.clientX - dragDX, winW - w)),
            y: Math.max(0, Math.min(e.clientY - dragDY, winH - h)),
        };
    }

    function endDrag() {
        dragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    // The dialog stays open until the user clicks its close button — it does
    // not dismiss on outside click or Escape (matching BookmarkDialog).

    // Rendered inside Parchment (whose root is display:none when the surah page
    // is hidden); portal to <body> so the panel escapes that subtree and any
    // overflow/stacking context.
    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }
</script>

<svelte:window
    bind:innerWidth={winW}
    bind:innerHeight={winH}
    onresize={() => reflowTick++}
/>

{#if open && pos}
    <div
        use:portal
        bind:this={panelEl}
        transition:fly={{ x: pos?.side === "left" ? 10 : -10, duration: 180, opacity: 0 }}
        role="dialog"
        tabindex="-1"
        aria-modal="false"
        aria-label={$t("takehome.title")}
        class="fixed flex w-[min(92vw,440px)] flex-col overflow-hidden rounded-3xl border border-brand-sand-200 bg-white shadow-xl dark:border-[#414559] dark:bg-[#303446] dark:shadow-black/40"
        style="left:{dragPos ? dragPos.x : (pos?.x ?? 0)}px; top:{dragPos
            ? dragPos.y
            : (pos?.y ?? 0)}px; width:{pos?.w ?? 440}px; max-height:{pos?.maxH ??
            640}px; {dragPos ? '' : 'transform:translateY(-50%);'} z-index:{zIndex};"
        onpointerdown={() => (zIndex = bringToFront())}
    >
        <!-- Header (drag handle) -->
        <div
            role="presentation"
            onpointerdown={startDrag}
            class="flex shrink-0 select-none items-start justify-between gap-3 border-b border-brand-gold-200 bg-brand-gold-100 px-5 py-4 dark:border-[#414559] dark:bg-[#292c3c] {dragging
                ? 'cursor-grabbing'
                : 'cursor-grab'}"
        >
            <div class="flex items-center gap-2.5">
                <div
                    class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                >
                    <Icon
                        icon="solar:lightbulb-bolt-bold-duotone"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                        width="1rem"
                    />
                </div>
                <div class="min-w-0">
                    <h2
                        class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {$t("takehome.title")}
                    </h2>
                    <p
                        class="truncate text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                        title={sourceLabel}
                    >
                        {sourceLabel
                            ? $t("takehome.reflecting_on", { source: sourceLabel })
                            : $t("takehome.subtitle_default")}
                    </p>
                </div>
            </div>
            <button
                onclick={onClose}
                aria-label={$t("common.close")}
                class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-brand-gold-200 text-brand-gold-600 transition-colors hover:bg-brand-gold-200/80 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
            >
                <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
            </button>
        </div>

        <!-- Body -->
        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {#if !$isPro}
                <!-- Pro upsell -->
                <div class="flex flex-col items-center gap-3 py-8 text-center">
                    <div
                        class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold-100 dark:bg-[#414559]"
                    >
                        <Icon
                            icon="solar:lock-keyhole-bold-duotone"
                            class="text-brand-gold-500 dark:text-[#e5c890]"
                            width="1.5rem"
                        />
                    </div>
                    <p
                        class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {$t("takehome.pro_title")}
                    </p>
                    <p
                        class="max-w-xs text-xs leading-relaxed text-brand-charcoal-400 dark:text-[#838ba7]"
                    >
                        {$t("takehome.pro_desc")}
                    </p>
                </div>
            {:else if error || quotaExceeded}
                <div class="flex flex-col items-center gap-3 py-8 text-center">
                    <Icon
                        icon={quotaExceeded
                            ? "solar:bolt-circle-bold-duotone"
                            : "solar:danger-triangle-bold-duotone"}
                        class={quotaExceeded
                            ? "text-brand-gold-500 dark:text-[#e5c890]"
                            : "text-red-400"}
                        width="1.5rem"
                    />
                    <p
                        class="max-w-xs text-xs leading-relaxed {quotaExceeded
                            ? 'text-brand-charcoal-500 dark:text-[#c6d0f5]'
                            : 'text-red-500 dark:text-red-400'}"
                    >
                        {quotaExceeded && $takeHomeModel === "advanced"
                            ? $t("takehome.quota_advanced")
                            : error || $t("takehome.quota_advanced")}
                    </p>
                    <div class="flex items-center gap-2">
                        {#if quotaExceeded && $takeHomeModel === "advanced"}
                            <button
                                onclick={useStandardAndRetry}
                                class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1 text-[11px] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
                            >
                                <Icon icon="solar:bolt-linear" width="0.7rem" />
                                {$t("takehome.use_standard")}
                            </button>
                        {/if}
                        <button
                            onclick={generate}
                            class="cursor-pointer rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3 py-1 text-[11px] font-semibold text-brand-charcoal-500 transition-colors hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                        >
                            {$t("takehome.try_again")}
                        </button>
                    </div>
                </div>
            {:else if !result && loading}
                <div class="flex flex-col items-center gap-3 py-10 text-center">
                    <Icon
                        icon="svg-spinners:3-dots-fade"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                        width="1.6rem"
                    />
                    <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                        {$t("takehome.loading")}
                    </p>
                </div>
            {:else if result}
                {#if isStale}
                    <!-- The displayed ayahs changed since this message was made. -->
                    <div
                        class="mb-3 flex items-center gap-2 rounded-2xl border border-brand-gold-200 bg-brand-gold-50 px-3 py-2 dark:border-[#5a5030] dark:bg-[#34302a]"
                    >
                        <Icon
                            icon="solar:refresh-square-bold-duotone"
                            class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                            width="0.95rem"
                        />
                        <span
                            class="flex-1 text-[11px] leading-snug text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        >
                            {$t("takehome.stale")}
                        </span>
                        <button
                            onclick={generate}
                            disabled={loading}
                            class="cursor-pointer shrink-0 rounded-full bg-brand-gold-400 px-2.5 py-1 text-[10px] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
                        >
                            {$t("takehome.generate")}
                        </button>
                    </div>
                {/if}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div onclick={onRefClick} onkeydown={onRefKeydown}>
                    {#if sections.length}
                        <div class="flex flex-col gap-2.5">
                            {#each sections as s (s.id)}
                                {@const meta =
                                    SECTION_META[s.id] ?? SECTION_META.key_lessons}
                                <section
                                    class="th-card"
                                    class:th-card-accent={s.id === "take_home"}
                                    data-section={s.id}
                                >
                                    <div class="th-card-head">
                                        <span class="th-icon">
                                            <Icon icon={meta.icon} width="0.9rem" />
                                        </span>
                                        <h3 class="th-card-title">
                                            {s.title || meta.fallback}
                                        </h3>
                                    </div>
                                    <div class="takehome-md" dir={contentDir}>
                                        {@html renderSection(s.body)}
                                    </div>
                                </section>
                            {/each}
                        </div>
                    {:else}
                        <div class="takehome-md" dir={contentDir}>
                            {@html renderSection(result)}
                        </div>
                    {/if}
                </div>
                {#if loading}
                    <div
                        class="mt-3 flex items-center gap-1.5 text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        <Icon icon="svg-spinners:3-dots-fade" width="1rem" />
                        <span>{$t("takehome.generating")}</span>
                    </div>
                {/if}
            {:else}
                <!-- Idle / empty fallback — never leave the dialog blank. -->
                <div class="flex flex-col items-center gap-3 py-10 text-center">
                    <Icon
                        icon="solar:lightbulb-bolt-bold-duotone"
                        class="text-brand-gold-500 dark:text-[#e5c890]"
                        width="1.5rem"
                    />
                    <p class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]">
                        {$t("takehome.subtitle_default")}
                    </p>
                    <button
                        onclick={generate}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1.5 text-[11px] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
                    >
                        <Icon icon="solar:magic-stick-3-bold-duotone" width="0.85rem" />
                        {$t("takehome.generate")}
                    </button>
                </div>
            {/if}
        </div>

        <!-- Footer -->
        {#if $isPro}
            <div
                class="flex shrink-0 flex-col gap-2 border-t border-brand-sand-200 px-5 py-3 dark:border-[#414559]"
            >
                <div class="flex items-center justify-between gap-2">
                    <!-- Standard / Advanced model toggle — the Advanced model is
                         Pro+ only, so Pro accounts see no toggle (Standard). -->
                    {#if $isProPlus}
                        <button
                            onclick={toggleModel}
                            class="cursor-pointer flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors
                                {$takeHomeModel === 'advanced'
                                ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-brand-gold-900/30 text-brand-gold-600 dark:text-[#e5c890]'
                                : 'border-brand-sand-200 dark:border-[#414559] bg-transparent text-brand-charcoal-400 dark:text-[#8087a2] hover:bg-brand-sand-100 dark:hover:bg-[#292c3c]'}"
                            title={$takeHomeModel === "advanced"
                                ? $t("ai_chat.advanced_on")
                                : $t("ai_chat.advanced_off")}
                        >
                            <Icon
                                icon={$takeHomeModel === "advanced"
                                    ? "solar:bolt-bold-duotone"
                                    : "solar:bolt-linear"}
                                width="0.7rem"
                            />
                            {$takeHomeModel === "advanced"
                                ? $t("ai_chat.model_advanced")
                                : $t("ai_chat.model_standard")}
                        </button>
                    {:else}
                        <span></span>
                    {/if}
                    {#if result && !isStale}
                        <button
                            onclick={generate}
                            disabled={loading}
                            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1.5 text-[11px] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
                        >
                            <Icon icon="solar:refresh-bold" width="0.8rem" />
                            {$t("takehome.regenerate")}
                        </button>
                    {:else}
                        <button
                            onclick={generate}
                            disabled={loading}
                            class="flex cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1.5 text-[11px] font-semibold text-gray-100 transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-brand-gold-500 dark:text-gray-800 dark:hover:bg-brand-gold-400 dark:hover:text-gray-100"
                        >
                            <Icon
                                icon="solar:magic-stick-3-bold-duotone"
                                width="0.85rem"
                            />
                            {$t("takehome.generate")}
                        </button>
                    {/if}
                </div>
                <p class="text-[10px] text-brand-charcoal-300 dark:text-[#626880]">
                    {$t("takehome.disclaimer")}
                </p>
            </div>
        {/if}
    </div>
{/if}

<style>
    /* ── Section cards ─────────────────────────────────────────────────── */
    .th-card {
        border: 1px solid #ece6d9;
        border-radius: 16px;
        padding: 12px 14px;
        background: #fbf9f4;
    }
    :global(.dark) .th-card {
        border-color: #414559;
        background: #292c3c;
    }
    /* The take-home message is the payoff — give it a gold-tinted callout. */
    .th-card-accent {
        border-color: #e6cf96;
        background: linear-gradient(180deg, #fdf6e6 0%, #fbf9f4 100%);
    }
    :global(.dark) .th-card-accent {
        border-color: #6b5b37;
        background: linear-gradient(180deg, #34302a 0%, #292c3c 100%);
    }
    .th-card-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 7px;
    }
    .th-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 8px;
        background: #f4e4bf;
        color: #c58b2c;
        flex-shrink: 0;
    }
    :global(.dark) .th-icon {
        background: #414559;
        color: #e5c890;
    }
    .th-card-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #b07d28;
        margin: 0;
    }
    :global(.dark) .th-card-title {
        color: #e5c890;
    }

    /* ── Rendered markdown body ────────────────────────────────────────── */
    .takehome-md {
        font-size: 13px;
        line-height: 1.6;
        color: var(--th-fg);
        --th-fg: #45475a;
    }
    :global(.dark) .takehome-md {
        --th-fg: #c6d0f5;
    }
    .takehome-md :global(p) {
        margin: 0.35em 0;
    }
    .takehome-md :global(p:first-child) {
        margin-top: 0;
    }
    .takehome-md :global(p:last-child) {
        margin-bottom: 0;
    }
    /* Custom gold bullet markers (list-style removed, dot drawn via ::before). */
    .takehome-md :global(ul) {
        list-style: none;
        margin: 0.2em 0;
        padding: 0;
    }
    .takehome-md :global(ol) {
        margin: 0.2em 0;
        padding-left: 1.25em;
    }
    .takehome-md :global(ul > li) {
        position: relative;
        padding-left: 1.1em;
        margin: 0.3em 0;
    }
    .takehome-md :global(ul > li::before) {
        content: "";
        position: absolute;
        left: 0.15em;
        top: 0.62em;
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: #d4a24e;
    }
    .takehome-md :global(ol > li) {
        margin: 0.3em 0;
    }
    .takehome-md :global(ol > li::marker) {
        color: #d4a24e;
        font-weight: 700;
    }
    :global(.dark) .takehome-md :global(ol > li::marker) {
        color: #e5c890;
    }
    /* RTL: mirror the bullet padding to the right edge. */
    .takehome-md[dir="rtl"] :global(ul > li) {
        padding-left: 0;
        padding-right: 1.1em;
    }
    .takehome-md[dir="rtl"] :global(ul > li::before) {
        left: auto;
        right: 0.15em;
    }
    .takehome-md[dir="rtl"] :global(ol) {
        padding-left: 0;
        padding-right: 1.25em;
    }
    .takehome-md :global(strong) {
        font-weight: 700;
        color: #383a52;
    }
    :global(.dark) .takehome-md :global(strong) {
        color: #eff1f5;
    }
    /* Reflection prompts read better as quiet, italic questions. */
    .th-card[data-section="reflection_prompts"] .takehome-md :global(li) {
        font-style: italic;
    }
    /* The take-home paragraph is the emphasis — a touch larger. */
    .th-card-accent .takehome-md {
        font-size: 13.5px;
    }

    /* ── Clickable ayah reference chips (injected via {@html}) ─────────── */
    :global(.ayah-ref) {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        padding: 0 7px;
        margin: 0 1px;
        border-radius: 999px;
        font-size: 0.8em;
        font-weight: 600;
        line-height: 1.55;
        white-space: nowrap;
        vertical-align: baseline;
        cursor: pointer;
        text-decoration: none;
        color: #b07d28;
        background: #f7ebcf;
        border: 1px solid #ecd9a6;
        transition:
            background 0.12s ease,
            color 0.12s ease;
    }
    :global(.ayah-ref::before) {
        content: "﴾";
        font-size: 0.95em;
        opacity: 0.7;
    }
    :global(.ayah-ref::after) {
        content: "﴿";
        font-size: 0.95em;
        opacity: 0.7;
    }
    :global(.ayah-ref:hover) {
        background: #f0dfac;
        color: #8f6416;
    }
    :global(.dark .ayah-ref) {
        color: #e5c890;
        background: #3a3f52;
        border-color: #51617d;
    }
    :global(.dark .ayah-ref:hover) {
        background: #454b61;
        color: #f2d9a8;
    }
</style>
