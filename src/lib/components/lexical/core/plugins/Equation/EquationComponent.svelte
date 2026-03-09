<script lang="ts">
    import katex from "katex";
    import { onMount, createEventDispatcher } from "svelte";
    import { getActiveEditor, getEditor } from '$lexical/core/composerContext.js';
    import { $isEquationNode as isEquationNode} from './EquationNode';
    import { $getNodeByKey as getNodeByKey } from "lexical";

    interface Props {
        equation: string;
        isInline: boolean;
        nodeKey: string;
    }

    let {equation, isInline, nodeKey}: Props = $props();

    let element: HTMLElement | null = $state(null);
    let isEditing = $state(false);
    let editableValue = $state(equation);
    
    const dispatch = createEventDispatcher();
    const editor = getEditor();

    function renderEquation() {
        if (element) {
            katex.render(equation, element, {
                throwOnError: false,
                displayMode: !isInline,
                output: "mathml",
            });
        }
    }

    function handleDoubleClick() {
        isEditing = true;
        editableValue = equation;
    }

    function handleSave() {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isEquationNode(node)) {
                node.setEquation(editableValue);
            }
        });
        isEditing = false;
    }

    function handleCancel() {
        isEditing = false;
        editableValue = equation;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSave();
        } else if (event.key === 'Escape') {
            event.preventDefault();
            handleCancel();
        }
    }

    $effect(() => {
        if (!isEditing) {
            renderEquation();
        }
    });

    onMount(() => {
        renderEquation();
    });
</script>

{#if isEditing}
    <div class="equation-editor">
        <textarea 
            bind:value={editableValue}
            on:keydown={handleKeydown}
            class="equation-textarea"
            autofocus
        ></textarea>
        <div class="equation-editor-buttons">
            <button on:click={handleSave}>Save</button>
            <button on:click={handleCancel}>Cancel</button>
        </div>
        <div class="equation-preview">
            {#if editableValue}
                <!-- Preview of the equation -->
                {@html katex.renderToString(editableValue, { throwOnError: false, displayMode: !isInline, output: "mathml" })}
            {/if}
        </div>
    </div>
{:else}
    {#if isInline}
        <span 
            class="SL_Theme__equation_inline" 
            bind:this={element} 
            on:dblclick={handleDoubleClick}
        ></span>
    {:else}
        <div 
            class="SL_Theme__equation_display" 
            bind:this={element} 
            on:dblclick={handleDoubleClick}
        ></div>
    {/if}
{/if}

<style>
    .equation-editor {
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        background-color: #f9f9f9;
    }
    
    .equation-textarea {
        width: 100%;
        min-height: 60px;
        font-family: monospace;
        margin-bottom: 8px;
        padding: 4px;
    }
    
    .equation-editor-buttons {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
    }

    .equation-editor-buttons button {
        cursor: pointer;
    }
    
    .equation-preview {
        padding: 8px;
        background-color: white;
        border: 1px solid #eee;
        border-radius: 4px;
        min-height: 30px;
    }
</style>