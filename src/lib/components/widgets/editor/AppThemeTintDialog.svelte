<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import {
        appDarkMode,
        appLightTint,
        appDarkTint,
        LIGHT_TINTS,
        DARK_TINTS,
        type AppTint,
    } from "$lib/stores/editor.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }
    let { open, onClose }: Props = $props();

    // Which mode's tints are shown. Defaults to the mode the app is currently
    // in so the user previews the change they're most likely after.
    let activeMode = $state<"light" | "dark">("light");

    $effect(() => {
        if (open) activeMode = $appDarkMode ? "dark" : "light";
    });

    // Surface colour a tint preview swatch is mixed from (mirrors +layout.svelte).
    const PREVIEW_BASE = { light: "#f5efe4", dark: "#292c3c" };
    const STRENGTH = { light: 16, dark: 24 };

    let tints = $derived(activeMode === "light" ? LIGHT_TINTS : DARK_TINTS);
    let activeTint = $derived(
        activeMode === "light" ? $appLightTint : $appDarkTint,
    );

    // Preview background for a tint's swatch.
    function swatch(tint: AppTint): string {
        const base = PREVIEW_BASE[activeMode];
        if (!tint.color) return base;
        return `color-mix(in srgb, ${base} ${100 - STRENGTH[activeMode]}%, ${tint.color})`;
    }

    // Selecting a tint applies it immediately for live preview.
    function selectTint(tint: AppTint) {
        if (activeMode === "light") appLightTint.set(tint.id);
        else appDarkTint.set(tint.id);
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
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={handleBackdropClick}
        onkeydown={handleKeydown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-tint-select-title"
        tabindex="-1"
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-sm max-h-[85vh] flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
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
                                id="app-tint-select-title"
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                App Theme Tint
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                Give the light & dark themes a feel
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={onClose}
                        aria-label="Close"
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>

                <!-- Mode selector -->
                <div
                    class="mx-4 mb-2 flex gap-1 rounded-full bg-brand-gold-200/50 dark:bg-[#414559]/50 p-1"
                >
                    {#each [{ id: "light", label: "Light", icon: "solar:sun-bold" }, { id: "dark", label: "Dark", icon: "solar:moon-bold" }] as m (m.id)}
                        <button
                            onclick={() =>
                                (activeMode = m.id as "light" | "dark")}
                            class={`flex-1 cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1 text-[11px] font-semibold transition-colors ${
                                activeMode === m.id
                                    ? "bg-white dark:bg-[#303446] text-brand-charcoal-900 dark:text-[#c6d0f5] shadow-sm"
                                    : "text-brand-gold-600 dark:text-[#838ba7] hover:text-brand-charcoal-900 dark:hover:text-[#c6d0f5]"
                            }`}
                        >
                            <Icon icon={m.icon} width="0.85rem" />
                            {m.label}
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Tint grid -->
            <div
                class="flex-1 min-h-0 overflow-y-auto px-5 py-4 bg-brand-sand-50 dark:bg-[#232634]"
            >
                <div class="grid grid-cols-3 gap-2.5">
                    {#each tints as tint (tint.id)}
                        {@const selected = activeTint === tint.id}
                        <button
                            onclick={() => selectTint(tint)}
                            class={`cursor-pointer flex flex-col items-center gap-1.5 rounded-2xl border p-2.5 transition-all ${
                                selected
                                    ? "border-brand-gold-300 dark:border-[#e5c890]/40 bg-brand-gold-50 dark:bg-[#3b3757]"
                                    : "border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#292c3c] hover:border-brand-gold-200 dark:hover:border-[#51576d]"
                            }`}
                            aria-pressed={selected}
                        >
                            <span
                                class="relative flex h-10 w-full items-center justify-center rounded-xl border border-black/10 dark:border-white/10"
                                style="background:{swatch(tint)}"
                            >
                                {#if selected}
                                    <Icon
                                        icon="solar:check-circle-bold"
                                        class="text-brand-gold-600 dark:text-[#e5c890]"
                                        width="1.1rem"
                                    />
                                {/if}
                            </span>
                            <span
                                class="text-[10px] font-semibold truncate max-w-full {selected
                                    ? 'text-brand-charcoal-900 dark:text-[#c6d0f5]'
                                    : 'text-brand-charcoal-500 dark:text-[#a5adce]'}"
                            >
                                {tint.label}
                            </span>
                        </button>
                    {/each}
                </div>
            </div>

            <!-- Footer -->
            <div
                class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559]"
            >
                <button
                    onclick={onClose}
                    class="cursor-pointer flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold-400 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
                >
                    <Icon icon="solar:check-circle-bold" width="0.9rem" />
                    Done
                </button>
            </div>
        </div>
    </div>
{/if}
