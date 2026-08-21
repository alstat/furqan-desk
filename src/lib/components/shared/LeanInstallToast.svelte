<script lang="ts">
    // Floating indicator for a Lean install/update running in the background —
    // i.e. after the user dismissed the install prompt (or closed Settings)
    // while the download continues. The install itself lives in
    // lean-install.store, so it keeps running regardless of any dialog; this
    // just surfaces its progress and final result so the user can keep working.
    //
    // Stacked above JuliaInstallToast rather than on top of it, since both
    // toolchains can legitimately be installing at once.
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { t } from "$lib/i18n";
    import IndeterminateProgress from "./IndeterminateProgress.svelte";
    import {
        leanInstallState,
        leanInstallMessage,
        leanInstallError,
        leanSettingsOpen,
        leanPromptOpen,
    } from "$lib/stores/lean-install.store";

    type Kind = "updating" | "success" | "error" | null;
    let kind = $state<Kind>(null);

    // Non-reactive bookkeeping for detecting background completions.
    let prevState = "idle";
    let showedUpdating = false;
    let successTimer: ReturnType<typeof setTimeout> | null = null;

    // Settings shows progress inline, so suppress the toast while it is open.
    // The install prompt no longer shows progress — it hands off to this toast
    // the moment Install is pressed — but it can be reopened, and two overlaid
    // progress reports would be noise.
    let modalOpen = $derived($leanSettingsOpen || $leanPromptOpen);

    $effect(() => {
        const state = $leanInstallState;
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
                    successTimer = setTimeout(() => (kind = null), 5000);
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
        class="fixed bottom-28 right-2.5 z-[150] flex items-start gap-3 px-4 py-3
               rounded-3xl w-2xs
               bg-white/90 dark:bg-[#292c3c]/95
               backdrop-blur-md
               border border-brand-sand-200 dark:border-[#414559]
               shadow-lg shadow-stone-300/30 dark:shadow-black/40"
    >
        {#if kind === "updating"}
            <Icon
                icon="solar:verified-check-bold-duotone"
                width="1.1rem"
                class="shrink-0 mt-0.5 text-brand-gold-500 dark:text-[#e5c890]"
            />
            <div class="flex-1 min-w-0">
                <p
                    class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
                >
                    {$t("settings.lean.updating")}
                </p>
                <p
                    class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5 truncate"
                >
                    {$leanInstallMessage || $t("settings.lean.updating")}
                </p>
                <IndeterminateProgress
                    class="mt-2"
                    ariaLabel={$t("settings.lean.updating")}
                />
                <p
                    class="text-[10.5px] text-brand-charcoal-300 dark:text-[#626880] mt-1.5"
                >
                    {$t("settings.lean.background_hint")}
                </p>
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
                    {$t("settings.lean.update_done")}
                </p>
                <p
                    class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5"
                >
                    {$t("lean.prompt.success")}
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
                    {$t("settings.lean.update_failed")}
                </p>
                <p
                    class="text-[11px] text-red-500 dark:text-red-300/90 mt-0.5 break-words"
                >
                    {$leanInstallError}
                </p>
            </div>
        {/if}
        <button
            onclick={dismiss}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label={$t("lean.prompt.close")}
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
