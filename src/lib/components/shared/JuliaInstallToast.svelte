<script lang="ts">
    // Floating indicator for a Julia install/update that is running in the
    // background — i.e. after the user closed the Settings dialog (or the
    // install prompt) while the work continues. The install itself lives in
    // julia-install.store, so it keeps running regardless of any dialog; this
    // just surfaces its progress and final result.
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { t } from "$lib/i18n";
    import IndeterminateProgress from "./IndeterminateProgress.svelte";
    import {
        juliaInstallState,
        juliaInstallMessage,
        juliaInstallError,
        juliaSettingsOpen,
        juliaPromptOpen,
    } from "$lib/stores/julia-install.store";

    type Kind = "updating" | "success" | "error" | null;
    let kind = $state<Kind>(null);

    // Non-reactive bookkeeping for detecting background completions.
    let prevState = "idle";
    let showedUpdating = false;
    let successTimer: ReturnType<typeof setTimeout> | null = null;

    // A modal (Settings or the install prompt) already shows progress inline,
    // so suppress the toast while one is open.
    let modalOpen = $derived($juliaSettingsOpen || $juliaPromptOpen);

    $effect(() => {
        const state = $juliaInstallState;
        const hidden = modalOpen;

        if (state === "updating") {
            kind = hidden ? null : "updating";
            if (!hidden) showedUpdating = true;
        } else if (prevState === "updating") {
            // The background job just finished.
            if (showedUpdating && !hidden) {
                if (state === "error") {
                    kind = "error";
                } else {
                    kind = "success";
                    if (successTimer) clearTimeout(successTimer);
                    successTimer = setTimeout(() => (kind = null), 4000);
                }
            } else {
                kind = null;
            }
            showedUpdating = false;
        }

        prevState = state;
    });

    function dismiss() {
        if (successTimer) clearTimeout(successTimer);
        kind = null;
    }
</script>

{#if kind}
    <div
        transition:fly={{ y: 8, duration: 200, opacity: 0 }}
        class="fixed bottom-6 right-2.5 z-[150] flex items-start gap-3 px-4 py-3
               rounded-3xl w-2xs
               bg-white/90 dark:bg-[#292c3c]/95
               backdrop-blur-md
               border border-brand-sand-200 dark:border-[#414559]
               shadow-lg shadow-stone-300/30 dark:shadow-black/40"
    >
        {#if kind === "updating"}
            <Icon
                icon="solar:code-bold-duotone"
                width="1.1rem"
                class="shrink-0 mt-0.5 text-brand-gold-500 dark:text-[#e5c890]"
            />
            <div class="flex-1 min-w-0">
                <p
                    class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
                >
                    {$t("settings.julia.updating")}
                </p>
                <p
                    class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5 truncate"
                >
                    {$juliaInstallMessage || $t("settings.julia.updating")}
                </p>
                <IndeterminateProgress
                    class="mt-2"
                    ariaLabel={$t("settings.julia.updating")}
                />
            </div>
        {:else if kind === "success"}
            <Icon
                icon="solar:check-circle-bold-duotone"
                width="1.1rem"
                class="shrink-0 mt-0.5 text-green-600 dark:text-green-400"
            />
            <div class="flex-1 min-w-0">
                <p
                    class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
                >
                    {$t("settings.julia.update_done")}
                </p>
            </div>
        {:else}
            <Icon
                icon="solar:danger-triangle-bold-duotone"
                width="1.1rem"
                class="shrink-0 mt-0.5 text-red-500 dark:text-red-400"
            />
            <div class="flex-1 min-w-0">
                <p
                    class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
                >
                    {$t("settings.julia.update_failed")}
                </p>
                <p
                    class="text-[11px] text-red-500 dark:text-red-300/90 mt-0.5 break-words"
                >
                    {$juliaInstallError}
                </p>
            </div>
        {/if}
        <button
            onclick={dismiss}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label={$t("julia.prompt.close")}
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
