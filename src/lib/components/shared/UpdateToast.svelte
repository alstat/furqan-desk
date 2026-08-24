<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { getVersion } from "@tauri-apps/api/app";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import Icon from "@iconify/svelte";
    import { fade } from "svelte/transition";
    import { t } from "$lib/i18n";

    let visible = $state(false);
    let latestVersion = $state("");

    function isNewer(latest: string, current: string): boolean {
        const parts = (v: string) => v.split(".").map(Number);
        const [la, lb, lc = 0] = parts(latest);
        const [ca, cb, cc = 0] = parts(current);
        if (la !== ca) return la > ca;
        if (lb !== cb) return lb > cb;
        return lc > cc;
    }

    onMount(() => {
        setTimeout(async () => {
            try {
                const [current, latest] = await Promise.all([
                    getVersion(),
                    invoke<string>("get_latest_ayahlab_version"),
                ]);
                if (isNewer(latest, current)) {
                    latestVersion = latest;
                    visible = true;
                }
            } catch {
                // silently ignore — network errors, etc.
            }
        }, 1500);
    });
</script>

{#if visible}
    <div
        transition:fade={{ duration: 200 }}
        class="fixed top-6 right-2.5 z-[150] flex items-start gap-3 px-4 py-3
                rounded-xl w-2xs
                bg-white/90 dark:bg-[#292c3c]/95
                backdrop-blur-md
                border border-brand-sand-200 dark:border-[#414559]
                shadow-lg shadow-stone-300/30 dark:shadow-black/40"
    >
        <Icon
            icon="solar:download-minimalistic-bold-duotone"
            width="1.1rem"
            class="shrink-0 mt-0.5 text-brand-gold-500 dark:text-[#e5c890]"
        />
        <div class="flex-1 min-w-0">
            <p
                class="text-xs font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]"
            >
                {$t("update.title")}
            </p>
            <p
                class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7] mt-0.5"
            >
                {$t("update.message", { version: latestVersion })}
            </p>
            <button
                class="mt-2 text-[11px] cursor-pointer font-medium text-brand-gold-600 dark:text-[#e5c890]
                       hover:underline"
                onclick={() => openUrl("https://www.ayahlab.com/")}
            >
                {$t("update.download")}
            </button>
        </div>
        <button
            onclick={() => (visible = false)}
            class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg text-brand-charcoal-300 dark:text-[#626880] hover:text-brand-gold-600 dark:hover:text-[#e5c890] transition-colors"
            aria-label="Dismiss"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1rem" />
        </button>
    </div>
{/if}
