<script lang="ts">
    import { getActiveEditor } from "$lexical/core/composerContext.js";
    import { INSERT_CODE_COMMAND } from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { getCommands } from "$lexical/core/commands.js";
    import { tick } from "svelte";
    import Icon from "@iconify/svelte";

    const activeEditor = getActiveEditor();

    interface Props {
        showModal?: boolean;
    }

    let { showModal = $bindable(false) }: Props = $props();

    let language = $state("javascript");
    let code = $state("");

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute($activeEditor);
    }

    function onConfirm() {
        $activeEditor.dispatchCommand(INSERT_CODE_COMMAND, { code, language });
        code = "";
        close();
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

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
</script>

{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        use:portal
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) close();
        }}
    >
        <div
            class="flex w-full max-w-md flex-col rounded-2xl bg-white dark:bg-[#303446] shadow-2xl overflow-hidden"
        >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-4"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:code-square-bold-duotone"
                                class="text-brand-gold-600"
                                width="1rem"
                            />
                        </div>
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            Insert Code Block
                        </h2>
                    </div>
                    <button
                        onclick={close}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
            >
                <!-- Language selector -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >Language</label
                    >
                    <select
                        bind:value={language}
                        class="h-9 rounded-xl cursor-pointer border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    >
                        {#each languages as lang}
                            <option class="cursor-pointer" value={lang}
                                >{lang}</option
                            >
                        {/each}
                    </select>
                </div>

                <!-- Code textarea -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >Code</label
                    >
                    <textarea
                        bind:value={code}
                        placeholder="Paste or type your code here..."
                        rows="8"
                        class="w-full resize-y rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors font-mono"
                    ></textarea>
                </div>

                <!-- Action -->
                <button
                    disabled={!code.trim()}
                    onclick={onConfirm}
                    class="h-9 cursor-pointer flex items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                >
                    <Icon icon="solar:code-square-bold" width="0.8rem" />
                    Insert Code Block
                </button>
            </div>
        </div>
    </div>
{/if}
