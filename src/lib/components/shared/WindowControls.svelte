<!--
  Minimise / maximise / close for platforms where the window is undecorated and
  this app draws its own title bar — Windows (tauri.windows.conf.json) and Linux
  (tauri.linux.conf.json). macOS keeps its native traffic lights
  (`titleBarStyle: "Overlay"`) and never renders these.

  The two platforms disagree about what a caption button *is*, so `variant`
  picks the shape rather than one compromise shape looking foreign on both:

  - "windows": full-bleed rectangles that run the whole height of the bar and
    meet the window corner, with a red close. Hairline glyphs on a 10px grid,
    which is what Windows draws at any DPI.
  - "gnome": 24px circles with a neutral hover, inset from the corner and
    spaced apart. Adwaita gives all three the same neutral hover — it does not
    single out close in red — and its glyphs are 16px symbolic strokes with
    round caps, so they are drawn heavier than the Windows set.

  The glyphs are inline SVG rather than icon-font lookups: they are three
  straight-line shapes, and this keeps them crisp without a font round-trip.

  GNOME's button order comes from `org.gnome.desktop.wm.preferences
  button-layout`, whose default (and Ubuntu's) is `:minimize,maximize,close` —
  the same order Windows uses, so one order serves both. A user who has moved
  their buttons to the left will see them on the right here.
-->
<script lang="ts">
    import { getCurrentWindow } from "@tauri-apps/api/window";
    import { windowMaximized } from "$lib/stores/window-state.store";

    let { variant = "windows" }: { variant?: "windows" | "gnome" } = $props();

    const gnome = $derived(variant === "gnome");

    // Shared with the Linux window frame, which has to square its corners on
    // the same edge this button swaps its glyph on.
    const maximized = $derived($windowMaximized);

    // Not every failure here is worth surfacing: outside Tauri (browser dev)
    // the whole module is absent, and the buttons simply do nothing.
    async function withWindow(fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
        try {
            await fn(getCurrentWindow());
        } catch (e) {
            console.error("window control failed", e);
        }
    }

    const minimize = () => withWindow((w) => w.minimize());
    const toggleMaximize = () => withWindow((w) => w.toggleMaximize());
    // close(), not destroy() — this has to run the unsaved-changes prompt that
    // +layout.svelte hangs off onCloseRequested.
    const close = () => withWindow((w) => w.close());

    // -mr-2 cancels the header's px-2 so the Windows strip meets the window
    // corner; GNOME's buttons are meant to sit inset from it instead.
    const wrap = $derived(
        gnome
            ? "ml-2 flex shrink-0 items-center gap-1.5"
            : "-mr-2 ml-1 flex h-full shrink-0 items-stretch self-stretch",
    );

    // h-full makes each Windows button's hover fill the whole caption-bar
    // height rather than just boxing its glyph, the way a native caption bar
    // does. GNOME's are a fixed circle regardless of how tall the bar is.
    const btn = $derived(
        gnome
            ? "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full " +
                  "bg-black/10 text-brand-charcoal-600 transition-colors " +
                  "hover:bg-black/15 active:bg-black/25 " +
                  "dark:bg-white/10 dark:text-[#c6d0f5] dark:hover:bg-white/20 dark:active:bg-white/30"
            : "flex h-full w-11 shrink-0 cursor-pointer items-center justify-center " +
                  "text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors " +
                  "hover:bg-brand-sand-200 dark:hover:bg-[#414559]",
    );

    // Adwaita keeps close neutral; Windows turns it red.
    const closeBtn = $derived(
        gnome
            ? btn
            : `${btn} hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white`,
    );
</script>

{#snippet minimizeGlyph()}
    {#if gnome}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M4.5 11.5h7"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                fill="none"
            />
        </svg>
    {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
    {/if}
{/snippet}

{#snippet maximizeGlyph()}
    {#if gnome}
        {#if maximized}
            <!-- Two offset panes: Adwaita's "restore" reads as the window
                 stepping back out of the screen edge. -->
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path
                    d="M6 4.75h5.25V10M4.75 6.75h4.5v4.5h-4.5z"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                />
            </svg>
        {:else}
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <rect
                    x="4.5"
                    y="4.5"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    fill="none"
                />
            </svg>
        {/if}
    {:else if maximized}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
                d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z"
                stroke="currentColor"
                stroke-width="1"
                fill="none"
            />
        </svg>
    {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <rect
                x="0.5"
                y="0.5"
                width="9"
                height="9"
                stroke="currentColor"
                stroke-width="1"
                fill="none"
            />
        </svg>
    {/if}
{/snippet}

{#snippet closeGlyph()}
    {#if gnome}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d="M4.75 4.75l6.5 6.5M11.25 4.75l-6.5 6.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                fill="none"
            />
        </svg>
    {:else}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
    {/if}
{/snippet}

<div class={wrap}>
    <button onclick={minimize} class={btn} title="Minimize" aria-label="Minimize">
        {@render minimizeGlyph()}
    </button>

    <button
        onclick={toggleMaximize}
        class={btn}
        title={maximized ? "Restore Down" : "Maximize"}
        aria-label={maximized ? "Restore Down" : "Maximize"}
    >
        {@render maximizeGlyph()}
    </button>

    <button onclick={close} class={closeBtn} title="Close" aria-label="Close">
        {@render closeGlyph()}
    </button>
</div>
