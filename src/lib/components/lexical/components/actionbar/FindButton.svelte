<!--
  Opens find & replace for whichever editor the bar is driving: the Lexical
  panel for rich-text tabs, CodeMirror's own search panel for the Julia and
  Typst (and plain text) editors.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { IS_APPLE } from "@lexical/utils";
    import { openSearchPanel } from "@codemirror/search";
    import { get } from "svelte/store";
    import { actionBtnStyle } from "$lib/data/toolbar/toolbar";
    import {
        codeMirrorViewInstance,
        codeMirrorViewsByTab,
        lexicalFindOpener,
    } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";
    import { t } from "$lib/i18n";

    // In split layouts each panel renders its own action bar and names the tab
    // it drives; omitting tabId keeps the single-bar behaviour of following the
    // active tab.
    let { tabId = null }: { tabId?: string | null } = $props();

    const targetTab = $derived(
        tabId ? ($tabs.find((tb) => tb.id === tabId) ?? null) : $activeTab,
    );
    const isLexical = $derived(targetTab?.type === "lexical");

    // A bar pinned to a panel addresses that panel's CodeMirror view; the
    // unpinned bar keeps using the most recently mounted one.
    const codeTabId = $derived(!isLexical && targetTab ? targetTab.id : null);
    const enabled = $derived(
        isLexical
            ? $lexicalFindOpener !== null
            : (codeTabId !== null && codeTabId in $codeMirrorViewsByTab) ||
              $codeMirrorViewInstance !== null,
    );

    function openFind() {
        if (isLexical) {
            get(lexicalFindOpener)?.();
            return;
        }
        const view =
            (codeTabId ? get(codeMirrorViewsByTab)[codeTabId] : null) ??
            get(codeMirrorViewInstance);
        if (view) openSearchPanel(view);
    }

    const shortcut = IS_APPLE ? "⌘F" : "Ctrl+F";
</script>

<button
    disabled={!enabled}
    onclick={openFind}
    title="{$t('toolbar.find')} ({shortcut})"
    aria-label={$t("toolbar.find")}
    type="button"
    class={actionBtnStyle}
>
    {#if !enabled}
        <span class="text-slate-300">
            <Icon icon="solar:magnifer-bold-duotone" width="1rem" />
        </span>
    {:else}
        <Icon icon="solar:magnifer-bold-duotone" width="1rem" />
    {/if}
</button>
