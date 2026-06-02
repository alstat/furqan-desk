<script lang="ts">
    import Icon from "@iconify/svelte";

    interface Props {
        value: string;
        class?: string;
        [key: string]: unknown;
    }

    let { value = $bindable(""), class: className = "", ...rest }: Props =
        $props();

    // Hold-to-reveal: the password is only visible while the peek button is
    // pressed; releasing (or leaving) the button hides it again.
    let revealed = $state(false);

    function show(e: PointerEvent) {
        e.preventDefault(); // keep focus/selection in the input
        revealed = true;
    }
    function hide() {
        revealed = false;
    }
</script>

<div class="relative">
    <input
        {...rest}
        type={revealed ? "text" : "password"}
        bind:value
        class={className}
        style="padding-right: 2.25rem;"
    />
    <button
        type="button"
        tabindex="-1"
        aria-label="Hold to reveal password"
        title="Hold to reveal password"
        onpointerdown={show}
        onpointerup={hide}
        onpointerleave={hide}
        onpointercancel={hide}
        oncontextmenu={(e) => e.preventDefault()}
        class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center text-brand-charcoal-300 dark:text-[#8087a2] hover:text-brand-gold-500 dark:hover:text-[#e5c890] transition-colors cursor-pointer"
    >
        <Icon
            icon={revealed ? "solar:eye-bold" : "solar:eye-closed-bold"}
            width="0.9rem"
        />
    </button>
</div>
