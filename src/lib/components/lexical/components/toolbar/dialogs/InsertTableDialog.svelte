<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext.js";
    import { INSERT_TABLE_COMMAND } from "@lexical/table";
    import { getCommands } from "$lexical/core/commands.js";
    import { tick } from "svelte";
    import Icon from "@iconify/svelte";

    let rows = $state("5");
    let columns = $state("5");
    let isDisabled = $derived(
        (() => {
            const row = Number(rows);
            const column = Number(columns);
            return !(row > 0 && row <= 500 && column > 0 && column <= 50);
        })(),
    );

    const editor = getEditor();

    interface Props {
        showModal?: boolean;
    }

    let { showModal = $bindable(false) }: Props = $props();

    export function open() {
        showModal = true;
    }

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    function onConfirm() {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns,
            rows,
            includeHeaders: { rows: true, columns: false },
        });
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
</script>

{#if showModal}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        use:portal
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/30 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) close();
        }}
    >
        <div
            class="flex w-full max-w-sm flex-col rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
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
                                icon="fluent:table-16-filled"
                                class="text-brand-gold-600"
                                width="1rem"
                            />
                        </div>
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            Insert Table
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
                class="px-5 pt-5 pb-7 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
            >
                <!-- Rows -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >Rows</label
                    >
                    <input
                        type="number"
                        bind:value={rows}
                        placeholder="# of rows (1–500)"
                        min="1"
                        max="500"
                        data-test-id="table-modal-rows"
                        class="h-9 w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    />
                </div>

                <!-- Columns -->
                <div class="flex flex-col gap-1.5">
                    <label
                        class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                        >Columns</label
                    >
                    <input
                        type="number"
                        bind:value={columns}
                        placeholder="# of columns (1–50)"
                        min="1"
                        max="50"
                        data-test-id="table-modal-columns"
                        class="h-9 w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors"
                    />
                </div>

                <!-- Action -->
                <button
                    disabled={isDisabled}
                    onclick={onConfirm}
                    data-test-id="table-model-confirm-insert"
                    class="h-9 cursor-pointer flex items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
                >
                    <Icon icon="solar:table-bold" width="0.8rem" />
                    Insert Table
                </button>
            </div>
        </div>
    </div>
{/if}
