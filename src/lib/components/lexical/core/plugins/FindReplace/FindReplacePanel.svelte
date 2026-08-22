<!--
  Find & replace panel for the Lexical editor.

  Pure presentation: it owns the inputs and the keyboard handling inside them,
  while the matching, highlighting and replacing live in FindReplacePlugin.
  It floats over the top-right of the writing area, below the toolbar, and the
  replace row folds away until it is asked for.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { IS_APPLE } from "@lexical/utils";
    import { t } from "$lib/i18n";

    let {
        query = $bindable(""),
        replacement = $bindable(""),
        caseSensitive = $bindable(false),
        wholeWord = $bindable(false),
        showReplace = $bindable(false),
        total = 0,
        current = 0,
        capped = false,
        onNext,
        onPrev,
        onReplace,
        onReplaceAll,
        onClose,
    }: {
        query?: string;
        replacement?: string;
        caseSensitive?: boolean;
        wholeWord?: boolean;
        showReplace?: boolean;
        total?: number;
        current?: number;
        capped?: boolean;
        onNext: () => void;
        onPrev: () => void;
        onReplace: () => void;
        onReplaceAll: () => void;
        onClose: () => void;
    } = $props();

    let queryInput = $state<HTMLInputElement | null>(null);
    let replaceInput = $state<HTMLInputElement | null>(null);
    let root = $state<HTMLDivElement | null>(null);

    const mod = IS_APPLE ? "⌘" : "Ctrl+";

    export function focusQuery() {
        queryInput?.focus();
        queryInput?.select();
    }

    export function focusReplace() {
        replaceInput?.focus();
        replaceInput?.select();
    }

    // Esc and ⌘F are handled on the container so they work wherever focus sits
    // in the panel — including on the buttons, which is where it lands after a
    // click on Replace or All. Listener rather than an `onkeydown` attribute:
    // the wrapper is a plain div, and a handler on it would be flagged by the
    // a11y rules for a non-interactive element.
    $effect(() => {
        const el = root;
        if (!el) return;
        el.addEventListener("keydown", onPanelKeydown);
        return () => el.removeEventListener("keydown", onPanelKeydown);
    });

    function onPanelKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            event.preventDefault();
            onClose();
        } else if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "f"
        ) {
            // ⌘F with the panel already open re-selects the term, the way every
            // other find bar behaves.
            event.preventDefault();
            focusQuery();
        }
    }

    function onQueryKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") {
            event.preventDefault();
            if (event.shiftKey) onPrev();
            else onNext();
        }
    }

    function onReplaceKeydown(event: KeyboardEvent) {
        if (event.key === "Enter") {
            event.preventDefault();
            if (event.metaKey || event.ctrlKey) onReplaceAll();
            else onReplace();
        }
    }

    // Styling follows the AI selection prompt (AiSelectionToolbar): a pill-
    // shaped translucent card, fully rounded inputs, and borderless round
    // buttons that pick up a gold wash on hover.
    const inputClass =
        "min-w-0 w-full rounded-xl border px-3 py-1.5 text-[11px] " +
        "border-brand-sand-200 dark:border-[#414559] " +
        "bg-brand-sand-50 dark:bg-[#1e2030] " +
        "text-brand-charcoal-900 dark:text-[#c6d0f5] " +
        "placeholder-brand-charcoal-300 dark:placeholder-[#626880] " +
        "focus:border-brand-gold-400 focus:outline-none focus:ring-2 " +
        "focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30";

    const iconBtnClass =
        "inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center " +
        "rounded-full transition-colors " +
        "text-brand-charcoal-700 dark:text-[#c6d0f5] " +
        "hover:bg-brand-gold-200 hover:text-brand-gold-700 " +
        "dark:hover:bg-[#4a4e5c] dark:hover:text-brand-gold-400 " +
        "focus:outline-none focus:ring-2 focus:ring-brand-gold-300 " +
        "disabled:cursor-default disabled:opacity-40 " +
        "disabled:hover:bg-transparent disabled:hover:text-brand-charcoal-700 " +
        "dark:disabled:hover:text-[#c6d0f5]";

    const actionBtnClass =
        "cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 " +
        "text-[11px] font-medium transition-colors " +
        "text-brand-charcoal-700 dark:text-[#c6d0f5] " +
        "hover:bg-brand-gold-200 hover:text-brand-gold-700 " +
        "dark:hover:bg-[#4a4e5c] dark:hover:text-brand-gold-400 " +
        "focus:outline-none focus:ring-2 focus:ring-brand-gold-300 " +
        "disabled:cursor-default disabled:opacity-40 " +
        "disabled:hover:bg-transparent disabled:hover:text-brand-charcoal-700 " +
        "dark:disabled:hover:text-[#c6d0f5]";

    function toggleClass(active: boolean) {
        return (
            iconBtnClass +
            (active
                ? " bg-brand-gold-200 text-brand-gold-700 dark:bg-[#4a4e5c] dark:text-brand-gold-400"
                : "")
        );
    }
</script>

<div
    bind:this={root}
    class="absolute top-2 right-3 z-40 flex w-[21rem] max-w-[calc(100%-1.5rem)]
           flex-col gap-1.5 rounded-xl border border-brand-sand-200 bg-white/95
           p-1.5 font-sans shadow-xl backdrop-blur-sm
           dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
    role="search"
    aria-label={$t("find.title")}
>
    <div class="flex items-center gap-1">
        <button
            type="button"
            class={iconBtnClass}
            title={$t("find.toggle_replace")}
            aria-label={$t("find.toggle_replace")}
            aria-expanded={showReplace}
            onclick={() => (showReplace = !showReplace)}
        >
            <Icon
                icon={showReplace
                    ? "material-symbols:keyboard-arrow-down-rounded"
                    : "material-symbols:keyboard-arrow-right-rounded"}
                width="16"
            />
        </button>

        <div class="relative flex-1 min-w-0">
            <input
                bind:this={queryInput}
                bind:value={query}
                onkeydown={onQueryKeydown}
                class={inputClass + " pr-14"}
                type="text"
                spellcheck="false"
                autocomplete="off"
                placeholder={$t("find.find_placeholder")}
                aria-label={$t("find.find_placeholder")}
            />
            <span
                class="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] tabular-nums
                       {total === 0 && query
                    ? 'text-red-500 dark:text-[#e78284]'
                    : 'text-brand-charcoal-300 dark:text-[#626880]'}"
            >
                {#if !query}
                    &nbsp;
                {:else if total === 0}
                    {$t("find.no_results")}
                {:else}
                    {current}/{total}{capped ? "+" : ""}
                {/if}
            </span>
        </div>

        <button
            type="button"
            class={toggleClass(caseSensitive)}
            title={$t("find.match_case")}
            aria-label={$t("find.match_case")}
            aria-pressed={caseSensitive}
            onclick={() => (caseSensitive = !caseSensitive)}
        >
            <Icon icon="material-symbols:match-case-rounded" width="16" />
        </button>
        <button
            type="button"
            class={toggleClass(wholeWord)}
            title={$t("find.whole_word")}
            aria-label={$t("find.whole_word")}
            aria-pressed={wholeWord}
            onclick={() => (wholeWord = !wholeWord)}
        >
            <Icon icon="material-symbols:match-word-rounded" width="16" />
        </button>

        <button
            type="button"
            class={iconBtnClass}
            title="{$t('find.previous')} (⇧⏎)"
            aria-label={$t("find.previous")}
            disabled={total === 0}
            onclick={onPrev}
        >
            <Icon icon="material-symbols:keyboard-arrow-up-rounded" width="16" />
        </button>
        <button
            type="button"
            class={iconBtnClass}
            title="{$t('find.next')} (⏎)"
            aria-label={$t("find.next")}
            disabled={total === 0}
            onclick={onNext}
        >
            <Icon
                icon="material-symbols:keyboard-arrow-down-rounded"
                width="16"
            />
        </button>
        <button
            type="button"
            class={iconBtnClass}
            title="{$t('find.close')} (Esc)"
            aria-label={$t("find.close")}
            onclick={onClose}
        >
            <Icon icon="material-symbols:close-rounded" width="15" />
        </button>
    </div>

    {#if showReplace}
        <div class="flex items-center gap-1">
            <!-- Spacer matching the disclosure chevron, so both inputs line up. -->
            <span class="h-7 w-7 shrink-0"></span>
            <div class="flex-1 min-w-0">
                <input
                    bind:this={replaceInput}
                    bind:value={replacement}
                    onkeydown={onReplaceKeydown}
                    class={inputClass}
                    type="text"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder={$t("find.replace_placeholder")}
                    aria-label={$t("find.replace_placeholder")}
                />
            </div>
            <button
                type="button"
                class={actionBtnClass}
                title="{$t('find.replace')} (⏎)"
                disabled={total === 0}
                onclick={onReplace}
            >
                {$t("find.replace")}
            </button>
            <button
                type="button"
                class={actionBtnClass}
                title="{$t('find.replace_all')} ({mod}⏎)"
                disabled={total === 0}
                onclick={onReplaceAll}
            >
                {$t("find.replace_all")}
            </button>
        </div>
    {/if}
</div>
