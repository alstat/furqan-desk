<script lang="ts">
    import { onMount } from "svelte";
    import {
        $createRangeSelection as createRangeSelection,
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $setSelection as setSelection,
    } from "lexical";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { isPro } from "$lib/stores/auth.store";
    import AiSelectionToolbar from "$lib/components/shared/AiSelectionToolbar.svelte";

    const editor = getEditor();

    let aiSelection = $state<{
        text: string;
        x: number;
        y: number;
        range: Range;
    } | null>(null);

    function toolbarHasFocus() {
        const active = document.activeElement;
        return (
            active instanceof HTMLElement &&
            active.closest("[data-ai-selection-toolbar]") !== null
        );
    }

    function readSelection() {
        if (!$isPro) {
            aiSelection = null;
            return;
        }

        if (aiSelection && toolbarHasFocus()) return;

        let text = "";
        editor.getEditorState().read(() => {
            const selection = getSelection();
            if (isRangeSelection(selection) && !selection.isCollapsed()) {
                text = selection.getTextContent();
            }
        });

        if (!text.trim()) {
            aiSelection = null;
            return;
        }

        const domSelection = window.getSelection();
        const root = editor.getRootElement();
        if (!domSelection || domSelection.rangeCount === 0 || !root) {
            aiSelection = null;
            return;
        }

        const anchor = domSelection.anchorNode;
        if (anchor && !root.contains(anchor)) {
            aiSelection = null;
            return;
        }

        const range = domSelection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
            aiSelection = null;
            return;
        }

        aiSelection = {
            text,
            x: Math.max(180, Math.min(window.innerWidth - 180, rect.left + rect.width / 2)),
            y: Math.max(12, rect.top - 8),
            range: range.cloneRange(),
        };
    }

    function replaceSelection(replacement: string) {
        const captured = aiSelection;
        if (!captured) return;

        editor.update(() => {
            const rangeSelection = createRangeSelection();
            rangeSelection.applyDOMRange(captured.range);
            setSelection(rangeSelection);

            const selection = getSelection();
            if (isRangeSelection(selection)) {
                selection.insertText(replacement);
            }
        });

        editor.focus();
        aiSelection = null;
    }

    onMount(() => {
        const unregister = editor.registerUpdateListener(() => {
            requestAnimationFrame(readSelection);
        });
        document.addEventListener("selectionchange", readSelection);

        return () => {
            unregister();
            document.removeEventListener("selectionchange", readSelection);
        };
    });
</script>

{#if $isPro && aiSelection}
    <AiSelectionToolbar
        selectedText={aiSelection.text}
        x={aiSelection.x}
        y={aiSelection.y}
        onReplace={replaceSelection}
        onClose={() => (aiSelection = null)}
    />
{/if}
