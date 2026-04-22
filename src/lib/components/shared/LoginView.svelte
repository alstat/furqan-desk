<script lang="ts">
    let { onSwitchToProfile }: { onSwitchToProfile: () => void } = $props();

    let tab: "signin" | "signup" = $state("signin");

    let signinEmail = $state("");
    let signinPassword = $state("");

    let signupName = $state("");
    let signupEmail = $state("");
    let signupPassword = $state("");

    const inputClass =
        "w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-3 py-2 text-[12px] text-brand-charcoal-500 dark:text-[#c6d0f5] placeholder-brand-charcoal-200 dark:placeholder-[#626880] outline-none focus:border-brand-gold-400 focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 transition-colors";
</script>

<div class="flex flex-col gap-4">
    <!-- Tab switcher -->
    <div
        class="flex rounded-full border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#292c3c] p-0.5"
    >
        <button
            onclick={() => (tab = "signin")}
            class="flex-1 rounded-full py-1 text-[11px] font-semibold transition-colors
                   {tab === 'signin'
                ? 'bg-brand-gold-400 text-gray-100 shadow-sm'
                : 'text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446]'}"
        >
            Sign In
        </button>
        <button
            onclick={() => (tab = "signup")}
            class="flex-1 rounded-full py-1 text-[11px] font-semibold transition-colors
                   {tab === 'signup'
                ? 'bg-brand-gold-400 text-gray-100 shadow-sm'
                : 'text-brand-charcoal-500 dark:text-[#8087a2] hover:bg-brand-sand-200 dark:hover:bg-[#303446]'}"
        >
            Sign Up
        </button>
    </div>

    {#if tab === "signin"}
        <!-- Sign In form -->
        <div class="flex flex-col gap-2.5">
            <input
                type="email"
                placeholder="Email address"
                bind:value={signinEmail}
                class={inputClass}
            />
            <input
                type="password"
                placeholder="Password"
                bind:value={signinPassword}
                class={inputClass}
            />
            <button
                onclick={onSwitchToProfile}
                class="cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                       text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                       hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors"
            >
                Sign In
            </button>
            <button
                class="cursor-pointer text-center text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] hover:text-brand-gold-500 transition-colors"
            >
                Forgot password?
            </button>
        </div>
    {:else}
        <!-- Sign Up form -->
        <div class="flex flex-col gap-2.5">
            <input
                type="text"
                placeholder="Full name"
                bind:value={signupName}
                class={inputClass}
            />
            <input
                type="email"
                placeholder="Email address"
                bind:value={signupEmail}
                class={inputClass}
            />
            <input
                type="password"
                placeholder="Password"
                bind:value={signupPassword}
                class={inputClass}
            />
            <button
                onclick={onSwitchToProfile}
                class="cursor-pointer mt-1 w-full rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 py-1.5
                       text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                       hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 active:bg-brand-gold-600/90 transition-colors"
            >
                Create Account
            </button>
        </div>
    {/if}

    <!-- Pro callout -->
    <div
        class="rounded-2xl border border-brand-gold-200 dark:border-brand-gold-800/40 bg-brand-gold-50 dark:bg-brand-gold-900/20 px-4 py-3 flex flex-col gap-1"
    >
        <p
            class="text-[11px] font-semibold text-brand-gold-700 dark:text-brand-gold-400"
        >
            Unlock AyahLab Pro
        </p>
        <p
            class="text-[11px] text-brand-charcoal-400 dark:text-[#8087a2] leading-relaxed"
        >
            Advanced morphology views, unlimited manuscripts, cloud sync, and
            more.
        </p>
    </div>
</div>
