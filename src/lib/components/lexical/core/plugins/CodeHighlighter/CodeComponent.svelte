<script lang="ts">
    import hljs from "highlight.js/lib/core";
    import javascript from "highlight.js/lib/languages/javascript";
    import r from "highlight.js/lib/languages/r";
    import python from "highlight.js/lib/languages/python";
    import julia from "highlight.js/lib/languages/julia";
    import typescript from "highlight.js/lib/languages/typescript";
    import css from "highlight.js/lib/languages/css";
    import html from "highlight.js/lib/languages/xml";
    import sql from "highlight.js/lib/languages/sql";
    import json from "highlight.js/lib/languages/json";
    import yaml from "highlight.js/lib/languages/yaml";
    import bash from "highlight.js/lib/languages/bash";

    hljs.registerLanguage("javascript", javascript);
    hljs.registerLanguage("r", r);
    hljs.registerLanguage("python", python);
    hljs.registerLanguage("julia", julia);
    hljs.registerLanguage("typescript", typescript);
    hljs.registerLanguage("css", css);
    hljs.registerLanguage("html", html);
    hljs.registerLanguage("sql", sql);
    hljs.registerLanguage("json", json);
    hljs.registerLanguage("yaml", yaml);
    hljs.registerLanguage("bash", bash);

    import { onMount } from "svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { $isCodeNode as isCodeNode } from "./CodeNode";
    import Icon from "@iconify/svelte";

    interface Props {
        codeDOM: HTMLElement;
        code?: string;
        language?: string;
        nodeKey?: string;
    }

    let { codeDOM, code = '', language = 'javascript', nodeKey = '' }: Props = $props();

    const editor = getEditor();

    let isEditing = $state(false);
    let editCode = $state(code);
    let editLanguage = $state(language);

    const languages = [
        'javascript', 'typescript', 'python', 'julia', 'r',
        'css', 'html', 'sql', 'json', 'yaml', 'bash'
    ];

    function highlight() {
        const codeEl = codeDOM.querySelector('code') ?? codeDOM;
        // reset so hljs re-highlights on content change
        codeEl.removeAttribute('data-highlighted');
        hljs.highlightElement(codeEl as HTMLElement);
    }

    function handleDoubleClick() {
        editCode = code;
        editLanguage = language;
        isEditing = true;
    }

    function handleSave() {
        editor.update(() => {
            const node = getNodeByKey(nodeKey);
            if (node && isCodeNode(node)) {
                node.setCode(editCode);
                node.setLanguage(editLanguage);
                // Update the DOM directly so highlight runs correctly
                const codeEl = codeDOM.querySelector('code');
                if (codeEl) {
                    codeEl.innerHTML = editCode;
                    codeEl.removeAttribute('data-highlighted');
                    hljs.highlightElement(codeEl as HTMLElement);
                }
                codeDOM.className = 'language-' + editLanguage;
            }
        });
        isEditing = false;
    }

    function handleCancel() {
        isEditing = false;
    }

    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            event.preventDefault();
            handleCancel();
        }
    }

    onMount(() => {
        highlight();
        codeDOM.addEventListener('dblclick', handleDoubleClick);
        codeDOM.style.cursor = 'pointer';
        codeDOM.title = 'Double-click to edit';
        return () => {
            codeDOM.removeEventListener('dblclick', handleDoubleClick);
        };
    });
</script>

{#if isEditing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="my-1 rounded-2xl border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-lg overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-4 py-2.5">
            <div class="flex items-center gap-2">
                <div class="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559]">
                    <Icon icon="solar:code-square-bold-duotone" class="text-brand-gold-600" width="0.75rem" />
                </div>
                <span class="text-xs font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]">Edit Code Block</span>
            </div>
            <div class="flex items-center gap-1.5">
                <select
                    bind:value={editLanguage}
                    class="h-7 rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-2 text-[10px] text-brand-charcoal-900 dark:text-[#c6d0f5] focus:border-brand-gold-400 focus:outline-none transition-colors"
                >
                    {#each languages as lang}
                        <option value={lang}>{lang}</option>
                    {/each}
                </select>
                <button
                    onclick={handleSave}
                    title="Save"
                    class="cursor-pointer flex items-center gap-1 rounded-lg bg-brand-gold-400 px-2.5 py-1 text-[10px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
                >
                    <Icon icon="solar:check-circle-bold" width="0.65rem" />
                    Save
                </button>
                <button
                    onclick={handleCancel}
                    title="Cancel (Esc)"
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
                >
                    <Icon icon="solar:close-circle-bold" width="0.8rem" />
                </button>
            </div>
        </div>
        <!-- Textarea -->
        <!-- svelte-ignore a11y_autofocus -->
        <textarea
            bind:value={editCode}
            onkeydown={handleKeydown}
            autofocus
            rows="10"
            placeholder="Paste or type your code here..."
            class="w-full resize-y bg-brand-sand-50 dark:bg-[#232634] px-4 py-3 font-mono text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none"
        ></textarea>
    </div>
{/if}
