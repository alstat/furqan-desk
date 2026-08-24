<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fade, fly } from "svelte/transition";
    import { t } from "$lib/i18n";
    import {
        editorTheme,
        editorThemeSlots,
        ALL_EDITOR_THEMES,
        type EditorTheme,
        type EditorThemeInfo,
    } from "$lib/stores/editor.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    // Local dialog state — two theme slots and which is focused for assignment.
    let dialogSlots = $state<[EditorTheme, EditorTheme]>([...$editorThemeSlots]);
    let focusedSlot = $state<0 | 1>(0);

    // Reset local state each time the dialog opens.
    $effect(() => {
        if (open) {
            dialogSlots = [...$editorThemeSlots];
            focusedSlot = 0;
        }
    });

    function slotIndexOf(id: EditorTheme): 0 | 1 | null {
        if (dialogSlots[0] === id) return 0;
        if (dialogSlots[1] === id) return 1;
        return null;
    }

    const lightThemes = ALL_EDITOR_THEMES.filter((th) => !th.dark);
    const darkThemes = ALL_EDITOR_THEMES.filter((th) => th.dark);

    function assignTheme(theme: EditorThemeInfo) {
        // The same theme can't occupy both slots.
        const otherSlot = focusedSlot === 0 ? 1 : 0;
        if (dialogSlots[otherSlot] === theme.id) return;
        dialogSlots[focusedSlot] = theme.id;
        // Auto-advance focus to the other slot once one is picked.
        focusedSlot = otherSlot;
    }

    function handleDone() {
        editorThemeSlots.set(dialogSlots);
        // If the active theme is no longer one of the two slots, switch to the
        // first slot so the toolbar selection stays consistent.
        if (!dialogSlots.includes($editorTheme)) {
            editorTheme.set(dialogSlots[0]);
        }
        onClose();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") onClose();
    }

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === e.currentTarget) onClose();
    }
</script>

{#if open}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-theme-select-title"
        tabindex="-1"
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-sm max-h-[85vh] flex-col rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        >
            <!-- Header -->
            <div
                class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559]"
            >
                <div class="flex items-center justify-between px-5 py-4">
                    <div class="flex items-center gap-2.5">
                        <div
                            class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:palette-bold-duotone"
                                class="text-brand-gold-500"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                id="editor-theme-select-title"
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("editor_theme_select.title")}
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("editor_theme_select.subtitle")}
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={onClose}
                        aria-label={$t("common.close")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>

                <!-- Slot selector -->
                <div
                    class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 dark:bg-[#414559]/50 p-1"
                >
                    {#each [0, 1] as slotIdx (slotIdx)}
                        {@const slotId = dialogSlots[slotIdx]}
                        {@const info = ALL_EDITOR_THEMES.find(
                            (t) => t.id === slotId,
                        )}
                        <button
                            onclick={() => {
                                focusedSlot = slotIdx as 0 | 1;
                            }}
                            class={`flex-1 cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors ${
                                focusedSlot === slotIdx
                                    ? "bg-white dark:bg-[#303446] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm"
                                    : "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                            }`}
                        >
                            <span
                                class="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold
                                       {focusedSlot === slotIdx
                                    ? 'bg-brand-gold-400 dark:bg-[#e5c890] text-white dark:text-[#292c3c]'
                                    : 'bg-brand-gold-200 dark:bg-[#51576d] text-brand-gold-600 dark:text-[#838ba7]'}"
                            >
                                {slotIdx + 1}
                            </span>
                            {info?.label ?? $t("editor_theme_select.slot_n", { n: String(slotIdx + 1) })}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Theme list -->
            <div
                class="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-brand-sand-50 dark:bg-[#232634]"
            >
                {#snippet themeItem(theme: EditorThemeInfo)}
                    {@const slotIdx = slotIndexOf(theme.id)}
                    {@const isOtherSlot =
                        slotIdx !== null && slotIdx !== focusedSlot}
                    {@const isSelected = slotIdx !== null}
                    {@const isSameAsOther =
                        dialogSlots[focusedSlot === 0 ? 1 : 0] === theme.id}
                    <button
                        onclick={() => assignTheme(theme)}
                        disabled={isSameAsOther}
                        class={`w-full cursor-pointer flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition-all
                            disabled:opacity-40 disabled:cursor-not-allowed
                            ${
                                isSelected && !isOtherSlot
                                    ? "border-brand-gold-400 dark:border-[#e5c890]/40 bg-brand-gold-50 dark:bg-[#3b3757]"
                                    : "border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] hover:border-brand-gold-200 dark:hover:border-[#51576d] hover:bg-brand-gold-50 dark:hover:bg-[#3b3757]"
                            }`}
                        aria-pressed={isSelected}
                    >
                        <div class="flex items-center gap-2.5 min-w-0">
                            <!-- Theme swatch -->
                            <div
                                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-black/10 dark:border-white/10"
                                style="background:{theme.bg}"
                            >
                                <span
                                    class="h-2.5 w-2.5 rounded-full"
                                    style="background:{theme.accent}"
                                ></span>
                            </div>
                            <div class="min-w-0">
                                <p
                                    class="text-[11px] font-semibold truncate
                                           {isSelected && !isOtherSlot
                                        ? 'text-brand-charcoal-900 dark:text-[#c6d0f5]'
                                        : 'text-brand-charcoal-500 dark:text-[#a5adce]'}"
                                >
                                    {theme.label}
                                </p>
                            </div>
                        </div>

                        <!-- Slot badge -->
                        {#if isSelected}
                            <span
                                class="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
                                       {isOtherSlot
                                    ? 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-300 dark:text-[#626880]'
                                    : 'bg-brand-gold-400 dark:bg-[#e5c890] text-white dark:text-[#292c3c]'}"
                                aria-hidden="true"
                            >
                                {(slotIdx ?? 0) + 1}
                            </span>
                        {:else}
                            <span
                                class="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-brand-sand-200 dark:border-[#414559] text-[10px] text-brand-charcoal-300 dark:text-[#626880]"
                                aria-hidden="true"
                            >
                                {focusedSlot + 1}
                            </span>
                        {/if}
                    </button>
                {/snippet}

                {#snippet groupHeader(icon: string, label: string)}
                    <div
                        class="flex items-center gap-1.5 px-1 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        <Icon {icon} width="0.85rem" />
                        <span>{label}</span>
                        <div
                            class="flex-1 h-px bg-brand-sand-200 dark:bg-[#414559] ml-1"
                        ></div>
                    </div>
                {/snippet}

                {#if lightThemes.length}
                    {@render groupHeader(
                        "solar:sun-bold-duotone",
                        $t("editor_theme_select.light"),
                    )}
                    <div class="space-y-2 mb-4">
                        {#each lightThemes as theme (theme.id)}
                            {@render themeItem(theme)}
                        {/each}
                    </div>
                {/if}

                {#if darkThemes.length}
                    {@render groupHeader(
                        "solar:moon-bold-duotone",
                        $t("editor_theme_select.dark"),
                    )}
                    <div class="space-y-2">
                        {#each darkThemes as theme (theme.id)}
                            {@render themeItem(theme)}
                        {/each}
                    </div>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559]"
            >
                <button
                    onclick={handleDone}
                    class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
                >
                    <Icon icon="solar:check-circle-bold" width="0.9rem" />
                    {$t("editor_theme_select.done")}
                </button>
            </div>
        </div>
    </div>
{/if}
