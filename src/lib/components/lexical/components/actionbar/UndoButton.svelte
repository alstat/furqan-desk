<script lang="ts">
    import Icon from "@iconify/svelte";
    import {
        CAN_UNDO_COMMAND,
        UNDO_COMMAND,
        COMMAND_PRIORITY_CRITICAL,
    } from "lexical";
    import { IS_APPLE } from "@lexical/utils";
    import { undo } from "@codemirror/commands";
    import { actionBtnStyle, icons } from "$lib/data/toolbar/toolbar";
    import {
        lexicalEditorInstance,
        codeMirrorViewInstance,
        codeMirrorCanUndo,
        codeMirrorViewsByTab,
        codeMirrorHistoryByTab,
    } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";
    import { get } from "svelte/store";
    import { t } from "$lib/i18n";

    // In split layouts each panel renders its own action bar and names the tab
    // it drives; omitting tabId keeps the single-bar behaviour of following the
    // active tab.
    let {
        tabId = null,
        btnClass = actionBtnStyle,
    }: { tabId?: string | null; btnClass?: string } = $props();

    const targetTab = $derived(
        tabId ? ($tabs.find((tb) => tb.id === tabId) ?? null) : $activeTab,
    );
    const isLexical = $derived(targetTab?.type === "lexical");

    let lexicalCanUndo = $state(false);
    let unregister: (() => void) | null = null;

    $effect(() => {
        unregister?.();
        unregister = null;
        const editor = $lexicalEditorInstance;
        if (editor) {
            unregister = editor.registerCommand(
                CAN_UNDO_COMMAND,
                (payload) => {
                    lexicalCanUndo = payload;
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL,
            );
        } else {
            lexicalCanUndo = false;
        }
    });

    // A bar pinned to a panel addresses that panel's CodeMirror view; the
    // unpinned bar keeps using the most recently mounted one.
    const codeTabId = $derived(!isLexical && targetTab ? targetTab.id : null);
    const canUndo = $derived(
        isLexical
            ? lexicalCanUndo
            : codeTabId && codeTabId in $codeMirrorHistoryByTab
              ? $codeMirrorHistoryByTab[codeTabId].canUndo
              : $codeMirrorCanUndo,
    );

    function handleUndo() {
        if (isLexical) {
            get(lexicalEditorInstance)?.dispatchCommand(
                UNDO_COMMAND,
                undefined,
            );
        } else {
            const view =
                (codeTabId ? get(codeMirrorViewsByTab)[codeTabId] : null) ??
                get(codeMirrorViewInstance);
            if (view) undo(view);
        }
    }
</script>

<button
    disabled={!canUndo}
    onclick={handleUndo}
    title={IS_APPLE ? `${$t('toolbar.undo')} (⌘Z)` : `${$t('toolbar.undo')} (Ctrl+Z)`}
    type="button"
    class={btnClass}
    aria-label={$t('toolbar.undo')}
>
    {#if !canUndo}
        <span class="text-slate-300"
            ><Icon icon={icons["undo"]} width="1rem" /></span
        >
    {:else}
        <Icon icon={icons["undo"]} width="1rem" />
    {/if}
</button>
