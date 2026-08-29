<script lang="ts">
    import Icon from "@iconify/svelte";
    import { fade } from "svelte/transition";
    import { t } from "$lib/i18n";
    import { activeTab } from "$lib/stores/tabs.store";
    import { appDarkMode, typstPreviewDarkMode } from "$lib/stores/editor.store";

    interface Props {
        onOpenSettings: () => void;
    }
    let { onOpenSettings }: Props = $props();

    // Opting out is permanent — the "Never remind me" button writes this and the
    // hint stops being built at all. Closing the toast only silences it until the
    // next time a Typst editor is opened.
    const NEVER_KEY = "typst-preview-dark-hint-never";

    function loadNever(): boolean {
        try {
            return localStorage.getItem(NEVER_KEY) === "true";
        } catch {
            return false;
        }
    }

    let never = $state(loadNever());
    let dismissed = $state(false);

    const typstActive = $derived($activeTab?.type === "typst");

    // Only worth suggesting while the app itself is dark: with a light app the
    // light preview is what the user asked for.
    const visible = $derived(
        typstActive &&
            $appDarkMode &&
            !$typstPreviewDarkMode &&
            !never &&
            !dismissed,
    );

    $effect(() => {
        // Leaving the Typst editor re-arms the hint for the next one.
        if (!typstActive) dismissed = false;
    });

    function neverRemind() {
        try {
            localStorage.setItem(NEVER_KEY, "true");
        } catch {
            /* ignore */
        }
        never = true;
    }

    function openSettings() {
        dismissed = true;
        onOpenSettings();
    }
</script>

{#if visible}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed top-64 right-2.5 z-[150] flex items-start gap-3 px-4 py-3
                rounded-xl w-2xs
                bg-white/90 dark:bg-[#292c3c]/95
                backdrop-blur-md
                border border-brand-sand-200 dark:border-[#414559]
                shadow-lg shadow-stone-300/30 dark:shadow-black/40"
    >
        <Icon
            icon="solar:moon-stars-bold-duotone"
            width="1.1rem"
            class="shrink-0 mt-0.5 text-brand-gold-500 dark:text-[#e5c890]"
        />
        <div class="flex-1 min-w-0">
            <p
                class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
            >
                {$t("typst_dark_hint.title")}
            </p>
            <p
                class="text-[0.6875rem] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5"
            >
                {$t("typst_dark_hint.message")}
            </p>
            <div class="mt-2 flex items-center gap-3">
                <button
                    class="text-[0.6875rem] cursor-pointer font-medium text-brand-gold-600 dark:text-[#e5c890]
                           hover:underline"
                    onclick={openSettings}
                >
                    {$t("typst_dark_hint.open_settings")}
                </button>
                <button
                    class="text-[0.6875rem] cursor-pointer font-medium text-brand-charcoal-400 dark:text-[#838ba7]
                           hover:text-brand-charcoal-600 dark:hover:text-[#c6d0f5] hover:underline transition-colors"
                    onclick={neverRemind}
                >
                    {$t("typst_dark_hint.never")}
                </button>
            </div>
        </div>
        <button
            onclick={() => (dismissed = true)}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label={$t("typst_dark_hint.dismiss")}
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
