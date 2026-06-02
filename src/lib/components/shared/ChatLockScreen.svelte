<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import PasswordInput from "./PasswordInput.svelte";
    import {
        keyState,
        keyError,
        setupPassphrase,
        unlock,
        resetKeyAndChats,
    } from "$lib/stores/chat-key.store";

    let passphrase = $state("");
    let confirmPassphrase = $state("");
    let busy = $state(false);
    let localError = $state("");

    async function handleSetup() {
        localError = "";
        if (passphrase.length < 8) {
            localError = $t("ai_chat.lock.too_short");
            return;
        }
        if (passphrase !== confirmPassphrase) {
            localError = $t("ai_chat.lock.mismatch");
            return;
        }
        busy = true;
        try {
            await setupPassphrase(passphrase);
            passphrase = "";
            confirmPassphrase = "";
        } finally {
            busy = false;
        }
    }

    async function handleUnlock() {
        localError = "";
        if (passphrase.length === 0) return;
        busy = true;
        try {
            const ok = await unlock(passphrase);
            if (!ok) {
                localError = $t("ai_chat.lock.wrong");
            } else {
                passphrase = "";
            }
        } finally {
            busy = false;
        }
    }

    async function handleReset() {
        if (
            !confirm(
                "Reset will permanently delete all your chats. Continue?",
            )
        ) {
            return;
        }
        busy = true;
        try {
            await resetKeyAndChats();
        } finally {
            busy = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if ($keyState === "needs_setup") handleSetup();
        else if ($keyState === "locked") handleUnlock();
    }

    let isSetup = $derived($keyState === "needs_setup");
</script>

<div
    class="flex flex-1 items-center justify-center bg-brand-sand-50 dark:bg-[#232634] px-6"
>
    <div class="w-full max-w-sm flex flex-col gap-4">
        <div class="flex flex-col items-center text-center gap-2">
            <div
                class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold-100 dark:bg-[#414559]"
            >
                <Icon
                    icon={isSetup
                        ? "solar:lock-keyhole-bold-duotone"
                        : "solar:lock-keyhole-unlocked-bold-duotone"}
                    class="text-brand-gold-500 dark:text-[#e5c890]"
                    width="1.5rem"
                />
            </div>
            <h3
                class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
            >
                {isSetup
                    ? $t("ai_chat.lock.setup_title")
                    : $t("ai_chat.lock.unlock_title")}
            </h3>
            <p
                class="text-[11px] leading-relaxed text-brand-charcoal-300 dark:text-[#8087a2]"
            >
                {isSetup
                    ? $t("ai_chat.lock.setup_desc")
                    : $t("ai_chat.lock.unlock_desc")}
            </p>
        </div>

        <div class="flex flex-col gap-2">
            <PasswordInput
                bind:value={passphrase}
                onkeydown={handleKeydown}
                placeholder={$t("ai_chat.lock.passphrase")}
                disabled={busy}
                autocomplete="new-password"
                class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#1e2030] px-3 py-2 text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30"
            />
            {#if isSetup}
                <PasswordInput
                    bind:value={confirmPassphrase}
                    onkeydown={handleKeydown}
                    placeholder={$t("ai_chat.lock.confirm")}
                    disabled={busy}
                    autocomplete="new-password"
                    class="w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#1e2030] px-3 py-2 text-[12px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30"
                />
            {/if}
        </div>

        {#if localError || $keyError}
            <p class="flex items-center gap-1.5 text-[11px] text-red-500">
                <Icon icon="solar:danger-circle-bold" width="0.75rem" />
                {localError || $keyError}
            </p>
        {/if}

        <button
            onclick={isSetup ? handleSetup : handleUnlock}
            disabled={busy || passphrase.length === 0}
            class="cursor-pointer w-full rounded-xl bg-brand-gold-400 dark:bg-brand-gold-500 px-4 py-2 text-[12px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            {#if busy}
                <Icon
                    icon="solar:refresh-circle-bold-duotone"
                    class="inline animate-spin mr-1"
                    width="0.85rem"
                />
            {/if}
            {isSetup
                ? $t("ai_chat.lock.create")
                : $t("ai_chat.lock.unlock")}
        </button>

        {#if !isSetup}
            <button
                onclick={handleReset}
                disabled={busy}
                class="cursor-pointer text-center text-[10px] text-brand-charcoal-300 dark:text-[#626880] hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
                {$t("ai_chat.lock.forgot")}
            </button>
        {/if}
    </div>
</div>
