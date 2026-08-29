<script lang="ts">
    import { fade } from "svelte/transition";
    import { cubicInOut } from "svelte/easing";

    let { visible }: { visible: boolean } = $props();
</script>

{#if visible}
    <div
        transition:fade={{ duration: 600, easing: cubicInOut }}
        class="fixed inset-0 z-[9999] flex flex-col items-center justify-center
               bg-brand-sand-50 dark:bg-[#232634]"
    >
        <!-- Logo -->
        <div class="logo-wrap mb-5">
            <img
                src="/icon.png"
                alt="AyahLab"
                class="w-20 h-20 select-none"
                draggable="false"
            />
        </div>

        <!-- App name -->
        <p class="text-2xl font-semibold tracking-wide
                  text-brand-gold-500 dark:text-[#e5c890]
                  name-appear select-none">
            AyahLab
        </p>

        <!-- Subtle loading dots -->
        <div class="essential-loading-dots mt-6 flex gap-1.5 dots-appear">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890] dot dot-1"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890] dot dot-2"></span>
            <span class="w-1.5 h-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890] dot dot-3"></span>
        </div>
    </div>
{/if}

<style>
    /* ── Logo: fade + scale in ───────────────────────────────────────────── */
    .logo-wrap {
        animation: logo-appear 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
    @keyframes logo-appear {
        from { opacity: 0; transform: scale(0.75); }
        to   { opacity: 1; transform: scale(1); }
    }

    /* ── App name: fade in slightly after logo ───────────────────────────── */
    .name-appear {
        animation: fade-up 0.6s 0.3s cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    @keyframes fade-up {
        from { opacity: 0; transform: translateY(6px); }
        to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Loading dots: fade in then bounce ──────────────────────────────── */
    .dots-appear {
        animation: fade-up 0.5s 0.55s ease-out both;
    }
    .dot {
        --loading-dot-delay: 0.8s;
        animation: bounce 1.2s var(--loading-dot-delay) ease-in-out infinite;
    }
    .dot-2 { --loading-dot-delay: 0.95s; }
    .dot-3 { --loading-dot-delay: 1.1s; }
    @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0);    opacity: 0.5; }
        40%            { transform: translateY(-5px); opacity: 1;   }
    }
    @media (prefers-reduced-motion: reduce) {
        .dot {
            animation: none;
            opacity: 0.6;
        }
    }
</style>
