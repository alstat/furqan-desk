<script lang="ts">
    import { slide } from "svelte/transition";
    import { rotateSpring } from "$lib/stores/animation";
    import type { TransitionConfig } from "svelte/transition";
    import {
        hideSurahPage,
        isSidebar,
        surahOrientation,
    } from "$lib/stores/quran.svelte";
    import {
        juliaMode,
        juliaViewerOpen,
        juliaPlots,
        tocOpen,
        tocAnchorRect,
        zenPeek,
        singlePageMargin,
        editorSplitRatio,
    } from "$lib/stores/editor.store";
    import { activeTab, activeTabId } from "$lib/stores/tabs.store";
    import { crossGroups } from "$lib/stores/julia-terminal.store";
    import { isScriptLanguage } from "$lib/languages/scriptLanguages";
    import DonationDialog from "./DonationDialog.svelte";
    import UserAccountDialog from "./UserAccountDialog.svelte";
    import AiChatDialog from "./AiChatDialog.svelte";
    import TerminalDialog from "./TerminalDialog.svelte";
    import {
        terminalDialogOpen,
        openTerminal,
    } from "$lib/stores/terminal-window.store";
    import { openJuliaPlotViewer } from "$lib/stores/julia-plot-window";
    import ReferencesDialog from "./ReferencesDialog.svelte";
    import {
        referencesOpen,
        referencesAnchorRect,
    } from "$lib/stores/references.store";
    import Icon from "@iconify/svelte";
    import { donationOpen } from "$lib/stores/tour.store";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { zenMode, appDarkMode } from "$lib/stores/editor.store";
    import { authUser } from "$lib/stores/auth.store";
    import { aiChatDialogOpen, openAiChat } from "$lib/stores/ai-chat.store";
    import { openUrl } from "@tauri-apps/plugin-opener";

    let accountOpen = $state(false);
    // Only the in-app fallback uses this; inside Tauri the terminal gets an OS
    // window of its own.
    let terminalOpen = $derived($terminalDialogOpen);
    let tocBtnEl = $state<HTMLButtonElement | null>(null);
    let referencesBtnEl = $state<HTMLButtonElement | null>(null);

    function handleAiClick() {
        // Signing in is the whole requirement — Free accounts get the chat on
        // a daily token allowance, so the account panel is only for the users
        // who have no account at all.
        if (!$authUser) {
            accountOpen = true;
            return;
        }
        // A window cannot be "toggled" from here the way a floating panel
        // could — openAiChat focuses it if it is already up.
        void openAiChat();
    }

    let { children } = $props();

    let sidebarWidth = $derived($isSidebar ? "w-full" : "");

    let hasLeftPanel = $derived(
        !$hideSurahPage() ||
            $crossGroups.some(
                (g) =>
                    g.hostTabId === $activeTabId ||
                    g.partnerTabId === $activeTabId,
            ) ||
            $activeTab?.type === "julia" ||
            $activeTab?.type === "lean" ||
            isScriptLanguage($activeTab?.type) ||
            $activeTab?.type === "typst",
    );

    // Hide Quran Page + Julia/Typst tab → right side hosts REPL or Typst preview.
    // In that mode the user can drag the divider, so the sidebar width is variable.
    let inResizableSplit = $derived(
        $hideSurahPage() &&
            ($activeTab?.type === "julia" ||
                $activeTab?.type === "lean" ||
                $activeTab?.type === "typst") &&
            !$crossGroups.some(
                (g) =>
                    g.hostTabId === $activeTabId ||
                    g.partnerTabId === $activeTabId,
            ),
    );

    let sidebarWidthPct = $derived(
        !$isSidebar
            ? 0
            : !hasLeftPanel
              ? 100
              : inResizableSplit
                ? $editorSplitRatio
                : 50,
    );

    let windowWidth = $state(0);
    function toggleSidebar() {
        const opening = !$isSidebar;

        // Prevent both panels from being hidden at the same time:
        // if closing the sidebar while parchment is already hidden, reveal
        // the parchment instead so the user always sees content.
        if (!opening && $hideSurahPage()) {
            hideSurahPage.set(() => false);
        }

        if (!$hideSurahPage() && $isSidebar) {
            if (windowWidth < 1800) {
                singlePageMargin.set(12);
                console.log(windowWidth);
            } else if (windowWidth >= 1800 && windowWidth < 2000) {
                singlePageMargin.set(10);
            } else {
                singlePageMargin.set(8);
            }
        }

        $isSidebar = opening;
        rotateSpring.set(
            $surahOrientation() === "flex-row-reverse"
                ? opening
                    ? 180
                    : 0
                : opening
                  ? 0
                  : 180,
        );
    }

    interface HorizontalSlideParams {
        duration?: number;
        direction?: "left" | "right";
    }

    function horizontalSlide(
        node: HTMLElement,
        { duration = 300, direction = "left" }: HorizontalSlideParams = {},
    ): TransitionConfig {
        const style = getComputedStyle(node);
        const width = parseFloat(style.width);
        const padding =
            parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const margin =
            parseFloat(style.marginLeft) + parseFloat(style.marginRight);
        const initialWidth = width + padding + margin;

        return {
            duration,
            css: (t: number) => {
                const eased = t;
                return `
          overflow: hidden;
          width: ${eased * initialWidth}px;
          margin-left: ${direction === "right" ? `${(1 - eased) * initialWidth}px` : "0"};
          transform-origin: ${direction === "left" ? "left" : "right"};
        `;
            },
        };
    }
</script>

<svelte:window bind:innerWidth={windowWidth} />

<div
    id="tour-sidebar"
    style:width="{sidebarWidthPct}%"
    class={`relative flex justify-right overflow-visible font-base text-slate-900 dark:text-[#c6d0f5]`}
>
    <!-- Sidebar toggle (top) -->
    <button
        class={`${$hideSurahPage() ? "hidden " : ""} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} top-4 z-200 rounded-full bg-brand-gold-200 dark:bg-[#292c3c] p-2 shadow-md transition-colors text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-400 dark:hover:bg-[#363a4f] active:bg-brand-gold-500 dark:active:bg-[#414559] ${$zenMode ? "opacity-30 hover:opacity-100" : ""}`}
        onclick={toggleSidebar}
        aria-label={$isSidebar ? "Collapse sidebar" : "Expand sidebar"}
    >
        <svg
            class="h-4 w-4 transform transition-transform"
            style="transform: rotate({$rotateSpring}deg)"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
        >
            <path d="M15 19l-7-7 7-7" />
        </svg>
    </button>

    <!-- AI Button -->
    <button
        id="tour-ai-button"
        class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} top-15 z-3 ${$aiChatDialogOpen ? "bg-brand-gold-400 dark:bg-[#363a4f]" : ""} ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
        onclick={handleAiClick}
        aria-label={$t("ai_chat.title")}
        title={$t("ai_chat.title")}
    >
        <Icon
            icon="ri:chat-smile-ai-fill"
            class="h-4 w-4 text-brand-charcoal-300"
        />
    </button>

    <!-- Terminal Button -->
    <button
        id="tour-terminal-button"
        class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} top-26 z-3 ${terminalOpen ? "bg-brand-gold-400 dark:bg-[#363a4f]" : ""} ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
        onclick={() => void openTerminal()}
        aria-label="Open terminal"
        title="Open terminal"
    >
        <Icon
            icon="icon-park-twotone:terminal"
            class="h-4 w-4 text-brand-charcoal-300"
        />
    </button>

    <!-- Table of Contents button -->
    {#if $isSidebar && $activeTab?.type === "lexical"}
        <button
            bind:this={tocBtnEl}
            class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} top-37 z-3 ${$tocOpen ? "bg-brand-gold-400 dark:bg-[#363a4f]" : ""} ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
            onclick={() => {
                if (tocBtnEl)
                    tocAnchorRect.set(tocBtnEl.getBoundingClientRect());
                $tocOpen = !$tocOpen;
            }}
            aria-label={$t("toc.button")}
            title={$t("toc.button")}
        >
            <Icon icon="solar:list-bold-duotone" class="h-4 w-4" />
        </button>
    {/if}

    <!-- References button (below Table of Contents) -->
    {#if $isSidebar && ($activeTab?.type === "lexical" || $activeTab?.type === "typst")}
        <button
            bind:this={referencesBtnEl}
            class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} ${$activeTab?.type === "typst" ? "top-37" : "top-48"} z-3 ${$referencesOpen ? "bg-brand-gold-400 dark:bg-[#363a4f]" : ""} ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
            onclick={() => {
                if (referencesBtnEl)
                    referencesAnchorRect.set(
                        referencesBtnEl.getBoundingClientRect(),
                    );
                $referencesOpen = !$referencesOpen;
            }}
            aria-label={$t("references.button")}
            title={$t("references.button")}
        >
            <Icon icon="solar:bookmark-square-bold-duotone" class="h-4 w-4" />
        </button>
    {/if}

    <!-- Julia Plot Viewer button -->
    {#if $juliaMode || $juliaViewerOpen}
        <button
            class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} bottom-37 z-3 rounded-full
			       ${$juliaViewerOpen ? "bg-brand-gold-400 dark:bg-[#363a4f]" : ""} ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
            onclick={() =>
                void openJuliaPlotViewer().then((opened) => {
                    // A window cannot be toggled shut from here; the fallback
                    // panel still can.
                    if (!opened) $juliaViewerOpen = !$juliaViewerOpen;
                })}
            aria-label="Julia Plot Viewer"
            title="Julia Plot Viewer"
        >
            <Icon icon="solar:chart-bold-duotone" class="h-4 w-4" />
            {#if $juliaPlots.length > 0}
                <span
                    class="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center
					       rounded-full bg-brand-gold-500 dark:bg-[#e5c890] text-gray-100 hover:dark:text-gray-100 dark:text-[#1a1d2e]
					       text-[0.5rem] font-bold leading-none"
                >
                    {$juliaPlots.length > 9 ? "9+" : $juliaPlots.length}
                </span>
            {/if}
        </button>
    {/if}

    <!-- Zen-mode locator dot — marks where the (hidden) account button sits. -->
    {#if $zenMode && !$zenPeek && !accountOpen}
        <div
            aria-hidden="true"
            class={`pointer-events-none absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} bottom-26 z-2 h-8 w-8 flex items-center justify-center`}
        >
            <span
                class="h-1.5 w-1.5 rounded-full bg-brand-charcoal-400 dark:bg-[#838ba7] opacity-15"
            ></span>
        </div>
    {/if}

    <!-- User account button (above donation) -->
    <button
        id="tour-account-button"
        class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} bottom-26 z-3 ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
        onclick={() => (accountOpen = true)}
        aria-label={$t("account.title")}
        title={$t("account.title")}
    >
        <Icon icon="solar:user-bold-duotone" class="h-4 w-4" />
    </button>

    <!-- Donation button (above feedback) -->
    <button
        class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} bottom-15 z-3 ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
        onclick={() => ($donationOpen = true)}
        aria-label="Support AyahLab"
        title="Donate / Support"
    >
        <Icon icon="solar:heart-bold-duotone" class="h-4 w-4" />
    </button>

    <!-- Feedback button (bottom) — same strip as toggle, aligned vertically at bottom -->
    <button
        class={`${actionBtnStyle} cursor-pointer absolute ${$surahOrientation() == "flex-row-reverse" ? "sm:-right-4 -right-10" : "sm:-left-4 left-2"} bottom-4 z-3 ${$zenMode ? ($zenPeek ? "opacity-50 transition-opacity duration-200" : "opacity-0 hover:opacity-100 transition-opacity duration-200") : ""}`}
        onclick={() => openUrl("https://www.ayahlab.com/#feedback")}
        aria-label="Send feedback"
        title="Send feedback"
    >
        <Icon icon="solar:chat-round-dots-bold-duotone" class="h-4 w-4" />
    </button>

    <DonationDialog
        open={$donationOpen}
        onClose={() => ($donationOpen = false)}
    />
    <UserAccountDialog
        open={accountOpen}
        onClose={() => (accountOpen = false)}
    />
    <AiChatDialog
        open={$aiChatDialogOpen}
        onClose={() => aiChatDialogOpen.set(false)}
    />
    <TerminalDialog
        open={terminalOpen}
        onClose={() => terminalDialogOpen.set(false)}
    />
    <ReferencesDialog />

    <div class={$isSidebar ? `flex flex-row w-full` : `hidden`}>
        <!-- Sidebar Content -->
        <!-- {#if isOpen} -->
        <!-- <div
				transition:slide={{ duration: 300 }}
				class="vintage-scroll parchment space-y-2 overflow-auto bg-amber-50 p-4 text-xl leading-[2]"
			>
				{@render children()}
			</div> -->
        <div
            transition:horizontalSlide={{
                duration: 300,
                direction:
                    $surahOrientation() == "flex-row-reverse"
                        ? "right"
                        : "left", // or 'left' for left-to-right
            }}
            class="relative w-full space-y-2 overflow-visible {$zenMode &&
            $appDarkMode
                ? 'bg-transparent'
                : 'bg-white dark:bg-[#1c1c1c]'} px-1 pb-4 text-xl {$zenMode
                ? ''
                : 'border-x border-stone-200 dark:border-[#414559]'}"
        >
            {#if $zenMode}
                <div
                    class="absolute top-0 right-0 w-1/2 h-px z-10 pointer-events-none"
                    style="background: linear-gradient(to right, transparent 0%, {$appDarkMode
                        ? 'rgba(229,200,144,0.25)'
                        : 'rgba(229,200,144,0.55)'} 20%, {$appDarkMode
                        ? 'rgba(229,200,144,0.25)'
                        : 'rgba(229,200,144,0.55)'} 80%, transparent 100%)"
                ></div>
            {/if}
            {@render children()}
        </div>
        <!-- {/if} -->
    </div>
</div>
