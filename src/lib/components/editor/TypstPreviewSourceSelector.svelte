<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { t } from "$lib/i18n";
    import {
        typstPreviewMode,
        typstPinnedPath,
        typstRecompile,
    } from "$lib/stores/editor.store";
    import { tabs } from "$lib/stores/tabs.store";

    // `compact` trims the trigger label to just an icon + caret, for the tight
    // embedded-preview header. The side-by-side toolbar uses the full label.
    let { compact = false }: { compact?: boolean } = $props();

    let open = $state(false);
    let wrapperEl: HTMLDivElement | null = $state(null);

    // Only saved Typst files can be pinned: pinning is keyed by path (so it
    // survives reloads) and import resolution needs a file location.
    let pinnableTabs = $derived(
        $tabs.filter((t) => t.type === "typst" && t.path),
    );

    // The tab matching the current pinned path, if it is still open.
    let pinnedTab = $derived(
        $typstPinnedPath
            ? (pinnableTabs.find((t) => t.path === $typstPinnedPath) ?? null)
            : null,
    );

    // Pinned but its file isn't currently open — we fall back to the active file
    // and surface this so the user understands why the pin isn't taking effect.
    let pinnedMissing = $derived(
        $typstPreviewMode === "pinned" && !!$typstPinnedPath && !pinnedTab,
    );

    let triggerLabel = $derived(
        $typstPreviewMode === "pinned" && $typstPinnedPath
            ? (pinnedTab?.name ??
              ($typstPinnedPath.split("/").pop() ?? $typstPinnedPath))
            : $t("typst.preview_source.active"),
    );

    function chooseActive() {
        typstPreviewMode.set("active");
        typstRecompile.update((n) => n + 1);
        open = false;
    }

    function choosePinned(path: string) {
        typstPinnedPath.set(path);
        typstPreviewMode.set("pinned");
        typstRecompile.update((n) => n + 1);
        open = false;
    }

    function handleWindowPointerDown(e: PointerEvent) {
        if (open && wrapperEl && !wrapperEl.contains(e.target as Node)) {
            open = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") open = false;
    }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleKeydown} />

<div class="relative" bind:this={wrapperEl}>
    <button
        type="button"
        onclick={() => (open = !open)}
        title={$t("typst.preview_source.title")}
        aria-haspopup="menu"
        aria-expanded={open}
        class="flex max-w-[11rem] cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors
               {$typstPreviewMode === 'pinned'
            ? 'bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25'
            : 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'}"
    >
        <Icon
            icon={$typstPreviewMode === "pinned"
                ? "solar:pin-bold"
                : "solar:document-text-linear"}
            width="11"
        />
        {#if !compact}
            <span class="truncate">{triggerLabel}</span>
        {/if}
        {#if pinnedMissing}
            <Icon
                icon="solar:danger-triangle-bold"
                width="11"
                class="text-amber-500"
            />
        {/if}
        <Icon icon="solar:alt-arrow-down-linear" width="9" class="opacity-70" />
    </button>

    {#if open}
        <div
            transition:fly={{ y: 4, duration: 180, opacity: 0 }}
            role="menu"
            class="absolute right-0 z-50 mt-1.5 flex max-h-[60vh] w-64 flex-col overflow-hidden rounded-xl border border-stone-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] shadow-xl shadow-black/15 dark:shadow-black/40"
        >
            <!-- Header -->
            <div
                class="shrink-0 flex items-center gap-2 border-b border-stone-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#232634] px-5 py-2"
            >
                <Icon
                    icon="solar:eye-bold-duotone"
                    class="shrink-0 text-brand-gold-400 dark:text-[#e5c890]"
                    width="0.85rem"
                />
                <span
                    class="text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("typst.preview_source.title")}
                </span>
            </div>

            <div class="flex-1 min-h-0 overflow-y-auto default-scroll">
                <!-- Default: follow the active file -->
                <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={$typstPreviewMode === "active"}
                    onclick={chooseActive}
                    class="w-full cursor-pointer flex items-start gap-2 px-3 py-2 text-left transition-colors border-b border-stone-100 dark:border-[#363a4f]
                           {$typstPreviewMode === 'active'
                        ? 'bg-brand-gold-50 dark:bg-[#3b3757]'
                        : 'hover:bg-brand-sand-50 dark:hover:bg-[#1e2030]'}"
                >
                    <Icon
                        icon="solar:document-text-bold-duotone"
                        width="0.95rem"
                        class="mt-0.5 shrink-0 {$typstPreviewMode === 'active'
                            ? 'text-brand-gold-400 dark:text-[#e5c890]'
                            : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                    />
                    <span class="min-w-0 flex-1">
                        <span
                            class="block text-[13px] font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
                        >
                            {$t("typst.preview_source.active")}
                        </span>
                        <span
                            class="block text-[10px] text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {$t("typst.preview_source.active_desc")}
                        </span>
                    </span>
                    {#if $typstPreviewMode === "active"}
                        <Icon
                            icon="solar:check-circle-bold"
                            width="0.9rem"
                            class="mt-0.5 shrink-0 text-brand-gold-400 dark:text-[#e5c890]"
                        />
                    {/if}
                </button>

                <!-- Pin section sub-header -->
                <div
                    class="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7] border-b border-stone-100 dark:border-[#363a4f] bg-brand-sand-50/60 dark:bg-[#232634]/60"
                >
                    {$t("typst.preview_source.pin_heading")}
                </div>

                {#if pinnableTabs.length === 0}
                    <div
                        class="px-3 py-4 text-center text-[11px] italic text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("typst.preview_source.no_files")}
                    </div>
                {:else}
                    <!-- Cap the pickable file list so a long list scrolls within
                         the menu instead of stretching it off-screen. -->
                    <div class="max-h-[30vh] overflow-y-auto default-scroll">
                        {#each pinnableTabs as tab (tab.id)}
                            {@const isPinned =
                                $typstPreviewMode === "pinned" &&
                                tab.path === $typstPinnedPath}
                            <button
                                type="button"
                                role="menuitemradio"
                                aria-checked={isPinned}
                                onclick={() => choosePinned(tab.path!)}
                                class="w-full cursor-pointer flex items-center gap-2 px-3 py-1.5 text-left transition-colors border-b border-stone-50 dark:border-[#363a4f]/50
                                       {isPinned
                                    ? 'bg-brand-gold-50 dark:bg-[#3b3757]'
                                    : 'hover:bg-brand-sand-50 dark:hover:bg-[#1e2030]'}"
                            >
                                <Icon
                                    icon="solar:file-text-bold-duotone"
                                    width="0.85rem"
                                    class="shrink-0 {isPinned
                                        ? 'text-brand-gold-400 dark:text-[#e5c890]'
                                        : 'text-brand-charcoal-300 dark:text-[#838ba7]'}"
                                />
                                <span
                                    class="min-w-0 flex-1 truncate text-[13px] {isPinned
                                        ? 'font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]'
                                        : 'text-brand-charcoal-500 dark:text-[#a5adce]'}"
                                    title={tab.path}
                                >
                                    {tab.name}
                                </span>
                                {#if isPinned}
                                    <Icon
                                        icon="solar:check-circle-bold"
                                        width="0.9rem"
                                        class="shrink-0 text-brand-gold-400 dark:text-[#e5c890]"
                                    />
                                {/if}
                            </button>
                        {/each}
                    </div>
                {/if}

                {#if pinnedMissing}
                    <p
                        class="flex items-center gap-1.5 px-3 py-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-900/10"
                    >
                        <Icon
                            icon="solar:danger-triangle-bold"
                            width="0.8rem"
                            class="shrink-0"
                        />
                        {$t("typst.preview_source.pinned_closed")}
                    </p>
                {/if}
            </div>
        </div>
    {/if}
</div>
