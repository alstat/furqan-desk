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

    import { tick, onMount } from "svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import { $getNodeByKey as getNodeByKey } from "lexical";
    import { $isCodeNode as isCodeNode } from "./CodeNode";
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";

    interface Props {
        code?: string;
        language?: string;
        nodeKey?: string;
        autoEdit?: boolean;
    }

    let {
        code = "",
        language = "javascript",
        nodeKey = "",
        autoEdit = false,
    }: Props = $props();

    const editor = getEditor();

    let isEditing = $state(autoEdit);
    let editCode = $state(code);
    let editLanguage = $state(language);
    let codeEl: HTMLElement | null = $state(null);
    let textareaEl: HTMLTextAreaElement | null = $state(null);

    const languages = [
        "javascript",
        "typescript",
        "python",
        "julia",
        "r",
        "css",
        "html",
        "sql",
        "json",
        "yaml",
        "bash",
    ];

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
            }
        });
        // Immediately update the displayed code before Lexical's async commit
        if (codeEl) {
            codeEl.innerHTML = editCode;
            codeEl.removeAttribute("data-highlighted");
            hljs.highlightElement(codeEl as HTMLElement);
        }
        isEditing = false;
    }

    function handleCancel() {
        isEditing = false;
    }

    function handleKeydown(event: KeyboardEvent) {
        event.stopPropagation();
        if (event.key === "Escape") {
            event.preventDefault();
            handleCancel();
        } else if (event.key === "Tab") {
            event.preventDefault();
            const ta = event.currentTarget as HTMLTextAreaElement;
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            editCode =
                editCode.substring(0, start) + "    " + editCode.substring(end);
            tick().then(() => {
                ta.selectionStart = ta.selectionEnd = start + 4;
            });
        }
    }

    onMount(() => {
        if (autoEdit) {
            editor.update(() => {
                const node = getNodeByKey(nodeKey);
                if (node && isCodeNode(node)) {
                    node.setAutoEdit(false);
                }
            });
            // Defer focus until after Lexical finishes processing the key event
            // that triggered the markdown shortcut, otherwise ContentEditable steals focus
            setTimeout(() => textareaEl?.focus(), 0);
        }
    });

    // Re-highlight when code/language props update (e.g. after Lexical commits a save)
    $effect(() => {
        if (!isEditing && codeEl) {
            codeEl.innerHTML = code;
            codeEl.removeAttribute("data-highlighted");
            hljs.highlightElement(codeEl as HTMLElement);
        }
    });
</script>

{#if isEditing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="my-1">
        <div
            class="flex flex-col rounded-xl border border-brand-gold-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-lg overflow-hidden"
        >
            <!-- Header -->
            <span
                class="flex items-center justify-between bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-3 py-2"
            >
                <span class="flex items-center gap-1.5">
                    <span
                        class="flex h-5 w-5 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559]"
                    >
                        <Icon
                            icon="solar:code-square-bold-duotone"
                            class="text-brand-gold-600"
                            width="0.65rem"
                        />
                    </span>
                    <span
                        class="font-sans text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >{$t("editor.code.edit_title")}</span
                    >
                </span>
                <span class="flex items-center gap-0.5">
                    <!-- Language select -->
                    <span class="relative">
                        <select
                            bind:value={editLanguage}
                            class="appearance-none cursor-pointer rounded-xl border border-brand-gold-200 bg-brand-sand-50/80 pl-2 pr-6 py-1 text-[10px] font-sans text-brand-charcoal-500 dark:border-[#414559] dark:bg-[#1e2030]/80 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100 dark:hover:bg-[#292c3c] dark:[color-scheme:dark]"
                        >
                            {#each languages as lang}
                                <option value={lang}>{lang}</option>
                            {/each}
                        </select>
                        <span
                            class="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-brand-charcoal-300 dark:text-[#626880]"
                        >
                            <Icon
                                icon="charm:chevron-down"
                                class="mr-2"
                                width="0.6rem"
                            />
                        </span>
                    </span>
                    <!-- Save -->
                    <button
                        onclick={handleSave}
                        title={$t("common.save")}
                        class="cursor-pointer flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 font-sans active:bg-brand-gold-600/90 transition-colors"
                    >
                        {$t("common.save")}
                    </button>
                    <!-- Cancel -->
                    <button
                        onclick={handleCancel}
                        title={$t("common.cancel")}
                        aria-label={$t("common.cancel")}
                        class="cursor-pointer flex h-5 w-5 items-center justify-center rounded-lg
                               bg-brand-gold-200 dark:bg-[#414559]
                               text-brand-gold-600 dark:text-[#c6d0f5]
                               hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors ml-2"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="0.8rem"
                        />
                    </button>
                </span>
            </span>
            <!-- Textarea -->
            <span class="px-3 pt-2.5 pb-1.5 bg-brand-sand-50 dark:bg-[#232634]">
                <!-- svelte-ignore a11y_autofocus -->
                <textarea
                    bind:this={textareaEl}
                    bind:value={editCode}
                    onkeydown={handleKeydown}
                    autofocus
                    autocorrect="off"
                    dir="ltr"
                    rows="10"
                    placeholder={$t("dialog.insert_code.placeholder")}
                    class="w-full resize-y rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-2.5 py-2 font-mono text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                ></textarea>
            </span>
        </div>
    </div>
{:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <pre
        dir="ltr"
        class="language-{language} cursor-pointer"
        title={$t("editor.dblclick_hint")}
        ondblclick={handleDoubleClick}><code bind:this={codeEl}></code></pre>
{/if}
