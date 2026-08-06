<script lang="ts">
    import { onMount, tick } from "svelte";
    import { t } from "$lib/i18n";
    import { suggestWord } from "$lib/stores/spellcheck.store";

    let {
        x,
        y,
        word,
        onReplace,
        onIgnore,
        onIgnoreAll,
        onClose,
    }: {
        x: number;
        y: number;
        word: string;
        onReplace: (suggestion: string) => void;
        onIgnore: () => void;
        onIgnoreAll: () => void;
        onClose: () => void;
    } = $props();

    let suggestions = $state<string[]>([]);
    let loading = $state(true);
    let menuEl = $state<HTMLDivElement | null>(null);
    let pos = $state({ left: x, top: y });

    onMount(() => {
        void load();
        // Defer listener attachment so the opening right-click doesn't
        // immediately close the menu.
        const attach = setTimeout(() => {
            window.addEventListener("pointerdown", onOutside, true);
            window.addEventListener("keydown", onKey, true);
            window.addEventListener("resize", onClose, true);
        }, 0);
        return () => {
            clearTimeout(attach);
            window.removeEventListener("pointerdown", onOutside, true);
            window.removeEventListener("keydown", onKey, true);
            window.removeEventListener("resize", onClose, true);
        };
    });

    async function load() {
        loading = true;
        suggestions = await suggestWord(word);
        loading = false;
        await tick();
        clampToViewport();
    }

    function clampToViewport() {
        if (!menuEl) return;
        const rect = menuEl.getBoundingClientRect();
        const margin = 8;
        let left = x;
        let top = y;
        if (left + rect.width > window.innerWidth - margin) {
            left = Math.max(margin, window.innerWidth - rect.width - margin);
        }
        if (top + rect.height > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - rect.height - margin);
        }
        pos = { left, top };
    }

    function onOutside(e: PointerEvent) {
        if (menuEl && !menuEl.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") {
            e.preventDefault();
            onClose();
        }
    }
</script>

<div
    bind:this={menuEl}
    class="fixed z-[9999] min-w-[180px] max-w-[280px] py-1 rounded-md shadow-lg text-[13px]
           bg-white dark:bg-[#292c3c] border border-stone-200 dark:border-[#414559]
           text-brand-charcoal-600 dark:text-[#c6d0f5]"
    style:left="{pos.left}px"
    style:top="{pos.top}px"
    role="menu"
    tabindex="-1"
>
    {#if loading}
        <div class="px-3 py-1.5 italic text-brand-charcoal-300">
            {$t("spellcheck.checking")}
        </div>
    {:else if suggestions.length === 0}
        <div class="px-3 py-1.5 italic text-brand-charcoal-300">
            {$t("spellcheck.no_suggestions")}
        </div>
    {:else}
        {#each suggestions as s}
            <button
                type="button"
                role="menuitem"
                class="block w-full text-left px-3 py-1 font-medium cursor-pointer
                       hover:bg-brand-gold-100 dark:hover:bg-brand-gold-400/15"
                onclick={() => onReplace(s)}
            >
                {s}
            </button>
        {/each}
    {/if}
    <div class="my-1 border-t border-stone-200 dark:border-[#414559]"></div>
    <button
        type="button"
        role="menuitem"
        class="block w-full text-left px-3 py-1 cursor-pointer
               hover:bg-brand-gold-100 dark:hover:bg-brand-gold-400/15"
        onclick={onIgnore}
    >
        {$t("spellcheck.ignore")}
    </button>
    <button
        type="button"
        role="menuitem"
        class="block w-full text-left px-3 py-1 cursor-pointer
               hover:bg-brand-gold-100 dark:hover:bg-brand-gold-400/15"
        onclick={onIgnoreAll}
    >
        {$t("spellcheck.ignore_all")}
    </button>
</div>
