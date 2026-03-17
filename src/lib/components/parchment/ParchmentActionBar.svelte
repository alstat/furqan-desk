<script lang="ts">
    import Icon from "@iconify/svelte";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";

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
    class="absolute -top-5 inset-x-0 flex items-center justify-center space-x-2"
    dir="ltr"
>
    <button
        onclick={onOpenBookmarks}
        class={actionBtnStyle + " p-1 z-50"}
        title="Bookmarks"
        aria-label="Open bookmarks"
    >
        <Icon icon="solar:bookmark-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={onOpenHighlights}
        class={actionBtnStyle + " p-1 z-50"}
        title="Highlights"
        aria-label="Open highlights"
    >
        <Icon icon="solar:magic-stick-3-bold-duotone" width="1rem" />
    </button>

    <button
        onclick={toggleSearch}
        class={actionBtnStyle +
            " p-1 z-50 " +
            (showSearch ? "ring-2 ring-brand-gold-300" : "")}
        title="Search"
        aria-label="Search quran"
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
                placeholder="Search Arabic or Translation…"
                title="For translation, you need to select one first before the app can search the translation."
                class="w-44 bg-transparent text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#838ba7] outline-none"
                dir="auto"
                disabled={isSearching}
            />
            {#if searchQuery && !isSearching}
                <button
                    onclick={clearSearch}
                    class="cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5]"
                    title="Clear"
                >
                    <Icon icon="solar:close-circle-linear" width="0.75rem" />
                </button>
            {/if}
            <button
                onclick={submitSearch}
                disabled={isSearching || !searchQuery.trim()}
                class="cursor-pointer text-brand-charcoal-400 dark:text-[#c6d0f5] hover:text-brand-charcoal-600 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Search"
                aria-label="Submit search"
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
