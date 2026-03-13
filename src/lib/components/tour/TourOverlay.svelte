<script lang="ts">
    import Icon from "@iconify/svelte";
    import { tourActive, completeTour, donationOpen } from "$lib/stores/tour.store";
    import { manuscriptDemoOpen } from "$lib/stores/manuscripts.store";

    const MANUSCRIPT_STEP = 6; // index of the manuscript step
    const AUTHOR_STEP = 8;     // index of the author's note step

    const steps = [
        {
            targetId: null,
            title: "Welcome to AyahLab",
            description:
                "Your all-in-one Quran study and research workspace — explore the text with full morphology, examine original manuscripts, compose publications with Typst, and run scientific computations with Julia.",
            position: "center" as const,
        },
        {
            targetId: "tour-parchment",
            title: "The Quran Reader",
            description:
                "Interactive Quran text with full morphology. Click any word to explore its root, grammar, and linguistic details.",
            position: "right" as const,
        },
        {
            targetId: "tour-action-bar",
            title: "Reader Actions",
            description:
                "Bookmark ayahs, manage highlights, and search in Arabic or translation.",
            position: "bottom" as const,
        },
        {
            targetId: "tour-recitation",
            title: "Recitation Player",
            description:
                "Audio playback of any surah. Appears at the bottom of the reader when a reciter is active.",
            position: "top" as const,
        },
        {
            targetId: "tour-surah-widget",
            title: "Surah & Translation Controls",
            description:
                "Select surah, choose a translator, toggle word-by-word and transliteration, and adjust fonts.",
            position: "top" as const,
        },
        {
            targetId: "tour-sidebar",
            title: "The Editor Panel",
            description:
                "Multi-tab workspace with three editor types: Lexical for quick rich-text notes, Typst for beautifully typeset documents and research papers, and Julia for interactive scientific computing — with built-in APIs like AL.surah and AL.ayah to programmatically control the Quran reader.",
            position: "left" as const,
        },
        {
            targetId: null,
            title: "📜 Manuscript Viewer",
            description:
                "Hover any ayah number in the reader and click the scroll icon (📜) to open the Manuscript Viewer. Browse early Quranic manuscripts from world archives, view folio images, inspect dating and script details, zoom in for detail, and save high-resolution images. Live preview below — Surah Al-Ikhlas (112), Ayah 2:",
            position: "center" as const,
        },
        {
            targetId: "tour-editor-toolbar",
            title: "Editor Tools",
            description:
                "Create new tabs, browse local files, configure Julia & Typst packages, and access settings.",
            position: "top" as const,
        },
        {
            targetId: null,
            title: "A Note from the Author",
            description: "",
            position: "center" as const,
        },
        {
            targetId: null,
            title: "You're all set!",
            description:
                "For more, check the User Guide under the Settings panel. You can restart this tour anytime from the Settings panel in the Editor Tools.",
            position: "center" as const,
        },
    ];

    let currentStep = $state(0);
    let spotlightRect = $state<DOMRect | null>(null);

    function updateSpotlight() {
        const { targetId } = steps[currentStep];
        if (!targetId) {
            spotlightRect = null;
            return;
        }
        const el = document.getElementById(targetId);
        spotlightRect = el ? el.getBoundingClientRect() : null;
    }

    $effect(() => {
        // Re-run whenever currentStep or tourActive changes
        currentStep;
        if ($tourActive) updateSpotlight();
    });

    $effect(() => {
        if (!$tourActive) {
            manuscriptDemoOpen.set(false);
            return;
        }
        function onResize() {
            updateSpotlight();
        }
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    });

    function applyManuscriptDemo(step: number) {
        if (step === MANUSCRIPT_STEP) {
            manuscriptDemoOpen.set(true);
        } else {
            manuscriptDemoOpen.set(false);
        }
    }

    function next() {
        if (currentStep === steps.length - 1) {
            manuscriptDemoOpen.set(false);
            completeTour();
            currentStep = 0;
        } else {
            currentStep++;
            applyManuscriptDemo(currentStep);
        }
    }

    function prev() {
        if (currentStep > 0) {
            currentStep--;
            applyManuscriptDemo(currentStep);
        }
    }

    function skip() {
        manuscriptDemoOpen.set(false);
        completeTour();
        currentStep = 0;
    }

    const TOOLTIP_H = 200;
    const PAD = 8;

    function getTooltipStyle(rect: DOMRect | null, position: string, step: number): string {
        const tooltipW = (step === MANUSCRIPT_STEP || step === AUTHOR_STEP) ? 320 : 288; // w-80 vs w-72
        if (!rect || position === "center") {
            if (step === MANUSCRIPT_STEP) {
                // Place below center so the demo viewer behind is visible
                return "left: 50%; top: 12px; transform: translateX(-50%);";
            }
            return "left: 50%; top: 50%; transform: translate(-50%, -50%);";
        }
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let left: number;
        let top: number;
        switch (position) {
            case "bottom":
                left = rect.left + rect.width / 2 - tooltipW / 2;
                top = rect.bottom + 16;
                break;
            case "top":
                left = rect.left + rect.width / 2 - tooltipW / 2;
                top = rect.top - TOOLTIP_H - 16;
                break;
            case "right":
                left = rect.right + 16;
                top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
                break;
            case "left":
                left = rect.left - tooltipW - 16;
                top = rect.top + rect.height / 2 - TOOLTIP_H / 2;
                break;
            default:
                return "left: 50%; top: 50%; transform: translate(-50%, -50%);";
        }
        left = Math.max(PAD, Math.min(vw - tooltipW - PAD, left));
        top = Math.max(PAD, Math.min(vh - TOOLTIP_H - PAD, top));
        return `left: ${left}px; top: ${top}px;`;
    }

    const tooltipStyle = $derived(
        getTooltipStyle(spotlightRect, steps[currentStep].position, currentStep),
    );

    const primaryBtn =
        "cursor-pointer px-3 py-1 text-xs font-semibold rounded-full bg-brand-gold-400 dark:bg-[#1a1d2e] text-white dark:text-[#c8a96a] border border-transparent dark:border-[#3e4568] hover:bg-brand-gold-500 dark:hover:bg-[#252840] transition-colors";
    const secondaryBtn =
        "cursor-pointer px-3 py-1 text-xs font-semibold rounded-full border border-slate-200 dark:border-[#414559] hover:bg-slate-100 dark:hover:bg-[#414559] text-slate-600 dark:text-[#c6d0f5] transition-colors";
</script>

{#if $tourActive}
    <!-- Click blocker -->
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-[9997]" onclick={() => {}}></div>

    <!-- Spotlight (targeted steps) or solid overlay (centered steps) -->
    {#if spotlightRect}
        <div
            class="fixed z-[9998] pointer-events-none transition-all duration-300 rounded-lg"
            style="left:{spotlightRect.left - 8}px; top:{spotlightRect.top -
                8}px;
                   width:{spotlightRect.width +
                16}px; height:{spotlightRect.height + 16}px;
                   box-shadow: 0 0 0 9999px rgba(0,0,0,0.65), 0 0 0 2px rgba(255,255,255,0.15);"
        ></div>
    {:else}
        <div
            class="fixed inset-0 z-[9997] bg-black/65 pointer-events-none"
        ></div>
    {/if}

    <!-- Tooltip card -->
    <div
        class="fixed z-[9999] rounded-xl bg-white dark:bg-[#303446] shadow-2xl p-5 border border-slate-100 dark:border-[#414559]
               {(currentStep === MANUSCRIPT_STEP || currentStep === AUTHOR_STEP) ? 'w-80' : 'w-72'}"
        style={tooltipStyle}
    >
        <!-- Step dots -->
        <div class="flex gap-1 mb-3">
            {#each steps as _, i}
                <span
                    class="h-1.5 rounded-full transition-all duration-200 {i ===
                    currentStep
                        ? 'w-4 bg-brand-gold-400'
                        : 'w-1.5 bg-slate-200 dark:bg-[#414559]'}"
                ></span>
            {/each}
        </div>

        <!-- Title -->
        {#if currentStep === 0 || currentStep === steps.length - 1 || currentStep === MANUSCRIPT_STEP || currentStep === AUTHOR_STEP}
            <div class="flex items-center gap-2 mb-1">
                <Icon
                    icon={currentStep === 0
                        ? "solar:graduation-cap-bold-duotone"
                        : currentStep === MANUSCRIPT_STEP
                          ? "solar:document-text-bold-duotone"
                          : currentStep === AUTHOR_STEP
                            ? "solar:heart-bold-duotone"
                            : "solar:star-bold-duotone"}
                    class="text-brand-gold-400 shrink-0"
                    width="1.1rem"
                />
                <h3
                    class="text-sm font-semibold text-slate-700 dark:text-[#c6d0f5]"
                >
                    {currentStep === MANUSCRIPT_STEP ? "Manuscript Viewer" : steps[currentStep].title}
                </h3>
            </div>
        {:else}
            <h3
                class="text-sm font-semibold text-slate-700 dark:text-[#c6d0f5] mb-1"
            >
                {steps[currentStep].title}
            </h3>
        {/if}

        {#if currentStep === AUTHOR_STEP}
            <p class="text-xs text-slate-500 dark:text-[#838ba7] leading-relaxed mb-4 space-y-2">
                Assalamu 'Alaikum wa Rahmatullahi wa Barakatuh.<br /><br />
                AyahLab is a passion project built to serve the Quran studies community — and it is, and always will be, free.<br /><br />
                If this app has benefited you and you are in a position to support it, even a small contribution helps keep it alive and actively developed. If not, sharing it with a friend and keeping me in your du'a means just as much.<br /><br />
                Jazakallah Khairan Kathiran. —&nbsp;<button
                    onclick={() => { completeTour(); currentStep = 0; $donationOpen = true; }}
                    class="underline text-brand-gold-500 dark:text-[#e5c890] hover:opacity-80 transition-opacity cursor-pointer"
                >Al-Ahmadgaid B. Asaad</button>
            </p>
        {:else}
            <p
                class="text-xs text-slate-500 dark:text-[#838ba7] leading-relaxed mb-4"
            >
                {steps[currentStep].description}
            </p>
        {/if}

        <div class="flex items-center justify-between">
            <button
                onclick={skip}
                class="text-xs text-slate-400 dark:text-[#838ba7] hover:text-slate-600 dark:hover:text-[#c6d0f5] cursor-pointer transition-colors"
            >
                Skip tour
            </button>
            <div class="flex gap-2">
                {#if currentStep > 0}
                    <button onclick={prev} class={secondaryBtn}>Back</button>
                {/if}
                <button onclick={next} class={primaryBtn}>
                    {currentStep === steps.length - 1 ? "Done" : "Next →"}
                </button>
            </div>
        </div>
    </div>
{/if}
