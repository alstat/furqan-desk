<!--
  "R / Python is not installed."

  Julia and Lean get an install button, because the app drives juliaup and elan
  itself. R and Python it will not install: on every platform they come from
  the system package manager, and a private copy fetched here would be the
  wrong interpreter — it would not see the user's virtualenv, their conda
  environment or their CRAN library, so every package they already have would
  appear to be missing. So this explains, offers the official download, and
  re-checks when they come back.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import { SCRIPT_LANGUAGES } from "$lib/languages/scriptLanguages";
    import {
        scriptPromptFor,
        closeScriptInstallPrompt,
        detectScriptLanguage,
    } from "$lib/stores/script-install.store";
    import { HEADER_PILL, HEADER_PILL_ACCENT, HEADER_PILL_IDLE } from "$lib/styles/editorChrome";

    const spec = $derived($scriptPromptFor ? SCRIPT_LANGUAGES[$scriptPromptFor] : null);

    let checking = $state(false);
    let checkedAndMissing = $state(false);

    async function recheck() {
        if (!$scriptPromptFor) return;
        checking = true;
        checkedAndMissing = false;
        try {
            const found = await detectScriptLanguage($scriptPromptFor, true);
            if (found) closeScriptInstallPrompt();
            else checkedAndMissing = true;
        } finally {
            checking = false;
        }
    }

    async function download() {
        if (!spec) return;
        try {
            const { openUrl } = await import("@tauri-apps/plugin-opener");
            await openUrl(spec.install.url);
        } catch {
            window.open(spec.install.url, "_blank");
        }
    }
</script>

{#if spec}
    <div
        class="fixed inset-0 z-[90] flex items-center justify-center bg-black/30"
        role="presentation"
        onclick={closeScriptInstallPrompt}
    >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            role="dialog"
            aria-modal="true"
            aria-label={$t("script_install.title", { language: spec.label })}
            class="glass-panel w-[26rem] max-w-[90vw] rounded-xl border border-brand-sand-200 bg-white p-5 shadow-xl dark:border-[#414559] dark:bg-[#292c3c]"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => {
                if (e.key === "Escape") closeScriptInstallPrompt();
            }}
        >
            <div class="mb-3 flex items-center gap-2">
                <Icon icon={spec.icon} width="1.25rem" class="shrink-0" />
                <h2
                    class="text-sm font-semibold text-brand-charcoal-800 dark:text-[#c6d0f5]"
                >
                    {$t("script_install.title", { language: spec.label })}
                </h2>
            </div>

            <p
                class="mb-4 text-[0.75rem] leading-relaxed text-brand-charcoal-500 dark:text-[#838ba7]"
            >
                {$t("script_install.body", { language: spec.label })}
            </p>

            {#if checkedAndMissing}
                <p
                    class="mb-3 rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-[0.6875rem] text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/15 dark:text-amber-200"
                >
                    {$t("script_install.still_missing", { language: spec.label })}
                </p>
            {/if}

            <div class="flex items-center justify-end gap-2">
                <button
                    onclick={closeScriptInstallPrompt}
                    class="{HEADER_PILL} {HEADER_PILL_IDLE}"
                >
                    {$t("common.close")}
                </button>
                <button
                    onclick={recheck}
                    disabled={checking}
                    class="{HEADER_PILL} {HEADER_PILL_IDLE} disabled:opacity-50"
                >
                    {$t("script_install.recheck")}
                </button>
                <button onclick={download} class="{HEADER_PILL} {HEADER_PILL_ACCENT}">
                    <Icon icon="solar:download-bold-duotone" width="0.6875rem" />
                    {$t("script_install.download", { language: spec.label })}
                </button>
            </div>
        </div>
    </div>
{/if}
