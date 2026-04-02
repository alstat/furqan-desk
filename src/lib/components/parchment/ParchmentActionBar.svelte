<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import { t } from "$lib/i18n";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";

    interface Props {
        onOpenBookmarks: () => void;
        onOpenHighlights: () => void;
        onSearch: (query: string) => void;
        isSearching?: boolean;
    }
    let {
        onOpenBookmarks,
        onOpenHighlights,
        onSearch,
        isSearching = false,
    }: Props = $props();

    let showSearch = $state(false);
    let searchQuery = $state("");
    let inputEl = $state<HTMLInputElement | null>(null);

    function toggleSearch() {
        showSearch = !showSearch;
        if (!showSearch) {
            searchQuery = "";
            onSearch("");
        } else {
            setTimeout(() => inputEl?.focus(), 50);
        }
    }

    function submitSearch() {
        if (searchQuery.trim()) {
            onSearch(searchQuery);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Enter") submitSearch();
    }

    function clearSearch() {
        searchQuery = "";
        onSearch("");
        inputEl?.focus();
    }
</script>

<div
    id="tour-action-bar"
    class="{$zenMode
        ? $zenPeek
            ? 'opacity-50 transition-opacity duration-200'
            : 'opacity-0 hover:opacity-100 transition-opacity duration-200'
        : ''} absolute -top-4.5 left-1/2 -translate-x-1/2 flex items-center justify-center space-x-2"
    dir="ltr"
>
    <button
        onclick={onOpenBookmarks}
        class={actionBtnStyle + " p-2 z-50"}
        title={$t("parchment.bookmarks")}
        aria-label={$t("parchment.open_bookmarks")}
    >
        <Icon icon="solar:bookmark-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={onOpenHighlights}
        class={actionBtnStyle + " p-2 z-50"}
        title={$t("parchment.highlights")}
        aria-label={$t("parchment.open_highlights")}
    >
        <Icon icon="solar:magic-stick-3-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={toggleSearch}
        class={actionBtnStyle +
            " p-2 z-50 " +
            (showSearch ? "ring-2 ring-brand-gold-300" : "")}
        title={$t("parchment.search")}
        aria-label={$t("parchment.search_quran")}
    >
        <Icon icon="solar:magnifer-bold-duotone" width="1rem" />
    </button>

    {#if showSearch}
        <div
            class="flex items-center gap-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/90 dark:bg-[#303446]/95 px-2 py-0.5 shadow-sm z-50"
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
                class="cursor-pointer text-brand-charcoal-400 dark:text-[#c6d0f5] hover:text-brand-charcoal-600 dark:hover:text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
