<script lang="ts">
    import { invoke } from "@tauri-apps/api/core";
    import Icon from "@iconify/svelte";

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
            error = "Subject and message are required.";
            return;
        }

        sending = true;
        try {
            await invoke("send_feedback", {
                subject: subject.trim(),
                message: message.trim(),
                fromEmail: fromEmail.trim() || null,
            });
            sent = true;
        } catch (e) {
            error =
                typeof e === "string"
                    ? e
                    : "Network error — please check your connection and try again.";
        } finally {
            sending = false;
        }
    }
</script>

{#if open}
    <div
        role="dialog"
        aria-modal="true"
        aria-label="Send Feedback"
        tabindex="-1"
        class="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-brand-charcoal-900/40 backdrop-blur-sm"
        onclick={(e) => {
            if (e.target === e.currentTarget) handleClose();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") handleClose();
        }}
    >
        <div
            class="flex w-full max-w-md flex-col rounded-2xl bg-white dark:bg-[#303446] shadow-2xl overflow-hidden"
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
                                Send Feedback
                            </h2>
                            <p
                                class="text-[11px] text-brand-charcoal-300 dark:text-[#8087a2]"
                            >
                                We'd love to hear from you
                            </p>
                        </div>
                    </div>
                    <button
                        onclick={handleClose}
                        aria-label="Close"
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:close-circle-bold" width="1rem" />
                    </button>
                </div>
            </div>

            <!-- Body -->
            <div
                class="flex-1 overflow-y-auto bg-brand-sand-50 dark:bg-[#232634] px-5 py-4 flex flex-col gap-3"
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
                                Feedback sent!
                            </p>
                            <p
                                class="mt-1 text-xs text-brand-charcoal-300 dark:text-[#8087a2] leading-relaxed"
                            >
                                Thank you — your message has been delivered<br
                                />to the AyahLab team.
                            </p>
                        </div>
                        <button
                            onclick={handleClose}
                            class="mt-2 cursor-pointer flex items-center gap-1.5 rounded-xl bg-brand-gold-400 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 transition-colors"
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
                            Your email <span class="normal-case font-normal"
                                >(optional — for a reply)</span
                            >
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
                                class="flex-1 bg-transparent text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none"
                            />
                        </div>
                    </div>

                    <!-- ── Subject ── -->
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="feedback-subject"
                            class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            Subject <span class="text-red-400">*</span>
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
                                placeholder="Bug report, feature request, question…"
                                class="flex-1 bg-transparent text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:outline-none"
                            />
                        </div>
                    </div>

                    <!-- ── Message ── -->
                    <div class="flex flex-col gap-1.5">
                        <label
                            for="feedback-message"
                            class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300 dark:text-[#8087a2]"
                        >
                            Message <span class="text-red-400">*</span>
                        </label>
                        <textarea
                            id="feedback-message"
                            bind:value={message}
                            rows="5"
                            placeholder="Describe your feedback, bug, or idea in detail…"
                            class="w-full resize-none rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 hover:border-brand-sand-400 dark:hover:border-[#51576d] transition-all"
                        ></textarea>
                    </div>

                    {#if error}
                        <p
                            class="flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400"
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
                    class="shrink-0 bg-brand-sand-50 dark:bg-[#232634] border-t border-brand-sand-200 dark:border-[#414559] px-5 py-3 flex items-center justify-end gap-3"
                >
                    <button
                        onclick={handleClose}
                        class="cursor-pointer px-4 py-2 rounded-xl text-xs font-medium text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onclick={handleSend}
                        disabled={sending || !subject.trim() || !message.trim()}
                        class="cursor-pointer flex items-center justify-center gap-1.5 rounded-xl bg-brand-gold-400 dark:bg-brand-gold-500 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {#if sending}
                            <Icon
                                icon="solar:refresh-circle-bold-duotone"
                                class="animate-spin"
                                width="0.85rem"
                            />
                            Sending…
                        {:else}
                            <Icon
                                icon="solar:plain-bold-duotone"
                                width="0.85rem"
                            />
                            Send Feedback
                        {/if}
                    </button>
                </div>
            {/if}
        </div>
    </div>
{/if}
