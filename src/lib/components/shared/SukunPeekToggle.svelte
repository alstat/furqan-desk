<script lang="ts">
    import { zenPeek } from "$lib/stores/editor.store";
    import { t } from "$lib/i18n";

    let isPeeking = $state(false);

    function onPointerDown(e: PointerEvent) {
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        isPeeking = true;
        zenPeek.set(true);
    }

    function onPointerUp() {
        isPeeking = false;
        zenPeek.set(false);
    }
</script>

<button
    class="absolute -top-3 left-1/2 pt-3 -translate-x-1/2 z-50
           flex flex-col items-center gap-0 select-none cursor-pointer
           transition-all duration-200"
    title={$t("sukun.show_icons")}
    aria-label={$t("sukun.show_icons")}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
>
    <!-- Flame -->
    <svg
        width="8"
        height="12"
        viewBox="0 0 8 11"
        fill="none"
        class="transition-all -mt-4 duration-300 {isPeeking
            ? 'scale-125 drop-shadow-[0_0_4px_rgba(229,200,144,0.9)]'
            : 'scale-90 opacity-30'}"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M4 0 C4 0 7.5 3.5 7.5 6.5 C7.5 8.4 5.9 10 4 10 C2.1 10 0.5 8.4 0.5 6.5 C0.5 3.5 4 0 4 0Z"
            class={isPeeking
                ? "fill-brand-gold-400 dark:fill-[#e5c890]"
                : "fill-brand-gold-500/55 dark:fill-brand-gold-400/40"}
        />
        <path
            d="M4 4 C4 4 5.8 5.8 5.8 7 C5.8 8 5 8.8 4 8.8 C3 8.8 2.2 8 2.2 7 C2.2 5.8 4 4 4 4Z"
            class={isPeeking
                ? "fill-brand-sand-50 dark:fill-[#f5e9c8]"
                : "fill-brand-sand-100/50 dark:fill-brand-sand-50/20"}
        />
    </svg>

    <!-- Candle body -->
    <div
        class="w-0.5 h-2.5 rounded-sm transition-all duration-300
                {isPeeking
            ? 'bg-brand-gold-200 dark:bg-[#414559] shadow-[0_0_6px_1px_rgba(229,200,144,0.35)]'
            : 'bg-brand-gold-200/40 dark:bg-[#414559]/40'}"
    >
        <!-- Wax drip -->
        <div
            class="mx-auto mt-1 w-px h-2 rounded-full transition-all duration-300
                    {isPeeking
                ? 'bg-brand-gold-100 dark:bg-[#626880]/60'
                : 'bg-brand-gold-100/30 dark:bg-[#626880]/20'}"
        ></div>
    </div>
</button>
