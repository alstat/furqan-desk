<script lang="ts">
    import Icon from "@iconify/svelte";
    import { IS_APPLE } from "@lexical/utils";
    import {
        open as openDialog,
        save as saveDialog,
    } from "@tauri-apps/plugin-dialog";
    import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
    import { get } from "svelte/store";
    import {
        activeTab,
        activeTabId,
        undoHistory,
        redoHistory,
        undoActiveTab,
        redoActiveTab,
        markTabSaved,
        openOrFocusTab,
    } from "$lib/stores/tabs.store";
    import { actionBtnStyle, icons } from "$lib/data/toolbar/toolbar";
    import { onMount } from "svelte";

    const canUndo = $derived(
        (undoHistory.get($activeTabId ?? "") ?? []).length > 0,
    );
    const canRedo = $derived(
        (redoHistory.get($activeTabId ?? "") ?? []).length > 0,
    );

    async function saveFile() {
        const tab = get(activeTab);
        if (!tab) return;
        let path = tab.path;
        if (!path) {
            path = await saveDialog({
                defaultPath: `${tab.name}.typ`,
                filters: [
                    {
                        name: "Typst / Text",
                        extensions: ["typ", "bib", "txt", "md"],
                    },
                ],
            });
            if (!path) return;
        }
        await writeTextFile(path, tab.content);
        markTabSaved(tab.id, path);
    }

    async function openFile() {
        const result = await openDialog({
            multiple: false,
            filters: [
                {
                    name: "Files",
                    extensions: ["typ", "bib", "txt", "md", "lexical", "json"],
                },
            ],
        });
        if (!result || Array.isArray(result)) return;
        const content = await readTextFile(result as string);
        openOrFocusTab(result as string, content);
    }

    function handleKey(e: KeyboardEvent) {
        const mod = IS_APPLE ? e.metaKey : e.ctrlKey;
        if (mod && e.key === "s") {
            e.preventDefault();
            saveFile();
        }
        if (mod && !e.shiftKey && e.key === "z") {
            e.preventDefault();
            undoActiveTab();
        }
        if (
            mod &&
            (e.key === "y" || (IS_APPLE && e.shiftKey && e.key === "z"))
        ) {
            e.preventDefault();
            redoActiveTab();
        }
    }

    onMount(() => {
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    });
</script>

<div
    class="absolute -top-9 left-1/2 -translate-x-1/2 flex flex-row justify-stretch"
>
    <div class="mr-4">
        <button
            disabled={!canUndo}
            onclick={undoActiveTab}
            title={IS_APPLE ? "Undo (⌘Z)" : "Undo (Ctrl+Z)"}
            type="button"
            class={actionBtnStyle + " p-1"}
            aria-label="Undo"
        >
            {#if !canUndo}
                <span class="text-slate-300"
                    ><Icon icon={icons["undo"]} width="1rem" /></span
                >
            {:else}
                <Icon icon={icons["undo"]} width="1rem" />
            {/if}
        </button>
        <button
            disabled={!canRedo}
            onclick={redoActiveTab}
            title={IS_APPLE ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Y)"}
            type="button"
            class={actionBtnStyle + " p-1"}
            aria-label="Redo"
        >
            {#if !canRedo}
                <span class="text-slate-300"
                    ><Icon icon={icons["redo"]} width="1rem" /></span
                >
            {:else}
                <Icon icon={icons["redo"]} width="1rem" />
            {/if}
        </button>
    </div>
    <div class="ml-4">
        <button
            onclick={openFile}
            title="Open file"
            type="button"
            class={actionBtnStyle}
            aria-label="Open file"
        >
            <Icon icon="solar:folder-open-bold-duotone" width="1rem" />
        </button>
        <button
            onclick={saveFile}
            title={IS_APPLE ? "Save (⌘S)" : "Save (Ctrl+S)"}
            type="button"
            class={actionBtnStyle + " p-1"}
            aria-label="Save file"
        >
            <Icon icon="solar:diskette-bold-duotone" width="1rem" />
        </button>
    </div>
</div>
