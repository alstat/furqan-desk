<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import Icon from "@iconify/svelte";
    import { fly } from "svelte/transition";
    import { t } from "$lib/i18n";
    import { isPro } from "$lib/stores/auth.store";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    let fromEmail = $state("");
    let subject = $state("");
    let message = $state("");
    let sending = $state(false);
    let sent = $state(false);
    let error = $state("");

    function reset() {
        fromEmail = "";
        subject = "";
        message = "";
        sending = false;
        sent = false;
        error = "";
    }

    function handleClose() {
        reset();
        onClose();
    }

    async function handleSend() {
        error = "";
        if (!subject.trim() || !message.trim()) {
            error = $t("feedback.error_required");
            return;
        }

        sending = true;
        try {
            await invoke("send_feedback", {
                subject: subject.trim(),
                message: message.trim(),
                fromEmail: fromEmail.trim() || null,
                isPro: $isPro,
            });
            sent = true;
        } catch (e) {
            error = typeof e === "string" ? e : $t("feedback.error_network");
        } finally {
            sending = false;
        }
    }
</script>

{#if open}
    <div
        role="dialog"
        aria-modal="true"
        aria-label={$t("feedback.title")}
        tabindex="-1"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/30 backdrop-blur-sm"
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
                                icon="solar:chat-round-dots-bold-duotone"
                                class="text-brand-gold-500 dark:text-[#e5c890]"
                                width="1rem"
                            />
                        </div>
                        <div>
                            <h2
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("feedback.title")}
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]"
                            >
                                {$t("feedback.subtitle")}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <!-- Account tier indicator -->
                        {#if $isPro}
                            <div
                                class="flex h-7 items-center gap-1 rounded-lg bg-brand-gold-400 dark:bg-brand-gold-500 px-2 text-[10px] font-semibold text-gray-100 dark:text-gray-800"
                            >
                                <Icon icon="solar:crown-bold" width="1rem" />
                                Pro
                            </div>
                        {:else}
                            <div
                                class="flex h-7 items-center gap-1 rounded-lg bg-brand-sand-100 dark:bg-[#414559] px-2 text-[10px] font-semibold text-brand-charcoal-400 dark:text-[#a5adce]"
                            >
                                <Icon icon="solar:user-bold" width="1rem" />
                                Free
                            </div>
                        {/if}
                        <button
                            onclick={handleClose}
                            aria-label={$t("common.close")}
                            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                        >
                            <Icon
                                icon="solar:close-circle-bold-duotone"
                                width="1rem"
                            />
                        </button>
                    </div>
                </div>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 py-5 flex flex-col gap-3"
            >
                {#if sent}
                    <!-- ── Success state ── -->
                    <div
                        class="flex flex-col items-center gap-3 py-10 text-center"
                    >
                        <div
                            class="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold-100 dark:bg-[#414559]"
                        >
                            <Icon
                                icon="solar:check-circle-bold-duotone"
                                class="text-brand-gold-500 dark:text-[#e5c890]"
                                width="2rem"
                            />
                        </div>
                        <div>
                            <p
                                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                            >
                                {$t("feedback.success_title")}
                            </p>
                            <p
                                class="mt-1 text-[11px] text-brand-charcoal-300 dark:text-[#8087a2] leading-relaxed"
                            >
                                {$t("feedback.success_message")}
                            </p>
                        </div>
                        <button
                            onclick={handleClose}
                            class="mt-2 cursor-pointer flex items-center gap-1.5 rounded-xl bg-brand-gold-400 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 transition-colors"
                        >
                            <Icon
                                icon="solar:check-circle-bold"
                                width="0.8rem"
                            />
                            Close
                        </button>
                    </div>
                {:else}
                    <!-- ── Your email (optional) ── -->
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="feedback-email"
                            class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            {$t("feedback.email")}
                        </label>
                        <div
                            class="flex items-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 focus-within:border-brand-gold-400 focus-within:ring-2 focus-within:ring-brand-gold-100 dark:focus-within:ring-brand-gold-900/30 transition-colors"
                        >
                            <Icon
                                icon="solar:letter-bold-duotone"
                                class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                                width="0.85rem"
                            />
                            <input
                                id="feedback-email"
                                type="email"
                                bind:value={fromEmail}
                                placeholder="your@email.com"
                                class="flex-1 bg-transparent text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none"
                            />
                        </div>
                    </div>

                    <!-- ── Subject ── -->
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="feedback-subject"
                            class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            {$t("feedback.subject")}
                            <span class="text-red-400">*</span>
                        </label>
                        <div
                            class="flex items-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 focus-within:border-brand-gold-400 focus-within:ring-2 focus-within:ring-brand-gold-100 dark:focus-within:ring-brand-gold-900/30 transition-colors"
                        >
                            <Icon
                                icon="solar:tag-bold-duotone"
                                class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
                                width="0.85rem"
                            />
                            <input
                                id="feedback-subject"
                                type="text"
                                bind:value={subject}
                                placeholder={$t("feedback.subject_placeholder")}
                                class="flex-1 bg-transparent text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none"
                            />
                        </div>
                    </div>

                    <!-- ── Message ── -->
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="feedback-message"
                            class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            {$t("feedback.message")}
                            <span class="text-red-400">*</span>
                        </label>
                        <textarea
                            id="feedback-message"
                            bind:value={message}
                            rows="5"
                            placeholder={$t("feedback.message_placeholder")}
                            class="w-full resize-none rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 hover:border-brand-sand-400 dark:hover:border-[#51576d] transition-all"
                        ></textarea>
                    </div>

                    {#if error}
                        <p
                            class="flex items-center gap-1.5 text-[11px] text-red-500 dark:text-red-400"
                        >
                            <Icon
                                icon="solar:danger-circle-bold"
                                width="0.75rem"
                            />
                            {error}
                        </p>
                    {/if}
                {/if}
            </div>

            <!-- Footer -->
            {#if !sent}
                <div
                    class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3 flex items-center justify-end gap-2"
                >
                    <button
                        onclick={handleClose}
                        class="cursor-pointer px-4 py-1.5 rounded-full text-[11px] font-medium text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446] transition-colors"
                    >
                        {$t("common.cancel")}
                    </button>
                    <button
                        onclick={handleSend}
                        disabled={sending || !subject.trim() || !message.trim()}
                        class="cursor-pointer flex items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {#if sending}
                            <Icon
                                icon="solar:refresh-circle-bold-duotone"
                                class="animate-spin"
                                width="0.85rem"
                            />
                            {$t("feedback.sending")}
                        {:else}
                            <Icon
                                icon="solar:plain-bold-duotone"
                                width="0.85rem"
                            />
                            {$t("feedback.send")}
                        {/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
