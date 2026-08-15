<script lang="ts">
    import Icon from "@iconify/svelte";
    import {
        CAN_REDO_COMMAND,
        REDO_COMMAND,
        COMMAND_PRIORITY_CRITICAL,
    } from "lexical";
    import { IS_APPLE } from "@lexical/utils";
    import { redo } from "@codemirror/commands";
    import { actionBtnStyle, icons } from "$lib/data/toolbar/toolbar";
    import {
        lexicalEditorInstance,
        codeMirrorViewInstance,
        codeMirrorCanRedo,
        codeMirrorViewsByTab,
        codeMirrorHistoryByTab,
    } from "$lib/stores/editor.store";
    import { activeTab, tabs } from "$lib/stores/tabs.store";
    import { get } from "svelte/store";
    import { t } from "$lib/i18n";

    // See UndoButton: tabId names the panel's tab in split layouts.
    let { tabId = null }: { tabId?: string | null } = $props();

    const targetTab = $derived(
        tabId ? ($tabs.find((tb) => tb.id === tabId) ?? null) : $activeTab,
    );
    const isLexical = $derived(targetTab?.type === "lexical");

    let lexicalCanRedo = $state(false);
    let unregister: (() => void) | null = null;

    $effect(() => {
        unregister?.();
        unregister = null;
        const editor = $lexicalEditorInstance;
        if (editor) {
            unregister = editor.registerCommand(
                CAN_REDO_COMMAND,
                (payload) => {
                    lexicalCanRedo = payload;
                    return false;
                },
                COMMAND_PRIORITY_CRITICAL,
            );
        } else {
            lexicalCanRedo = false;
        }
    });

    // See UndoButton: pinned bars address their own panel's CodeMirror view.
    const codeTabId = $derived(!isLexical && targetTab ? targetTab.id : null);
    const canRedo = $derived(
        isLexical
            ? lexicalCanRedo
            : codeTabId && codeTabId in $codeMirrorHistoryByTab
              ? $codeMirrorHistoryByTab[codeTabId].canRedo
              : $codeMirrorCanRedo,
    );

    function handleRedo() {
        if (isLexical) {
            get(lexicalEditorInstance)?.dispatchCommand(
                REDO_COMMAND,
                undefined,
            );
        } else {
            const view =
                (codeTabId ? get(codeMirrorViewsByTab)[codeTabId] : null) ??
                get(codeMirrorViewInstance);
            if (view) redo(view);
        }
    }
</script>

<button
    disabled={!canRedo}
    onclick={handleRedo}
    title={IS_APPLE ? `${$t('toolbar.redo')} (⌘⇧Z)` : `${$t('toolbar.redo')} (Ctrl+Y)`}
    type="button"
    class={actionBtnStyle}
    aria-label={$t('toolbar.redo')}
>
    {#if !canRedo}
        <span class="text-slate-300"
            ><Icon icon={icons["redo"]} width="1rem" /></span
        >
    {:else}
        <Icon icon={icons["redo"]} width="1rem" />
    {/if}
</button>
