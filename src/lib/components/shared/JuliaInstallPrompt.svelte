<script lang="ts">
    import { t } from "$lib/i18n";
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import {
        juliaPromptOpen,
        closeJuliaInstallPrompt,
        installJulia,
        juliaInstallState,
        juliaInstallMessage,
        juliaInstallError,
    } from "$lib/stores/julia-install.store";

    const JULIA_DOWNLOADS_URL = "https://julialang.org/downloads/";

    // Local "finished successfully" flag so we can show a success view instead of
    // immediately closing — installs can take minutes and users want confirmation.
    let installed = $state(false);

    let busy = $derived($juliaInstallState === "updating");

    async function handleInstall() {
        installed = false;
        try {
            await installJulia();
            installed = true;
        } catch {
            // Error surfaced via juliaInstallError; the dialog stays open.
        }
    }

    function handleClose() {
        if (busy) return;
        installed = false;
        closeJuliaInstallPrompt();
    }
</script>

{#if $juliaPromptOpen}
    <div
        role="dialog"
        aria-modal="true"
        aria-label={$t("julia.prompt.title")}
        tabindex="-1"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") handleClose();
        }}
    >
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-sm flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
            style="max-height: 90vh;"
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
                                icon="solar:code-bold-duotone"
                                class="text-brand-gold-500 dark:text-[#e5c890]"
                                width="1rem"
                            />
                        </div>
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                        >
                            {$t("julia.prompt.title")}
                        </h2>
                    </div>
                    <button
                        onclick={handleClose}
                        disabled={busy}
                        aria-label={$t("julia.prompt.close")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 py-4 flex flex-col gap-4"
            >
                {#if installed}
                    <div class="flex items-start gap-2.5">
                        <Icon
                            icon="solar:check-circle-bold-duotone"
                            class="mt-0.5 shrink-0 text-green-600 dark:text-green-400"
                            width="1.2rem"
                        />
                        <p
                            class="text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        >
                            {$t("julia.prompt.success")}
                        </p>
                    </div>
                {:else}
                    <p
                        class="text-[12px] leading-relaxed text-brand-charcoal-500 dark:text-[#c6d0f5]"
                    >
                        {$t("julia.prompt.desc")}
                    </p>

                    {#if busy}
                        <div
                            class="flex items-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-3 py-2"
                        >
                            <Icon
                                icon="svg-spinners:ring-resize"
                                width="0.9rem"
                                class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
                            />
                            <span
                                class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] truncate"
                            >
                                {$juliaInstallMessage || $t("julia.prompt.installing")}
                            </span>
                        </div>
                    {/if}

                    {#if $juliaInstallState === "error" && $juliaInstallError}
                        <div
                            class="rounded-xl border border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 px-3 py-2"
                        >
                            <p
                                class="text-[11px] font-semibold text-red-600 dark:text-red-400"
                            >
                                {$t("julia.prompt.error_title")}
                            </p>
                            <p
                                class="mt-0.5 text-[11px] text-red-500 dark:text-red-300/90 break-words"
                            >
                                {$juliaInstallError}
                            </p>
                            <button
                                onclick={() => openUrl(JULIA_DOWNLOADS_URL)}
                                class="mt-1.5 cursor-pointer text-[11px] font-medium text-brand-gold-600 dark:text-[#e5c890] hover:underline"
                            >
                                julialang.org/downloads
                            </button>
                        </div>
                    {/if}

                    <p
                        class="text-[10.5px] text-brand-charcoal-300 dark:text-[#8087a2]"
                    >
                        {$t("julia.prompt.settings_hint")}
                    </p>
                {/if}
            </div>

            <!-- Footer -->
            <div
                class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3 flex items-center justify-end gap-2"
            >
                {#if installed}
                    <button
                        onclick={handleClose}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 transition-colors"
                    >
                        <Icon icon="solar:check-circle-bold-duotone" width="0.8rem" />
                        {$t("julia.prompt.done")}
                    </button>
                {:else}
                    <button
                        onclick={handleClose}
                        disabled={busy}
                        class="cursor-pointer rounded-full border border-brand-sand-200 dark:border-[#414559] px-4 py-1.5 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#292c3c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {$t("julia.prompt.cancel")}
                    </button>
                    <button
                        onclick={handleInstall}
                        disabled={busy}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {#if busy}
                            <Icon icon="svg-spinners:ring-resize" width="0.8rem" />
                            {$t("julia.prompt.installing")}
                        {:else}
                            <Icon icon="solar:download-bold-duotone" width="0.8rem" />
                            {$t("julia.prompt.install")}
                        {/if}
                    </button>
                {/if}
            </div>
        </div>
    </div>
{/if}
