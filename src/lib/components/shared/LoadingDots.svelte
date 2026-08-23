<!--
  The three bouncing dots from the start-up splash, on their own so any view can
  show the same "working on it" while content loads.

  The splash staggers its dots in after the logo, so its copy carries entrance
  delays this one leaves out: here the dots should be bouncing the moment they
  appear.
-->
<script lang="ts">
    let { class: className = "" }: { class?: string } = $props();
</script>

<div
    class="flex gap-1.5 {className}"
    role="status"
    aria-live="polite"
    aria-label="Loading"
>
    <span
        class="dot-1 h-1.5 w-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
    ></span>
    <span
        class="dot-2 h-1.5 w-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
    ></span>
    <span
        class="dot-3 h-1.5 w-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
    ></span>
</div>

<style>
    /* Same bounce the splash uses — see SplashScreen.svelte.
       Each dot states its whole animation, delay included, rather than sharing
       a `.dot` shorthand and overriding `animation-delay` from a later rule:
       the shorthand resets the delay, and relying on a separate rule to put it
       back leaves the stagger at the mercy of how the engine re-resolves an
       already-running animation. One self-contained rule per dot can't go
       wrong that way. */
    .dot-1 {
        animation: bounce 1.2s ease-in-out 0s infinite;
    }
    .dot-2 {
        animation: bounce 1.2s ease-in-out 0.15s infinite;
    }
    .dot-3 {
        animation: bounce 1.2s ease-in-out 0.3s infinite;
    }
    @keyframes bounce {
        0%,
        80%,
        100% {
            transform: translateY(0);
            opacity: 0.5;
        }
        40% {
            transform: translateY(-5px);
            opacity: 1;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .dot-1,
        .dot-2,
        .dot-3 {
            animation: none;
            opacity: 0.6;
        }
    }
</style>
