<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import LoginView from "./LoginView.svelte";
    import ProfileView from "./ProfileView.svelte";
    import { authSession, authLoading } from "$lib/stores/auth.store";
    import { t } from "$lib/i18n";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    let view = $derived($authSession ? "profile" : "login");

    function handleClose() {
        onClose();
    }
</script>

<svelte:window onkeydown={(e) => { if (open && e.key === 'Escape') handleClose(); }} />

{#if open}
    <!-- Backdrop -->
    <div
        role="dialog"
        aria-modal="true"
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") handleClose();
        }}
        tabindex="-1"
    >
        <!-- Modal -->
        <div
            transition:fly={{ y: 8, duration: 180, opacity: 0 }}
            class="flex w-full max-w-[440px] flex-col rounded-xl border border-brand-sand-200 dark:border-[#414559]
                   bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
            style="max-height: 90vh;"
        >
            <!-- Header -->
            <div
                class="flex items-center gap-3 border-b border-brand-gold-200 dark:border-[#414559] bg-brand-gold-100 dark:bg-[#292c3c] px-5 py-4"
            >
                <div
                    class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#363a4f] text-brand-gold-600 dark:text-brand-gold-400"
                >
                    {#if $authLoading}
                        <Icon icon="svg-spinners:ring-resize" width="0.85rem" />
                    {:else}
                        <Icon icon="solar:user-bold-duotone" width="1rem" />
                    {/if}
                </div>
                <div class="flex flex-col">
                    <span
                        class="text-sm font-semibold text-brand-charcoal-900"
                        >{$t("account.title")}</span
                    >
                    <span
                        class="text-[11px] text-brand-charcoal-300"
                    >
                        {view === "login"
                            ? $t("account.subtitle.login")
                            : $t("account.subtitle.profile")}
                    </span>
                </div>
                <button
                    onclick={handleClose}
                    class="cursor-pointer ml-auto flex h-7 w-7 items-center justify-center rounded-lg
                           bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5]
                           hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    aria-label={$t("common.close")}
                >
                    <Icon
                        icon="solar:close-circle-bold-duotone"
                        width="0.9rem"
                    />
                </button>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 pt-5"
            >
                {#if view === "login"}
                    <LoginView />
                {:else}
                    <ProfileView />
                {/if}
            </div>
        </div>
    </div>
{/if}
