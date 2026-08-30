<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle, headerBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { parchmentActions, parchmentSearching } from "$lib/stores/header.store";
    import {
        manuscriptAyah,
        manuscriptsEnabled,
        openManuscriptViewer,
    } from "$lib/stores/manuscripts.store";
    import {
        arabicStudyEnabled,
        openArabicStudyHome,
    } from "$lib/stores/arabic-study.store";
    import {
        openPostcard,
        savedPostcardDesign,
    } from "$lib/stores/postcard.store";

    // variant "header" drops the absolute centring and the zen fade: the bar is
    // then a plain row the window header lays out itself.
    let { variant = "floating" }: { variant?: "floating" | "header" } =
        $props();

    const inHeader = $derived(variant === "header");

    // In the header the bar itself is the surface, so the buttons drop their
    // pill and shadow and sit closer together.
    const btn = $derived(
        inHeader ? headerBtnStyle + " z-50" : actionBtnStyle + " p-2 z-50",
    );

    // Parchment still owns the dialogs and the search request; it publishes the
    // handlers and this bar drives them from wherever it is mounted.
    const onOpenBookmarks = $derived($parchmentActions?.onOpenBookmarks);
    const onOpenHighlights = $derived($parchmentActions?.onOpenHighlights);
    const isSearching = $derived($parchmentSearching);

    let showSearch = $state(false);
    let searchQuery = $state("");
    let inputEl = $state<HTMLInputElement | null>(null);

    function search(query: string) {
        $parchmentActions?.onSearch(query);
    }

    function toggleSearch() {
        showSearch = !showSearch;
        if (!showSearch) {
            searchQuery = "";
            search("");
        } else {
            setTimeout(() => inputEl?.focus(), 50);
        }
    }

    function submitSearch() {
        if (searchQuery.trim()) {
            search(searchQuery);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") submitSearch();
    }

    function clearSearch() {
        searchQuery = "";
        search("");
        inputEl?.focus();
    }

    function reopenManuscripts() {
        void openManuscriptViewer();
    }

    // Reopens the last design rather than seeding a fresh card, which is what
    // the widget's "Create Post Card" does.
    function reopenPostcard() {
        openPostcard($savedPostcardDesign ? "resume" : "new");
    }

    const postcardLabel = $derived.by(() => {
        const d = $savedPostcardDesign;
        if (!d) return $t("parchment.open_postcard");
        return $t("parchment.reopen_postcard", {
            surah: String(d.surah),
            ayah: d.selected?.length ? String(d.selected[0]) : "1",
        });
    });
</script>

<!-- Same deal as the editor ActionBar: in the header this row sits in the
     title bar, so the space between its buttons drags the window. Tauri
     matches only the element the click lands on, hence the attribute here
     rather than relying on the header above. Not in the floating variant,
     which hovers over the page. -->
<div
    id="tour-action-bar"
    data-tauri-drag-region={inHeader ? true : undefined}
    class={inHeader
        ? "flex items-center space-x-0.5"
        : `${
              $zenMode
                  ? $zenPeek
                      ? "opacity-50 transition-opacity duration-200"
                      : "opacity-0 hover:opacity-100 transition-opacity duration-200"
                  : ""
          } absolute -top-4.5 left-1/2 -translate-x-1/2 flex items-center justify-center space-x-2`}
    dir="ltr"
>
    <button
        onclick={(e) =>
            onOpenBookmarks?.(e.currentTarget.getBoundingClientRect())}
        class={btn}
        title={$t("parchment.bookmarks")}
        aria-label={$t("parchment.open_bookmarks")}
    >
        <Icon icon="solar:bookmark-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={(e) =>
            onOpenHighlights?.(e.currentTarget.getBoundingClientRect())}
        class={btn}
        title={$t("parchment.highlights")}
        aria-label={$t("parchment.open_highlights")}
    >
        <Icon icon="solar:pen-new-square-bold-duotone" width="1rem" />
    </button>

    {#if $arabicStudyEnabled}
        <button
            onclick={() => openArabicStudyHome()}
            class={btn}
            title={$t("arabicStudy.open")}
            aria-label={$t("arabicStudy.open")}
        >
            <Icon icon="solar:square-academic-cap-2-bold-duotone" width="1rem" />
        </button>
    {/if}

    {#if $manuscriptsEnabled}
        <button
            onclick={reopenManuscripts}
            class={btn}
            title={$manuscriptAyah
                ? $t("parchment.reopen_manuscripts", {
                      surah: String($manuscriptAyah.surah),
                      ayah: String($manuscriptAyah.ayah),
                  })
                : $t("parchment.open_manuscripts")}
            aria-label={$manuscriptAyah
                ? $t("parchment.reopen_manuscripts", {
                      surah: String($manuscriptAyah.surah),
                      ayah: String($manuscriptAyah.ayah),
                  })
                : $t("parchment.open_manuscripts")}
        >
            <!-- A solid glyph in a row of duotone ones: at full strength it
                 carries about 1.6x their ink (measured coverage 0.52 against
                 a 0.31 average), which reads as too dark in light mode and
                 too bright in dark. Fading it lands on the same weight the
                 duotone icon it replaced had, in both themes at once. -->
            <Icon
                icon="streamline-plump:script-2-solid"
                width="1rem"
                class="opacity-65"
            />
        </button>
    {/if}

    <button
        onclick={reopenPostcard}
        class={btn}
        title={postcardLabel}
        aria-label={postcardLabel}
    >
        <Icon icon="solar:gallery-send-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={toggleSearch}
        class={btn + (showSearch ? " ring-2 ring-brand-gold-300" : "")}
        title={$t("parchment.search")}
        aria-label={$t("parchment.search_quran")}
    >
        <Icon icon="solar:magnifer-bold-duotone" width="1rem" />
    </button>

    {#if showSearch}
        <div
            class="flex items-center gap-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white/90 dark:bg-[#343434]/95 px-2 py-0.5 z-50"
        >
            <input
                bind:this={inputEl}
                type="text"
                bind:value={searchQuery}
                onkeydown={handleKeydown}
                placeholder={$t("parchment.search_placeholder")}
                title={$t("parchment.search_hint")}
                class="w-44 bg-transparent text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#838ba7] outline-none"
                dir="auto"
                disabled={isSearching}
            />
            {#if searchQuery && !isSearching}
                <button
                    onclick={clearSearch}
                    class="cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5]"
                    title={$t("parchment.clear")}
                >
                    <Icon icon="solar:close-circle-linear" width="0.75rem" />
                </button>
            {/if}
            <button
                onclick={submitSearch}
                disabled={isSearching || !searchQuery.trim()}
                class="cursor-pointer text-brand-charcoal-400 hover:text-brand-charcoal-600 dark:hover:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={$t("parchment.search")}
                aria-label={$t("parchment.submit_search")}
            >
                {#if isSearching}
                    <span class="animate-spin inline-flex">
                        <Icon icon="solar:refresh-bold" width="0.75rem" />
                    </span>
                {:else}
                    <Icon icon="solar:arrow-right-linear" width="0.75rem" />
                {/if}
            </button>
        </div>
    {/if}
</div>
